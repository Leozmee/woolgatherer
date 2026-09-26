import * as THREE from 'three'
import type { DollParams } from './params'
import type { Collider } from '../core/springBone'

const FORWARD = new THREE.Vector3(0, 0, 1)
const clamp = THREE.MathUtils.clamp

export type SurfacePoint = {
  pos: THREE.Vector3
  normal: THREE.Vector3
  /** Amène +Z sur la normale : tout élément dessiné dans son plan XY devient tangent. */
  quat: THREE.Quaternion
}

/**
 * Profil du crâne, bajoues comprises.
 *
 * Partagé entre la géométrie, les implantations de locks, les épingles et les
 * ornements. Toute copie de cette formule finit par diverger, et les éléments
 * posés dessus se mettent à flotter ou à s'enfoncer dès qu'on change une
 * proportion — c'est arrivé assez de fois pour justifier ce module.
 */
export function headWidth(p: DollParams, sy: number, lateral = 1) {
  const t = (sy + 1) * 0.5
  const oval = 1 + p.shape.headEgg * (1 - t) - p.shape.headEgg * 0.45 * t
  const gauss = Math.exp(-Math.pow((sy - p.shape.headCheekY) / p.shape.headCheekSpread, 2))
  const cheek = 1 + p.shape.headPuff * (0.4 + 0.6 * lateral) * gauss
  return oval * cheek
}

/** Rayons de l'ellipsoïde du crâne à une hauteur normalisée donnée. */
function headRadii(p: DollParams, sy: number, lateral: number) {
  const R = p.shape.headRadius
  const w = headWidth(p, sy, lateral)
  return { rx: w * R, ry: p.shape.headSquash * R, rz: w * R * 0.96 }
}

function place(pos: THREE.Vector3, rx: number, ry: number, rz: number, lift: number): SurfacePoint {
  const normal = new THREE.Vector3(
    pos.x / (rx * rx),
    pos.y / (ry * ry),
    pos.z / (rz * rz),
  ).normalize()
  pos.addScaledVector(normal, lift)
  return { pos, normal, quat: new THREE.Quaternion().setFromUnitVectors(FORWARD, normal) }
}

/** Point du crâne repéré par (x, y) de face — pour les yeux et la bouche. */
export function onHead(p: DollParams, x: number, y: number, lift: number): SurfacePoint {
  const ry = p.shape.headSquash * p.shape.headRadius
  const sy = clamp(y / ry, -0.97, 0.97)
  const { rx, rz } = headRadii(p, sy, 1)
  const sx = clamp(x / rx, -0.97, 0.97)
  const sz = Math.sqrt(Math.max(0.02, 1 - sx * sx - sy * sy))
  return place(new THREE.Vector3(sx * rx, sy * ry, sz * rz), rx, ry, rz, lift)
}

/** Point du crâne repéré en coordonnées sphériques — pour ce qui fait le tour. */
export function onHeadPolar(p: DollParams, azimuth: number, sy: number, lift: number): SurfacePoint {
  const ring = Math.sqrt(Math.max(0, 1 - sy * sy))
  const dx = Math.sin(azimuth) * ring
  const dz = Math.cos(azimuth) * ring
  const lateral = (dx * dx) / (dx * dx + dz * dz + 1e-6)
  const { rx, ry, rz } = headRadii(p, sy, lateral)
  return place(new THREE.Vector3(dx * rx, sy * ry, dz * rz), rx, ry, rz, lift)
}

/**
 * Profil du tronc : rayon de l'anneau à la hauteur normalisée `sy`.
 *
 * Source unique pour la géométrie (`torsoGeometry`), la surface (`onTorso`)
 * et le corps de révolution (`bodyRadius`). À `torsoSquare` 0, un ellipsoïde ;
 * vers 1, une superellipse : épaules et hanches franches, flancs droits — le
 * bloc du pavé, sans arêtes (exposant plafonné, un coussin et non une boîte).
 * Une copie de cette formule dériverait, et tout ce qui est posé sur le tronc
 * flotterait ou s'enfoncerait.
 *
 * `seat` (0 à 1) : **assise**, la même superellipse mais seulement vers le bas
 * (voir `TorsoShape`) — le tronc garde sa largeur plus bas avant de se
 * refermer, au lieu de se pincer en pointe entre les cuisses.
 */
export function torsoRing(square: number | undefined, sy: number, seat = 0) {
  const b = Math.max(0, -sy)
  const n = Math.min(4.2, 2 + 1.6 * clamp(square ?? 0, 0, 1) + SEAT_EXP * clamp(seat, 0, 1) * b * b)
  return Math.pow(Math.max(0, 1 - Math.pow(Math.min(1, Math.abs(sy)), n)), 1 / n)
}

/**
 * Raccord des cuisses (voir `thighOverhang`, et `fillHips` dans `morph.ts`),
 * deux cotes calculées par poupée et jamais réglées au panneau :
 * - `seat` (0 à 1), l'**assise** : le bas du tronc se remplit — flancs tenus
 *   plus bas (`torsoRing`) et section qui passe de l'ellipse au coussin
 *   (superellipse horizontale), ce qui remplit les coins devant et derrière
 *   les cuisses **sans avancer ni le ventre ni le dos** ;
 * - `seatWidth`, l'**élargissement** du bas du tronc sur les flancs, en rampe
 *   douce depuis la taille : une bosse localisée (celle de `hips`) fait une
 *   jupe évasée, pas un bassin qui se prolonge en cuisses.
 */
export type TorsoShape = DollParams['shape'] & { seat?: number; seatWidth?: number }
type Shape = TorsoShape

/** Exposant ajouté au profil vertical des flancs, en bas, à pleine assise. */
const SEAT_EXP = 2
/** Exposant ajouté à la section horizontale, en bas, à pleine assise. */
const SEAT_SQUIRCLE = 3
/**
 * Rampe de l'élargissement : nulle au-dessus de `sy` −0,1, pleine sous −0,8.
 * Partie de 0,1, elle gonflait le tronc à hauteur des mains du kangourou.
 */
const SEAT_RAMP = [-0.1, -0.8] as const
/**
 * Hauteur normalisée de l'**assise** : au-dessus, tout ce qui dépasse de la
 * cuisse est sa calotte — le pilon planté sous le tronc ; au-dessous, la jambe
 * sort du tronc, c'est normal.
 */
export const SEAT_SY = -0.85

/**
 * Galbe d'un membre : facteur d'épaisseur à la fraction `u` de sa longueur
 * (0 à l'attache, 1 au bout). Source unique de `limbGeometry` et du raccord
 * des cuisses (`thighOverhang`).
 */
export function limbGirth(taper: number, upper: number, lower: number, u: number) {
  const g = (c: number) => Math.exp(-(((u - c) / 0.16) ** 2))
  return Math.max(0.4, (1 + taper * (u - 0.5)) * (1 + upper * g(0.25) + lower * g(0.74)))
}

/**
 * Sculpture du tronc : facteur du rayon à la hauteur `sy` et à l'azimut `az`
 * (0 devant, π/2 sur le flanc).
 *
 * Un tronc qui ne varie qu'en largeur et en hauteur reste un œuf plus ou moins
 * gros : l'hercule, la ballerine et le crapaud avaient le même buste à
 * l'échelle près, et c'étaient les membres seuls qui faisaient la morpho. Une
 * silhouette se lit d'abord au **profil du tronc** — le V d'un buste de
 * lutteur, la taille marquée d'une danseuse, le ventre qui tombe d'un crapaud,
 * le dos rond d'un gorille. Chaque terme est une bosse localisée (gaussienne
 * en hauteur, pondérée en azimut) : la poitrine gonfle surtout devant, le
 * ventre seulement devant, le dos voûté seulement derrière, les hanches
 * surtout sur les flancs. Symétrique gauche-droite par construction (cos az).
 * L'élargissement de l'assise (`seatWidth`), lui, est une rampe, et seulement
 * sur les flancs.
 */
export function torsoSculpt(s: Shape, sy: number, az: number) {
  const f = Math.cos(az)
  const front = Math.max(0, f)
  const back = Math.max(0, -f)
  const lat = 1 - f * f
  const g = (c: number, w: number) => Math.exp(-(((sy - c) / w) ** 2))
  const rt = clamp((SEAT_RAMP[0] - sy) / (SEAT_RAMP[0] - SEAT_RAMP[1]), 0, 1)
  return Math.max(
    0.4,
    1 +
      (s.chest ?? 0) * g(0.38, 0.36) * (0.5 + 0.5 * front) -
      (s.waist ?? 0) * g(-0.22, 0.26) +
      (s.belly ?? 0) * g(-0.3, 0.38) * front * front +
      (s.hips ?? 0) * g(-0.62, 0.3) * (0.3 + 0.7 * lat) +
      (s.hunch ?? 0) * g(0.48, 0.38) * back * back +
      (s.seatWidth ?? 0) * rt * rt * (3 - 2 * rt) * lat,
  )
}

/** Exposant de la section horizontale du tronc à la hauteur `sy` (2 : ellipse). */
function sectionExp(s: Shape, sy: number) {
  const b = Math.max(0, -sy)
  return 2 + SEAT_SQUIRCLE * clamp(s.seat ?? 0, 0, 1) * b * b
}

/**
 * Point du tronc **idéal** (avant bosselage), repère du torse. Source unique
 * de la géométrie (`torsoGeometry`) et de la surface (`onTorso`) : toute copie
 * dériverait, et les pièces cousues flotteraient ou s'enfonceraient.
 */
export function torsoPoint(s: Shape, sy: number, az: number, out = new THREE.Vector3()) {
  const t = (sy + 1) * 0.5
  const c = Math.cos(az)
  const sn = Math.sin(az)
  // L'assise tient les flancs, pas le ventre ni le dos : de profil, le tronc
  // garde sa courbe.
  const seat = (s.seat ?? 0) * sn * sn
  const w = (1 + (s.torsoTaper - 1) * t) * s.torsoRadius * torsoRing(s.torsoSquare, sy, seat) * torsoSculpt(s, sy, az)
  const m = sectionExp(s, sy)
  const dx = m === 2 ? sn : Math.sign(sn) * Math.pow(Math.abs(sn), 2 / m)
  const dz = m === 2 ? c : Math.sign(c) * Math.pow(Math.abs(c), 2 / m)
  return out.set(dx * w, sy * s.torsoHeight * 0.5, dz * w * (s.torsoDepth ?? 0.86))
}

const _tp = new THREE.Vector3()

/**
 * Distance d'un point au tronc idéal, le long de sa direction horizontale
 * depuis l'axe (en unités monde ; > 0 dehors). Inverse la paramétrisation de
 * `torsoPoint` — section en superellipse comprise —, pour mesurer ce qui en
 * dépasse sans copier sa formule.
 */
export function torsoOutside(s: Shape, x: number, y: number, z: number) {
  const sy = clamp(y / (s.torsoHeight * 0.5), -1, 1)
  const depth = s.torsoDepth ?? 0.86
  const zn = z / depth
  // Direction φ du point ; l'azimut du paramètre qui y mène vérifie
  // |tan az| = |tan φ|^(m/2).
  const m = sectionExp(s, sy)
  const az = Math.atan2(Math.sign(x) * Math.pow(Math.abs(x), m / 2), Math.sign(zn) * Math.pow(Math.abs(zn), m / 2))
  torsoPoint(s, sy, az, _tp)
  return Math.hypot(x, zn) - Math.hypot(_tp.x, _tp.z / depth)
}

/**
 * Débord de la cuisse hors du tronc, au repos, en rayons de jambe : le pire
 * point de sa surface au-dessus de l'assise (`SEAT_SY`). Toute la calotte,
 * tout autour — c'est elle qui se lit comme le haut d'une capsule plantée
 * sous le tronc —, et du fût seulement le flanc extérieur, qui doit
 * prolonger celui du tronc vu de face. Devant et derrière, le fût peut sortir
 * de sous le ventre ou le dos : c'est ainsi qu'une jambe de peluche sort de
 * son corps, et les couvrir aussi bomberait le ventre et les fesses.
 */
export function thighOverhang(p: DollParams) {
  const s = p.shape
  const lb = p.limbs
  const r = lb.legRadius
  const L = lb.legLength
  // Écartement, et pli de repos : cuisse en avant, ou en dehors (grenouille).
  const a = lb.legSpread + (lb.kneeRest ?? 0) * (lb.kneeOut ?? 0) * 0.5
  const fwd = (lb.kneeRest ?? 0) * (1 - (lb.kneeOut ?? 0)) * 0.5
  const ca = Math.cos(a), sa = Math.sin(a), cf = Math.cos(fwd), sf = Math.sin(fwd)
  const hx = hipX(p)
  const hy = -s.torsoHeight * 0.36
  const half = s.torsoHeight * 0.5
  let worst = -Infinity
  for (let i = 0; i <= 16; i++) {
    // De la calotte (y > 0) au premier tiers de la cuisse.
    const yl = r - ((r + L * 0.35) * i) / 16
    const cap = yl > 0 ? Math.sqrt(Math.max(0, 1 - (yl / r) ** 2)) : 1
    const rho = r * cap * limbGirth(lb.legTaper ?? 0, lb.legUpper ?? 0, lb.legLower ?? 0, clamp(-yl / L, 0, 1))
    for (let k = 0; k < 12; k++) {
      const th = (k / 12) * Math.PI * 2
      const xl = rho * Math.cos(th)
      const zl = rho * Math.sin(th)
      // Écartée (autour de z), puis avancée par le pli (autour de x, −fwd) :
      // l'ordre des groupes de `Doll.tsx`.
      const y1 = xl * sa + yl * ca
      const x = hx + xl * ca - yl * sa
      const y = hy + y1 * cf + zl * sf
      const z = zl * cf - y1 * sf
      if (y / half < SEAT_SY || (yl < 0 && Math.cos(th) < 0.5)) continue
      worst = Math.max(worst, torsoOutside(s, x, y, z) / r)
    }
  }
  return worst
}

const _ta = new THREE.Vector3()
const _tb = new THREE.Vector3()
const _tc = new THREE.Vector3()

export function onTorso(p: DollParams, azimuth: number, y: number, lift: number): SurfacePoint {
  const s = p.shape
  const sy = clamp(y / (s.torsoHeight * 0.5), -0.92, 0.92)
  const pos = torsoPoint(s, sy, azimuth)
  // Normale par différences finies : la sculpture n'a pas de gradient simple,
  // et celle de l'ellipsoïde ferait pencher ce qu'on coud sur un ventre ou un
  // pectoral.
  const e = 1e-3
  torsoPoint(s, sy, azimuth + e, _ta).sub(torsoPoint(s, sy, azimuth - e, _tc))
  torsoPoint(s, sy + e, azimuth, _tb).sub(torsoPoint(s, sy - e, azimuth, _tc))
  const normal = new THREE.Vector3().crossVectors(_ta, _tb).normalize()
  pos.addScaledVector(normal, lift)
  return { pos, normal, quat: new THREE.Quaternion().setFromUnitVectors(FORWARD, normal) }
}

/**
 * Attaches des membres, sculpture comprise : un buste en V porte ses bras plus
 * loin, des hanches larges écartent les jambes. Partagé par le rendu
 * (`dollLayout`) et les colliders — sinon les sphères ratent les membres.
 */
export function shoulderX(s: Shape) {
  return s.torsoRadius * s.torsoTaper * 0.88 * torsoSculpt(s, 0.56, Math.PI / 2)
}
export function hipX(p: DollParams) {
  const s = p.shape
  const lb = p.limbs
  // Au moins l'épaisseur d'une cuisse, renflement compris : sinon deux cuisses
  // de kangourou ou de poupon s'interpénètrent au milieu (mesuré : −0,12).
  const thigh = lb.legRadius * (1 - (lb.legTaper ?? 0) * 0.25) * (1 + (lb.legUpper ?? 0))
  // Sans l'élargissement de l'assise : c'est le tronc qui vient couvrir les
  // cuisses, pas les cuisses qui s'écartent à mesure qu'il s'élargit.
  // Et un jour franc entre les cuisses, écartement compris : l'ancien raccord,
  // qui élargissait la bosse des hanches, les écartait du même coup ; sans
  // lui elles se frôlaient au renflement (0,003).
  const bare = (s as Shape).seatWidth ? { ...s, seatWidth: 0 } : s
  return Math.max(
    s.torsoRadius * 0.44 * Math.sqrt(torsoSculpt(bare, -0.72, Math.PI / 2)),
    thigh * 0.95,
    thigh + 0.006 - Math.sin(lb.legSpread) * lb.legLength * 0.25,
  )
}

/**
 * Rayon du corps à une hauteur donnée, **dans le repère du cou**.
 *
 * Crâne et torse confondus, au maximum des deux : la peluche n'a pratiquement
 * pas de cou, les deux volumes se recouvrent largement, et c'est le plus large
 * qui porte ce qu'on lui pose dessus. Tout accessoire qui fait le tour du corps
 * en dépend — écharpe, collier — et une copie de cette formule finit par
 * diverger dès qu'on change une proportion.
 *
 * Les facteurs reprennent l'aplatissement de face de chaque volume (`rz`), le
 * plus étroit des deux axes : mieux vaut qu'un ornement effleure le corps sur
 * les côtés qu'il flotte devant.
 */
export function bodyRadius(p: DollParams, y: number) {
  const s = p.shape
  const headC = s.headRadius * s.headSquash * 0.78
  const hs = (y - headC) / (s.headSquash * s.headRadius)
  const head =
    Math.abs(hs) < 1 ? headWidth(p, hs, 0.5) * s.headRadius * Math.sqrt(1 - hs * hs) * 0.96 : 0

  const ts = (y + s.torsoHeight * 0.44) / (s.torsoHeight * 0.5)
  const torso =
    Math.abs(ts) < 1
      ? (1 + (s.torsoTaper - 1) * (ts + 1) * 0.5) * s.torsoRadius *
        // Moyenne du flanc et de la face (celle-ci aplatie par l'épaisseur) ;
        // l'assise ne tient que les flancs (voir `torsoPoint`).
        0.5 * (torsoRing(s.torsoSquare, ts, (s as Shape).seat) * torsoSculpt(s, ts, Math.PI / 2) +
          torsoRing(s.torsoSquare, ts) * (s.torsoDepth ?? 0.86) * torsoSculpt(s, ts, 0)) * 0.97
      : 0

  return Math.max(head, torso)
}

/**
 * Sphères des bras, **dans le repère du cou**.
 *
 * Les bras sont écartés (`armSpread` vaut près d'un radian par défaut) : une
 * chaîne de sphères posée à l'aplomb de l'épaule les rate complètement, et ce
 * qu'on drape autour du corps passe au travers. On rejoue donc la formule du
 * rendu — épaule, puis descente le long de l'axe incliné.
 *
 * `shift` décale le résultat vers le repère de l'appelant : l'écharpe vit plus
 * bas que le cou, le collier à sa hauteur.
 */
/** Sphères le long d'un bras : fraction de la longueur, facteur de rayon. */
export const ARM_T = [[0, 1.15], [0.4, 1], [0.8, 1], [1.15, 1.25]] as const
/** Idem pour une jambe. */
export const LEG_T = [[0, 1.1], [0.4, 1], [0.8, 1], [1.1, 1.3]] as const

export function armSpheres(p: DollParams, skin: number, shift = 0): Collider[] {
  const s = p.shape
  const lb = p.limbs
  const shoulderY = -s.torsoHeight * 0.16 + shift
  const sx = shoulderX(s)
  const ax = Math.sin(lb.armSpread)
  const ay = Math.cos(lb.armSpread)

  const out: Collider[] = []
  for (const side of [-1, 1]) {
    for (const [t, k] of ARM_T) {
      out.push({
        center: new THREE.Vector3(
          side * (sx + t * lb.armLength * ax),
          shoulderY - t * lb.armLength * ay,
          0,
        ),
        radius: lb.armRadius * k + skin,
      })
    }
  }
  return out
}

/**
 * Sphères des jambes, **dans le repère du cou**.
 *
 * Le corps de révolution s'arrête au bassin : tout ce qui pend plus bas — le pan
 * avant d'une écharpe, par exemple — n'y rencontre plus rien et traverse la
 * jambe de part en part. Un plancher de rayon sur la pose de repos ne suffit
 * pas : à l'écartement par défaut, le bord extérieur d'une cuisse est deux fois
 * plus loin de l'axe que ce plancher. Comme pour les bras, on rejoue la formule
 * du rendu — hanche, puis descente le long de l'axe incliné, pied compris.
 */
export function legSpheres(p: DollParams, skin: number, shift = 0): Collider[] {
  const s = p.shape
  const lb = p.limbs
  const hipY = -s.torsoHeight * 0.8 + shift
  const hx = hipX(p)
  const ax = Math.sin(lb.legSpread)
  const ay = Math.cos(lb.legSpread)

  const out: Collider[] = []
  for (const side of [-1, 1]) {
    for (const [t, k] of LEG_T) {
      out.push({
        center: new THREE.Vector3(
          side * (hx + t * lb.legLength * ax),
          hipY - t * lb.legLength * ay,
          0,
        ),
        radius: lb.legRadius * k + skin,
      })
    }
  }
  return out
}

/**
 * Chaîne de sphères **inscrites** approchant le corps entre deux hauteurs.
 *
 * Inscrites, pas au rayon local : près d'un pôle le profil retombe bien plus
 * vite qu'une sphère de ce rayon, qui déborde alors de plusieurs millimètres —
 * et c'est justement sous le menton que se posent écharpes et colliers.
 */
export function bodySpheres(
  p: DollParams,
  from: number,
  to: number,
  skin: number,
  shift = 0,
): Collider[] {
  const top = p.shape.headRadius * p.shape.headSquash * 1.78
  const bottom = -p.shape.torsoHeight * 0.94
  const SCAN = 90

  const inscribed = (y0: number) => {
    let r = Infinity
    for (let k = 0; k <= SCAN; k++) {
      const y = bottom + ((top - bottom) * k) / SCAN
      r = Math.min(r, Math.hypot(bodyRadius(p, y), y - y0))
    }
    return r
  }

  const out: Collider[] = []
  const steps = Math.max(6, Math.round((from - to) / (p.shape.headRadius * 0.16)))
  for (let k = 0; k <= steps; k++) {
    const y = from - ((from - to) * k) / steps
    const r = inscribed(y)
    if (r > 1e-3) out.push({ center: new THREE.Vector3(0, y + shift, 0), radius: r + skin })
  }
  return out
}

/**
 * Rayon minimal, dans la direction `a` et à la hauteur `y`, pour dégager un jeu
 * de sphères posées hors de l'axe — les bras, en pratique.
 *
 * Le rayon d'un accessoire qui fait le tour du corps se déduit du corps de
 * **révolution** ; les bras n'y sont pas, ils saillent sur les flancs, et
 * l'accessoire leur passe au ras puis s'y enfonce. Le dégagement ne peut pas
 * être une constante non plus : la boucle enflerait partout pour une gêne qui
 * n'existe que sur deux azimuts.
 */
export function armClearance(spheres: readonly Collider[], a: number, y: number) {
  const ca = Math.cos(a)
  const sa = Math.sin(a)
  let r = 0
  for (const c of spheres) {
    const dy = y - c.center.y
    const disc = c.radius * c.radius - dy * dy - c.center.x * c.center.x * sa * sa
    if (disc > 0) r = Math.max(r, c.center.x * ca + Math.sqrt(disc))
  }
  return r
}
