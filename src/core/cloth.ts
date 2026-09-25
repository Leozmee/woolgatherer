import * as THREE from 'three'
import { mulberry32 } from './rand'
import type { Collider } from './springBone'

export type ClothConfig = {
  /** Poids ressenti du tissu. */
  gravity: number
  /** 0 = le tissu oscille sans fin, 1 = il s'arrête net. */
  damping: number
  /** Passes de résolution des contraintes. Plus il y en a, moins le tissu s'étire. */
  iterations: number
}

/** Raideurs relatives des trois familles de contraintes d'un tissu. */
export type ClothStiffness = {
  /** Diagonales : empêchent la nappe de se cisailler en losanges. */
  shear: number
  /** Sauts d'un rang : résistance au pli. C'est le paramètre qui décide si on
   *  a du drap (bas) ou du carton (haut). */
  bend: number
  /**
   * Surplus de matière en travers, sur les parties libres seulement.
   *
   * Sans lui un pan qui pend déjà à la verticale est **à l'équilibre** : la
   * gravité tire dans l'axe où il est déjà, rien ne le fait plier, et il reste
   * une planche quelle que soit la souplesse qu'on lui donne. Un vrai tissu
   * ondule parce qu'il a plus de largeur qu'il n'en faut pour rester à plat ; on
   * lui en donne donc un peu trop, et le flambage vient tout seul.
   */
  slack: number
}

type Link = { a: number; b: number; len: number; k: number }

/** Options d'un pas de simulation au-delà de la gravité et des obstacles. */
export type ClothExtras = {
  /**
   * Transport du repère : la matrice qui envoie un point du repère de l'image
   * précédente dans celui-ci (`FrameCarry`). Appliquée aux particules libres,
   * elle leur garde leur place **dans le monde** quand le corps tourne ou se
   * déplace — la torsion d'une attaque fouette alors les pans. L'accélération
   * seule (`accel`) ne voit que la translation : un buste qui pivote emportait
   * l'écharpe comme un décor collé.
   */
  carry?: THREE.Matrix4 | null
  /** Part du transport (0 à 1), sur les particules libres. */
  carryK?: number
  /** Sol, dans le repère de la nappe : normale unitaire et `n·p ≥ d`. */
  floor?: { n: THREE.Vector3; d: number } | null
  /**
   * **Portance** : vitesse (unités/s) à laquelle le poids d'une particule est
   * divisé par deux. Un tissu léger lancé vite est porté par l'air : il redescend
   * en planant au lieu de tomber comme un fil à plomb. Sans elle, un pan fouetté
   * par une attaque retombait aussitôt et le coup ne se lisait pas dans l'étoffe.
   * Au repos (vitesse nulle), le poids est entier : rien ne flotte tout seul.
   */
  lift?: number
}

/**
 * Pas de la simulation : celui auquel tous les réglages ont été faits.
 *
 * Amortissement et retenue s'appliquaient **une fois par appel** : à 144 Hz
 * l'air freinait l'écharpe 2,4 fois plus qu'à 60, à 30 Hz le pas était borné
 * à 1/45 s et la simulation ralentissait d'un tiers. Même remède que pour les
 * ressorts (`SpringBone`) : des sous-pas d'au plus 1/60 s, et des taux
 * convertis au pas réel — à 60 i/s c'est exactement l'ancien calcul.
 */
const STEP = 1 / 60
/** Sous-pas au plus par image : en deçà de 20 i/s on ralentit plutôt que d'exploser. */
const MAX_SUB = 3
/**
 * Transport découpé : déplacement au plus par sous-pas d'un point à une unité
 * de l'axe, et nombre de parts au plus.
 *
 * Au salto le repère tourne de 15 rad/s : un quart de radian par image. Les
 * particules gardées sur place dans le monde sautaient alors de 0,1 à 0,15 dans
 * le repère du corps, plus que la moitié d'une sphère d'obstacle : elles la
 * traversaient et ressortaient **du mauvais côté** — mesuré, un lien du pan
 * arrière étiré quatre fois. Découpé, chaque part reste sous 0,05, et les
 * collisions ont le temps de s'en apercevoir.
 */
const CARRY_MOVE = 0.05
const MAX_CARRY = 5

const _d = new THREE.Vector3()
const _push = new THREE.Vector3()
const _c = new THREE.Vector3()
const _tv = new THREE.Vector3()
const _ts = new THREE.Vector3()
const _tq = new THREE.Quaternion()
const _qi = new THREE.Quaternion()
const _one = new THREE.Vector3(1, 1, 1)
const _mPrev = new THREE.Matrix4()
const _mCur = new THREE.Matrix4()
const _mPart = new THREE.Matrix4()
const _mInv = new THREE.Matrix4()

/**
 * Nappe de tissu simulée en Verlet — une **grille** de particules, pas une ligne.
 *
 * C'est la différence entre du tissu et une corde. Une chaîne de particules ne
 * peut ni se vriller, ni onduler en travers, ni ouvrir un pli : la largeur y est
 * reconstruite géométriquement après coup, donc parfaitement rigide, et le
 * résultat lit comme un ruban de carton quoi qu'on fasse de la physique.
 *
 * Ici chaque point de la nappe est une particule reliée à ses voisines en long
 * (structure), en large (structure), en diagonale (cisaillement) et à un rang
 * d'écart (pliage). Les plis, la vrille des pans et le drapé sur les épaules
 * sortent tout seuls de ce maillage — il n'y a rien à scripter.
 *
 * `pin` retient chaque particule vers sa pose de repos : fort sur le tour de cou
 * — sans quoi l'écharpe glisse au sol — nul sur les pans, et **dégressif vers
 * les bords**, pour que même la partie tenue puisse gondoler.
 */
export class ClothSheet {
  readonly points: THREE.Vector3[]
  private prev: THREE.Vector3[]
  private rest: THREE.Vector3[]
  private pin: number[]
  private links: Link[] = []
  /**
   * **Attaches longues** (tethers) : pour chaque particule libre, la particule
   * retenue la plus proche le long de sa colonne, et la longueur de tissu qui
   * les sépare au repos. Aucune particule ne peut s'en éloigner davantage.
   *
   * Les contraintes de distance se résolvent de proche en proche : chaque passe
   * ne rattrape qu'une fraction de l'écart, et elle s'amortit d'un rang à
   * l'autre. Quand le corps file à 5 à 8 unités/s, le bout d'un long pan reste
   * sur place dans le monde (`carry`) et neuf passes ne suffisent plus à le
   * ramener : mesuré à la glissade, le pan arrière s'allongeait de moitié,
   * tremblait d'une image à l'autre et traversait le corps en revenant. Une
   * borne par particule, résolue en une passe, ne laisse pas s'étirer ce qui
   * pend, quelle que soit la vitesse — et ne gêne en rien ce qui se plie.
   */
  private tether: Int32Array
  private tetherLen: Float32Array
  /**
   * Épaisseur propre de chaque particule, ajoutée au rayon des obstacles et au
   * sol : un cadenas, un pompon, une aiguille au bout d'une chaîne ont un
   * volume que la particule seule ne porte pas.
   */
  pad: number[] | null = null
  /** Pas du dernier sous-pas : la vitesse implicite de Verlet s'y rapporte. */
  private lastH = STEP

  constructor(
    rest: THREE.Vector3[],
    pin: number[],
    readonly rows: number,
    readonly cols: number,
    stiff: ClothStiffness,
    /** Micro-vitesse initiale. Une nappe lâchée parfaitement symétrique retombe
     *  en planche : il lui faut un défaut pour choisir de quel côté plier. */
    seed = 0,
    /** Referme la nappe sur elle-même en long : le dernier rang est lié au
     *  premier. Sans ça une boucle — un collier — se fend à sa couture. */
    loop = false,
    /** Retenue à partir de laquelle une particule sert d'attache (`tether`). */
    holdFrom = 0.25,
  ) {
    this.rest = rest.map((v) => v.clone())
    this.points = rest.map((v) => v.clone())
    this.pin = pin

    const rnd = mulberry32(seed + 4021)
    this.prev = rest.map((v, i) => {
      const q = v.clone()
      if (pin[i] < 0.5) {
        const a = 0.004 * (1 - pin[i])
        q.x -= (rnd() - 0.5) * a
        q.y -= (rnd() - 0.5) * a
        q.z -= (rnd() - 0.5) * a
      }
      return q
    })

    const at = (i: number, j: number) => i * cols + j
    const link = (a: number, b: number, k: number, slack = 0) => {
      // Le surplus n'a de sens que là où le tissu est libre : sur la partie
      // retenue il ne ferait que lutter contre le rappel.
      const free = pin[a] < 0.15 && pin[b] < 0.15
      const len = this.rest[a].distanceTo(this.rest[b]) * (free ? 1 + slack : 1)
      this.links.push({ a, b, len, k })
    }

    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        if (i + 1 < rows) link(at(i, j), at(i + 1, j), 1)
        if (j + 1 < cols) link(at(i, j), at(i, j + 1), 1, stiff.slack)
        if (i + 1 < rows && j + 1 < cols) {
          link(at(i, j), at(i + 1, j + 1), stiff.shear)
          link(at(i + 1, j), at(i, j + 1), stiff.shear)
        }
        if (i + 2 < rows) link(at(i, j), at(i + 2, j), stiff.bend)
        if (j + 2 < cols) link(at(i, j), at(i, j + 2), stiff.bend)
      }
    }

    if (loop && rows > 3) {
      for (let j = 0; j < cols; j++) {
        link(at(rows - 1, j), at(0, j), 1)
        link(at(rows - 2, j), at(0, j), stiff.bend)
        link(at(rows - 1, j), at(1, j), stiff.bend)
      }
    }

    // Attaches : on remonte chaque colonne des deux côtés jusqu'à la première
    // particule retenue, en cumulant les longueurs au repos — la longueur de
    // tissu, pas la corde, sinon un pan courbé au repos ne pourrait plus se
    // déplier.
    const n = rows * cols
    this.tether = new Int32Array(n).fill(-1)
    this.tetherLen = new Float32Array(n)
    for (let j = 0; j < cols; j++) {
      for (let i = 0; i < rows; i++) {
        const k = at(i, j)
        if (pin[k] >= holdFrom) continue
        let best = -1
        let bestLen = Infinity
        for (const dir of [-1, 1]) {
          let len = 0
          let r = i
          for (let s = 1; s < rows; s++) {
            let nr = r + dir
            if (nr < 0 || nr >= rows) {
              if (!loop) break
              nr = (nr + rows) % rows
            }
            len += this.rest[at(r, j)].distanceTo(this.rest[at(nr, j)])
            r = nr
            if (pin[at(r, j)] >= holdFrom) {
              if (len < bestLen) {
                bestLen = len
                best = at(r, j)
              }
              break
            }
          }
        }
        if (best >= 0) {
          this.tether[k] = best
          this.tetherLen[k] = bestLen
        }
      }
    }
  }

  step(
    dt: number,
    cfg: ClothConfig,
    colliders: readonly Collider[],
    /** Direction du poids, **dans le repère de la nappe**. La simulation vit en
     *  local ; si la poupée tourne, c'est cette direction qui tourne. */
    gravityDir: THREE.Vector3,
    /**
     * Accélération du repère de la nappe, **dans ce repère** (unités/s²). La
     * simulation vit en local : sans elle, une poupée qui court ou roule
     * emporte son écharpe comme un décor collé, qui ne traîne jamais derrière.
     */
    accel?: THREE.Vector3,
    extra?: ClothExtras,
  ) {
    // Sous-pas d'au plus 1/60 s ; au-delà de trois par image (onglet en
    // arrière-plan, rendu lent) la simulation ralentit au lieu d'exploser.
    // Un sous-pas peut dépasser 1/60 s de 20 % : une image de 17 ms ne doit
    // pas coûter deux passes complètes.
    const span = Math.max(0, dt)
    const carry = extra?.carry ?? null
    if (span <= 0) {
      if (carry) this.transport(carry, extra?.carryK ?? 1, 1)
      return
    }
    let sub = Math.min(MAX_SUB, Math.max(1, Math.ceil(span / (STEP * 1.2))))
    // Repère qui bouge vite (salto, K.O., glissade) : le transport de l'image
    // est réparti sur plus de sous-pas (voir `CARRY_MOVE`).
    let parts = 1
    if (carry) {
      carry.decompose(_tv, _tq, _ts)
      const angle = 2 * Math.acos(Math.min(1, Math.abs(_tq.w)))
      parts = Math.min(MAX_CARRY, Math.max(1, Math.ceil((_tv.length() + angle) / CARRY_MOVE)))
      sub = Math.max(sub, parts)
    }
    const h = Math.min(span / sub, STEP * 1.2)
    _mPrev.identity()
    for (let s = 0; s < sub; s++) {
      if (carry) {
        if (parts === 1) {
          if (s === 0) this.transport(carry, extra?.carryK ?? 1, 1)
        } else {
          // Part du transport : de la fraction s/n à (s+1)/n, la dernière
          // exactement égale au transport de l'image (écrasement compris).
          const u = (s + 1) / sub
          if (s === sub - 1) _mCur.copy(carry)
          else _mCur.compose(_c.copy(_tv).multiplyScalar(u), _qi.identity().slerp(_tq, u), _push.copy(_one).lerp(_ts, u))
          _mPart.multiplyMatrices(_mCur, _mInv.copy(_mPrev).invert())
          this.transport(_mPart, extra?.carryK ?? 1, sub)
          _mPrev.copy(_mCur)
        }
      }
      this.substep(h, cfg, colliders, gravityDir, accel, extra)
    }
  }

  /**
   * Transport du repère sur les particules libres (voir `ClothExtras.carry`),
   * en `parts` morceaux : la part de chacun est ajustée pour que leur produit
   * redonne celle d'un transport d'un bloc.
   */
  private transport(m: THREE.Matrix4, k: number, parts: number) {
    const n = this.points.length
    for (let i = 0; i < n; i++) {
      let w = k * (1 - this.pin[i])
      if (w <= 0) continue
      if (parts > 1 && w < 1) w = 1 - Math.pow(1 - w, 1 / parts)
      this.points[i].lerp(_c.copy(this.points[i]).applyMatrix4(m), w)
      this.prev[i].lerp(_c.copy(this.prev[i]).applyMatrix4(m), w)
    }
  }

  private substep(
    h: number,
    cfg: ClothConfig,
    colliders: readonly Collider[],
    gravityDir: THREE.Vector3,
    accel?: THREE.Vector3,
    extra?: ClothExtras,
  ) {
    const n = this.points.length
    const r = h / STEP
    const g = cfg.gravity * h * h * 60
    // Taux ramenés au pas réel : réglés par image à 60 i/s.
    const keep = Math.pow(1 - cfg.damping, r)
    // Verlet à pas variable : l'écart à l'image précédente couvrait `lastH`.
    const scale = keep * (h / this.lastH)
    this.lastH = h
    const lift = extra?.lift ?? 0
    const lift2 = lift > 0 ? 1 / (lift * lift * h * h) : 0
    const floor = extra?.floor

    for (let i = 0; i < n; i++) {
      const p = this.points[i]
      const q = this.prev[i]
      _d.subVectors(p, q).multiplyScalar(scale)
      q.copy(p)
      p.add(_d)
      // Portance : le poids fond avec le carré de la vitesse (voir `lift`).
      const w = lift2 > 0 ? 1 / (1 + _d.lengthSq() * lift2) : 1
      p.addScaledVector(gravityDir, g * w)
      // Force d'inertie : le repère accélère, le tissu libre reste en arrière.
      if (accel) p.addScaledVector(accel, -h * h * (1 - this.pin[i]))

      // Rappel vers la pose de repos, seulement là où le tissu doit tenir.
      const pin = this.pin[i]
      if (pin > 0) p.lerp(this.rest[i], r === 1 ? pin * 0.4 : 1 - Math.pow(1 - pin * 0.4, r))
    }

    const pad = this.pad
    for (let k = 0; k < cfg.iterations; k++) {
      for (let l = 0; l < this.links.length; l++) {
        const c = this.links[l]
        const a = this.points[c.a]
        const b = this.points[c.b]
        _d.subVectors(b, a)
        const len = _d.length()
        if (len < 1e-8) continue
        const diff = ((len - c.len) / len) * c.k

        // Une particule retenue bouge moins que sa voisine libre.
        const wa = 1 - this.pin[c.a]
        const wb = 1 - this.pin[c.b]
        const total = wa + wb
        if (total < 1e-6) continue
        a.addScaledVector(_d, (diff * wa) / total)
        b.addScaledVector(_d, (-diff * wb) / total)
      }

      // Attaches longues : rien ne s'éloigne de son attache au-delà de la
      // longueur de tissu qui les sépare (voir `tether`).
      for (let i = 0; i < n; i++) {
        const a = this.tether[i]
        if (a < 0) continue
        const p = this.points[i]
        _d.subVectors(p, this.points[a])
        const len = _d.length()
        const max = this.tetherLen[i]
        if (len > max) p.copy(this.points[a]).addScaledVector(_d, max / len)
      }

      // Collisions : on repousse à la surface de chaque sphère.
      for (let i = 0; i < n; i++) {
        const p = this.points[i]
        const extraR = pad ? pad[i] : 0
        for (let c = 0; c < colliders.length; c++) {
          const s = colliders[c]
          const rad = s.radius + extraR
          _push.subVectors(p, s.center)
          const d = _push.length()
          if (d > 1e-6 && d < rad) p.copy(s.center).addScaledVector(_push, rad / d)
        }
        // Sol : on remonte, et le frottement mange la glissade.
        if (floor) {
          const under = floor.d + extraR - floor.n.dot(p)
          if (under > 0) {
            p.addScaledVector(floor.n, under)
            this.prev[i].lerp(p, 0.35)
          }
        }
      }
    }
  }

  /**
   * Accroche la particule `i` à `v`, sans vitesse : le bout d'une chaîne
   * pendue à une autre, qui la suit (à retenir avec `pin` = 1).
   */
  anchor(i: number, v: THREE.Vector3) {
    this.points[i].copy(v)
    this.prev[i].copy(v)
    this.rest[i].copy(v)
  }
}
