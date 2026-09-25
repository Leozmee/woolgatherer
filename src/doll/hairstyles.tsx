import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import { SpringBone, type Collider, type SpringConfig } from '../core/springBone'
import { useDisposable } from '../core/useDisposable'
import { clamp, mulberry32 } from '../core/rand'
import type { CordMaps } from '../core/cord'
import { onHeadPolar } from './surface'
import { EYE_SCALE } from './face'
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
  | 'epars'
  | 'couettes'
  | 'queue'
  | 'nattes'
  | 'frange'

export const HAIR_STYLES: readonly HairStyle[] = [
  'locks', 'boucles', 'meches', 'chignon', 'houppette', 'epars', 'couettes', 'queue', 'nattes', 'frange',
]

export const HAIR_STYLE_NAMES: Record<HairStyle, string> = {
  locks: 'locks',
  boucles: 'bouclettes',
  meches: 'mèches',
  chignon: 'chignon',
  houppette: 'houppette',
  epars: 'trois poils',
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
 * Même règle que pour les laines, les archétypes et les visages ; avec dix
 * coupes pour six poupées, une planche en laisse quatre de côté, jamais les
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
  /**
   * Ressort **parent** : celui-ci est porté par lui. Son os est l'enfant de
   * l'os parent, donc son repos suit le balancement du parent, et au vertex
   * shader sa rotation s'applique d'abord (autour de son pivot de repos), puis
   * celle du parent. C'est ce qui fait fouetter une queue : la racine
   * balance, les mèches traînent derrière elle, et les pointes arrivent en
   * dernier.
   */
  parent?: number
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
  // Tous les morceaux d'une coiffure portent les mêmes attributs, sinon
  // `mergeGeometries` refuse de les fusionner.
  geo.setAttribute('aMover2', new THREE.Float32BufferAttribute(new Float32Array(n).fill(-1), 1))
  geo.setAttribute('aFree2', new THREE.Float32BufferAttribute(new Float32Array(n), 1))
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
  /**
   * Second ressort, porté par `mover` (voir `Mover.parent`), et sa mobilité
   * le long du brin : la mèche d'une queue, sur le ressort de la racine.
   */
  mover2?: number
  free2?: (t: number) => number
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
  const mover2 = new Float32Array(n).fill(o.mover2 ?? -1)
  const free2 = new Float32Array(n)
  const c = new THREE.Vector3()
  const v = new THREE.Vector3()
  for (let i = 0; i <= segs; i++) {
    const t = i / segs
    const f = o.free ? o.free(t) : 0
    const fl = o.fling ? o.fling(t) : f
    const f2 = o.free2 ? o.free2(t) : 0
    // Effilage : sommets ramenés vers l'axe sur la part effilée de la pointe.
    const taper = closed ? 1 : Math.sqrt(clamp((1 - t) / (o.taper ?? 0.2), 0, 1))
    if (taper < 1) curve.getPointAt(Math.min(1, t), c)
    for (let j = 0; j <= radial; j++) {
      const k = i * (radial + 1) + j
      free[k] = f
      fling[k] = fl
      free2[k] = f2
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
  tube.setAttribute('aMover2', new THREE.Float32BufferAttribute(mover2, 1))
  tube.setAttribute('aFree2', new THREE.Float32BufferAttribute(free2, 1))
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
  // Lisière irrégulière qui descend en pointe sur la nuque.
  const rim = (az: number) => dirOf(az, limit(az) + 0.02 - Math.max(0, -Math.cos(az)) ** 3 * 0.18)
  const dirs = targets.map((t) => t.clone().normalize())
  const nearest = (f: THREE.Vector3) => dirs.reduce((a, d) => (d.dot(f) > a.dot(f) ? d : a), dirs[0])
  const split = dirs.length === 2 && dirs[0].x * dirs[1].x < 0
  const a0 = Math.asin(clamp(limit(0), -0.99, 0.99))
  const a1 = Math.PI - Math.asin(Math.max(-0.9, limit(Math.PI) - 0.1))
  /*
   * Zones : avec deux attaches opposées, chaque moitié a pour bord la raie
   * (du front à la nuque) puis sa demi-lisière ; sinon la lisière entière.
   */
  const zones = split
    ? dirs.map((to) => {
        const sx = Math.sign(to.x)
        const part = Array.from({ length: 121 }, (_, k) => {
          const a = a0 + ((a1 - a0) * k) / 120
          return new THREE.Vector3(sx * 0.013, Math.sin(a), Math.cos(a)).normalize()
        })
        const edge = Array.from({ length: 180 }, (_, k) => rim(sx * (Math.PI - (Math.PI * (k + 1)) / 181)))
        return { to: to as THREE.Vector3 | null, line: [...part, ...edge] }
      })
    : [{ to: null as THREE.Vector3 | null, line: Array.from({ length: 721 }, (_, k) => rim(-Math.PI + (k / 720) * Math.PI * 2)) }]

  const base = Math.max(r * 0.8, p.shell.height - r * 0.9)
  for (const z of zones) {
    const pos = z.line.map((d) => onDir(p, d, 0, POLE).pos)
    const cum = [0]
    for (let i = 1; i < pos.length; i++) {
      const th = z.line[i].angleTo(z.to ?? nearest(z.line[i]))
      const w = th > Math.PI / 2 ? Math.max(0.3, Math.sin(th)) : 1
      cum.push(cum[i - 1] + pos[i].distanceTo(pos[i - 1]) / w)
    }
    const B = cum[cum.length - 1]
    const n = clamp(Math.ceil(B / ((o.pitch ?? 1.8) * r)), 60, 480)
    for (let i = 0, j = 1; i < n; i++) {
      const at = ((i + 0.5 + (rnd() - 0.5) * 0.3) / n) * B
      while (j < cum.length - 1 && cum[j] < at) j++
      const u = clamp((at - cum[j - 1]) / Math.max(1e-9, cum[j] - cum[j - 1]), 0, 1)
      const from = z.line[j - 1].clone().lerp(z.line[j], u).normalize()
      const to = z.to ?? nearest(from)
      const upper = i % 2 === 1
      const ridge = upper && o.grooves ? r * 0.9 * (0.5 + 0.5 * Math.cos((2 * Math.PI * o.grooves * at) / B)) : 0
      const layer = upper ? base + r * (0.9 + rnd() * 0.3) + ridge : base * (1 + rnd() * 0.2)
      const ang = from.angleTo(to)
      const reach = o.tuck ? Math.max(0.2, 1 - o.tuck / Math.max(ang, 1e-3)) : 1
      const M = clamp(Math.ceil(ang / 0.08), 8, 24)
      const pts: THREE.Vector3[] = []
      for (let k = 0; k <= M; k++) {
        const d = from.clone().lerp(to, (k / M) * reach).normalize()
        const lift = k === 0 ? -r * 2 : k === M && o.tuck ? -r * 0.5 : layer
        pts.push(onDir(p, d, lift, POLE).pos)
        /*
         * Sortie franche : un point à un tiers du premier pas, déjà à hauteur.
         * Le tube ne remontait de sous la peau qu'à mi-pas — une bande nue
         * d'un diamètre de fil de chaque côté de la raie, qui lisait comme une
         * couture beige et non comme une raie.
         */
        if (k === 0) pts.push(onDir(p, from.clone().lerp(to, (0.3 / M) * reach).normalize(), layer, POLE).pos)
      }
      // Aucune option de mouvement : aMover −1, mobilité et écartement nuls.
      out.yarn.push(yarn(pts, r, { step: 6 }))
    }
  }
  return { frontLine: (az: number) => limit(az) + 0.02 }
}

// ---------------------------------------------------------------- briques anime

/**
 * Ressort qui pivote au centre du crâne, bout vers l'azimut `az` — en bas et
 * vers l'extérieur : à l'aplomb du centre, il serait sur l'axe de rotation de
 * la poupée et ne ressentirait rien. Pour ce qui est posé contre le crâne :
 * une rotation autour du centre le fait glisser dessus sans l'y enfoncer.
 */
function centerMover(R: number, az: number, cfg: SpringConfig, maxAngle: number): Mover {
  return {
    pivot: new THREE.Vector3(),
    dir: new THREE.Vector3(Math.sin(az) * 0.75, -0.66, Math.cos(az) * 0.75).normalize(),
    length: R,
    cfg,
    maxAngle,
  }
}

type SideLockOpts = {
  /** Azimut de la mèche, signé : son signe est le côté. */
  az: number
  /**
   * Azimut de la racine, plus près du milieu : la mèche naît avec la frange
   * et s'écarte vers la tempe sur son premier tiers. Partie de la tempe, elle
   * lisait comme un favori.
   */
  rootAz?: number
  /** Hauteur de la racine (sur la lisière des cheveux tirés) et de la pointe. */
  from: number
  end: number
  /** Relèvement de base : au-dessus de la couche tirée qu'elle recouvre. */
  over: number
  /** Largeur de la mèche, en azimut. */
  span: number
  /** Brins par couche (deux couches). */
  n: number
}

/**
 * Mèche latérale : elle encadre le visage.
 *
 * De la lisière, elle passe sur la tempe **par-dessus** les cheveux tirés,
 * descend devant l'oreille jusqu'à la mâchoire, se referme en pointe sur son
 * dernier tiers et rentre la pointe vers la joue. Sous l'équateur elle ne peut
 * plus se rapprocher de l'axe : elle passe par-dessus les bajoues au lieu d'y
 * entrer. C'est elle qui dit « personnage » : sans elle, le visage d'une
 * coupe tirée est un œuf.
 *
 * Un ressort pivotant au centre du crâne, sans gravité ; racine tenue — elle
 * sort de cheveux immobiles, une racine qui glisse lirait comme une perruque.
 */
function sideLock(p: DollParams, rnd: () => number, r: number, out: Parts, o: SideLockOpts) {
  const R = p.shape.headRadius
  const sx = Math.sign(o.az) || 1
  const m = out.movers.length
  out.movers.push(
    centerMover(R, o.az, { stiffness: 0.03 + rnd() * 0.015, drag: 0.08 + rnd() * 0.04, gravity: 0 }, 0.22),
  )
  // Pointe rentrée vers la joue — signée par le côté : une rotation ne
  // reflète pas, et sans le signe les deux mèches tourneraient du même côté.
  const curl = sx * (0.1 + rnd() * 0.06)
  const count = o.n * 2
  const M = 18
  const ra = o.rootAz ?? o.az
  for (let i = 0; i < count; i++) {
    const u = ((Math.floor(i / 2) + 0.5) / o.n) * 2 - 1
    const a0 = o.az + u * o.span * 0.5
    const r0 = ra + u * o.span * 0.35
    // Bords plus courts : la pointe.
    const tipSy = clamp(o.end + Math.abs(u) ** 1.4 * 0.12 + rnd() * 0.02, -0.9, 0.9)
    const layer = o.over + r * ((i % 2) * 0.9 + rnd() * 0.4)
    const phase = rnd() * 6
    let rMax = 0
    const pts: THREE.Vector3[] = []
    for (let k = 0; k <= M; k++) {
      const t = k / M
      const close = 0.8 * smooth(0.55, 1, t)
      const a = r0 + (a0 + (o.az - a0) * close - curl * smooth(0.7, 1, t) ** 2 - r0) * smooth(0, 0.4, t)
      const sy = o.from + (tipSy - o.from) * t
      // Ventre : la mèche gonfle un peu à mi-hauteur, comme une mèche peignée.
      const s = onHeadPolar(p, a, sy, k === 0 ? -r * 2 : layer + R * 0.03 * Math.sin(Math.PI * t))
      const h = Math.hypot(s.pos.x, s.pos.z)
      if (sy < 0 && h < rMax) {
        s.pos.x *= rMax / h
        s.pos.z *= rMax / h
      }
      rMax = Math.max(rMax, Math.hypot(s.pos.x, s.pos.z))
      pts.push(s.pos)
    }
    out.yarn.push(yarn(pts, r, { mover: m, free: after(0.15), fling: (t) => 0.9 * after(0.3)(t), phase }))
  }
}

/**
 * Épi rebelle (ahoge) : une mèche dressée sur le dessus, qui monte puis ploie
 * vers l'avant en crochet. Tirages faits dans tous les cas — présence
 * comprise —, pour que la suite de la graine n'en dépende pas.
 *
 * Son ressort est raide et peu amorti : il vibre. Il pointe **vers la pointe
 * réelle**, pas selon la normale : à la verticale du sommet, le bout du
 * ressort serait sur l'axe de rotation de la poupée et ne ressentirait rien.
 * Hors de la sphère du crâne, il a le collider.
 */
function ahoge(p: DollParams, rnd: () => number, r: number, out: Parts, chance: number, at?: THREE.Vector3) {
  const R = p.shape.headRadius
  const has = rnd() < chance
  const root = onDir(p, at ?? dirOf((rnd() - 0.5) * 0.6, 0.955), 0, POLE)
  const n = root.normal
  const fwd = new THREE.Vector3(0, 0, 1).addScaledVector(n, -n.z).normalize()
  const lean = (rnd() - 0.5) * 0.5
  const side = new THREE.Vector3().crossVectors(n, fwd)
  fwd.applyAxisAngle(n, lean)
  side.applyAxisAngle(n, lean)
  const L = R * (0.42 + rnd() * 0.22)
  const bend = 2 + rnd() * 0.6
  const strands = 4 + Math.floor(rnd() * 2)
  const phases = Array.from({ length: 5 }, () => rnd() * 6)
  if (!has) return
  const rad = L / bend
  const at2 = (ang: number) => root.pos.clone().addScaledVector(n, rad * Math.sin(ang)).addScaledVector(fwd, rad * (1 - Math.cos(ang)))
  const toTip = at2(bend).sub(root.pos)
  const m = out.movers.length
  out.movers.push({
    pivot: root.pos.clone(),
    dir: toTip.clone().normalize(),
    length: toTip.length(),
    cfg: { stiffness: 0.14, drag: 0.06, gravity: 0 },
    maxAngle: 0.5,
  })
  for (let s = 0; s < strands; s++) {
    const off = (s / (strands - 1) - 0.5) * 2
    const pts = [root.pos.clone().addScaledVector(n, -r * 2).addScaledVector(side, off * r * 1.6)]
    for (let k = 1; k <= 12; k++) {
      const t = k / 12
      // Les brins se rejoignent en une seule pointe.
      pts.push(at2(bend * t).addScaledVector(side, off * r * 1.6 * (1 - t) ** 1.3))
    }
    out.yarn.push(yarn(pts, r * 1.1, { mover: m, free: (t) => t ** 1.1, fling: (t) => 0.5 * t, phase: phases[s], taper: 0.35 }))
  }
}

type TailOpts = {
  /** Axe de la queue, de t = 0 (nœud) à 1 (pointe du cœur). */
  axisAt: (t: number) => THREE.Vector3
  /** Horizontale « vers le dehors » au nœud : repère de la section. */
  outH: THREE.Vector3
  /** Demi-largeur et demi-profondeur de la section pleine. */
  W: number
  D: number
  /** Rayon de sortie du lien : les brins sortent serrés. */
  rim: number
  /** Mèches autour du cœur. */
  K: number
  /** Vrille totale sur la longueur, signée — chiralité. */
  twist: number
  /** Point du tracé où la queue enfouit ses racines (sous le lien). */
  root: THREE.Vector3
}

/**
 * Queue en mèches : couettes et queue de cheval.
 *
 * Un cylindre de brins tirés dans un disque faisait une **queue de rat** —
 * 7 à 10 % de la largeur de la tête vue de face, sans pointes. Ici la section
 * est une ellipse pleine (couronne extérieure, couronne intérieure, cœur),
 * qui sort serrée du lien, gonfle aussitôt, puis se divise en `K` mèches et
 * un cœur, plus long. Chaque mèche a sa longueur — les latérales plus
 * courtes, d'où une pointe en V vue de dos —, ses brins se referment vers sa
 * pointe sur la seconde moitié, et creusent dès le haut un **sillon** entre
 * deux mèches, que le trait d'encre dessine. Une mèche sur deux retrousse sa
 * pointe vers l'extérieur.
 *
 * **Physique chaînée** : un ressort racine au nœud, et sous lui un ressort par
 * mèche (et le cœur), pivot là où la queue commence à tomber. La racine
 * balance, les mèches suivent avec leur propre retard et se séparent au
 * geste : le fouetté. Tous sans gravité, bout vers la masse réelle : repos =
 * géométrie, aucun mouvement sans geste — et un bout qui n'est pas à la
 * verticale du pivot ressent aussi les bonds de la course, qu'un ressort
 * pendant tout droit absorbait entièrement.
 */
function clumpTail(p: DollParams, rnd: () => number, r: number, out: Parts, o: TailOpts) {
  const K = o.K
  const span = (Math.PI * 2) / K
  const side0 = new THREE.Vector3().crossVectors(UP, o.outH).normalize()
  const tan = new THREE.Vector3()
  /** Section en t : point de l'ellipse d'angle a, fraction s du rayon. */
  const ell = (t: number, a: number, s: number, target = new THREE.Vector3()) => {
    tan.copy(o.axisAt(Math.min(1.05, t + 0.01))).sub(o.axisAt(Math.max(0, t - 0.01))).normalize()
    const bl = side0.clone().addScaledVector(tan, -side0.dot(tan)).normalize()
    const bd = new THREE.Vector3().crossVectors(tan, bl)
    const tw = o.twist * t
    return target.copy(bl).multiplyScalar(Math.cos(a + tw) * o.W * s).addScaledVector(bd, Math.sin(a + tw) * o.D * s)
  }
  // Gonfle juste après le lien, s'affine d'un quart vers le bas.
  const grow = (t: number) => smooth(0, 0.22, t) * (1 - 0.25 * smooth(0.6, 1, t))
  // Mèches latérales plus courtes : pointe en V ; le cœur est le plus long.
  const clumpLen = Array.from({ length: K + 1 }, (_, c) =>
    c === K ? 1 : 1 - 0.2 * Math.abs(Math.sin((c + 0.5) * span)) ** 1.5 - rnd() * 0.08,
  )
  const flick = Array.from({ length: K }, () => rnd())

  const tp = 0.4
  const root = out.movers.length
  const cen = o.axisAt(0.6)
  const knot = o.axisAt(0)
  out.movers.push({
    pivot: knot.clone(),
    dir: cen.clone().sub(knot).normalize(),
    length: cen.distanceTo(knot),
    cfg: { stiffness: 0.06, drag: 0.14, gravity: 0 },
    maxAngle: 0.28,
  })
  const low = o.axisAt(tp)
  const clump0 = out.movers.length
  for (let c = 0; c <= K; c++) {
    const tl = clumpLen[c]
    const tip = o.axisAt(tl).add(c === K ? new THREE.Vector3() : ell(tl, (c + 0.5) * span, 0.62 * grow(tl)))
    out.movers.push({
      pivot: low.clone(),
      dir: tip.clone().sub(low).normalize(),
      length: tip.distanceTo(low),
      cfg: { stiffness: 0.035 + rnd() * 0.02, drag: 0.1 + rnd() * 0.06, gravity: 0 },
      maxAngle: 0.3,
      parent: root,
    })
  }

  // Brins : couronne extérieure au pas d'1,7 r, couronne intérieure, cœur.
  const perim = Math.PI * (3 * (o.W + o.D) - Math.sqrt((3 * o.W + o.D) * (o.W + 3 * o.D)))
  const nO = Math.ceil(perim / (1.7 * r))
  const nI = Math.ceil(nO * 0.55)
  const strands = [
    ...Array.from({ length: nO }, (_, i) => ({ s: 0.88 + rnd() * 0.12, a: ((i + rnd() * 0.4) / nO) * Math.PI * 2, core: false })),
    ...Array.from({ length: nI }, (_, i) => ({ s: 0.5 + rnd() * 0.2, a: ((i + 0.5 + rnd() * 0.4) / nI) * Math.PI * 2, core: false })),
    ...Array.from({ length: 5 }, () => ({ s: 0.25 * Math.sqrt(rnd()), a: rnd() * Math.PI * 2, core: true })),
  ]
  const N = 22
  const own = new THREE.Vector3()
  const mid = new THREE.Vector3()
  const dir = new THREE.Vector3()
  for (const st of strands) {
    const c = st.core ? K : Math.floor(st.a / span) % K
    const ac = (c + 0.5) * span
    const tEnd = clumpLen[c] * (0.93 + rnd() * 0.07)
    const pts = [o.root.clone()]
    for (let k = 1; k <= N; k++) {
      const u = k / N
      const t = u * tEnd
      // Sillon entre les mèches dès le haut, puis fermeture sur la pointe.
      const close = 0.15 * smooth(0.1, 0.35, u) + 0.7 * smooth(0.55, 1, u) ** 1.2
      ell(t, st.a, st.s, own)
      if (st.core) mid.set(0, 0, 0)
      else ell(t, ac, 0.62, mid)
      const off = own.lerp(mid, close).multiplyScalar(grow(t))
      // Sortie du lien : les brins partent d'un anneau du rayon du lien.
      off.addScaledVector(ell(t, st.a, 1, dir).normalize(), (o.rim - r) * st.s * (1 - smooth(0, 0.22, t)))
      if (!st.core && flick[c] < 0.5) off.addScaledVector(ell(t, ac, 1, dir).normalize(), r * 5 * Math.max(0, (u - 0.78) / 0.22) ** 2)
      pts.push(clearHead(p, o.axisAt(t).add(off), r * 2.5))
    }
    out.yarn.push(
      yarn(pts, r, {
        step: 3.5,
        mover: root,
        free: (x) => smooth(0.02, 0.2, x * tEnd),
        mover2: clump0 + c,
        free2: (x) => smooth(tp, 1, x * tEnd) ** 1.1,
        fling: (x) => 0.7 * (x * tEnd) ** 1.2,
        phase: rnd() * 6,
      }),
    )
  }
  return { root, knot }
}

/**
 * Nœud de ruban : deux boucles en goutte et deux pans.
 *
 * Un lien fait de deux anneaux de fil ne dit pas « coiffé » à la taille d'une
 * planche. Les boucles sont dans le plan tangent au crâne, relevées de ±30°,
 * et le tube est **aplati** trois fois selon la normale : de face on voit la
 * boucle, de profil une bande — un ruban, pas une ficelle. Tenu : aucun
 * ressort, ou celui de la racine d'une queue pour les pans.
 */
function bowKnot(out: Parts, at: THREE.Vector3, n: THREE.Vector3, size: number, thread: number, tilt: number, tails?: YarnOpts) {
  const nn = n.clone().normalize()
  const S = new THREE.Vector3().crossVectors(UP, nn)
  if (S.lengthSq() < 1e-6) S.set(1, 0, 0)
  S.normalize().applyAxisAngle(nn, tilt)
  const U = new THREE.Vector3().crossVectors(nn, S).normalize()
  const place = new THREE.Matrix4().makeBasis(S, U, nn).setPosition(at).multiply(new THREE.Matrix4().makeScale(1, 1, 2.4))
  for (const sx of [-1, 1]) {
    const loop = Array.from({ length: 16 }, (_, k) => {
      const f = (k / 16) * Math.PI * 2
      // Goutte : pointue au nœud, ronde au bout, relevée de 30°.
      const x = size * 0.5 * (1 - Math.cos(f))
      const y = size * 0.42 * Math.sin(f) * Math.sqrt(Math.max(0, x / size))
      const a = sx * 0.52
      return new THREE.Vector3(sx * (x * Math.cos(a) - y * Math.sin(a) * sx), x * Math.sin(Math.abs(a)) + y * Math.cos(a), 0)
    })
    out.ribbon.push(yarn(loop, thread, { closed: true }).applyMatrix4(place))
    const tail = [0, 0.5, 1].map((t) => new THREE.Vector3(sx * size * (0.12 + 0.3 * t), -size * 0.95 * t, 0))
    out.ribbon.push(yarn(tail, thread, { ...tails, taper: 0.05 }).applyMatrix4(place))
  }
  out.ribbon.push(still(new THREE.SphereGeometry(thread * 1.6, 10, 8).applyMatrix4(place)))
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
   * boucles qui se touchent — donc une boucle par carré d'à peu près son
   * diamètre, sur la calotte au-dessus de `low` (aire ∝ hauteur).
   */
  const cap = 2 * Math.PI * R * R * (0.97 - low)
  const count = clamp(Math.round(cap / (loop * 1.55) ** 2), 60, 420)
  // Bouclettes : elles rebondissent par secteurs — raides et peu amorties,
  // une boucle serrée sautille plus qu'elle ne pend.
  const sector = sectorMovers(out, rnd, R, 8, 0.16, 0.08)
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count
    const sy = low + (0.97 - low) * t
    const az = i * GOLDEN + rnd() * 0.3
    if (sy < limit(az)) continue
    const s = onHeadPolar(p, az, sy, 0)
    const [t1, t2] = tangentBasis(s.normal)
    const phi = rnd() * Math.PI
    const dir = t1.clone().multiplyScalar(Math.cos(phi)).addScaledVector(t2, Math.sin(phi))
    const side = t1.clone().multiplyScalar(-Math.sin(phi)).addScaledVector(t2, Math.cos(phi))
    const lr = loop * (0.8 + rnd() * 0.45)
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
  // le bas du crâne — l'effet chauve, réservé à « trois poils ».
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
  const whorl = dirOf(Math.PI + (rnd() - 0.5) * 1.2, 0.8 + rnd() * 0.12)
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
    let rMax = 0
    const pts: THREE.Vector3[] = []
    for (let k = 0; k <= M; k++) {
      const t = k / M
      const d = from.clone().lerp(tip, t).normalize()
      const close = clumps ? pinch * clamp((t - 0.62) / 0.38, 0, 1) ** 1.5 : 0
      const a = Math.atan2(d.x, d.z) + pinchTo * close + wave * Math.sin(t * waves * Math.PI + phase) * t
      const sy = clamp(d.y, -0.98, 0.98)
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
    : [onHeadPolar(p, Math.PI - (rnd() - 0.5) * 0.6, 0.72 + rnd() * 0.2, 0)]
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
 * Houppette : un plumet noué sur le sommet, dont les brins retombent en
 * fontaine tout autour du crâne.
 *
 * Premier essai : un plumet seul, sur un crâne nu — une poupée chauve avec un
 * toupet. Puis une base couchée sous le plumet : deux coiffures superposées,
 * rejeté. C'est donc le plumet lui-même qui couvre : chaque brin jaillit du
 * nœud, monte, puis retombe **sur** le crâne en l'épousant jusqu'à la
 * lisière. Une partie des brins, plus courts, reste dressée au centre : c'est
 * elle qui fait le toupet.
 *
 * Physique : le toupet oscille autour du nœud, raide et peu amorti — il
 * rebondit. La gerbe qui retombe glisse sur le crâne par secteurs ; seule sa
 * sortie du nœud reste fixe, sinon elle s'en détacherait.
 */
function tuft(p: DollParams, rnd: () => number, yarnR: number, out: Parts) {
  const R = p.shape.headRadius
  const s = onHeadPolar(p, (rnd() - 0.5) * 0.5, 0.93 + rnd() * 0.04, 0)
  const [t1, t2] = tangentBasis(s.normal)
  const rise = R * (0.12 + rnd() * 0.1)
  const r = yarnR * (1 + rnd() * 0.35)
  const limit = hairline(p, -0.1 + rnd() * 0.25)
  out.movers.push({
    pivot: s.pos.clone(),
    dir: s.normal.clone(),
    length: rise * 2,
    cfg: { stiffness: 0.12, drag: 0.1, gravity: 0.4 },
    maxAngle: 0.45,
  })

  /**
   * Brins qui retombent jusqu'à la lisière. Leur partie posée sur le crâne
   * bouge aussi, par secteurs pivotant au centre : elle glisse sur le crâne.
   * Pendue au nœud, elle y restait figée — seul le plumet bougeait.
   */
  const sector = sectorMovers(out, rnd, R, 8, 0.3, 0.035)
  const count = 80
  const M = 18
  for (let i = 0; i < count; i++) {
    const az = (i / count) * Math.PI * 2 + (rnd() - 0.5) * 0.08
    const tip = dirOf(az, limit(az) + (rnd() - 0.5) * 0.05)
    const top = s.normal.clone()
    const layer = r * (0.7 + rnd() * 1.2)
    const arc = rise * (0.7 + rnd() * 0.5)
    const pts: THREE.Vector3[] = [s.pos.clone().addScaledVector(s.normal, -r * 2)]
    for (let k = 1; k <= M; k++) {
      const t = k / M
      const d = top.clone().lerp(tip, t).normalize()
      // Bosse de la gerbe : haute au départ, nulle une fois posée.
      const bulge = arc * Math.sin(Math.PI * Math.min(1, t * 1.6)) * (t < 0.62 ? 1 : 0)
      pts.push(onDir(p, d, layer + Math.max(0, bulge)).pos)
    }
    out.yarn.push(yarn(pts, r, { mover: sector(az), free: (t) => clamp(t / 0.2, 0, 1) * (0.4 + 0.6 * t), fling: (t) => t, phase: rnd() * 6 }))
  }

  // Toupet : brins courts, dressés au centre.
  // Le toupet est la signature de la coupe : trop court, la houppette ne se
  // distinguait plus d'une coupe au bol.
  const tall = 18 + Math.floor(rnd() * 10)
  const L = R * (0.5 + rnd() * 0.3)
  for (let i = 0; i < tall; i++) {
    const phi = (i / tall) * Math.PI * 2 + rnd() * 0.5
    const dir = t1.clone().multiplyScalar(Math.cos(phi)).addScaledVector(t2, Math.sin(phi))
    const len = L * (0.7 + rnd() * 0.45)
    const droop = 0.2 + rnd() * 0.3
    const pts: THREE.Vector3[] = [s.pos.clone().addScaledVector(s.normal, -r * 2)]
    for (let k = 1; k <= 10; k++) {
      const t = k / 10
      pts.push(
        s.pos
          .clone()
          .addScaledVector(s.normal, len * (t - droop * t * t))
          .addScaledVector(dir, len * 0.55 * Math.pow(t, 1.2))
          .addScaledVector(DOWN, len * droop * t * t * 0.35),
      )
    }
    out.yarn.push(yarn(pts, r, { mover: 0, free: (t) => t ** 1.3, phase: rnd() * 6 }))
  }
  for (let w = 0; w < 2; w++) {
    const c = s.pos.clone().addScaledVector(s.normal, rise * (0.35 + w * 0.3))
    out.yarn.push(ring(c, s.normal, r * 4.2, r * 0.9))
  }
}

/**
 * Trois poils : quelques tire-bouchons sur un crâne presque nu.
 *
 * L'hélice part d'un rayon nul à la racine : un ressort qui démarre plein
 * rayon paraît posé sur le crâne. Son axe fléchit sous son poids — droit, il
 * lit comme une antenne. Physique : chacun son pivot, raide et à peine amorti.
 * C'est un ressort : il doit rebondir.
 */
function wisps(p: DollParams, rnd: () => number, yarnR: number, out: Parts) {
  const R = p.shape.headRadius
  const count = 2 + Math.floor(rnd() * 4)
  const r = yarnR * (1 + rnd() * 0.4)
  for (let i = 0; i < count; i++) {
    const s = onHeadPolar(p, (rnd() - 0.5) * 2.4, 0.8 + rnd() * 0.17, 0)
    const [t1, t2] = tangentBasis(s.normal)
    const lean = t1.clone().multiplyScalar(rnd() - 0.5).addScaledVector(t2, rnd() - 0.5)
    const axis0 = s.normal.clone().addScaledVector(lean, 0.8).normalize()
    const L = R * (0.28 + rnd() * 0.3)
    const coil = R * (0.03 + rnd() * 0.025)
    const turns = 2.5 + rnd() * 2.5
    const bend = 0.3 + rnd() * 0.5
    const m = out.movers.length
    out.movers.push({
      pivot: s.pos.clone(),
      dir: axis0.clone(),
      length: L,
      cfg: { stiffness: 0.16, drag: 0.07, gravity: 0.3 },
      maxAngle: 0.55,
    })
    const pts: THREE.Vector3[] = [s.pos.clone().addScaledVector(s.normal, -r * 2)]
    let at = s.pos.clone()
    const N = 40
    for (let k = 1; k <= N; k++) {
      const t = k / N
      const axis = axis0.clone().addScaledVector(DOWN, bend * t).normalize()
      at = at.clone().addScaledVector(axis, L / N)
      const [b1, b2] = tangentBasis(axis)
      const a = t * turns * Math.PI * 2
      pts.push(
        at.clone()
          .addScaledVector(b1, Math.cos(a) * coil * Math.sqrt(t))
          .addScaledVector(b2, Math.sin(a) * coil * Math.sqrt(t)),
      )
    }
    out.yarn.push(yarn(pts, r, { mover: m, free: (t) => t, phase: rnd() * 6 }))
  }
}

/**
 * Sommet de la couche tirée, au-dessus de la peau : ce qui se pose dessus —
 * frange, mèches latérales — part de là. Même formule que `pulled`.
 */
const pulledTop = (p: DollParams, r: number) => Math.max(r * 0.8, p.shell.height - r * 0.9) + r * 2.3

/**
 * Couettes : deux queues hautes nouées d'un ruban, façon twin-tails.
 *
 * Deux touffes de rat nouées sur des cheveux gominés lisaient « écolière de
 * grand-mère ». La silhouette d'anime tient à quatre choses : des queues
 * **hautes et volumineuses** qui partent en arc vers l'extérieur avant de
 * tomber (`clumpTail`), une **frange en pointes** qui s'allonge vers les
 * tempes, deux **mèches latérales** qui encadrent le visage, et un nœud de
 * couleur franche sur chaque attache. Un épi une fois sur deux.
 *
 * Les cheveux tirés partent d'une raie au milieu et de la lisière relevée
 * sous la frange : la frange part vers l'avant, les tirés vers l'arrière,
 * **d'une même ligne** (`frontLine`) — ni recouvrement ni jour entre les deux.
 * Tirés, ils sont tenus ; seules les parties libres bougent.
 */
function pigtails(p: DollParams, rnd: () => number, yarnR: number, out: Parts) {
  const R = p.shape.headRadius
  const r = yarnR * 0.9
  // Tous les tirages de variante d'abord, sans condition ; chaque partie a
  // ensuite sa sous-graine : ajouter un brin à la queue ne change pas la frange.
  const sy = 0.42 + rnd() * 0.26
  const back = 0.22 + rnd() * 0.16
  const L = R * (0.85 + rnd() * 0.45)
  out.ribbonColor = RIBBONS[Math.floor(rnd() * RIBBONS.length)]
  const W = r * (10 + rnd() * 3)
  const arc = R * (0.26 + rnd() * 0.12)
  const twist = 0.3 + rnd() * 0.5
  const tufts = 4 + Math.floor(rnd() * 3)
  const crown = 0.93 + rnd() * 0.04
  const low = NAPE_LOW + rnd() * 0.12
  const bowSize = R * (0.16 + rnd() * 0.06)
  const sub = () => mulberry32(Math.floor(rnd() * 2 ** 31))
  const [rPull, rFringe, rSide, rTail, rTop] = [sub(), sub(), sub(), sub(), sub()]

  const safe = faceSafe(p)
  const ties = [-1, 1].map((sx) => onHeadPolar(p, sx * (Math.PI / 2 + back), sy, 0))
  const rim = r * 2.6
  const { frontLine } = pulled(p, rPull, r, ties.map((t) => t.pos), out, low, { crown, tuck: (rim + r * 3) / R })
  const top = pulledTop(p, r)

  // Frange : au-dessus des sourcils, pointes en V ; elle rejoint les mèches
  // latérales en s'allongeant vers les tempes.
  const width = Math.min(safe.sideAz - 0.12, 1.05)
  const edge = safe.edge(1.9)
  const root = (az: number, j: number) => dirOf(az * 0.8, frontLine(az * 0.8) + 0.01 + j * 0.03)
  fringeTufts(p, rFringe, r, out, {
    width,
    tufts,
    edge,
    sideTo: edge - 0.22,
    sideFrom: 0.6,
    count: () => fringeCount(R, width, edge, r, 1.7),
    radius: r * 1.1,
    root,
    layer: [0.9, 1.3],
    spring: { stiffness: [0.03, 0.02], drag: [0.08, 0.04], maxAngle: safe.maxAngle(edge, 1) },
    free: (t) => 0.1 + 0.9 * t ** 1.2,
    fling: (t) => 0.5 * t ** 1.3,
    point: 0.07,
    cap: POLE,
  })
  for (const sx of [-1, 1]) {
    const rootAz = sx * width * 0.72
    sideLock(p, rSide, r, out, {
      az: sx * (width + 0.14),
      rootAz,
      from: frontLine(rootAz) + 0.02,
      end: -0.42 - rSide() * 0.18,
      over: top,
      span: 0.22,
      n: 5,
    })
  }

  ties.forEach((tie, i) => {
    const sx = i ? 1 : -1
    const outH = new THREE.Vector3(tie.normal.x, 0, tie.normal.z).normalize()
    const knot = tie.pos.clone().addScaledVector(tie.normal, r * 2.2)
    /*
     * Axe en fontaine (Hermite) : la queue part vers le haut et le dehors,
     * puis retombe à la verticale en revenant un peu vers le corps — l'arc
     * « ( ) » des twin-tails. Tombant tout droit du lien, elle collait à la
     * joue.
     */
    const P1 = knot.clone().addScaledVector(outH, arc).addScaledVector(DOWN, L)
    const m0 = tie.normal.clone().addScaledVector(UP, 0.45).normalize().multiplyScalar(L * 1.1)
    const m1 = DOWN.clone().addScaledVector(outH, -0.2).normalize().multiplyScalar(L * 0.8)
    const axisAt = (t: number) => hermite(knot, m0, P1, m1, t)
    clumpTail(p, rTail, r, out, {
      axisAt,
      outH,
      W,
      D: W * 0.85,
      rim,
      K: 5,
      // Vrille signée par le côté : la paire est un miroir, pas une copie.
      twist: sx * twist,
      root: tie.pos.clone().addScaledVector(tie.normal, -r * 2),
    })
    const tan = axisAt(0.08).sub(axisAt(0)).normalize()
    out.ribbon.push(ring(axisAt(0.05), tan, rim + r * 1.6, r * 1.4))
    /*
     * Le nœud regarde à mi-chemin entre le dehors et l'avant : posé selon la
     * normale de l'attache — derrière l'oreille —, on ne le voyait que de
     * profil, et de face il n'en restait qu'un trait.
     */
    const face = tie.normal.clone().add(new THREE.Vector3(0, 0.25, 0.9)).normalize()
    // Sur le dessus du lien : au centre, la queue qui en sort l'engloutissait.
    const up = UP.clone().addScaledVector(tie.normal, -tie.normal.y).normalize()
    const at = axisAt(0.05).addScaledVector(up, rim + r * 1.5).addScaledVector(face, r)
    bowKnot(out, at, face, bowSize, r * 1.3, sx * 0.15)
  })
  // Épi une fois sur deux, sur la raie juste derrière le sommet.
  ahoge(p, rTop, r, out, 0.5, new THREE.Vector3(0.02, 1, -0.2).normalize())
}

/** Courbe d'Hermite de `a` (tangente `ta`) à `b` (tangente `tb`). */
function hermite(a: THREE.Vector3, ta: THREE.Vector3, b: THREE.Vector3, tb: THREE.Vector3, t: number) {
  const t2 = t * t
  const t3 = t2 * t
  return a
    .clone()
    .multiplyScalar(2 * t3 - 3 * t2 + 1)
    .addScaledVector(ta, t3 - 2 * t2 + t)
    .addScaledVector(b, -2 * t3 + 3 * t2)
    .addScaledVector(tb, t3 - t2)
}

/**
 * Chouchou : un tore de tissu froncé autour du lien. Huit fronces qui
 * ondulent en rayon et en épaisseur ; lisse, il lisait comme un joint.
 */
function scrunchie(out: Parts, at: THREE.Vector3, axis: THREE.Vector3, rim: number, r: number) {
  const [a, b] = tangentBasis(axis.clone().normalize())
  const pts = Array.from({ length: 48 }, (_, k) => {
    const t = (k / 48) * Math.PI * 2
    const rr = rim + r * 1.2 + r * 0.6 * Math.sin(8 * t)
    return at
      .clone()
      .addScaledVector(a, Math.cos(t) * rr)
      .addScaledVector(b, Math.sin(t) * rr)
      .addScaledVector(axis, r * 0.7 * Math.cos(8 * t))
  })
  out.ribbon.push(yarn(pts, r * 1.7, { closed: true, step: 1 }))
}

/**
 * Queue de cheval haute : l'héroïne d'anime, pas la queue de travail.
 *
 * Attachée haut derrière le sommet, elle **jaillit** en fontaine (axe
 * d'Hermite : départ vers le haut et l'arrière, retombée verticale qui revient
 * un peu vers le dos) : vue de face, elle dépasse derrière le crâne — c'est ce
 * qui la fait lire à la taille d'une planche. Section elliptique, large de dos
 * et fine de profil, comme un dessin ; six mèches et un cœur (`clumpTail`).
 * Liée d'un chouchou ou d'un nœud.
 *
 * Devant, une **frange balayée** d'un côté — son sens est tiré et porté comme
 * un signe — et deux mèches latérales : chaque coupe à cheveux tirés a son
 * propre front, sans quoi une planche montre quatre fois le même.
 */
function ponytail(p: DollParams, rnd: () => number, yarnR: number, out: Parts) {
  const R = p.shape.headRadius
  const r = yarnR * 0.9
  // Tous les tirages de variante d'abord, sans condition ; puis une
  // sous-graine par partie.
  const tie = onHeadPolar(p, Math.PI + (rnd() - 0.5) * 0.3, 0.64 + rnd() * 0.22, 0)
  // Assez longue pour pendre sous l'attache et au-dessus des épaules.
  const L = R * (1.0 + rnd() * 0.45)
  out.ribbonColor = RIBBONS[Math.floor(rnd() * RIBBONS.length)]
  const low = NAPE_LOW + rnd() * 0.12
  const W = r * (12 + rnd() * 3)
  const hand = rnd() < 0.5 ? -1 : 1
  const withBow = rnd() < 0.5
  const tufts = 4 + Math.floor(rnd() * 2)
  const sweep = hand * (0.34 + rnd() * 0.14)
  const crown = 0.93 + rnd() * 0.04
  const back = R * (0.02 + rnd() * 0.08)
  const twist = hand * (0.4 + rnd() * 0.5)
  const bowSize = R * (0.17 + rnd() * 0.06)
  const sub = () => mulberry32(Math.floor(rnd() * 2 ** 31))
  const [rPull, rFringe, rSide, rTail, rTop] = [sub(), sub(), sub(), sub(), sub()]

  const safe = faceSafe(p)
  const rim = r * 2.6
  const { frontLine } = pulled(p, rPull, r, [tie.pos], out, low, { crown, tuck: (rim + r * 3) / R })
  const top = pulledTop(p, r)

  const width = Math.min(safe.sideAz - 0.12, 1.05)
  const edge = safe.edge(1.9)
  fringeTufts(p, rFringe, r, out, {
    width,
    tufts,
    edge,
    sideTo: edge - 0.18,
    sideFrom: 0.6,
    count: () => fringeCount(R, width, edge, r, 1.7),
    radius: r * 1.1,
    root: (az, j) => dirOf(az * 0.8, frontLine(az * 0.8) + 0.01 + j * 0.03),
    layer: [0.9, 1.3],
    spring: { stiffness: [0.03, 0.02], drag: [0.08, 0.04], maxAngle: safe.maxAngle(edge, 1) },
    free: (t) => 0.1 + 0.9 * t ** 1.2,
    fling: (t) => 0.5 * t ** 1.3,
    point: 0.07,
    sweep,
    cap: POLE,
  })
  for (const sx of [-1, 1]) {
    const rootAz = sx * width * 0.72
    sideLock(p, rSide, r, out, {
      az: sx * (width + 0.14),
      rootAz,
      from: frontLine(rootAz) + 0.02,
      // Plus longue du côté où la frange retombe.
      end: -0.4 - rSide() * 0.15 - (sx === hand ? 0.12 : 0),
      over: top,
      span: 0.22,
      n: 5,
    })
  }

  const outH = new THREE.Vector3(tie.normal.x, 0, tie.normal.z).normalize()
  const knot = tie.pos.clone().addScaledVector(tie.normal, r * 2.2)
  /*
   * Fontaine : départ vers le haut et l'arrière, retombée verticale qui
   * revient un peu vers le dos. Le bas se pose **hors du crâne** : sous une
   * attache haute, l'arrière de la tête bombe bien plus loin que le nœud, et
   * une queue qui retombait à un quart de rayon derrière lui s'écrasait
   * contre le crâne — `clearHead` la plaquait en nappe, une bande plate vue
   * de dos. Elle retombe à l'aplomb du plus large du crâne, plus sa
   * profondeur.
   */
  const az = Math.atan2(outH.x, outH.z)
  let widest = 0
  for (let s = -0.6; s <= 0.4; s += 0.1) {
    const q = onHeadPolar(p, az, s, 0).pos
    widest = Math.max(widest, q.x * outH.x + q.z * outH.z)
  }
  const reach = widest + W * 0.72 * 0.9 + r * 2 + back - (knot.x * outH.x + knot.z * outH.z)
  const P1 = knot.clone().addScaledVector(outH, reach).addScaledVector(DOWN, L)
  const m0 = tie.normal.clone().addScaledVector(UP, 1.3).normalize().multiplyScalar(L * 1.25)
  const m1 = DOWN.clone().addScaledVector(outH, -0.15).normalize().multiplyScalar(L * 0.9)
  const axisAt = (t: number) => hermite(knot, m0, P1, m1, t)
  const tail = clumpTail(p, rTail, r, out, {
    axisAt,
    outH,
    W,
    D: W * 0.72,
    rim,
    K: 6,
    twist,
    root: tie.pos.clone().addScaledVector(tie.normal, -r * 2),
  })
  const tan = axisAt(0.08).sub(axisAt(0)).normalize()
  if (withBow) {
    out.ribbon.push(ring(axisAt(0.05), tan, rim + r * 1.6, r * 1.4))
    const up = UP.clone().addScaledVector(tie.normal, -tie.normal.y).normalize()
    // Pans du nœud sur le ressort de la racine : ils suivent la queue.
    bowKnot(out, axisAt(0.05).addScaledVector(up, rim + r * 1.5), tie.normal, bowSize, r * 1.3, hand * 0.2, {
      mover: tail.root,
      free: (t) => 0.3 + 0.7 * t,
    })
  } else scrunchie(out, axisAt(0.05), tan, rim, r)
  ahoge(p, rTop, r, out, 0.5)
}

/**
 * Natte à trois brins : chacun décrit un huit, décalé d'un tiers de période
 * — latéral A·sin θ, profondeur B·sin 2θ. Aux croisements deux brins sont à
 * 2B·sin(π/3) = 1,73 rayon de brin l'un de l'autre : ils se touchent, un peu
 * tassés, comme de la laine tressée serré.
 *
 * Un tube unique à texture de tresse lisait comme une saucisse : aucun lobe
 * dans la silhouette, donc rien que le trait d'encre puisse dessiner. Les
 * lobes alternés gauche/droite font des sauts de profondeur que l'encre
 * dessine : c'est ce qui dit « natte » plutôt que « lock ». La natte se
 * resserre sous le lien du haut et dans l'élastique du bas.
 */
function plait(axisAt: (s: number) => THREE.Vector3, len: number, S0: THREE.Vector3, W: number, o: YarnOpts) {
  const rs = W * 0.52
  const A = W - rs
  const B = rs
  const P = W * 4.2
  const N = Math.ceil(len / (W * 0.25))
  const T = new THREE.Vector3()
  const S = new THREE.Vector3()
  const D = new THREE.Vector3()
  return [0, 1, 2].map((j) => {
    const pts: THREE.Vector3[] = []
    for (let k = 0; k <= N; k++) {
      const s = (k / N) * len
      const c = axisAt(s)
      T.copy(axisAt(Math.min(len, s + W * 0.2))).sub(axisAt(Math.max(0, s - W * 0.2))).normalize()
      S.copy(S0).addScaledVector(T, -S0.dot(T)).normalize()
      D.crossVectors(T, S)
      const w = (0.7 + 0.3 * smooth(0, W * 3, s)) * (1 - 0.3 * smooth(len * 0.8, len, s))
      const th = (s / P) * Math.PI * 2 + (j * Math.PI * 2) / 3
      pts.push(c.addScaledVector(S, A * w * Math.sin(th)).addScaledVector(D, B * w * Math.sin(2 * th)))
    }
    return yarn(pts, rs, { ...o, step: 0.8, taper: 0.08, phase: (o.phase ?? 0) + j })
  })
}

/**
 * Nattes : deux tresses basses derrière les oreilles, l'écolière d'anime.
 *
 * Frange droite en pointes courtes (coupe « hime » : bord presque net, des
 * encoches plutôt que des pics), deux mèches latérales droites jusqu'à la
 * mâchoire, raie au milieu, un épi une fois sur trois. Les nattes se
 * **décollent** du crâne au lien puis tombent à la verticale, repoussées hors
 * des bajoues ; collées à la tête jusqu'à la mâchoire, elles lisaient comme
 * des favoris. Liens du haut (qui cache la convergence des cheveux tirés) et
 * du bas, un nœud six fois sur dix, et un pinceau pointu au bout à la place
 * du pompon en balai.
 *
 * Physique : un ressort par natte, pivot où elle quitte la tête, repos
 * vertical et du poids — une natte est lourde, elle ballotte sans fouetter.
 * Mobilité nulle au lien : aucun raccord ne se déchire.
 */
function braids(p: DollParams, rnd: () => number, yarnR: number, out: Parts) {
  const R = p.shape.headRadius
  const r = yarnR * 0.9
  // Tous les tirages de variante d'abord ; puis une sous-graine par partie.
  const W = yarnR * (4 + rnd() * 1.1)
  // Derrière l'oreille : les bras passent devant.
  const az0 = Math.PI / 2 + 0.45 + rnd() * 0.15
  const sy0 = rnd() * 0.2
  out.ribbonColor = RIBBONS[Math.floor(rnd() * RIBBONS.length)]
  const low = NAPE_LOW + rnd() * 0.12
  const tufts = 4 + Math.floor(rnd() * 2)
  const edgeF = 1.7 + rnd() * 0.25
  const crown = 0.93 + rnd() * 0.04
  const sideEnd = -0.36 - rnd() * 0.16
  const lenK = 0.85 + rnd() * 0.15
  const hasBow = rnd() < 0.6
  const bowK = 1.1 + rnd() * 0.4
  const sub = () => mulberry32(Math.floor(rnd() * 2 ** 31))
  const [rPull, rFringe, rSide, rTop, rPlait] = [sub(), sub(), sub(), sub(), sub()]

  const safe = faceSafe(p)
  const ties = [-1, 1].map((sx) => onHeadPolar(p, sx * az0, sy0, 0))
  const tieR = W * 0.78 + r * 1.2
  const { frontLine } = pulled(p, rPull, r, ties.map((t) => t.pos), out, low, { crown, tuck: (tieR + r) / R })
  const top = pulledTop(p, r)

  // Frange presque droite : des encoches, pas des pics.
  const width = Math.min(safe.sideAz - 0.14, 1.0)
  const edge = safe.edge(edgeF)
  fringeTufts(p, rFringe, r, out, {
    width,
    tufts,
    edge,
    sideTo: edge,
    count: () => fringeCount(R, width, edge, r, 1.6),
    radius: r * 1.1,
    root: (az, j) => dirOf(az * 0.8, frontLine(az * 0.8) + 0.01 + j * 0.03),
    layer: [0.9, 1.3],
    spring: { stiffness: [0.03, 0.02], drag: [0.08, 0.04], maxAngle: safe.maxAngle(edge, 1) },
    free: (t) => 0.1 + 0.9 * t ** 1.2,
    fling: (t) => 0.5 * t ** 1.3,
    point: 0.025,
    cap: POLE,
  })
  for (const sx of [-1, 1]) {
    const rootAz = sx * width * 0.75
    sideLock(p, rSide, r, out, {
      az: sx * (width + 0.12),
      rootAz,
      from: frontLine(rootAz) + 0.02,
      end: sideEnd,
      over: top,
      span: 0.2,
      n: 5,
    })
  }
  ahoge(p, rTop, r, out, 0.35)

  // Longueur : jusque sous le bas du crâne, le pinceau en plus. Arrêtée au
  // haut des bras — la peluche n'a pas de cou, ils arrivent plus haut que le
  // menton —, elle ne dépassait pas la joue et lisait comme un favori tressé.
  ties.forEach((tie, n) => {
    const sx = n ? 1 : -1
    const radial = new THREE.Vector3(tie.normal.x, 0, tie.normal.z).normalize()
    // Lobes dans le plan de face : vue de face, la natte montre ses lobes.
    const S0 = new THREE.Vector3(sx, 0, 0)
    const axisAt = (s: number) =>
      clearHead(
        p,
        tie.pos
          .clone()
          .addScaledVector(tie.normal, W * 1.2 * smooth(0, W * 2.5, s))
          .addScaledVector(DOWN, Math.max(0, s - W * 0.6)),
        W * 1.15,
      )
    const L = Math.max(W * 7, tie.pos.y + R * p.shape.headSquash * lenK * 1.05)
    const m = out.movers.length
    out.movers.push({
      pivot: axisAt(W * 0.6),
      dir: DOWN.clone(),
      length: L,
      cfg: { stiffness: 0.03 + rPlait() * 0.015, drag: 0.14 + rPlait() * 0.04, gravity: 1.4 },
      maxAngle: 0.4,
    })
    const free = (t: number) => t ** 1.25
    out.yarn.push(...plait(axisAt, L, S0, W, { mover: m, free, fling: (t) => 0.8 * t, phase: n * 3 }))
    const tan = (s: number) => axisAt(s + W * 0.3).sub(axisAt(Math.max(0, s - W * 0.3))).normalize()
    // Lien du haut : tenu, il cache la convergence des cheveux tirés.
    out.ribbon.push(ring(axisAt(W * 0.6), tan(W * 0.6), tieR, r * 1.3))
    // Lien du bas, serré sur la partie pincée, et nœud : sur le ressort de la
    // natte, à la mobilité de cet endroit — ils restent solidaires.
    const tk = 0.93
    const fk = free(tk)
    const knot = axisAt(L * tk)
    const tied: YarnOpts = { mover: m, free: () => fk, fling: () => 0.8 * tk }
    out.ribbon.push(ring(knot, tan(L * tk), W * 0.62 + r * 1.2, r * 1.3, tied))
    if (hasBow) bowKnot(out, knot.clone().addScaledVector(radial, W * 0.7), radial, W * bowK, r * 1.1, sx * 0.1, tied)
    brush(rPlait, r, out, knot, S0, radial, W, m, fk)
  })
}

/**
 * Pinceau sous le lien du bas : il s'évase puis se referme en trois
 * pointes. Neuf brins droits en éventail lisaient comme un balai.
 */
function brush(
  rnd: () => number,
  r: number,
  out: Parts,
  knot: THREE.Vector3,
  S: THREE.Vector3,
  D: THREE.Vector3,
  W: number,
  m: number,
  f0: number,
) {
  const Lt = W * (2.4 + rnd() * 1.0)
  const tipLen = [0, 1, 2].map(() => 0.85 + rnd() * 0.3)
  for (let i = 0; i < 15; i++) {
    const c = i % 3
    const phi = (i / 15) * Math.PI * 2 + rnd() * 0.3
    const rad = W * 0.5 * Math.sqrt(rnd())
    const a = (c * Math.PI * 2) / 3 + 0.4
    const tipOff = S.clone().multiplyScalar(Math.cos(a) * W * 0.4).addScaledVector(D, Math.sin(a) * W * 0.4)
    const pts = Array.from({ length: 9 }, (_, k) => {
      const t = k / 8
      const b = rad + W * 0.35 * Math.sin(Math.PI * Math.min(1, t * 1.3))
      const off = S.clone()
        .multiplyScalar(Math.cos(phi) * b)
        .addScaledVector(D, Math.sin(phi) * b)
        .lerp(tipOff, clamp((t - 0.5) / 0.5, 0, 1) ** 1.3)
      return knot.clone().addScaledVector(DOWN, Lt * tipLen[c] * t).add(off)
    })
    out.yarn.push(yarn(pts, r, { mover: m, free: (t) => f0 + (1 - f0) * t, fling: () => 0.8, phase: rnd() * 6 }))
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
   * Un ressort par grosse mèche (5 ou 6), pivot au **centre du crâne** comme
   * les longueurs, bout orienté vers la mèche. Pivotant au ras du front, la
   * frange avait un bras de levier minuscule : mesuré pendant une rotation,
   * l'avant de la coupe se déplaçait huit fois moins que les côtés — la
   * moitié de la coupe paraissait figée. Autour du centre, le bras de levier
   * est le rayon du crâne, et la frange glisse sur le front sans s'y enfoncer.
   *
   * Racines sur la raie, **à la même place que les longueurs voisines** : la
   * hauteur de raie correspond à l'azimut du brin. Partant toutes de derrière
   * le sommet, les mèches qui s'allongent vers les tempes traversaient la tête
   * en biais et croisaient les longueurs. Courte au centre, au-dessus des
   * boutons, elle **s'allonge vers les tempes** jusqu'à la longueur des mèches
   * latérales : frange et longueurs se raccordent en une seule coupe.
   */
  // Jusqu'au-dessus des boutons : les sourcils sont couverts — c'est le
  // principe d'une grande frange. Les pointes des mèches remontent un peu.
  const edge = hairline(p, 0, 1.02)(0)
  const tufts = 5 + Math.floor(rnd() * 2)
  fringeTufts(p, rnd, r, out, {
    width,
    tufts,
    edge,
    sideTo: longEnd,
    // Premier tirage : l'ancien choix « effilée ou coupée droite », toujours
    // effilée depuis — coupée droite, elle faisait un bord au cordeau. Gardé
    // pour ne pas décaler la suite de la graine. Épaisse ensuite : assez de
    // brins pour que le front ne se voie plus au travers.
    count: () => (rnd(), 110 + Math.floor(rnd() * 20)),
    radius: r * 1.15,
    root: (tipAz, j) => new THREE.Vector3(Math.sign(tipAz || 1) * 0.03, 1, Math.cos(tipAz) * 0.55 - 0.12 + j * 0.08).normalize(),
    // Par-dessus les longueurs à la jonction : celles-ci gonflent (volume) ;
    // plaquée, la frange passait dessous vers les tempes. Décollée d'autant,
    // progressivement, elle recouvre le raccord.
    over: (side) => FRINGE_OVER * R * clamp((side - 0.35) / 0.5, 0, 1),
    spring: { stiffness: [0.018, 0.02], drag: [0.05, 0.05], maxAngle: 0.42 },
    // Toute la frange bouge, pas seulement son bas : autour du centre du
    // crâne, elle glisse sur le front sans s'y enfoncer.
    free: (t) => 0.4 + 0.6 * t,
    fling: (t) => t,
    hang: true,
  })
}

/**
 * Brins d'une frange, **déduits** de la ligne des pointes : deux rangées, un
 * brin tous les `pitch` rayons de fil par rangée. Borné, sinon le fil le plus
 * fin du panneau (0,008) en demandait des centaines.
 */
function fringeCount(R: number, width: number, edge: number, r: number, pitch: number) {
  return 2 * clamp(Math.ceil((2 * width * R * Math.sqrt(Math.max(0, 1 - edge * edge))) / (pitch * r)), 16, 80)
}

type FringeOpts = {
  /** Demi-largeur de la frange, en azimut. */
  width: number
  /** Nombre de grosses mèches, un ressort chacune. */
  tufts: number
  /** Bord au centre, en hauteur normalisée du crâne. */
  edge: number
  /**
   * Hauteur que les pointes atteignent vers les tempes, au-delà de
   * `sideFrom` de la largeur (0,55) : la frange rejoint les mèches latérales.
   * Égale à `edge`, le bord reste à peu près droit.
   */
  sideTo: number
  sideFrom?: number
  /** Nombre de brins, tiré après les ressorts — l'ordre des tirages compte. */
  count: () => number
  /** Rayon du tube. Le relèvement se compte en rayons de fil `r`. */
  radius: number
  /** Direction de la racine d'un brin qui finit à `tipAz` ; `j` ∈ [−½, ½]. */
  root: (tipAz: number, j: number) => THREE.Vector3
  /** Décollement selon la position de la pointe (0 au centre, 1 aux tempes). */
  over?: (side: number) => number
  /** Relèvement de base : r·(a + hasard·b) ; [0,8 ; 2,2] par défaut. */
  layer?: [number, number]
  spring: { stiffness: [number, number]; drag: [number, number]; maxAngle: number }
  free: (t: number) => number
  fling: (t: number) => number
  /**
   * Frange **tombante** : sous le haut du front elle ne suit plus la courbe du
   * crâne — qui fuit vers l'arrière sous elle — mais descend à la verticale.
   */
  hang?: boolean
  /**
   * Frange **balayée** d'un côté, en radians, signée : les pointes glissent
   * vers ce côté, s'y allongent et raccourcissent de l'autre. Une frange
   * symétrique sur chaque coupe à cheveux tirés, c'était quatre fois le
   * même front sur une planche.
   */
  sweep?: number
  /** Profondeur des pointes (bords de mèche plus courts), 0,06 par défaut. */
  point?: number
  /** Borne haute de `onDir` : 0,98 pour la grande frange, `POLE` ailleurs. */
  cap?: number
  /** Azimut du milieu de la frange (0 : de face) — une demi-frange de rideau. */
  center?: number
}

/**
 * Frange en grosses mèches pointues — la brique de la grande frange, partagée.
 *
 * Deux rangées de mèches décalées d'une demi-mèche : convergeant chacune vers
 * sa pointe, une seule rangée laissait le front à nu entre deux pointes — la
 * frange paraissait clairsemée. La seconde comble les vides. Chaque mèche a
 * sa longueur ; ses bords sont plus courts (la pointe), et la pointe se
 * relève d'un souffle, comme les pics des longueurs.
 *
 * Tirages dans l'ordre d'origine (ressorts, compte, longueurs de mèche, puis
 * par brin : pointe, racine, relèvement, phase) : la grande frange reste
 * identique au bit près depuis l'extraction.
 */
function fringeTufts(p: DollParams, rnd: () => number, r: number, out: Parts, o: FringeOpts) {
  const R = p.shape.headRadius
  const { width, tufts, edge } = o
  const first = out.movers.length
  const c0 = o.center ?? 0
  for (let k = 0; k < tufts; k++) {
    const ac = c0 + (((k + 0.5) / tufts) * 2 - 1) * width * 0.92
    out.movers.push({
      pivot: new THREE.Vector3(),
      dir: new THREE.Vector3(Math.sin(ac) * 0.75, -0.66, Math.cos(ac) * 0.75).normalize(),
      length: R,
      cfg: {
        stiffness: o.spring.stiffness[0] + rnd() * o.spring.stiffness[1],
        drag: o.spring.drag[0] + rnd() * o.spring.drag[1],
        gravity: 0,
      },
      maxAngle: o.spring.maxAngle,
    })
  }
  const count = o.count()
  const tuftLen = Array.from({ length: tufts }, () => rnd())
  const sideFrom = o.sideFrom ?? 0.55
  const [l0, l1] = o.layer ?? [0.8, 2.2]
  const sweep = o.sweep ?? 0
  const M = 16
  for (let i = 0; i < count; i++) {
    const u = (i + 0.5) / count
    const shift = i % 2 ? 0.5 : 0
    const f = clamp(u * tufts + shift - 0.25, 0, tufts - 0.001)
    const c = Math.floor(f)
    const w = (f - c) * 2 - 1
    const az = (u * 2 - 1) * width
    const center = (((c + 0.5) / tufts) * 2 - 1) * width * 0.92
    // Convergence marquée, mais deux rangées décalées gardent le front
    // couvert : des pics nets sans trous.
    let tipAz = az + (center - az) * 0.6
    /*
     * Balayage : les pointes glissent vers le côté `sweep`, d'autant plus
     * qu'elles en sont proches — la mèche du bord opposé ne bouge presque pas,
     * sinon elle découvrirait la tempe. Monotone en azimut (pente < 1) : deux
     * brins ne se croisent pas. La longueur suit : plus longue du côté où
     * elle retombe, plus courte de l'autre.
     */
    const toward = sweep ? 0.5 + 0.5 * (Math.sign(sweep) * tipAz) / width : 0
    tipAz += sweep * toward
    const side = Math.min(1, Math.abs(tipAz) / width)
    const lengthen = (edge - o.sideTo) * 0.9 * (side < sideFrom ? 0 : ((side - sideFrom) / (1 - sideFrom)) ** 1.6)
    const swept = sweep ? Math.abs(sweep) * 0.45 * (toward - 0.5) : 0
    const tipSy =
      edge + tuftLen[c] * 0.05 + Math.abs(w) ** 1.5 * (o.point ?? 0.06) + rnd() * 0.015 - lengthen - swept
    // Tout ce qui précède est relatif au milieu de la frange.
    tipAz += c0
    const from = o.root(tipAz, rnd() - 0.5)
    const tip = dirOf(tipAz, clamp(tipSy, -0.9, 0.9))
    const layer = r * (l0 + rnd() * l1) + (o.over ? o.over(side) : 0)
    const pts: THREE.Vector3[] = []
    let hang: THREE.Vector3 | null = null
    for (let k = 0; k <= M; k++) {
      const t = k / M
      const d = from.clone().lerp(tip, t).normalize()
      // Pointe relevée d'un souffle, comme les pics des longueurs.
      const lift = k === 0 ? -r * 2 : layer + R * 0.05 * Math.max(0, (t - 0.8) / 0.2) ** 2
      const q = onDir(p, d, lift, o.cap).pos
      /*
       * **Tombante** : à partir du haut du front, le point descend à la
       * verticale au lieu de suivre le crâne, sans passer derrière la surface —
       * on garde le plus avancé des deux.
       */
      if (o.hang && t > 0.62 && side < sideFrom) {
        hang ??= pts[pts.length - 1].clone()
        const drop = hang.clone()
        drop.y = q.y
        if (drop.z > q.z) q.z = q.z + (drop.z - q.z) * 0.7
      }
      pts.push(q)
    }
    out.yarn.push(yarn(pts, o.radius, { mover: first + c, free: o.free, fling: o.fling, phase: rnd() * 6 }))
  }
  return first
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
    case 'epars': wisps(p, rnd, yarnR, out); break
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
attribute float aMover2;
attribute float aFree2;
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
int hm2 = int(aMover2 + 0.5);
float ha = 0.0;
float ha2 = 0.0;
vec3 hk = vec3(1.0, 0.0, 0.0);
vec3 hk2 = vec3(1.0, 0.0, 0.0);
vec3 hp = vec3(0.0);
vec3 hp2 = vec3(0.0);
if ((aMover > -0.5 && aFree > 0.0) || (aMover2 > -0.5 && aFree2 > 0.0)) {
  for (int i = 0; i < ${MAX_MOVERS}; i++) {
    if (i == hm) { hk = uAxis[i]; ha = uAngle[i]; hp = uPivot[i]; }
    if (i == hm2) { hk2 = uAxis[i]; ha2 = uAngle[i]; hp2 = uPivot[i]; }
  }
  ha = aMover > -0.5 ? ha * aFree : 0.0;
  ha2 = aMover2 > -0.5 ? ha2 * aFree2 : 0.0;
}
// Le ressort porté d'abord, dans le repère de repos, puis son parent.
objectNormal = hairRotate(hairRotate(objectNormal, hk2, ha2), hk, ha);`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
transformed = hp2 + hairRotate(transformed - hp2, hk2, ha2);
transformed = hp + hairRotate(transformed - hp, hk, ha);
// Centrifuge : vers l'extérieur, en proportion de la distance à l'axe, et un
// peu vers le haut — un brin qui s'écarte se soulève.
vec3 hOut = vec3(transformed.x, 0.0, transformed.z);
transformed += (hOut * 0.5 + vec3(0.0, length(hOut) * 0.12, 0.0)) * uFling * aFling;`,
      )
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
    }),
    [],
  )
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

  /**
   * Os des ressorts, **imbriqués** comme les ressorts : l'os d'une mèche est
   * l'enfant de l'os de sa racine, placé à son pivot relatif. Le spring bone
   * lit la rotation du parent pour poser son repos : la mèche suit le
   * balancement de la racine, avec son propre retard.
   */
  const offsets = useMemo(
    () => built.movers.map((m) => (m.parent === undefined ? m.pivot : m.pivot.clone().sub(built.movers[m.parent].pivot))),
    [built],
  )
  const bone = (i: number): ReactNode => (
    <object3D
      key={`${style}-${i}`}
      position={offsets[i]}
      ref={(el) => {
        bones.current[i] = el
      }}
    >
      {built.movers.map((c, j) => (c.parent === i ? bone(j) : null))}
    </object3D>
  )

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
      {built.movers.map((m, i) => (m.parent === undefined ? bone(i) : null))}
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
