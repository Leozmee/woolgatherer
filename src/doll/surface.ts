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
 * bloc du pavé, sans arêtes (exposant plafonné à 3,6, un coussin et non une
 * boîte). Une copie de cette formule dériverait, et tout ce qui est posé sur
 * le tronc flotterait ou s'enfoncerait.
 */
export function torsoRing(square: number | undefined, sy: number) {
  const n = 2 + 1.6 * clamp(square ?? 0, 0, 1)
  return Math.pow(Math.max(0, 1 - Math.pow(Math.min(1, Math.abs(sy)), n)), 1 / n)
}

type Shape = DollParams['shape']

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
 */
export function torsoSculpt(s: Shape, sy: number, az: number) {
  const f = Math.cos(az)
  const front = Math.max(0, f)
  const back = Math.max(0, -f)
  const lat = 1 - f * f
  const g = (c: number, w: number) => Math.exp(-(((sy - c) / w) ** 2))
  return Math.max(
    0.4,
    1 +
      (s.chest ?? 0) * g(0.38, 0.36) * (0.5 + 0.5 * front) -
      (s.waist ?? 0) * g(-0.22, 0.26) +
      (s.belly ?? 0) * g(-0.3, 0.38) * front * front +
      (s.hips ?? 0) * g(-0.62, 0.3) * (0.3 + 0.7 * lat) +
      (s.hunch ?? 0) * g(0.48, 0.38) * back * back,
  )
}

/**
 * Point du tronc **idéal** (avant bosselage), repère du torse. Source unique
 * de la géométrie (`torsoGeometry`) et de la surface (`onTorso`) : toute copie
 * dériverait, et les pièces cousues flotteraient ou s'enfonceraient.
 */
export function torsoPoint(s: Shape, sy: number, az: number, out = new THREE.Vector3()) {
  const t = (sy + 1) * 0.5
  const w = (1 + (s.torsoTaper - 1) * t) * s.torsoRadius * torsoRing(s.torsoSquare, sy) * torsoSculpt(s, sy, az)
  return out.set(Math.sin(az) * w, sy * s.torsoHeight * 0.5, Math.cos(az) * w * (s.torsoDepth ?? 0.86))
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
export function hipX(s: Shape) {
  return s.torsoRadius * 0.44 * Math.sqrt(torsoSculpt(s, -0.72, Math.PI / 2))
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
      ? (1 + (s.torsoTaper - 1) * (ts + 1) * 0.5) * s.torsoRadius * torsoRing(s.torsoSquare, ts) *
        // Moyenne du flanc et de la face (celle-ci aplatie par l'épaisseur).
        0.5 * (torsoSculpt(s, ts, Math.PI / 2) + (s.torsoDepth ?? 0.86) * torsoSculpt(s, ts, 0)) * 0.97
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
  const hx = hipX(s)
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
