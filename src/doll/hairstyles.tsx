import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { SpringBone, type Collider, type SpringConfig } from '../core/springBone'
import { useDisposable } from '../core/useDisposable'
import { clamp, mulberry32 } from '../core/rand'
import type { CordMaps } from '../core/cord'
import { onHeadPolar } from './surface'
import { EYE_SCALE } from './face'
import { zipHole } from './zip'
import type { DollParams } from './params'

/**
 * Coiffures en laine, au-delà des locks.
 *
 * Une planche où les six poupées portent des locks ne varie que par leur
 * couleur et leur longueur : on voit six fois la même coupe. Chaque coiffure ici
 * reste une coiffure **de poupée de chiffon** — du fil de laine cousu sur le
 * crâne, pas des cheveux — mais avec sa propre silhouette :
 *
 * - **locks** : les dreadlocks tressées, simulées (`hair.tsx`) ;
 * - **bouclettes** : une tignasse de boucles de laine plantées dans le crâne ;
 * - **mèches** : une coupe au bol, frange devant, carré court ou long ;
 * - **chignon** : cheveux tirés vers une pelote, ou deux macarons ;
 * - **houppette** : un plumet noué qui jaillit du sommet ;
 * - **trois poils** : quelques tire-bouchons sur un crâne presque nu ;
 * - **couettes** : deux touffes nouées d'un ruban, de chaque côté ;
 * - **queue de cheval** : cheveux tirés vers une touffe nouée derrière ;
 * - **nattes** : deux tresses de laine, un ruban et un pompon au bout ;
 * - **grande frange** : cheveux longs et raides, frange épaisse qui balance.
 *
 * Tout ce qui touche le crâne passe par `onHeadPolar` — la même source que la
 * géométrie de la tête, bajoues comprises. Chaque brin a sa racine **sous** la
 * surface : un fil posé dessus lit comme une perruque, c'est le même piège que
 * pour les locks.
 *
 * Tous les brins d'une coiffure sont fusionnés en une géométrie par matière :
 * un à trois appels de rendu par coiffure, contre un par segment pour les locks.
 */
export type HairStyle =
  | 'locks'
  | 'boucles'
  | 'meches'
  | 'chignon'
  | 'houppette'
  | 'couettes'
  | 'queue'
  | 'nattes'
  | 'frange'

export const HAIR_STYLES: readonly HairStyle[] = [
  'locks', 'boucles', 'meches', 'chignon', 'houppette', 'couettes', 'queue', 'nattes', 'frange',
]

export const HAIR_STYLE_NAMES: Record<HairStyle, string> = {
  locks: 'locks',
  boucles: 'bouclettes',
  meches: 'mèches',
  chignon: 'chignon',
  houppette: 'houppette',
  couettes: 'couettes',
  queue: 'queue de cheval',
  nattes: 'nattes',
  frange: 'grande frange',
}

/** Coiffure d'une poupée seule. */
export function hairStyleFor(seed: number): HairStyle {
  return HAIR_STYLES[Math.floor(mulberry32(seed + 919)() * HAIR_STYLES.length)]
}

/**
 * Coiffures d'une planche : **toutes différentes**, tirées sans remise.
 * Même règle que pour les laines, les archétypes et les visages ; avec neuf
 * coupes pour six poupées, une planche en laisse trois de côté, jamais les
 * mêmes.
 */
export function boardHairStyles(seed: number, count: number): HairStyle[] {
  const rnd = mulberry32(seed + 919)
  const out: HairStyle[] = []
  while (out.length < count) {
    const deck = [...HAIR_STYLES]
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1))
      ;[deck[i], deck[j]] = [deck[j], deck[i]]
    }
    out.push(...deck)
  }
  return out.slice(0, count)
}

// ---------------------------------------------------------------- physique

/**
 * Un point d'articulation de la coiffure : là où une touffe est attachée.
 *
 * Les locks sont des chaînes d'os, un par segment. Ici les brins sont fusionnés
 * en une géométrie, et on ne peut pas y accrocher des os : on anime donc au
 * **vertex shader**. Chaque pivot porte un spring bone invisible ; chaque sommet
 * pivote autour de son pivot d'autant de fois l'angle du ressort que sa
 * **mobilité** (`aFree`, 0 à la racine, 1 à la pointe). La racine reste cousue,
 * la pointe traîne — le fouetté des locks, sans un os par brin.
 *
 * Pour les mèches, le pivot est le centre du crâne : une rotation autour du
 * centre garde chaque point à sa distance du centre, donc un brin posé sur le
 * crâne glisse dessus sans s'y enfoncer.
 */
type Mover = {
  pivot: THREE.Vector3
  /** Direction de repos de la touffe, dans le repère de la tête. */
  dir: THREE.Vector3
  length: number
  cfg: SpringConfig
  /** Débattement maximal : au-delà, une touffe traverserait la tête. */
  maxAngle: number
}

/**
 * Pivots par coiffure. 32 : un ressort **par mèche** pour la grande frange —
 * 20 mèches de longueurs et 5 ou 6 de frange. En blocs (3 pour les longueurs,
 * 4 pour la frange), la chevelure balançait d'un seul mouvement, comme une
 * perruque ; une mèche par ressort, chacune à son rythme, c'est ce qui se lit
 * comme de la physique.
 */
const MAX_MOVERS = 32
/** Décollement de la frange aux tempes, pour passer au-dessus du volume des longueurs. */
const FRINGE_OVER = 0.11

// ---------------------------------------------------------------- outils

const UP = new THREE.Vector3(0, 1, 0)
const DOWN = new THREE.Vector3(0, -1, 0)
const GOLDEN = Math.PI * (3 - Math.sqrt(5))

/**
 * Ressorts répartis en secteurs autour de la tête, pivot au centre, bout placé
 * vers le secteur (à l'aplomb du centre, il serait sur l'axe de rotation de la
 * poupée et ne ressentirait rien). Renvoie la fonction azimut → pivot.
 */
function sectorMovers(out: Parts, rnd: () => number, R: number, count: number, maxAngle: number, stiffness: number) {
  const first = out.movers.length
  for (let k = 0; k < count; k++) {
    const ac = ((k + 0.5) / count) * Math.PI * 2
    out.movers.push({
      pivot: new THREE.Vector3(),
      dir: new THREE.Vector3(Math.sin(ac) * 0.75, -0.66, Math.cos(ac) * 0.75).normalize(),
      length: R,
      cfg: { stiffness: stiffness * (0.8 + rnd() * 0.4), drag: 0.1 + rnd() * 0.06, gravity: 0 },
      maxAngle,
    })
  }
  return (az: number) =>
    first + (Math.floor(((((az % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2)) * count) % count)
}

/**
 * Attributs de physique sur une géométrie d'un bloc (pelote, nœud).
 *
 * L'écartement a sa propre valeur : il s'applique au shader **même sans
 * ressort**, et recopié depuis `free`, la pelote d'un chignon s'envolait seule
 * au-dessus de cheveux tirés immobiles (mesuré : 0,11 à 0,18).
 */
function still(geo: THREE.BufferGeometry, mover = -1, free = 0, fling = free): THREE.BufferGeometry {
  const n = geo.attributes.position.count
  geo.setAttribute('aMover', new THREE.Float32BufferAttribute(new Float32Array(n).fill(mover), 1))
  geo.setAttribute('aFree', new THREE.Float32BufferAttribute(new Float32Array(n).fill(free), 1))
  geo.setAttribute('aFling', new THREE.Float32BufferAttribute(new Float32Array(n).fill(fling), 1))
  geo.setAttribute('aPhase', new THREE.Float32BufferAttribute(new Float32Array(n), 1))
  return geo
}

type YarnOpts = {
  closed?: boolean
  /** Pivot qui anime ce brin, et sa mobilité le long du brin (t de 0 à 1). */
  mover?: number
  free?: (t: number) => number
  /**
   * Part de l'écartement centrifuge le long du brin ; `free` par défaut.
   * Séparée de la mobilité : un brin peut **glisser** sur le crâne dès sa
   * racine — rotation autour du centre, il reste à sa surface — mais pas s'en
   * **écarter**, sinon la racine décolle.
   */
  fling?: (t: number) => number
  /** Décalage de phase du souffle, propre au brin. */
  phase?: number
  /** Tube portant la texture de tresse plutôt que celle de fil retors. */
  braid?: boolean
  /**
   * Un anneau tous les `step` rayons (3 par défaut). Plus serré pour une
   * spirale ou une boucle — à 3, un tire-bouchon n'avait que 1,4 à 4,1
   * anneaux par tour et dessinait un bâton en zigzag —, plus lâche (6) sur
   * les arcs lisses des cheveux tirés, qui perdent la moitié de leurs
   * triangles sans que ça se voie.
   */
  step?: number
  /** Nombre d'anneaux imposé (spirales). */
  segs?: number
  /** Part effilée de la pointe (0,2) ; plus longue, un trait de pinceau. */
  taper?: number
  /** Éclaircissement le long du brin (0 : laine de la coupe, 1 : teinte de pointe). */
  tint?: (t: number) => number
}

/**
 * Un brin de laine le long d'un tracé.
 *
 * Les UV sont recalées **en longueur réelle** : une tuile de fil retors vaut un
 * pas de torsion. Laissées de 0 à 1, un brin long aurait une torsion étirée et
 * une boucle courte une torsion serrée — deux laines différentes sur la même
 * tête.
 *
 * La pointe d'un brin ouvert est **effilée** : le dernier cinquième du tube se
 * referme en cône. Une calotte sphérique au bout lisait, à la taille d'une
 * planche, comme une rangée de points sur le front.
 */
function yarn(points: THREE.Vector3[], radius: number, o: YarnOpts = {}): THREE.BufferGeometry {
  const closed = !!o.closed
  const curve = new THREE.CatmullRomCurve3(points, closed, 'centripetal')
  const len = curve.getLength()
  // Un anneau tous les trois rayons, six côtés : sous le trait d'encre et à la
  // taille d'une tête, la différence avec 2,2 rayons et sept côtés ne se voit
  // pas, et la coiffure perd un tiers de ses triangles (320 000 sur la planche).
  // Un tube fermé (anneau, lien, boucle de ruban) a au moins 16 segments : à
  // 6 ou 7, les rubans étaient des hexagones.
  const segs = o.segs ?? clamp(Math.ceil(len / (radius * (o.step ?? 3))), closed ? 16 : 6, o.step !== undefined ? 128 : 48)
  const radial = 6
  const tube = new THREE.TubeGeometry(curve, segs, radius, radial, closed)
  const pos = tube.attributes.position as THREE.BufferAttribute
  const uv = tube.attributes.uv as THREE.BufferAttribute

  if (o.braid) {
    // La tresse (`cord.ts`) court le long de `v` et fait le tour sur `u` :
    // l'inverse d'un tube. On échange, et un motif de tresse vaut quatre rayons.
    const pitch = radius * 4
    for (let i = 0; i < uv.count; i++) {
      const along = uv.getX(i)
      uv.setXY(i, uv.getY(i), (along * len) / pitch)
    }
  } else {
    const pitch = radius * 7
    for (let i = 0; i < uv.count; i++) uv.setX(i, (uv.getX(i) * len) / pitch)
  }

  const n = pos.count
  const mover = new Float32Array(n).fill(o.mover ?? -1)
  const free = new Float32Array(n)
  const fling = new Float32Array(n)
  const phase = new Float32Array(n).fill(o.phase ?? 0)
  const tint = new Float32Array(n)
  const c = new THREE.Vector3()
  const v = new THREE.Vector3()
  for (let i = 0; i <= segs; i++) {
    const t = i / segs
    const f = o.free ? o.free(t) : 0
    const fl = o.fling ? o.fling(t) : f
    const ti = o.tint ? o.tint(t) : 0
    // Effilage : sommets ramenés vers l'axe sur la part effilée de la pointe.
    const taper = closed ? 1 : Math.sqrt(clamp((1 - t) / (o.taper ?? 0.2), 0, 1))
    if (taper < 1) curve.getPointAt(Math.min(1, t), c)
    for (let j = 0; j <= radial; j++) {
      const k = i * (radial + 1) + j
      free[k] = f
      fling[k] = fl
      tint[k] = ti
      if (taper < 1) {
        v.fromBufferAttribute(pos, k).sub(c).multiplyScalar(Math.max(taper, 0.05)).add(c)
        pos.setXYZ(k, v.x, v.y, v.z)
      }
    }
  }
  tube.setAttribute('aMover', new THREE.Float32BufferAttribute(mover, 1))
  tube.setAttribute('aFree', new THREE.Float32BufferAttribute(free, 1))
  tube.setAttribute('aFling', new THREE.Float32BufferAttribute(fling, 1))
  tube.setAttribute('aPhase', new THREE.Float32BufferAttribute(phase, 1))
  tube.setAttribute('aTint', new THREE.Float32BufferAttribute(tint, 1))
  return tube
}

function merged(parts: THREE.BufferGeometry[]): THREE.BufferGeometry | null {
  if (!parts.length) return null
  const out = mergeGeometries(parts)
  parts.forEach((g) => g.dispose())
  return out
}

/** Base orthonormée du plan tangent à une normale. */
function tangentBasis(n: THREE.Vector3): [THREE.Vector3, THREE.Vector3] {
  const ref = Math.abs(n.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : UP
  const t1 = new THREE.Vector3().crossVectors(ref, n).normalize()
  const t2 = new THREE.Vector3().crossVectors(n, t1).normalize()
  return [t1, t2]
}

/** Direction unitaire depuis le centre du crâne, en (azimut, hauteur). */
function dirOf(az: number, sy: number) {
  const r = Math.sqrt(Math.max(0, 1 - sy * sy))
  return new THREE.Vector3(Math.sin(az) * r, sy, Math.cos(az) * r)
}

/**
 * Point du crâne dans la direction `d` (vecteur unitaire depuis le centre).
 *
 * `cap` borne la hauteur : à 0,98 (défaut, celui de la grande frange), tout
 * point à moins de 11° du pôle retombait sur un anneau de 0,2 R — un disque nu
 * de 7 diamètres de fil au sommet, le trou vu de dessus. Les cheveux tirés
 * passent 0,9995 : `onHeadPolar` est régulier au pôle.
 */
function onDir(p: DollParams, d: THREE.Vector3, lift: number, cap = 0.98) {
  return onHeadPolar(p, Math.atan2(d.x, d.z), clamp(d.y, -0.98, cap), lift)
}

/** Borne haute des cheveux tirés et de ce qui en part : le pôle est couvert. */
const POLE = 0.9995

/** Transition douce de 0 (en a) à 1 (en b). */
export const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}

/** Mobilité nulle jusqu'à `t0` — la partie tenue —, puis linéaire jusqu'à 1. */
export const after = (t0: number) => (t: number) => clamp((t - t0) / Math.max(1e-3, 1 - t0), 0, 1)

/**
 * Cotes du visage qui bornent franges et mèches latérales, **déduites** des
 * boutons et jamais réglées à la main. Bornes hautes des tirages de `Doll`
 * (écart des yeux ±12 %, taille +14 %) : aucune poupée ne peut les dépasser.
 *
 * - `edge(f)` : hauteur normalisée du bord d'une frange, `f` tailles de
 *   bouton au-dessus des yeux (même loi que `hairline`) ;
 * - `maxAngle(edgeSy)` : débattement d'un ressort pivotant au centre tel que
 *   la pointe, qui glisse de R·angle, ne descende jamais sur un bouton ;
 * - `sideAz` : azimut au-delà du bord des boutons, pour les mèches latérales.
 */
export function faceSafe(p: DollParams) {
  const R = p.shape.headRadius
  const ry = R * p.shape.headSquash
  const size = Math.max(p.face.leftSize, p.face.rightSize) * EYE_SCALE * 1.14
  const buttonTop = p.face.eyeHeight + size
  return {
    edge: (f: number) => clamp((p.face.eyeHeight + size * f) / ry, 0.3, 0.85),
    maxAngle: (edgeSy: number, freeMax = 1) => clamp((0.8 * (edgeSy * ry - buttonTop)) / (R * freeMax), 0.04, 0.3),
    sideAz: clamp(Math.asin(clamp((p.face.eyeSpacing * 0.56 + size) / R, 0, 0.95)) + 0.2, 0.95, 1.3),
  }
}

/**
 * Repousse hors du crâne un point de brin qui pend.
 *
 * Une touffe attachée sur le côté tombe à la verticale ; or sous l'attache la
 * tête s'élargit — bajoues — et une chute droite passe dedans. On mesure le
 * rayon du crâne à la hauteur du point et on l'écarte d'autant, plus `margin`.
 */
function clearHead(p: DollParams, q: THREE.Vector3, margin: number) {
  const ry = p.shape.headRadius * p.shape.headSquash
  const sy = q.y / ry
  if (Math.abs(sy) >= 0.98) return q
  const s = onHeadPolar(p, Math.atan2(q.x, q.z), sy, margin)
  const h = Math.hypot(q.x, q.z)
  const need = Math.hypot(s.pos.x, s.pos.z)
  if (h < need && h > 1e-6) {
    q.x *= need / h
    q.z *= need / h
  }
  return q
}

/**
 * Lisière du front, en hauteur normalisée du crâne, selon l'azimut.
 *
 * Devant, rien ne descend sur les boutons : une frange sur les yeux mange le
 * visage, et c'est lui qui distingue les poupées. Elle se prend sur le visage
 * réel — hauteur des yeux, taille des boutons — et non sur une constante, sinon
 * une grosse tête aux yeux hauts se retrouve la frange dans les yeux. Sur les
 * côtés et derrière, la limite est celle de la coupe.
 */
function hairline(p: DollParams, low: number, fringe = 2.7) {
  const ry = p.shape.headRadius * p.shape.headSquash
  // Taille **réelle** des boutons, agrandissement compris : la frange doit
  // s'arrêter au-dessus de ce qui est dessiné, pas du réglage.
  const size = Math.max(p.face.leftSize, p.face.rightSize) * EYE_SCALE * 1.14
  const front = clamp((p.face.eyeHeight + size * fringe) / ry, 0.3, 0.85)
  return (az: number) => {
    const c = Math.max(0, Math.cos(az))
    const w = clamp((c - 0.25) / 0.6, 0, 1)
    return low + (Math.max(front, low) - low) * w * w * (3 - 2 * w)
  }
}

/** Rubans : des teintes franches, pour trancher sur la laine des cheveux. */
/**
 * Lisière basse des coupes à cheveux tirés, derrière et sur les côtés.
 *
 * Placée à l'équateur du crâne comme sur une tête humaine, elle laissait nu
 * tout le bas de l'arrière de la tête : la peluche n'a pas de cou, sa nuque
 * est le bas du crâne. Vu de profil, une queue de cheval sortait d'une
 * calotte au-dessus d'un crâne chauve.
 */
const NAPE_LOW = -0.48

const RIBBONS = ['#c9544d', '#4f7fb0', '#e0b44a', '#6fa36b', '#b06fa8', '#e9e1cf', '#e08a6a', '#5a5f9e']

type Built = {
  yarn: THREE.BufferGeometry | null
  braid: THREE.BufferGeometry | null
  ribbon: THREE.BufferGeometry | null
  ribbonColor: string
  movers: Mover[]
  /** Grosseur de fil de référence de la coupe — étalon des audits. */
  yarnR: number
}

class Parts {
  yarn: THREE.BufferGeometry[] = []
  braid: THREE.BufferGeometry[] = []
  ribbon: THREE.BufferGeometry[] = []
  movers: Mover[] = []
  ribbonColor = RIBBONS[0]
  build(): Built {
    return {
      yarn: merged(this.yarn),
      braid: merged(this.braid),
      ribbon: merged(this.ribbon),
      ribbonColor: this.ribbonColor,
      movers: this.movers,
      yarnR: 0,
    }
  }
}

/** Anneau de fil autour d'un axe — nœud, lien, ruban. */
function ring(center: THREE.Vector3, axis: THREE.Vector3, radius: number, thread: number, o: YarnOpts = {}) {
  const [a, b] = tangentBasis(axis.clone().normalize())
  const pts = Array.from({ length: 14 }, (_, k) => {
    const t = (k / 14) * Math.PI * 2
    return center.clone().addScaledVector(a, Math.cos(t) * radius).addScaledVector(b, Math.sin(t) * radius)
  })
  return yarn(pts, thread, { ...o, closed: true })
}

/** Lisière des cheveux tirés : `low` derrière et sur les côtés, `front` devant. */
function hairlineAt(low: number, front: number) {
  return (az: number) => {
    const w = clamp((Math.max(0, Math.cos(az)) - 0.25) / 0.6, 0, 1)
    return low + (Math.max(front, low) - low) * w * w * (3 - 2 * w)
  }
}

type PulledOpts = {
  /** Pas entre racines voisines, couches confondues, en rayons de fil (1,8). */
  pitch?: number
  /** Lisière avant relevée (hauteur normalisée au centre), sous une frange. */
  crown?: number
  /** Arrêt avant l'attache, en angle : le brin plonge sous le lien ou la pelote. */
  tuck?: number
  /** Crêtes de tension sur la couche du dessus (0 : aucune). */
  grooves?: number
}

/**
 * Cheveux tirés de la lisière vers une ou plusieurs attaches : **tenus**.
 *
 * Chaque brin glisse sur le crâne jusqu'à son attache par le plus court chemin
 * sur la sphère. Serrés par le lien, ils ne bougent pas : aucun ressort, ni
 * mobilité ni écartement — seules les parties libres (queue, nattes, pelote)
 * ont une physique. Avec des ressorts par secteur, le dessus du crâne balançait
 * comme les queues ; et leur mobilité était la plus forte au bout noué, qui
 * sortait de dessous le ruban.
 *
 * **Densité, sans base.** Les brins sont le plus écartés là où ils partent, sur
 * le bord de la zone (ils convergent ensuite). Les racines y sont donc posées
 * au **pas constant en longueur réelle** — la lisière, et la raie quand deux
 * attaches se font face —, un brin tous les 1,8 rayon, sur deux couches
 * alternées. Posées au pas d'azimut, elles s'espaçaient aux tempes, où la
 * lisière monte vite : 47 à 65 % du crâne couvert là, avec le trou du pôle en
 * prime. Au-delà de 90° de l'attache, les chemins s'écartent encore avant de
 * converger : la longueur y compte pour 1/sin θ.
 *
 * **Relèvement.** La couche du dessous dépasse juste la pointe du duvet ; celle
 * du dessus garde l'enveloppe d'avant — pas d'effet casque.
 *
 * Rend la ligne de lisière avant, d'où une frange peut partir vers l'avant
 * pendant que les tirés partent vers l'arrière : une seule source, aucun
 * recouvrement.
 */
function pulled(
  p: DollParams,
  rnd: () => number,
  r: number,
  targets: THREE.Vector3[],
  out: Parts,
  low: number,
  o: PulledOpts = {},
) {
  const limit = o.crown !== undefined ? hairlineAt(low, o.crown) : hairline(p, low)
  // Lisière irrégulière, un peu plus basse derrière.
  const rim = (az: number) => dirOf(az, limit(az) + 0.02 - Math.max(0, -Math.cos(az)) ** 3 * 0.1)
  const dirs = targets.map((t) => t.clone().normalize())
  const nearest = (f: THREE.Vector3) => dirs.reduce((a, d) => (d.dot(f) > a.dot(f) ? d : a), dirs[0])
  const split = dirs.length === 2 && dirs[0].x * dirs[1].x < 0
  const zip = zipBand(p, r)
  const a0 = Math.asin(clamp(limit(0), -0.99, 0.99))
  const a1 = Math.PI - Math.asin(Math.max(-0.9, limit(Math.PI) - 0.1))
  // Bord du ruban, du côté `sx`, de la lisière jusqu'au bout haut.
  const zipEdge = (sx: number, count: number) =>
    Array.from({ length: count }, (_, k) => {
      const y = zip.top + (Math.max(zip.bottom, limit(Math.PI) - 0.1) - zip.top) * (k / (count - 1))
      return new THREE.Vector3(sx * zip.half, y, -Math.sqrt(Math.max(0, 1 - y * y - zip.half * zip.half)))
    })
  const offTape = (d: THREE.Vector3) => d.z < 0 && Math.abs(d.x) < zip.half && d.y < zip.top + 0.02
  /*
   * Zones, et côté de la fermeture de chaque racine (`side`).
   *
   * Deux attaches opposées : chaque moitié a pour bord la raie puis sa
   * demi-lisière. La raie est **le ruban** le long de la fermeture, et se
   * **referme** au-delà de son bout haut : les racines y passent d'un
   * cheveu de l'autre côté, les deux moitiés se chevauchent, aucun crâne nu.
   *
   * Une seule attache : la lisière entière, coupée par le ruban, plus ses
   * deux bords jusqu'au bout haut.
   */
  /** `edge` : racine au bord du ruban ; `shut` : sur la raie refermée. Ni l'une ni l'autre n'est enfouie. */
  type Zone = { to: THREE.Vector3 | null; line: THREE.Vector3[]; side: number[]; edge: boolean[]; shut?: boolean[] }
  const zones: Zone[] = split
    ? dirs.map((to) => {
        const sx = Math.sign(to.x)
        const aTop = Math.PI - Math.asin(zip.top)
        const part = Array.from({ length: 121 }, (_, k) => {
          const a = a0 + ((a1 - a0) * k) / 120
          const x = a < aTop ? -sx * 0.03 : sx * zip.half
          const y = Math.sin(a)
          const c = Math.sqrt(Math.max(0, 1 - x * x - y * y))
          return new THREE.Vector3(x, y, Math.sign(Math.cos(a)) * c)
        })
        const edge = Array.from({ length: 180 }, (_, k) => rim(sx * (Math.PI - (Math.PI * (k + 1)) / 181))).filter(
          (d) => !offTape(d),
        )
        const line = [...part, ...edge]
        const onTape = line.map((d, i) => i < part.length && d.z < 0 && d.y < zip.top)
        const shut = line.map((_, i) => i < part.length && !onTape[i])
        return { to: to as THREE.Vector3 | null, line, side: line.map(() => sx), edge: onTape, shut }
      })
    : (() => {
        const around = Array.from({ length: 721 }, (_, k) => rim((k / 720) * Math.PI * 2 - Math.PI)).filter(
          (d) => !offTape(d),
        )
        // La lisière part de la nuque côté x < 0, fait le tour par l'avant.
        const left = zipEdge(-1, 60)
        const right = zipEdge(1, 60).reverse()
        const line = [...left, ...around, ...right]
        const side = line.map((d, i) => (i < left.length ? -1 : i >= line.length - right.length ? 1 : Math.sign(d.x) || 1))
        const edge = line.map((_, i) => i < left.length || i >= line.length - right.length)
        return [{ to: null, line, side, edge }]
      })()

  const base = Math.max(r * 0.8, p.shell.height - r * 0.9)
  for (const z of zones) {
    const pos = z.line.map((d) => onDir(p, d, 0, POLE).pos)
    const cum = [0]
    for (let i = 1; i < pos.length; i++) {
      const th = z.line[i].angleTo(z.to ?? nearest(z.line[i]))
      const w = th > Math.PI / 2 ? Math.max(0.3, Math.sin(th)) : 1
      // Un saut (bord du ruban → lisière) ne compte pas comme de la lisière.
      const step = pos[i].distanceTo(pos[i - 1])
      cum.push(cum[i - 1] + (step > p.shape.headRadius * 0.2 ? 0 : step / w))
    }
    const B = cum[cum.length - 1]
    const n = clamp(Math.ceil(B / ((o.pitch ?? 1.8) * r)), 60, 520)
    for (let i = 0, j = 1; i < n; i++) {
      const at = ((i + 0.5 + (rnd() - 0.5) * 0.3) / n) * B
      while (j < cum.length - 1 && cum[j] < at) j++
      const u = clamp((at - cum[j - 1]) / Math.max(1e-9, cum[j] - cum[j - 1]), 0, 1)
      const from = z.line[j - 1].clone().lerp(z.line[j], u).normalize()
      const side = u < 0.5 ? z.side[j - 1] : z.side[j]
      /*
       * Au bord du ruban, la racine part **sous** le ruban et n'est pas
       * enfouie : un brin qui sort de la laine en biais laisse, entre deux
       * racines, un liseré nu le long de la fermeture.
       */
      const onEdge = u < 0.5 ? z.edge[j - 1] : z.edge[j]
      // Raie refermée : les racines passent de l'autre côté et ne sont pas
      // enfouies — un brin qui sort de la laine laisse un sillon nu sur toute
      // la longueur de sa sortie, et c'était le trou au-dessus de la fermeture.
      const shut = !!z.shut?.[u < 0.5 ? j - 1 : j]
      if (onEdge) {
        const x = side * zip.tape
        from.set(x, from.y, -Math.sqrt(Math.max(0, 1 - x * x - from.y * from.y)))
      }
      const to = z.to ?? nearest(from)
      const upper = i % 2 === 1
      const ridge = upper && o.grooves ? r * 0.9 * (0.5 + 0.5 * Math.cos((2 * Math.PI * o.grooves * at) / B)) : 0
      const layer = upper ? base + r * (0.9 + rnd() * 0.3) + ridge : base * (1 + rnd() * 0.2)
      const path = zipPath(from, to, zip, side, rnd)
      const ang = path.length
      const reach = o.tuck ? Math.max(0.2, 1 - o.tuck / Math.max(ang, 1e-3)) : 1
      const M = clamp(Math.ceil(ang / 0.08), 8, 30)
      const pts: THREE.Vector3[] = []
      for (let k = 0; k <= M; k++) {
        const d = path.at((k / M) * reach)
        const lift = k === 0 ? (onEdge || shut ? layer * 0.4 : -r * 2) : k === M && o.tuck ? -r * 0.5 : layer
        pts.push(onDir(p, d, lift, POLE).pos)
      }
      // Aucune option de mouvement : aMover −1, mobilité et écartement nuls.
      out.yarn.push(yarn(pts, r, { step: 6 }))
    }
  }
  return { frontLine: (az: number) => limit(az) + 0.02 }
}

/**
 * Emprise de la fermeture éclair dans l'espace des directions du crâne
 * (`dirOf`) : demi-largeur en x — ruban plus un fil, pour que les brins
 * partent **au bord** du ruban et non dessus —, bornes de hauteur. Une seule
 * source : `zipHole`, celle qui retire le duvet sous le ruban.
 */
function zipBand(p: DollParams, r: number) {
  const h = zipHole(p)
  const ry = p.shape.headRadius * p.shape.headSquash
  const R = p.shape.headRadius
  return { half: (h.half + r * 0.9) / R, tape: (h.half * 0.8) / R, top: h.top / ry, bottom: h.bottom / ry }
}
type ZipBand = ReturnType<typeof zipBand>

/** Tient une direction hors du ruban, du côté `side`. */
function keepOffZip(d: THREE.Vector3, zip: ZipBand, side: number) {
  if (d.z >= 0 || d.y > zip.top || d.y < zip.bottom || side * d.x >= zip.half) return d
  const x = side * zip.half
  d.set(x, d.y, -Math.sqrt(Math.max(0, 1 - x * x - d.y * d.y)))
  return d
}

/**
 * Chemin d'un brin sur le crâne, de `from` à `to`, **sans passer sur la
 * fermeture**.
 *
 * Le plus court chemin s'il ne la croise pas. Sinon il franchit le méridien
 * arrière au-dessus du bout haut du ruban : on prend le point où le plus
 * court chemin le croise, et on le **relève** jusque-là. Relever seulement
 * les brins qui croisent, et envoyer tous ceux-là par un même point, séparait
 * deux familles — ceux qui montent le long du ruban, ceux qui partent vers
 * l'attache — et ouvrait un sillon entre les deux. Le relèvement est continu :
 * un brin qui croisait juste au-dessus du bout ne change pas.
 *
 * `at(t)` rend la direction, `length` l'angle parcouru.
 */
function zipPath(from: THREE.Vector3, to: THREE.Vector3, zip: ZipBand, side: number, rnd: () => number) {
  const slerp = (a: THREE.Vector3, b: THREE.Vector3, t: number) => a.clone().lerp(b, t).normalize()
  const direct = () => ({ length: from.angleTo(to), at: (t: number) => keepOffZip(slerp(from, to, t), zip, side) })
  // Croisement du plus court chemin avec le plan x = 0, s'il est sur l'arc.
  const n = new THREE.Vector3().crossVectors(from, to)
  if (n.lengthSq() < 1e-10 || from.x * side < 0) return direct()
  const c = new THREE.Vector3().crossVectors(n, new THREE.Vector3(1, 0, 0)).normalize()
  if (c.dot(from) + c.dot(to) < 0) c.negate()
  const onArc = Math.abs(from.angleTo(c) + c.angleTo(to) - from.angleTo(to)) < 1e-3
  const floor = zip.top + 0.03
  if (!onArc || c.z >= 0 || c.y >= floor || to.x * side > 0) return direct()
  const y = Math.min(0.995, floor + rnd() * 0.02)
  const via = new THREE.Vector3(0, y, -Math.sqrt(1 - y * y))
  const l0 = from.angleTo(via)
  const l1 = via.angleTo(to)
  const len = l0 + l1
  return {
    length: len,
    at: (t: number) => {
      const s = t * len
      return s < l0 ? keepOffZip(slerp(from, via, s / l0), zip, side) : slerp(via, to, (s - l0) / Math.max(1e-6, l1))
    },
  }
}

// ---------------------------------------------------------------- coiffures

/**
 * Bouclettes : des boucles de laine dressées sur le crâne.
 *
 * Chaque boucle est une spirale dans un plan qui **contient la normale** —
 * elle se dresse, au lieu d'être posée à plat — et son départ est enfoncé
 * sous la surface : c'est ce qui la fait tenir au crâne. Petites et serrées,
 * ou grosses et lâches : la grosseur de la boucle et leur nombre dérivent en
 * sens inverse, comme l'épaisseur et la densité des locks. Pas de physique :
 * une boucle est courte et serrée, elle ne ballotte pas.
 */
function curls(p: DollParams, rnd: () => number, yarnR: number, out: Parts) {
  const R = p.shape.headRadius
  const g = rnd()
  const loop = R * (0.06 + g * 0.05)
  const r = yarnR * (0.9 + g * 0.35)
  const low = -0.1 + rnd() * 0.3
  const limit = hairline(p, low)
  /**
   * Nombre de boucles déduit de l'aire à couvrir, pas fixé.
   *
   * À soixante boucles le crâne restait nu entre elles : on lisait une
   * couronne de ressorts plantés, pas une tignasse. Une toison, c'est des
   * boucles qui se touchent — donc une boucle par carré d'un peu plus que son
   * diamètre, sur la calotte au-dessus de `low` (aire ∝ hauteur).
   */
  const cap = 2 * Math.PI * R * R * (0.97 - low)
  // Pas de 1,2 diamètre (1,55 avant) : à 1,55 on voyait encore la laine du
  // crâne entre les boucles — demandé plus dense.
  const count = clamp(Math.round(cap / (loop * 1.2) ** 2), 90, 640)
  // Bouclettes : elles rebondissent par secteurs — raides et peu amorties,
  // une boucle serrée sautille plus qu'elle ne pend.
  const sector = sectorMovers(out, rnd, R, 8, 0.16, 0.08)
  const zip = zipBand(p, r)
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count
    const sy = low + (0.97 - low) * t
    const az = i * GOLDEN + rnd() * 0.3
    if (sy < limit(az)) continue
    /*
     * Une boucle qui mordrait sur la fermeture est rangée **au bord** du
     * ruban, de son côté : les boucles s'alignent de part et d'autre et la
     * fermeture reste nette, sans trou dans la toison à côté.
     */
    const lr = loop * (0.8 + rnd() * 0.45)
    const dz = dirOf(az, sy)
    const wide = { ...zip, half: zip.half + (lr * 1.1) / R }
    const s = onDir(p, keepOffZip(dz, wide, Math.sign(dz.x) || (i % 2 ? 1 : -1)), 0, 0.99)
    const [t1, t2] = tangentBasis(s.normal)
    const phi = rnd() * Math.PI
    const dir = t1.clone().multiplyScalar(Math.cos(phi)).addScaledVector(t2, Math.sin(phi))
    const side = t1.clone().multiplyScalar(-Math.sin(phi)).addScaledVector(t2, Math.cos(phi))
    const center = s.pos.clone().addScaledVector(s.normal, lr * 0.5)
    // Un tour et demi de spirale, pas un anneau : l'anneau lit comme une
    // rondelle dressée, la spirale comme une boucle de laine qui frise.
    const N = 16
    const pts = Array.from({ length: N + 1 }, (_, k) => {
      const u = k / N
      const a = -Math.PI / 2 + u * 1.5 * Math.PI * 2
      const rr = lr * Math.sin(Math.PI * Math.min(1, u * 1.4)) ** 0.3
      return center
        .clone()
        .addScaledVector(dir, Math.cos(a) * rr)
        .addScaledVector(s.normal, Math.sin(a) * rr)
        .addScaledVector(side, (u - 0.5) * lr * 0.9)
    })
    pts[0].addScaledVector(s.normal, -r * 2)
    out.yarn.push(yarn(pts, r, { mover: sector(az), free: (t) => 0.6 + 0.4 * t, fling: (t) => 0.6 * t, phase: rnd() * 6 }))
  }
}

/**
 * Mèches : coupe au bol, en brins de laine.
 *
 * Les brins rayonnent d'un **épi** au sommet, un peu en arrière : frange
 * devant, arrêtée au-dessus des sourcils, carré sur les côtés et derrière.
 * Partis d'un anneau serré autour du pôle, les brins de devant n'avaient plus
 * que quelques centimètres avant la lisière, et la frange se réduisait à une
 * rangée de bouts de fil au ras du front.
 *
 * Chaque brin suit la surface point par point, et sous l'équateur il ne peut
 * plus se rapprocher de l'axe : il retombe par-dessus les bajoues au lieu de
 * rentrer sous la mâchoire. Physique : le carré ballotte autour du centre du
 * crâne, la frange presque pas — elle doit rester au-dessus des yeux.
 */
function bowlCut(p: DollParams, rnd: () => number, yarnR: number, out: Parts) {
  const R = p.shape.headRadius
  const g = rnd()
  const r = yarnR * (0.8 + g * 0.35)
  const count = Math.round(210 - g * 50)
  // Au moins jusqu'aux oreilles : arrêtée plus haut, la coupe laissait nu tout
  // le bas du crâne — l'effet chauve, qu'aucune coupe n'a le droit d'avoir.
  const end = -0.2 - rnd() * 0.5
  const wave = rnd() < 0.5 ? 0 : 0.04 + rnd() * 0.06
  // Huit ressorts autour de la tête, bout placé vers leur secteur : à
  // l'aplomb du centre, un ressort unique était sur l'axe de rotation de la
  // poupée et ne ressentait rien (voir la grande frange).
  const SECTORS = 8
  const first = out.movers.length
  for (let k = 0; k < SECTORS; k++) {
    const ac = ((k + 0.5) / SECTORS) * Math.PI * 2
    out.movers.push({
      pivot: new THREE.Vector3(),
      dir: new THREE.Vector3(Math.sin(ac) * 0.75, -0.66, Math.cos(ac) * 0.75).normalize(),
      length: R,
      cfg: { stiffness: 0.035 + rnd() * 0.02, drag: 0.12 + rnd() * 0.06, gravity: 0 },
      maxAngle: 0.22,
    })
  }
  const sector = (az: number) =>
    first + (Math.floor(((((az % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2)) * SECTORS) % SECTORS)
  radiate(p, rnd, r, count, hairline(p, end, 2.3), out, { wave, moverOf: sector, volume: R * 0.045 })
  sideLocks(p, rnd, r, hairline(p, end, 2.3), out)
}

/**
 * Deux longues mèches qui encadrent le visage, une de chaque côté, aux
 * pointes éclaircies — l'allure anime demandée pour la coupe au bol.
 *
 * Chaque mèche part **sous** la coupe, au-delà du bord des boutons
 * (`faceSafe.sideAz` : elle ne passe jamais devant un œil), descend en
 * épousant le crâne puis pend sous la mâchoire. Ses brins se referment en
 * pointe sur le dernier tiers seulement — refermés plus tôt, la mèche lit
 * comme une corde. Le dégradé commence aux trois cinquièmes : commencé à la
 * racine, il lirait comme une autre laine, pas comme une pointe éclaircie.
 *
 * Un ressort par mèche, pivot au centre du crâne et bout vers la mèche, sans
 * gravité : la géométrie pend déjà (voir « Repos d'une mèche pendante »).
 */
function sideLocks(p: DollParams, rnd: () => number, r: number, limit: (az: number) => number, out: Parts) {
  const R = p.shape.headRadius
  const safe = faceSafe(p)
  const hang = R * (0.55 + rnd() * 0.3)
  const width = R * (0.13 + rnd() * 0.04)
  const strands = 16
  const N = 26
  for (const sx of [-1, 1]) {
    const az = sx * (safe.sideAz + 0.05)
    const sy0 = clamp(limit(az) + 0.35, 0.3, 0.85)
    const sy1 = -0.45
    // Axe de la mèche : sur le crâne, au-dessus de la coupe, puis à la verticale.
    const onHeadPart = 0.55
    const lift = r * 3.2
    let rMax = 0
    const axis: THREE.Vector3[] = []
    const across: THREE.Vector3[] = []
    for (let k = 0; k <= N; k++) {
      const t = k / N
      let q: THREE.Vector3
      if (t <= onHeadPart) {
        const sy = sy0 + (sy1 - sy0) * (t / onHeadPart)
        q = onHeadPolar(p, az, sy, lift).pos
        const h = Math.hypot(q.x, q.z)
        if (sy < 0 && h < rMax) {
          q.x *= rMax / h
          q.z *= rMax / h
        }
        rMax = Math.max(rMax, Math.hypot(q.x, q.z))
      } else {
        const u = (t - onHeadPart) / (1 - onHeadPart)
        const last = axis[axis.length - 1]
        // Pend, et la pointe revient un peu vers la joue.
        const inward = new THREE.Vector3(-last.x, 0, -last.z).normalize()
        q = axis[Math.round(onHeadPart * N)]
          .clone()
          .addScaledVector(DOWN, hang * u)
          .addScaledVector(inward, R * 0.05 * u * u)
        clearHead(p, q, r * 2.5)
      }
      axis.push(q)
      across.push(new THREE.Vector3(q.z, 0, -q.x).normalize())
    }
    const m = out.movers.length
    const tip = axis[N]
    out.movers.push({
      pivot: new THREE.Vector3(),
      dir: tip.clone().normalize(),
      length: tip.length(),
      cfg: { stiffness: 0.05 + rnd() * 0.02, drag: 0.14 + rnd() * 0.05, gravity: 0 },
      maxAngle: Math.min(0.22, safe.maxAngle(sy0)),
    })
    for (let i = 0; i < strands; i++) {
      const off = ((i + 0.5) / strands) * 2 - 1 + (rnd() - 0.5) * 0.1
      const depth = rnd()
      const len = 0.9 + rnd() * 0.1 - Math.abs(off) * 0.12
      const pts: THREE.Vector3[] = []
      for (let k = 0; k <= N; k++) {
        const t = (k / N) * len
        const f = t * N
        const k0 = Math.min(N - 1, Math.floor(f))
        const a = axis[k0].clone().lerp(axis[k0 + 1], f - k0)
        const side = across[k0].clone().lerp(across[k0 + 1], f - k0).normalize()
        const close = smooth(0.62, 1, t)
        const w = width * (0.7 + 0.3 * Math.sin(Math.PI * Math.min(1, t * 1.6))) * (1 - 0.9 * close)
        const q = a
          .clone()
          .addScaledVector(side, off * w * 0.5)
          .add(a.clone().setY(0).normalize().multiplyScalar(depth * r * 1.6 * (1 - close)))
        if (k === 0) q.addScaledVector(axis[0].clone().normalize(), -lift - r * 2)
        pts.push(q)
      }
      out.yarn.push(
        yarn(pts, r, {
          mover: m,
          free: (t) => 0.3 + 0.7 * t,
          fling: (t) => t,
          phase: rnd() * 6,
          taper: 0.3,
          tint: (t) => smooth(0.5, 0.95, t * len),
        }),
      )
    }
  }
}

/**
 * Brins qui rayonnent d'un épi au sommet jusqu'à une lisière.
 *
 * La coupe au bol. Essayée aussi comme base couchée sous les locks et la
 * houppette pour masquer le crâne nu : deux coiffures superposées, ça se
 * voyait — rejeté. Chaque coupe doit couvrir le crâne par elle-même.
 */
function radiate(
  p: DollParams,
  rnd: () => number,
  r: number,
  count: number,
  limit: (az: number) => number,
  out: Parts,
  o: {
    wave?: number
    mover?: number
    /** Pivot selon l'azimut du brin — une chevelure qui ne bouge pas d'un bloc. */
    moverOf?: (az: number) => number
    /**
     * Raie au milieu plutôt qu'épi : les brins partent de la ligne qui va du
     * front à la nuque et **tombent droit** de chaque côté. Depuis un épi
     * derrière le sommet, ceux des côtés traversaient la tête en diagonale.
     */
    parting?: boolean
    /**
     * Volume : les brins se répartissent sur plusieurs épaisseurs, et les
     * couches extérieures gonflent au milieu de leur longueur. Sans lui la
     * chevelure est une calotte plaquée, qui laisse voir le crâne entre les
     * brins dès qu'ils s'écartent.
     */
    volume?: number
    /**
     * Pointes effilées et dégradées plutôt que coupées net. `ragged` : écart
     * de longueur d'un brin à l'autre ; les couches extérieures sont en plus
     * plus courtes (dégradé), et certaines pointes se retroussent. Coupés à la
     * même hauteur, les brins faisaient un carré au cordeau.
     */
    ragged?: number
    /**
     * Mèches pointues, façon anime : les brins sont groupés par `clumps`
     * mèches autour de la tête ; chaque mèche a sa longueur, ses brins
     * **convergent** vers sa pointe et ceux du bord sont plus courts. Une
     * lisière commune, même effilée brin à brin, dessinait encore une ligne
     * horizontale — l'effet coupé au carré.
     */
    clumps?: number
    /** Arrière plus long que les côtés, en hauteur normalisée du crâne. */
    backLonger?: number
    /** Fermeture des mèches vers leur pointe (0 à 1) ; 0,55 par défaut. */
    pinch?: number
    /** Un pivot par mèche : index du pivot de la mèche 0, les suivants à la suite. */
    clumpMover?: number
    /**
     * Évasement de l'arrière : les pointes de la nuque et des côtés arrière
     * partent vers l'extérieur, en unités monde. C'est ce qui donne l'allure
     * d'une coupe d'anime ; sans lui l'arrière épouse le crâne comme un bol.
     */
    flare?: number
    /**
     * Longueur **pendante** au-delà du crâne, en unités monde : une fois la
     * pointe atteinte sur la tête, le brin continue à la verticale. Sans elle
     * une chevelure s'arrête au bas du crâne, à la mâchoire au plus.
     */
    extend?: number
  } = {},
) {
  const wave = o.wave ?? 0
  const volume = o.volume ?? 0
  const waves = 2 + Math.floor(rnd() * 3)
  const zip = zipBand(p, r)
  /*
   * L'épi est au **bout haut de la fermeture** : les brins partent de là, la
   * fermeture ouvre la raie en dessous et rien ne passe dessus. Ailleurs, un
   * épi derrière le sommet envoyait les brins de l'arrière droit sur le ruban.
   * Deux tirages, comme avant : la suite de la graine ne bouge pas.
   */
  const w0 = rnd()
  const w1 = rnd()
  const whorl = dirOf(Math.PI + (w0 - 0.5) * 0.06, Math.min(0.99, zip.top + 0.03 + w1 * 0.02))
  const M = 18
  const clumps = o.clumps ?? 0
  // Longueur propre à chaque mèche, tirée avant la boucle.
  const clumpLen = Array.from({ length: clumps }, () => (rnd() - 0.5) * 2)
  // Décalage du centre des mèches, faible : fort, des brins voisins se
  // croisaient d'une mèche à l'autre.
  const clumpTwist = Array.from({ length: clumps }, () => (rnd() - 0.5) * 0.12)
  for (let i = 0; i < count; i++) {
    const az = (i / count) * Math.PI * 2 + (rnd() - 0.5) * 0.08
    const ragged = o.ragged ?? 0
    // Tirés dans tous les cas : sauter un tirage décalerait toute la suite.
    const cut = rnd()
    const depth = rnd()
    const flick = rnd()
    let tipSy =
      limit(az) + (rnd() - 0.5) * 0.04 + ragged * ((cut - 0.5) * 1.2 + depth * 0.7)
    tipSy -= (o.backLonger ?? 0) * Math.max(0, -Math.cos(az)) ** 1.5
    let tipAz = az
    let clump = 0
    if (clumps) {
      const span = (Math.PI * 2) / clumps
      const c = Math.floor((((az % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) / span)
      clump = c
      const center = (c + 0.5) * span + clumpTwist[c] * span
      const u = clamp((az - (c + 0.5) * span) / (span * 0.5), -1, 1)
      // Mèche plus ou moins longue ; bords plus courts : la pointe.
      tipSy += clumpLen[c] * 0.14 + Math.abs(u) ** 1.4 * 0.16
      tipAz = center
    }
    // Bornée des deux côtés : poussée sous −1 par l'arrière plus long, la
    // pointe sortait du crâne par le bas et le brin filait droit vers le sol
    // depuis le centre de la tête, à travers le cou et le torse.
    /**
     * Pointe **non convergée** : le tracé suit l'azimut du brin, et la mèche
     * ne se referme que sur son dernier tiers. Convergeant depuis la racine,
     * les brins se groupaient en faisceaux dès le milieu, et le crâne se
     * voyait entre deux mèches.
     */
    const pinchTo = tipAz - az
    const pinch = o.pinch ?? 0.55
    const tip = dirOf(az, clamp(tipSy, -0.9, 0.9))
    // Départ : sur la raie, à la hauteur de front ou de nuque qui correspond à
    // l'azimut du brin ; ou dispersé autour de l'épi — tous au même point, ils
    // y feraient un pâté de fil.
    const from = o.parting
      ? new THREE.Vector3(Math.sign(tip.x) * 0.03, 0, Math.cos(az) * 0.55 + (rnd() - 0.5) * 0.08)
          .setY(1)
          .normalize()
      : whorl.clone().addScaledVector(tip.clone().sub(whorl), 0.04 + rnd() * 0.06).normalize()
    // Brin trop court pour exister : devant, sous une frange, la lisière est
    // si haute que les longueurs partant de la raie s'y arrêtaient aussitôt —
    // des bouts de fil effilés qui hérissaient le sommet. On ne les pose pas.
    if (from.angleTo(tip) < 0.5) continue
    // Couche : de plaquée à franchement décollée, pour les chevelures fournies.
    const layer = r * (0.7 + rnd() * 1.4) + volume * depth
    const phase = rnd() * Math.PI * 2
    // Mobilité : nulle à l'épi, pleine au bout du carré, faible pour la frange.
    const reach = clamp((0.7 - tipSy) / 0.9, 0.12, 1)
    // Côté de la fermeture où tombe le brin ; à l'aplomb exact, en alternance.
    const side = Math.abs(tip.x) > 1e-3 ? Math.sign(tip.x) : i % 2 ? 1 : -1
    let rMax = 0
    const pts: THREE.Vector3[] = []
    for (let k = 0; k <= M; k++) {
      const t = k / M
      const d = from.clone().lerp(tip, t).normalize()
      const close = clumps ? pinch * clamp((t - 0.62) / 0.38, 0, 1) ** 1.5 : 0
      let a = Math.atan2(d.x, d.z) + pinchTo * close + wave * Math.sin(t * waves * Math.PI + phase) * t
      const sy = clamp(d.y, -0.98, 0.98)
      // Jamais sur la fermeture : le brin longe le ruban, du côté où il tombe.
      if (k > 0) {
        const off = keepOffZip(dirOf(a, sy), zip, side)
        a = Math.atan2(off.x, off.z)
      }
      // Gonflement : nul à la racine, maximal au milieu, retombant à la pointe.
      const puff = volume * depth * Math.sin(Math.PI * Math.min(1, t * 1.15)) * 0.8
      // Pointe retroussée pour un brin sur trois, sur le dernier cinquième.
      const flip = ragged > 0 && flick < 0.35 ? r * 5 * Math.max(0, (t - 0.8) / 0.2) ** 2 : 0
      // Tout autour, un peu plus ample derrière : les pics évasés font
      // l'allure de la coupe, et ne les avoir qu'à la nuque la coupait en deux.
      const flare = (o.flare ?? 0) * (0.75 + 0.35 * Math.max(0, -Math.cos(az))) * Math.max(0, (t - 0.55) / 0.45) ** 2
      const s = onHeadPolar(p, a, sy, k === 0 ? -r * 2 : layer + puff + flip + flare)
      const h = Math.hypot(s.pos.x, s.pos.z)
      if (sy < 0 && h < rMax) {
        s.pos.x *= rMax / h
        s.pos.z *= rMax / h
      }
      rMax = Math.max(rMax, Math.hypot(s.pos.x, s.pos.z))
      pts.push(s.pos)
    }
    if (o.extend) {
      // Longueur pendante propre au brin, plus courte au bord des mèches :
      // la pointe reste pointue. Repoussée hors du crâne à chaque point.
      const len = o.extend * (0.55 + cut * 0.45)
      const last = pts[pts.length - 1]
      const out = new THREE.Vector3(last.x, 0, last.z).normalize()
      for (let k = 1; k <= 5; k++) {
        const q = last
          .clone()
          .addScaledVector(DOWN, (len * k) / 5)
          .addScaledVector(out, r * 0.6 * k)
        pts.push(clearHead(p, q, r * 2))
      }
    }
    const mover = o.clumpMover !== undefined ? o.clumpMover + clump : o.moverOf ? o.moverOf(az) : o.mover
    out.yarn.push(
      mover === undefined
        ? yarn(pts, r)
        : /**
           * **Toute la coupe bouge, racines comprises.** Nulle à la racine, la
           * mobilité laissait le dessus du crâne figé pendant que les pointes
           * balançaient : on lisait des bouts de cheveux qui bougent sous une
           * calotte immobile. Un brin posé sur le crâne tourne autour de son
           * centre, il glisse dessus sans s'enfoncer : il peut bouger dès la
           * racine. L'écartement centrifuge, lui, reste nul à la racine.
           */
          yarn(pts, r, {
            mover,
            free: (t) => 0.4 + 0.6 * t ** 0.9,
            fling: (t) => (0.45 + 0.55 * reach) * t ** 0.9,
            phase,
          }),
    )
  }
}

/**
 * Chignon : cheveux tirés vers une pelote, ou vers deux macarons.
 *
 * La pelote est une sphère enroulée de fil — même fil retors, des tours serrés
 * — plus quelques tours croisés par-dessus, sans lesquels elle lit comme une
 * boule texturée. Pas de physique : un chignon est serré.
 */
function bun(p: DollParams, rnd: () => number, yarnR: number, out: Parts) {
  const R = p.shape.headRadius
  const two = rnd() < 0.45
  const rb = R * (two ? 0.18 + rnd() * 0.05 : 0.24 + rnd() * 0.08)
  const r = yarnR * 0.9
  const spots = two
    ? [-1, 1].map((sx) => onHeadPolar(p, sx * (Math.PI / 2 - 0.35), 0.62 + rnd() * 0.08, 0))
    : // Au bout haut de la fermeture : la pelote la termine, au lieu de la
      // recouvrir à mi-hauteur.
      [onHeadPolar(p, Math.PI, 0.985 + rnd() * 0.01, 0)]
  const buns = spots.map((s) => s.pos.clone().addScaledVector(s.normal, rb * 0.62))
  for (const [bi, c] of buns.entries()) {
    /*
     * La pelote est serrée : elle frémit à peine sur sa base (sommet déplacé de
     * moins d'un centimètre) et ne s'écarte pas. À 0,18 de débattement et avec
     * l'écartement centrifuge, elle s'envolait seule au-dessus de cheveux
     * tirés immobiles.
     */
    const m = out.movers.length
    const base = spots[bi]
    out.movers.push({
      pivot: base.pos.clone(),
      dir: base.normal.clone(),
      length: rb * 1.6,
      cfg: { stiffness: 0.14, drag: 0.22, gravity: 0 },
      maxAngle: 0.06,
    })
    const ball = new THREE.SphereGeometry(rb, 28, 18)
    const uv = ball.attributes.uv as THREE.BufferAttribute
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 16, uv.getY(i) * 11)
    // Pôles de la sphère orientés au hasard : sinon toutes les pelotes ont
    // leurs tours à l'horizontale, comme un pot.
    ball.applyQuaternion(new THREE.Quaternion().setFromEuler(new THREE.Euler(rnd() * 3, rnd() * 3, 0)))
    ball.translate(c.x, c.y, c.z)
    out.yarn.push(still(ball, m, 1, 0))
    for (let w = 0; w < 4; w++) {
      const n = new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize()
      out.yarn.push(ring(c, n, rb * 1.01, r * 0.9, { mover: m, free: () => 1, fling: () => 0 }))
    }
  }
  pulled(p, rnd, r, buns, out, NAPE_LOW + rnd() * 0.12)
}

/**
 * Houppette : cheveux **tirés** vers un nœud au sommet, et un plumet en
 * palmier qui en jaillit.
 *
 * Premier essai : un plumet seul, sur un crâne nu — une poupée chauve avec un
 * toupet. Puis une base couchée sous le plumet : deux coiffures superposées,
 * rejeté. Ensuite une gerbe qui retombait en fontaine sur tout le crâne et
 * glissait par secteurs : des cheveux noués qui bougent, contraire à ce qu'on
 * attend d'une coupe attachée. Ici la chevelure est tirée vers le nœud et
 * **tenue** (`pulled`, aucun ressort) ; seul le plumet bouge.
 *
 * Le plumet est fait de **lames** : des brins groupés à plat, qui montent puis
 * s'arquent et retombent — un palmier, l'allure anime de la coupe « ananas ».
 * Des brins en gerbe ronde lisaient comme un blaireau. Chaque lame a son
 * ressort, sans gravité (la géométrie retombe déjà), et ses réglages : sept
 * ressorts identiques bougeraient comme un seul.
 *
 * Nœud au pôle, légèrement en avant : derrière, c'est le bout haut de la
 * fermeture éclair.
 */
function tuft(p: DollParams, rnd: () => number, yarnR: number, out: Parts) {
  const R = p.shape.headRadius
  const r = yarnR * (0.95 + rnd() * 0.3)
  const tie = onHeadPolar(p, (rnd() - 0.5) * 0.6, 0.97 + rnd() * 0.02, 0)
  const knot = tie.pos.clone().addScaledVector(tie.normal, r * 2.2)
  const [t1, t2] = tangentBasis(tie.normal)
  out.ribbonColor = RIBBONS[Math.floor(rnd() * RIBBONS.length)]
  pulled(p, rnd, r, [tie.pos], out, -0.1 + rnd() * 0.2, { tuck: (r * 4) / R, grooves: 12 + Math.floor(rnd() * 5) })

  // Chouchou : deux tours serrés au pied du plumet.
  for (let w = 0; w < 2; w++) {
    const c = knot.clone().addScaledVector(tie.normal, r * (0.5 + w * 1.8))
    out.ribbon.push(ring(c, tie.normal, r * 4.6, r * 1.3))
  }

  const blades = 6 + Math.floor(rnd() * 3)
  const L = R * (0.85 + rnd() * 0.3)
  const phase0 = rnd() * Math.PI * 2
  for (let b = 0; b < blades; b++) {
    const phi = phase0 + (b / blades) * Math.PI * 2 + (rnd() - 0.5) * 0.4
    const out1 = t1.clone().multiplyScalar(Math.cos(phi)).addScaledVector(t2, Math.sin(phi))
    const len = L * (0.75 + rnd() * 0.45)
    const rise = 0.55 + rnd() * 0.35
    const width = r * (9 + rnd() * 3)
    // Axe de la lame : monte le long de la normale, s'arque vers l'extérieur,
    // retombe. Bézier cubique, comme la queue haute.
    const P0 = knot.clone().addScaledVector(tie.normal, r * 3)
    const P1 = P0.clone().addScaledVector(tie.normal, len * rise)
    const P2 = P0.clone().addScaledVector(tie.normal, len * rise * 0.9).addScaledVector(out1, len * 0.6)
    const P3 = P0.clone().addScaledVector(out1, len * 0.95).addScaledVector(tie.normal, len * (rise - 0.75))
    const axis = (t: number) => {
      const v = 1 - t
      return P0.clone()
        .multiplyScalar(v * v * v)
        .addScaledVector(P1, 3 * v * v * t)
        .addScaledVector(P2, 3 * v * t * t)
        .addScaledVector(P3, t * t * t)
    }
    const tip = axis(1)
    const m = out.movers.length
    out.movers.push({
      pivot: P0.clone(),
      dir: tip.clone().sub(P0).normalize(),
      length: tip.distanceTo(P0),
      cfg: { stiffness: 0.06 + rnd() * 0.04, drag: 0.1 + rnd() * 0.06, gravity: 0 },
      maxAngle: 0.35,
    })
    // Travers de la lame : à plat, perpendiculaire à son plan d'arc.
    const across = new THREE.Vector3().crossVectors(tie.normal, out1).normalize()
    const strands = 13
    const N = 16
    for (let i = 0; i < strands; i++) {
      const u = ((i + 0.5) / strands) * 2 - 1
      const depth = (rnd() - 0.5) * r * 1.5
      const cut = 0.88 + rnd() * 0.12 - Math.abs(u) * 0.1
      const pts: THREE.Vector3[] = [tie.pos.clone().addScaledVector(tie.normal, -r)]
      for (let k = 0; k <= N; k++) {
        const t = (k / N) * cut
        // Large au milieu, pointue au bout : la lame se referme sur son tiers.
        const w = width * (0.35 + 0.65 * smooth(0, 0.3, t)) * (1 - 0.9 * smooth(0.55, 1, t))
        pts.push(axis(t).addScaledVector(across, u * w * 0.5).addScaledVector(out1, depth * (1 - t)))
      }
      out.yarn.push(yarn(pts, r, { mover: m, free: (t) => t ** 1.1, fling: (t) => t, phase: rnd() * 6, taper: 0.3 }))
    }
  }
}

/**
 * Une touffe nouée : des brins qui partent d'une attache et pendent.
 *
 * Commune aux couettes et à la queue de cheval. Les brins sortent de l'attache
 * vers l'extérieur, s'ouvrent un peu en éventail puis tombent ; chaque point
 * est repoussé hors du crâne, faute de quoi une touffe attachée sur le côté
 * tombe droit dans les bajoues. Le ruban noué autour de l'attache est d'une
 * teinte franche : c'est lui qui dit « coiffé » plutôt que « poussé là ».
 */
function bunch(
  p: DollParams,
  rnd: () => number,
  r: number,
  tie: { pos: THREE.Vector3; normal: THREE.Vector3 },
  L: number,
  out: Parts,
  o: {
    axis?: (t: number) => THREE.Vector3
    spring?: Mover
    flare?: number
    count?: number
    tight?: number
    /**
     * Mèches pointues, façon anime : les brins se regroupent par `clumps`
     * faisceaux qui se referment sur leur dernier tiers. Une touffe dont tous
     * les brins s'évasent également lit comme un pinceau.
     */
    clumps?: number
  } = {},
) {
  const R = p.shape.headRadius
  const m = out.movers.length
  /**
   * Une touffe **attachée**, pas des cheveux lissés.
   *
   * Première version : chaque brin partait de l'attache, s'écartait à peine
   * et se couchait sur le crâne en éventail — vu de dos, la queue était plate
   * contre la tête. Ce qui dit « attaché », c'est un faisceau : les brins
   * sortent serrés du ruban, le faisceau se **détache** franchement de la tête
   * avant de retomber, et ne s'évase qu'en bas.
   */
  const stand = R * (0.16 + rnd() * 0.08)
  const tight = r * (o.tight ?? 2.6)
  const flare = r * (o.flare ?? 5 + rnd() * 3)
  const axisAt =
    o.axis ??
    ((t: number) =>
      tie.pos
        .clone()
        .addScaledVector(tie.normal, r * 2 + stand * Math.min(1, t * 2.5) ** 0.7)
        .addScaledVector(DOWN, L * Math.max(0, t - 0.08) ** 1.25))
  out.movers.push(o.spring ?? {
    pivot: tie.pos.clone().addScaledVector(tie.normal, r * 2),
    // Verticale, comme la frange : un repos penché fait pivoter la touffe au
    // repos, vers la tête.
    dir: DOWN.clone(),
    length: L,
    cfg: { stiffness: 0.04, drag: 0.16, gravity: 1.2 },
    maxAngle: 0.7,
  })
  const count = o.count ?? 22 + Math.floor(rnd() * 10)
  const margin = r * 2.5
  const N = 16
  const clumps = o.clumps ?? 0
  const centers = Array.from({ length: clumps }, (_, c) => ({
    phi: ((c + 0.5) / clumps) * Math.PI * 2 + (rnd() - 0.5) * 0.5,
    rad: 0.45 + rnd() * 0.4,
    len: 0.85 + rnd() * 0.25,
  }))
  for (let i = 0; i < count; i++) {
    const phi = rnd() * Math.PI * 2
    const rad = Math.sqrt(rnd())
    const lenRnd = 0.85 + rnd() * 0.2
    const cl = clumps ? centers[i % clumps] : null
    const len = cl ? cl.len * (0.9 + (lenRnd - 0.85) * 0.5) : lenRnd
    const pts: THREE.Vector3[] = [tie.pos.clone().addScaledVector(tie.normal, -r * 2)]
    for (let k = 1; k <= N; k++) {
      const t = (k / N) * len
      const a = axisAt(t)
      const tangent = axisAt(Math.min(1, t + 0.02)).sub(axisAt(Math.max(0, t - 0.02))).normalize()
      const [b1, b2] = tangentBasis(tangent)
      const spread = tight + (flare - tight) * t * t
      // Vers le centre de sa mèche, sur le dernier tiers.
      const pull = cl ? 0.85 * smooth(0.5, 1, t / len) : 0
      const px = Math.cos(phi) * rad * (1 - pull) + (cl ? Math.cos(cl.phi) * cl.rad * pull : 0)
      const py = Math.sin(phi) * rad * (1 - pull) + (cl ? Math.sin(cl.phi) * cl.rad * pull : 0)
      a.addScaledVector(b1, px * spread).addScaledVector(b2, py * spread)
      pts.push(clearHead(p, a, margin))
    }
    out.yarn.push(yarn(pts, r, { mover: m, free: (t) => t ** 1.2, phase: rnd() * 6 }))
  }
  // Ruban serré autour du faisceau, là où il sort de la tête.
  const knot = axisAt(0.06)
  const axis = axisAt(0.12).sub(axisAt(0)).normalize()
  out.ribbon.push(ring(knot, axis, tight + r * 1.6, r * 1.4))
  out.ribbon.push(ring(knot.clone().addScaledVector(axis, r * 2.6), axis, tight + r * 1.4, r * 1.4))
}

/** Couettes : deux touffes nouées de chaque côté du crâne. */
function pigtails(p: DollParams, rnd: () => number, yarnR: number, out: Parts) {
  const R = p.shape.headRadius
  const r = yarnR * 0.9
  const sy = 0.3 + rnd() * 0.25
  const L = R * (0.65 + rnd() * 0.45)
  const ties = [-1, 1].map((sx) => onHeadPolar(p, sx * (Math.PI / 2 + 0.25), sy, 0))
  out.ribbonColor = RIBBONS[Math.floor(rnd() * RIBBONS.length)]
  pulled(p, rnd, r, ties.map((t) => t.pos), out, NAPE_LOW + rnd() * 0.12)
  for (const t of ties) bunch(p, rnd, r, t, L, out, { clumps: 5, count: 34 + Math.floor(rnd() * 8), flare: 7 + rnd() * 2 })
  // Deux mèches qui encadrent le visage : l'allure des couettes d'anime.
  sideLocks(p, rnd, r, hairline(p, NAPE_LOW), out)
}

/**
 * Queue haute : nouée en haut du crâne, du côté droit de la poupée, elle
 * **monte** puis s'arque vers l'extérieur et retombe — le croquis de
 * l'utilisateur. Nouée derrière, elle pendait sur la fermeture et la cachait.
 *
 * L'arc est la pose de repos, pas un effet de gravité : son ressort n'a donc
 * **pas** de gravité (un repos qui n'est pas la verticale, avec de la
 * gravité, fait glisser la queue au repos). Il ne bouge qu'aux gestes.
 */
function ponytail(p: DollParams, rnd: () => number, yarnR: number, out: Parts) {
  const R = p.shape.headRadius
  const r = yarnR * 0.9
  // x < 0 : la droite de la poupée, qui fait face à +z.
  const az = -(Math.PI / 2 + 0.25 + rnd() * 0.25)
  const tie = onHeadPolar(p, az, 0.72 + rnd() * 0.1, 0)
  const L = R * (1.0 + rnd() * 0.45)
  const outward = new THREE.Vector3(Math.sin(az), 0, Math.cos(az)).normalize()
  const knot = tie.pos.clone().addScaledVector(tie.normal, r * 2)
  // Bézier cubique : sort le long de la normale en montant, s'arque, retombe.
  const P1 = knot.clone().addScaledVector(tie.normal, L * 0.25).addScaledVector(UP, L * 0.45)
  const P2 = knot.clone().addScaledVector(outward, L * 0.75).addScaledVector(UP, L * 0.5)
  const P3 = knot.clone().addScaledVector(outward, L * (0.95 + rnd() * 0.15)).addScaledVector(UP, -L * (0.25 + rnd() * 0.2))
  const axis = (t: number) => {
    const u = clamp(t, 0, 1)
    const v = 1 - u
    return knot
      .clone()
      .multiplyScalar(v * v * v)
      .addScaledVector(P1, 3 * v * v * u)
      .addScaledVector(P2, 3 * v * u * u)
      .addScaledVector(P3, u * u * u)
  }
  out.ribbonColor = RIBBONS[Math.floor(rnd() * RIBBONS.length)]
  pulled(p, rnd, r, [tie.pos], out, NAPE_LOW + rnd() * 0.12)
  bunch(p, rnd, r, tie, L, out, {
    axis,
    flare: 4.5 + rnd() * 2,
    // Un faisceau épais : le croquis montre une queue pleine, pas un pinceau.
    count: 52 + Math.floor(rnd() * 14),
    tight: 3.6,
    spring: {
      pivot: knot.clone(),
      dir: axis(0.6).sub(knot).normalize(),
      length: L * 0.8,
      cfg: { stiffness: 0.08, drag: 0.2, gravity: 0 },
      maxAngle: 0.45,
    },
  })
}

/**
 * Nattes : deux tresses de laine, nouées d'un ruban, terminées par un pompon.
 *
 * La tresse porte la texture des locks, qui est justement une tresse : trois
 * brins qui se croisent dessus-dessous. Elle part derrière l'oreille, descend
 * le long du crâne sans y rentrer, puis pend. Physique : seule la partie qui
 * pend ballotte, autour du point où elle quitte la tête.
 */
function braids(p: DollParams, rnd: () => number, yarnR: number, out: Parts) {
  const R = p.shape.headRadius
  const rb = yarnR * (4 + rnd() * 1.2)
  const r = yarnR * 0.9
  const sy0 = 0.15 + rnd() * 0.2
  const hang = R * (0.45 + rnd() * 0.4)
  out.ribbonColor = RIBBONS[Math.floor(rnd() * RIBBONS.length)]
  const starts = [-1, 1].map((sx) => onHeadPolar(p, sx * (Math.PI / 2 + 0.35), sy0, 0))
  // Lisière avant relevée : la frange balayée part de là (voir `sweptFringe`).
  const crown = clamp(faceSafe(p).edge(2.3) + 0.08, 0.55, 0.9)
  const { frontLine } = pulled(p, rnd, r, starts.map((s) => s.pos), out, NAPE_LOW + rnd() * 0.12, { crown })
  sweptFringe(p, rnd, r, frontLine, out)

  starts.forEach((s0, n) => {
    const az = Math.atan2(s0.pos.x, s0.pos.z)
    const pts: THREE.Vector3[] = []
    // Le long du crâne jusqu'au bas des bajoues, sans jamais se rapprocher de
    // l'axe, puis à la verticale.
    let rMax = 0
    const M = 10
    for (let k = 0; k <= M; k++) {
      const sy = sy0 + (-0.75 - sy0) * (k / M)
      const q = onHeadPolar(p, az, sy, k === 0 ? -rb : rb * 1.1).pos
      const h = Math.hypot(q.x, q.z)
      if (h < rMax) {
        q.x *= rMax / h
        q.z *= rMax / h
      }
      rMax = Math.max(rMax, Math.hypot(q.x, q.z))
      pts.push(q)
    }
    const leave = pts[pts.length - 1].clone()
    for (let k = 1; k <= 5; k++) pts.push(leave.clone().addScaledVector(DOWN, (hang * k) / 5))
    const onHeadPart = M / (pts.length - 1)
    const m = out.movers.length
    out.movers.push({
      pivot: leave.clone(),
      dir: DOWN.clone(),
      length: hang,
      cfg: { stiffness: 0.04, drag: 0.18, gravity: 1.4 },
      maxAngle: 0.6,
    })
    const free = (t: number) => clamp((t - onHeadPart) / (1 - onHeadPart), 0, 1)
    out.braid.push(yarn(pts, rb, { braid: true, mover: m, free, phase: n * 2 }))

    // Ruban et pompon au bout.
    const tip = pts[pts.length - 1]
    out.ribbon.push(ring(tip, DOWN, rb * 1.05, r * 1.3, { mover: m, free: () => 1 }))
    for (let k = 0; k < 9; k++) {
      const phi = (k / 9) * Math.PI * 2 + rnd() * 0.4
      const fan = new THREE.Vector3(Math.cos(phi), 0, Math.sin(phi))
      const len = rb * (2 + rnd() * 1.2)
      const tassel = [0, 0.5, 1].map((t) =>
        tip.clone().addScaledVector(DOWN, len * t).addScaledVector(fan, rb * (0.3 + t * 0.7)),
      )
      out.yarn.push(yarn(tassel, r, { mover: m, free: () => 1 }))
    }
  })
}

/**
 * Frange balayée sur le côté, en mèches pointues — l'allure anime des nattes.
 *
 * Les brins partent sous la lisière des cheveux tirés (`frontLine`) et
 * traversent le front en biais vers un côté tiré au sort, épousant le crâne
 * point par point. Le bord s'arrête au-dessus des boutons (`faceSafe.edge`) ;
 * les brins se groupent en mèches qui se referment sur leur dernier tiers. Un
 * ressort par mèche, pivot au centre du crâne, sans gravité, débattement
 * borné pour que la pointe ne descende jamais sur un bouton.
 */
function sweptFringe(p: DollParams, rnd: () => number, r: number, frontLine: (az: number) => number, out: Parts) {
  const safe = faceSafe(p)
  const side = rnd() < 0.5 ? -1 : 1
  const clumps = 4 + Math.floor(rnd() * 2)
  const span = 1.5
  const sweep = 0.45 + rnd() * 0.2
  // Au ras des sourcils, juste au-dessus des boutons : à deux tailles de
  // bouton au-dessus des yeux, sur de gros boutons, la frange n'avait plus
  // la place d'exister sous la lisière.
  const edge = safe.edge(1.35 + rnd() * 0.2)
  const N = 14
  const first = out.movers.length
  const lens = Array.from({ length: clumps }, () => 0.8 + rnd() * 0.4)
  for (let c = 0; c < clumps; c++) {
    const az = (((c + 0.5) / clumps) * 2 - 1) * span * 0.5 + side * sweep
    out.movers.push({
      pivot: new THREE.Vector3(),
      dir: dirOf(az, edge),
      length: p.shape.headRadius,
      cfg: { stiffness: 0.05 + rnd() * 0.03, drag: 0.1 + rnd() * 0.05, gravity: 0 },
      maxAngle: Math.min(0.2, safe.maxAngle(edge)),
    })
  }
  const strands = clumps * 9
  for (let i = 0; i < strands; i++) {
    const c = i % clumps
    const u = (Math.floor(i / clumps) + 0.5) / 9 - 0.5
    const cw = span / clumps
    const az0 = (((c + 0.5) / clumps) * 2 - 1) * span * 0.5 + u * cw * 0.9
    const tipAz = az0 + side * sweep
    const center = (((c + 0.5) / clumps) * 2 - 1) * span * 0.5 + side * sweep
    const sy0 = Math.min(0.97, frontLine(az0) + 0.14)
    // Pointe de mèche : au bord, les brins du milieu descendent plus bas.
    const tipSy = edge + (Math.abs(u) * 0.12 + (1 - lens[c]) * 0.1)
    const layer = r * (1.6 + rnd() * 1.4)
    const pts: THREE.Vector3[] = []
    for (let k = 0; k <= N; k++) {
      const t = k / N
      const close = 0.8 * smooth(0.6, 1, t)
      const a = az0 + (tipAz - az0) * t
      const sy = sy0 + (tipSy - sy0) * t
      pts.push(onHeadPolar(p, a * (1 - close) + center * close, sy, k === 0 ? -r * 2 : layer).pos)
    }
    out.yarn.push(
      yarn(pts, r, { mover: first + c, free: (t) => 0.4 + 0.6 * t, fling: (t) => t * 0.8, phase: rnd() * 6, taper: 0.35 }),
    )
  }
}

/**
 * Grande frange : cheveux longs et raides, et une frange épaisse qui balance.
 *
 * Deux pivots. Les longueurs ballottent autour du centre du crâne, comme la
 * coupe au bol. La frange a le sien, au haut du front : un pivot au centre la
 * ferait glisser sur le crâne jusqu'aux yeux au premier geste. Autour du front
 * elle bascule en avant et en arrière, et sa partie basse est **décollée** du
 * front — elle tombe devant, elle ne colle pas — ce qui lui laisse la place
 * de balancer sans rentrer dans la tête. Son bord s'arrête au-dessus des
 * sourcils, net ou effilé selon la graine.
 */
function bangs(p: DollParams, rnd: () => number, yarnR: number, out: Parts) {
  const R = p.shape.headRadius
  const r = yarnR * (0.85 + rnd() * 0.3)

  /**
   * Longueurs : trois pivots — gauche, droite, arrière — autour du centre du
   * crâne, aux raideurs légèrement différentes. D'un seul pivot, toute la
   * chevelure bougeait d'un bloc, comme un casque. Un peu de poids : quand la
   * tête penche, les longueurs retombent vers le sol.
   */
  const CLUMPS = 20
  const long0 = out.movers.length
  for (let k = 0; k < CLUMPS; k++) {
    /**
     * Chaque mèche son ressort, ses raideur et amortissement : sans cet
     * écart, vingt ressorts identiques bougeraient comme un seul.
     *
     * Le bout du ressort est placé **vers la mèche** — en bas et vers
     * l'extérieur, à son azimut — et non à l'aplomb du centre : à l'aplomb,
     * il est sur l'axe autour duquel la poupée tourne, il ne bouge donc pas
     * quand elle tourne, et le ressort ne ressent rien. Pas de gravité : la
     * géométrie pend déjà, et une gravité en désaccord avec le repos ferait
     * glisser la mèche au repos. C'est l'inertie qui fait tout.
     */
    const ac = ((k + 0.5) / CLUMPS) * Math.PI * 2
    out.movers.push({
      pivot: new THREE.Vector3(),
      dir: new THREE.Vector3(Math.sin(ac) * 0.75, -0.66, Math.cos(ac) * 0.75).normalize(),
      length: R,
      cfg: { stiffness: 0.02 + rnd() * 0.025, drag: 0.05 + rnd() * 0.06, gravity: 0 },
      maxAngle: 0.42,
    })
  }
  // Longueurs fournies : assez de brins pour se toucher en bas, là où ils
  // s'écartent le plus — à 100 le crâne se voyait en larges bandes —, un fil
  // plus gros, et du volume.
  // Largeur de la frange, tirée avant les longueurs : les longueurs prennent
  // le relais **là où la frange s'arrête**, sans creux entre les deux.
  const width = 1.2 + rnd() * 0.25
  /**
   * Silhouette de héros d'anime : deux longues mèches qui **encadrent le
   * visage**, un arrière **court et évasé**. Une longueur égale tout autour
   * — mi-joue ou mâchoire — faisait un casque ; c'est le contraste entre
   * l'avant long et l'arrière court qui donne l'allure.
   */
  const frameEnd = -0.55 - rnd() * 0.1
  const backEnd = -0.1 - rnd() * 0.12
  const longEnd = frameEnd
  const longLimit = (az: number) => {
    const a = Math.abs(Math.atan2(Math.sin(az), Math.cos(az)))
    // Sous la frange : lisière au sommet, donc brin trop court, non posé.
    if (a < width * 0.78) return 0.95
    const back = clamp((a - 1.5) / 1.1, 0, 1)
    return frameEnd + (backEnd - frameEnd) * back * back * (3 - 2 * back)
  }
  radiate(p, rnd, r * 1.15, 240, longLimit, out, {
    clumpMover: long0,
    wave: rnd() < 0.3 ? 0.04 : 0,
    parting: true,
    volume: R * 0.1,
    ragged: 0.08,
    // Moins de mèches, plus grandes et plus fermées : des pics francs.
    clumps: CLUMPS,
    pinch: 0.68,
    // Évasement modéré : trop fort, les pointes partaient à l'horizontale au
    // lieu de retomber — une chevelure qui ne tombe pas.
    flare: R * 0.09,
    extend: 0 * rnd(),
  })

  /**
   * Frange : elle descend jusqu'aux sourcils et peut les couvrir — c'est le
   * principe d'une grande frange. Jamais sur les boutons.
   *
   * Physique **tombante** : quatre mèches, chacune son pivot au haut du front,
   * peu de rappel et du poids — elle retombe sous son poids et suit la tête
   * avec retard, au lieu de revenir en place d'un bloc comme un rabat. Son
   * bas est décollé du front : de quoi balancer sans rentrer dans la tête, que
   * le collider du crâne protège en plus.
   */
  // Jusqu'au-dessus des boutons : les sourcils sont couverts — c'est le
  // principe d'une grande frange. Les pointes des mèches remontent un peu.
  const edge = hairline(p, 0, 1.02)(0)
  /**
   * Un ressort par grosse mèche de frange (5 ou 6), pivot au **centre du
   * crâne** comme les longueurs, bout orienté vers la mèche.
   *
   * Pivotant au ras du front, la frange avait un bras de levier minuscule :
   * mesuré pendant une rotation, l'avant de la coupe se déplaçait huit fois
   * moins que les côtés — la moitié de la coupe paraissait figée. Autour du
   * centre, le bras de levier est le rayon du crâne, et la frange glisse sur
   * le front sans s'y enfoncer.
   */
  const tufts = 5 + Math.floor(rnd() * 2)
  const SECTORS = tufts
  const fringe0 = out.movers.length
  for (let k = 0; k < SECTORS; k++) {
    const ac = ((k + 0.5) / SECTORS * 2 - 1) * width * 0.92
    out.movers.push({
      pivot: new THREE.Vector3(),
      dir: new THREE.Vector3(Math.sin(ac) * 0.75, -0.66, Math.cos(ac) * 0.75).normalize(),
      length: R,
      cfg: { stiffness: 0.018 + rnd() * 0.02, drag: 0.05 + rnd() * 0.05, gravity: 0 },
      maxAngle: 0.42,
    })
  }
  // Toujours effilée : coupée droite, elle faisait un bord au cordeau.
  rnd()
  // Épaisse : assez de brins pour que le front ne se voie plus au travers.
  const count = 110 + Math.floor(rnd() * 20)
  const tuftLen = Array.from({ length: tufts }, () => rnd())
  const M = 16
  for (let i = 0; i < count; i++) {
    const u = (i + 0.5) / count
    /**
     * Deux rangées de mèches décalées d'une demi-mèche : convergeant chacune
     * vers sa pointe, une seule rangée laissait le front à nu entre deux
     * pointes — la frange paraissait clairsemée. La seconde comble les vides.
     */
    const shift = i % 2 ? 0.5 : 0
    const f = clamp(u * tufts + shift - 0.25, 0, tufts - 0.001)
    const c = Math.floor(f)
    const w = (f - c) * 2 - 1
    const az = (u * 2 - 1) * width
    const center = (((c + 0.5) / tufts) * 2 - 1) * width * 0.92
    // Convergence marquée, mais deux rangées décalées gardent le front
    // couvert : des pics nets sans trous.
    const tipAz = az + (center - az) * 0.6
    // Le bord remonte sur les tempes : une frange droite d'une tempe à
    // l'autre descendrait sur les boutons. Pointe au centre de la mèche,
    // bords plus courts.
    /**
     * Courte au centre, au-dessus des boutons, elle **s'allonge vers les
     * tempes** jusqu'à la longueur des mèches latérales : frange et longueurs
     * se raccordent en une seule coupe. Remontant vers les tempes comme
     * avant, elle laissait un creux à la jonction — une frange plaquée d'un
     * côté, des cheveux qui tombent de l'autre. L'allongement ne commence
     * qu'au-delà des yeux.
     */
    const side = Math.abs(tipAz) / width
    const lengthen = (edge - longEnd) * 0.9 * (side < 0.55 ? 0 : ((side - 0.55) / 0.45) ** 1.6)
    const tipSy = edge + tuftLen[c] * 0.05 + Math.abs(w) ** 1.5 * 0.06 + rnd() * 0.015 - lengthen
    /**
     * Racines sur la raie, **à la même place que les longueurs voisines** —
     * la hauteur de raie correspond à l'azimut du brin. Partant toutes de
     * derrière le sommet, les mèches de frange qui s'allongent vers les
     * tempes traversaient la tête en biais et croisaient les longueurs.
     */
    const from = new THREE.Vector3(
      Math.sign(tipAz || 1) * 0.03,
      1,
      Math.cos(tipAz) * 0.55 - 0.12 + (rnd() - 0.5) * 0.08,
    ).normalize()
    const tip = dirOf(tipAz, clamp(tipSy, -0.9, 0.9))
    // Par-dessus les longueurs à la jonction : celles-ci gonflent (volume) ;
    // plaquée, la frange passait dessous vers les tempes. Décollée d'autant,
    // progressivement, elle recouvre le raccord.
    const over = FRINGE_OVER * R * clamp((side - 0.35) / 0.5, 0, 1)
    const layer = r * (0.8 + rnd() * 2.2) + over
    const pts: THREE.Vector3[] = []
    let hang: THREE.Vector3 | null = null
    for (let k = 0; k <= M; k++) {
      const t = k / M
      const d = from.clone().lerp(tip, t).normalize()
      // Pointe relevée d'un souffle, comme les pics des longueurs.
      const lift = k === 0 ? -r * 2 : layer + R * 0.05 * Math.max(0, (t - 0.8) / 0.2) ** 2
      const q = onDir(p, d, lift).pos
      /**
       * **Tombante** : à partir du haut du front, la frange ne suit plus la
       * courbe du crâne — qui fuit vers l'arrière sous elle — mais descend à
       * la verticale sous son poids. Le point ne peut pas passer derrière la
       * surface : on garde le plus avancé des deux.
       */
      if (t > 0.62 && side < 0.55) {
        hang ??= pts[pts.length - 1].clone()
        const drop = hang.clone()
        drop.y = q.y
        if (drop.z > q.z) q.z = q.z + (drop.z - q.z) * 0.7
      }
      pts.push(q)
    }
    // Le ressort de la mèche du brin.
    const mover = fringe0 + c
    // Toute la frange bouge, pas seulement son bas : autour du centre du
    // crâne, elle glisse sur le front sans s'y enfoncer.
    out.yarn.push(yarn(pts, r * 1.15, { mover, free: (t) => 0.4 + 0.6 * t, fling: (t) => t, phase: rnd() * 6 }))
  }
}

/**
 * Géométrie d'une coiffure. Rien pour les locks : ce sont des chaînes
 * simulées, rendues par `hair.tsx`.
 */
/**
 * Pièces d'une coiffure avant fusion, un tube par brin. Sert aussi aux
 * audits : la couverture du crâne se mesure brin par brin, sur l'axe de
 * chaque tube — fusionnés, on ne sait plus où l'un s'arrête.
 */
export function buildHairParts(p: DollParams, style: HairStyle) {
  const rnd = mulberry32(p.seed + 5303)
  // Grosseur de fil de référence : celle du panneau, rapportée au crâne.
  const yarnR = p.hair.thickness * 0.42 * (p.shape.headRadius / 0.43)
  const out = new Parts()
  switch (style) {
    case 'boucles': curls(p, rnd, yarnR, out); break
    case 'meches': bowlCut(p, rnd, yarnR, out); break
    case 'chignon': bun(p, rnd, yarnR, out); break
    case 'houppette': tuft(p, rnd, yarnR, out); break
    case 'couettes': pigtails(p, rnd, yarnR, out); break
    case 'queue': ponytail(p, rnd, yarnR, out); break
    case 'nattes': braids(p, rnd, yarnR, out); break
    case 'frange': bangs(p, rnd, yarnR, out); break
  }
  // Au-delà de 32 ressorts, les brins en trop deviendraient immobiles sans
  // bruit : on le dit en atelier.
  if (import.meta.env.DEV && out.movers.length > MAX_MOVERS)
    console.warn(`[coiffure] ${style} : ${out.movers.length} ressorts, ${MAX_MOVERS} au plus`)
  out.movers = out.movers.slice(0, MAX_MOVERS)
  return { out, yarnR }
}

export function buildHair(p: DollParams, style: HairStyle): Built {
  const { out, yarnR } = buildHairParts(p, style)
  return { ...out.build(), yarnR }
}

// ---------------------------------------------------------------- rendu

type HairUniforms = {
  uAxis: { value: THREE.Vector3[] }
  uAngle: { value: number[] }
  uPivot: { value: THREE.Vector3[] }
  /** Écartement centrifuge, 0 au repos, 1 quand la tête tourne vite. */
  uFling: { value: number }
  /** Teinte des pointes éclaircies (`YarnOpts.tint`). */
  uTip: { value: THREE.Color }
}

/**
 * Injection du balancement dans le shader standard.
 *
 * La rotation se fait sur la position **et** sur la normale : sans elle,
 * l'éclairage resterait figé pendant que le brin bouge, et on verrait la
 * lumière glisser sur la laine.
 *
 * **Aucun mouvement au repos** : un souffle permanent a été essayé et rejeté —
 * ce qu'on attend, c'est que la chevelure réagisse quand on **agite** la
 * poupée, pas qu'elle ondule seule.
 *
 * **Écartement centrifuge** (`uFling`). Agiter la poupée de gauche à droite la
 * fait tourner sur elle-même : la tête tourne sur place. Les ressorts n'y
 * voient qu'un retard de rotation, qui fait **glisser** les brins autour du
 * crâne — invisible sur ceux qui sont posés contre lui, c'est-à-dire presque
 * tous : seules les mèches pendantes des côtés bougeaient. De vrais cheveux
 * sur une tête qui tourne vite **s'écartent** : chaque sommet est poussé
 * vers l'extérieur en proportion de sa distance à l'axe et de sa mobilité.
 */
function hairShader(uni: HairUniforms) {
  return (sh: THREE.WebGLProgramParametersWithUniforms) => {
    Object.assign(sh.uniforms, uni)
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute float aMover;
attribute float aFree;
attribute float aFling;
attribute float aPhase;
attribute float aTint;
varying float vTint;
uniform vec3 uAxis[${MAX_MOVERS}];
uniform float uAngle[${MAX_MOVERS}];
uniform vec3 uPivot[${MAX_MOVERS}];
uniform float uFling;
vec3 hairRotate(vec3 v, vec3 k, float a) {
  float c = cos(a), s = sin(a);
  return v * c + cross(k, v) * s + k * dot(k, v) * (1.0 - c);
}`,
      )
      .replace(
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>
int hm = int(aMover + 0.5);
float ha = 0.0;
vec3 hk = vec3(1.0, 0.0, 0.0);
vec3 hp = vec3(0.0);
if (aMover > -0.5 && aFree > 0.0) {
  for (int i = 0; i < ${MAX_MOVERS}; i++) {
    if (i == hm) { hk = uAxis[i]; ha = uAngle[i]; hp = uPivot[i]; }
  }
  ha = ha * aFree;
}
objectNormal = hairRotate(objectNormal, hk, ha);
vTint = aTint;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
transformed = hp + hairRotate(transformed - hp, hk, ha);
// Centrifuge : vers l'extérieur, en proportion de la distance à l'axe, et un
// peu vers le haut — un brin qui s'écarte se soulève.
vec3 hOut = vec3(transformed.x, 0.0, transformed.z);
transformed += (hOut * 0.5 + vec3(0.0, length(hOut) * 0.12, 0.0)) * uFling * aFling;`,
      )
    // Pointes éclaircies : la couleur de base glisse vers la teinte de pointe
    // **avant** la carte de fil, qui garde tout son relief.
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vTint;\nuniform vec3 uTip;')
      .replace('#include <map_fragment>', 'diffuseColor.rgb = mix(diffuseColor.rgb, uTip, vTint);\n#include <map_fragment>')
  }
}

const _q = new THREE.Quaternion()
const _dq = new THREE.Quaternion()
/** Vitesse de rotation de la tête (rad/s) à laquelle l'écartement est plein. */
const FLING_SPEED = 5
const HAIR_DEFINES = { TOON_HAIR: '' }
const NO_DEFINES = {}

/** Coiffure en laine, autre que les locks. Rendue dans le repère de la tête. */
export function Hairdo({
  p,
  style,
  color,
  yarn: yarnMaps,
  braid: braidMaps,
}: {
  p: DollParams
  /** Pour les locks : rien, ils sont rendus par `hair.tsx`. */
  style: HairStyle
  color: string
  yarn: CordMaps
  /** Tresse des locks, pour les nattes. */
  braid: CordMaps
}) {
  const built = useDisposable(() => {
    const b = buildHair(p, style)
    return {
      ...b,
      dispose: () => {
        b.yarn?.dispose()
        b.braid?.dispose()
        b.ribbon?.dispose()
      },
    }
  }, [p, style])

  const uni = useMemo<HairUniforms>(
    () => ({
      uAxis: { value: Array.from({ length: MAX_MOVERS }, () => new THREE.Vector3(1, 0, 0)) },
      uAngle: { value: new Array(MAX_MOVERS).fill(0) },
      uPivot: { value: Array.from({ length: MAX_MOVERS }, () => new THREE.Vector3()) },
      uFling: { value: 0 },
      uTip: { value: new THREE.Color() },
    }),
    [],
  )
  // Pointe éclaircie d'un **écart absolu** de clarté : un facteur butait
  // contre le plafond sur une laine déjà claire (voir les locks).
  useEffect(() => {
    const hsl = { h: 0, s: 0, l: 0 }
    new THREE.Color(color).getHSL(hsl)
    // La carte de fil (0,4 à 1) rabat la clarté : l'écart se prend large.
    uni.uTip.value.setHSL(hsl.h, Math.max(0, hsl.s - 0.12), Math.min(0.96, hsl.l + 0.45))
  }, [color, uni])
  const onCompile = useMemo(() => hairShader(uni), [uni])

  // Un os invisible par pivot, enfant du repère de la tête : le spring bone
  // y lit la pose de repos et y écrit sa rotation.
  const bones = useRef<(THREE.Object3D | null)[]>([])
  const springs = useRef<SpringBone[]>([])
  const skull = useRef<THREE.Object3D>(null!)
  const collider = useRef<Collider>({ center: new THREE.Vector3(), radius: 0 })
  /**
   * Collision avec le crâne, seulement pour les touffes dont la pose de repos
   * est **hors** de la sphère.
   *
   * Une frange pend le long du front : au repos, le bout de son ressort est
   * dans le crâne. Le collider l'en repoussait à chaque frame — mesuré, les
   * quatre ressorts de frange restaient collés à leur débattement maximal, et
   * la frange flottait soulevée devant le visage, presque invisible de face.
   */
  const collides = useMemo(
    () =>
      built.movers.map(
        (m) =>
          m.pivot.lengthSq() > 1e-6 &&
          m.pivot.clone().addScaledVector(m.dir, m.length).length() > p.shape.headRadius * 0.97,
      ),
    [built, p.shape.headRadius],
  )
  // Atelier : de quoi auditer chaque coupe (couverture, mobilité par zone).
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const w = window as unknown as { __hairs?: Record<string, unknown> }
    w.__hairs = w.__hairs ?? {}
    const key = `${style}#${p.seed}`
    w.__hairs[key] = { style, built, uni, skull: skull.current, p }
    return () => {
      delete w.__hairs?.[key]
    }
  }, [built, uni, style, p])

  useEffect(() => {
    springs.current = built.movers.map((m, i) => new SpringBone(bones.current[i]!, m.length, m.dir))
    built.movers.forEach((m, i) => uni.uPivot.value[i].copy(m.pivot))
    uni.uAngle.value.fill(0)
  }, [built, uni])

  // Orientation de la tête à la frame précédente, pour sa vitesse de rotation.
  const lastQ = useRef<THREE.Quaternion | null>(null)

  useFrame((_, dt) => {
    /**
     * Vitesse de rotation de la tête autour de la verticale, lue sur son
     * orientation monde — quelle qu'en soit la source : platine, ressort de
     * la tête, animation à venir. L'écartement monte vite et retombe en
     * douceur : les cheveux s'envolent au geste et reviennent se poser.
     */
    /*
     * Rotation d'une image à l'autre, en axe-angle, dont on ne garde que la
     * part autour de la **verticale**. Lue sur le cap du regard, elle
     * s'affolait dès que la tête piquait vers le sol (écrasement, roulade) :
     * le regard presque vertical n'a plus de cap stable, et la chevelure
     * s'ouvrait en corolle.
     */
    skull.current.getWorldQuaternion(_q)
    const h = Math.max(dt, 1 / 240)
    let spin = 0
    if (lastQ.current) {
      _dq.copy(_q).multiply(lastQ.current.invert())
      if (_dq.w < 0) _dq.set(-_dq.x, -_dq.y, -_dq.z, -_dq.w)
      const angle = 2 * Math.acos(clamp(_dq.w, -1, 1))
      const s = Math.sqrt(Math.max(0, 1 - _dq.w * _dq.w))
      spin = s > 1e-5 ? (angle * Math.abs(_dq.y / s)) / h : 0
      lastQ.current.copy(_q)
    } else lastQ.current = _q.clone()
    const target = clamp(spin / FLING_SPEED, 0, 1)
    const rate = target > uni.uFling.value ? 10 : 2.5
    uni.uFling.value += (target - uni.uFling.value) * Math.min(1, h * rate)

    if (!springs.current.length) return
    skull.current.getWorldPosition(collider.current.center)
    collider.current.radius = p.shape.headRadius * 0.95
    built.movers.forEach((m, i) => {
      const bone = bones.current[i]
      const spring = springs.current[i]
      if (!bone || !spring) return
      // Le crâne n'est un obstacle que pour ce qui pend à côté de lui, pas
      // pour ce qui pivote autour de son centre ni ce qui repose dessus.
      spring.update(dt, m.cfg, collides[i] ? collider.current : undefined)
      _q.copy(bone.quaternion)
      if (_q.w < 0) _q.set(-_q.x, -_q.y, -_q.z, -_q.w)
      const s = Math.sqrt(Math.max(0, 1 - _q.w * _q.w))
      if (s < 1e-5) {
        uni.uAngle.value[i] = 0
        return
      }
      uni.uAxis.value[i].set(_q.x / s, _q.y / s, _q.z / s)
      uni.uAngle.value[i] = Math.min(2 * Math.acos(clamp(_q.w, -1, 1)), m.maxAngle)
    })
  })

  const material = (maps: CordMaps, tint: string, hair = true) => (
    <meshPhysicalMaterial
      // Marqué « cheveux » pour le cel shading : paliers plus francs et reflet
      // anime (voir `scene/toon.ts`). Pas les rubans, qui sont du tissu.
      defines={hair ? HAIR_DEFINES : NO_DEFINES}
      map={maps.map}
      normalMap={maps.normalMap}
      roughnessMap={maps.roughnessMap}
      color={tint}
      roughness={1}
      metalness={0}
      sheen={0.8}
      sheenColor="#fff2dd"
      sheenRoughness={0.75}
      onBeforeCompile={onCompile}
      customProgramCacheKey={() => 'hairdo'}
    />
  )

  return (
    <>
      <object3D ref={skull} />
      {built.movers.map((m, i) => (
        <object3D
          key={`${style}-${i}`}
          position={m.pivot}
          ref={(el) => {
            bones.current[i] = el
          }}
        />
      ))}
      {built.yarn && (
        <mesh geometry={built.yarn} castShadow receiveShadow>
          {material(yarnMaps, color)}
        </mesh>
      )}
      {built.braid && (
        <mesh geometry={built.braid} castShadow receiveShadow>
          {material(braidMaps, color)}
        </mesh>
      )}
      {built.ribbon && (
        <mesh geometry={built.ribbon} castShadow>
          {material(yarnMaps, built.ribbonColor, false)}
        </mesh>
      )}
    </>
  )
}
