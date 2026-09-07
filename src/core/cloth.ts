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

const _d = new THREE.Vector3()
const _push = new THREE.Vector3()

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
  }

  step(
    dt: number,
    cfg: ClothConfig,
    colliders: readonly Collider[],
    /** Direction du poids, **dans le repère de la nappe**. La simulation vit en
     *  local ; si la poupée tourne, c'est cette direction qui tourne. */
    gravityDir: THREE.Vector3,
  ) {
    // Pas borné : une frame longue (onglet en arrière-plan) ferait exploser
    // l'intégration.
    const h = Math.min(dt, 1 / 45)
    const g = cfg.gravity * h * h * 60
    const n = this.points.length

    for (let i = 0; i < n; i++) {
      const p = this.points[i]
      const q = this.prev[i]
      _d.subVectors(p, q).multiplyScalar(1 - cfg.damping)
      q.copy(p)
      p.add(_d)
      p.addScaledVector(gravityDir, g)

      // Rappel vers la pose de repos, seulement là où le tissu doit tenir.
      if (this.pin[i] > 0) p.lerp(this.rest[i], this.pin[i] * 0.4)
    }

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

      // Collisions : on repousse à la surface de chaque sphère.
      for (let i = 0; i < n; i++) {
        const p = this.points[i]
        for (let c = 0; c < colliders.length; c++) {
          const s = colliders[c]
          _push.subVectors(p, s.center)
          const d = _push.length()
          if (d > 1e-6 && d < s.radius) p.copy(s.center).addScaledVector(_push, s.radius / d)
        }
      }
    }
  }
}
