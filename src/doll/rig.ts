import * as THREE from 'three'
import { createContext, useContext } from 'react'
import type { DollParams } from './params'
import { dollLayout } from './layout'
import type { Collider } from '../core/springBone'
import { ARM_T, LEG_T } from './surface'
import { JOINT } from './limbs'

/**
 * Squelette de la poupée : des **os rigides**, pas un maillage déformé.
 *
 * Une peluche est faite de pièces cousues — tête, torse, deux bras, deux
 * jambes —, chacune d'un seul tenant. Un squelette à peau (skinning) plierait
 * des coudes et des genoux qu'elle n'a pas, et coûterait un maillage refait
 * pour chaque morphologie. Ici chaque pièce est portée par un os ; l'animation
 * tourne les os, les pièces suivent.
 *
 * Chaque articulation a **deux étages** : l'os de pose, que l'animation
 * oriente, puis l'os à ressort (`SpringBone`) qui le suit avec retard. C'est ce
 * second étage qui donne le moelleux : le bras frappe, puis ballotte.
 *
 * Les os :
 * - `hips` — toute la poupée (le torse porte bassin et épaules d'une pièce) :
 *   déplacement, penché, torsion ;
 * - `neck` — la tête ;
 * - `arm-1`, `arm1`, `leg-1`, `leg1` — membres, par côté (−1 : x négatif, la
 *   main droite de la poupée, qui fait face à +z) ;
 * - `elbow-1`, `elbow1`, `knee-1`, `knee1` — le pli à mi-membre (voir
 *   `limbs.ts`), un angle autour de x : négatif, le coude ramène l'avant-bras
 *   devant ; positif, le genou replie le tibia derrière. Lui aussi a son
 *   ressort : l'avant-bras arrive après le bras, c'est le fouet d'un coup ;
 * - `hand-1`, `hand1` — emboîtures au bout des bras, pour l'arme.
 *
 * Ce qui oriente les os de pose — gestes, locomotion, ressorts de pose — vit
 * dans `fighter.ts`.
 */
export type BoneName =
  | 'hips' | 'neck' | 'arm-1' | 'arm1' | 'leg-1' | 'leg1'
  | 'elbow-1' | 'elbow1' | 'knee-1' | 'knee1'
export const BONES: BoneName[] = [
  'hips', 'neck', 'arm-1', 'arm1', 'leg-1', 'leg1',
  'elbow-1', 'elbow1', 'knee-1', 'knee1',
]

/** Angles d'Euler (x, y, z) en radians ; déplacement du bassin en unités monde. */
export type Pose = Record<BoneName, [number, number, number]> & { hipsPos: [number, number, number] }

export function restPose(): Pose {
  return {
    hips: [0, 0, 0],
    neck: [0, 0, 0],
    'arm-1': [0, 0, 0],
    arm1: [0, 0, 0],
    'leg-1': [0, 0, 0],
    leg1: [0, 0, 0],
    'elbow-1': [0, 0, 0],
    elbow1: [0, 0, 0],
    'knee-1': [0, 0, 0],
    knee1: [0, 0, 0],
    hipsPos: [0, 0, 0],
  }
}

// ---------------------------------------------------------------- cotes

/**
 * Cotes dont les gestes ont besoin (voir `fighter.ts`), prises sur la poupée : un même geste doit
 * aller à six silhouettes différentes. Une chute qui ne connaît pas la hauteur
 * du bassin laisserait une poupée allongée en l'air, une autre dans le sol.
 */
export type RigMetrics = {
  /** Hauteur du centre de la poupée au-dessus du sol. */
  centerHeight: number
  torsoRadius: number
  legLength: number
  armSpread: number
  /** Hauteur totale : l'arme se mesure à la poupée. */
  height: number
}

export function rigMetrics(p: DollParams): RigMetrics {
  const L = dollLayout(p)
  return {
    centerHeight: -L.floorY,
    torsoRadius: p.shape.torsoRadius,
    legLength: p.limbs.legLength,
    armSpread: p.limbs.armSpread,
    height: L.height,
  }
}

/**
 * Os d'une poupée montée, exposés à ce qui s'y accroche : l'écharpe et le
 * collier y relisent la position **animée** des membres — calculée au repos,
 * leurs obstacles restaient en place pendant qu'un bras se levait, et le tissu
 * le traversait.
 */
export type RigBones = {
  /** Os à ressort des membres (le dernier étage : ce qu'on voit). */
  arm: Record<-1 | 1, THREE.Object3D | null>
  leg: Record<-1 | 1, THREE.Object3D | null>
  /** Os du bas (avant-bras, tibia), posés au pli (`JOINT`). */
  forearm: Record<-1 | 1, THREE.Object3D | null>
  shin: Record<-1 | 1, THREE.Object3D | null>
  /** Hauteur du sol sous la poupée, repère monde : ce qui traîne s'y pose. */
  floorY: number
}

const _inv = new THREE.Matrix4()
const _m = new THREE.Matrix4()
const _ml = new THREE.Matrix4()

/**
 * Recale sur les membres **animés** les sphères posées par `armSpheres` /
 * `legSpheres` (quatre par côté, côté −1 d'abord), dans le repère de `frame`.
 *
 * Au repos elles coïncident exactement : même formule, le long de l'axe du
 * membre. On ne fait que remplacer l'axe calculé par celui de l'os.
 */
export function followLimbs(
  bones: RigBones,
  frame: THREE.Object3D,
  colliders: Collider[],
  offset: number,
  kind: 'arm' | 'leg',
  length: number,
) {
  // Matrices du jour : la poupée vient de poser ses os, le rendu ne les a pas
  // encore propagées.
  frame.updateWorldMatrix(true, false)
  _inv.copy(frame.matrixWorld).invert()
  const list = kind === 'arm' ? ARM_T : LEG_T
  let i = offset
  for (const side of [-1, 1] as const) {
    const bone = bones[kind][side]
    if (!bone) {
      i += list.length
      continue
    }
    bone.updateWorldMatrix(true, false)
    _m.multiplyMatrices(_inv, bone.matrixWorld)
    // Sous le pli, la sphère suit l'os du bas : un avant-bras replié emmène
    // sa main, et l'écharpe ne doit pas la traverser.
    const lower = (kind === 'arm' ? bones.forearm : bones.shin)[side]
    if (lower) {
      lower.updateWorldMatrix(true, false)
      _ml.multiplyMatrices(_inv, lower.matrixWorld)
    }
    for (const [t] of list) {
      if (lower && t > JOINT) colliders[i++].center.set(0, -(t - JOINT) * length, 0).applyMatrix4(_ml)
      else colliders[i++].center.set(0, -t * length, 0).applyMatrix4(_m)
    }
  }
}

/** Os de la poupée, pour ce qui doit suivre ses membres animés (écharpe, collier). */
export const RigContext = createContext<RigBones | null>(null)
export const useRigBones = () => useContext(RigContext)

/**
 * Accélération d'un objet, relue dans son propre repère — la force d'inertie
 * que ressent un tissu simulé en local (voir `ClothSheet.step`). Lissée et
 * bornée : un téléport ou une image longue donneraient un coup de fouet
 * absurde.
 */
export class Inertia {
  private last = new THREE.Vector3()
  private vel = new THREE.Vector3()
  private ready = false
  readonly local = new THREE.Vector3()
  private _p = new THREE.Vector3()
  private _v = new THREE.Vector3()
  private _q = new THREE.Quaternion()

  update(obj: THREE.Object3D, dt: number) {
    obj.getWorldPosition(this._p)
    if (!this.ready || dt <= 0) {
      this.last.copy(this._p)
      this.ready = true
      this.local.set(0, 0, 0)
      return this.local
    }
    this._v.subVectors(this._p, this.last).divideScalar(Math.max(dt, 1 / 240))
    this.last.copy(this._p)
    // Accélération = variation de vitesse, lissée sur quelques images.
    const a = this._v.clone().sub(this.vel).divideScalar(Math.max(dt, 1 / 240))
    this.vel.copy(this._v)
    if (a.length() > 40) a.setLength(40)
    obj.getWorldQuaternion(this._q).invert()
    a.applyQuaternion(this._q)
    this.local.lerp(a, Math.min(1, dt * 20))
    return this.local
  }
}

const _inv2 = new THREE.Matrix4()
const _t = new THREE.Vector3()

/**
 * Transport du repère d'un objet d'une image à la suivante : la matrice qui
 * envoie un point exprimé dans son repère **précédent** dans son repère
 * actuel — c'est-à-dire où se trouve, vu d'ici, ce qui n'a pas bougé dans le
 * monde. Rotations comprises, contrairement à `Inertia`. Rien au premier
 * appel, ni après un saut de plus d'une unité (changement de poupée).
 */
export class FrameCarry {
  private last = new THREE.Matrix4()
  private ready = false
  readonly delta = new THREE.Matrix4()

  update(obj: THREE.Object3D): THREE.Matrix4 | null {
    obj.updateWorldMatrix(true, false)
    if (!this.ready) {
      this.last.copy(obj.matrixWorld)
      this.ready = true
      return null
    }
    _inv2.copy(obj.matrixWorld).invert()
    this.delta.multiplyMatrices(_inv2, this.last)
    this.last.copy(obj.matrixWorld)
    _t.setFromMatrixPosition(this.delta)
    return _t.lengthSq() > 1 ? null : this.delta
  }
}

/**
 * Sol dans le repère d'un objet : normale (le haut du monde vu d'ici) et
 * seuil, au format de `ClothExtras.floor`.
 *
 * La normale d'un plan se ramène par la **transposée** de la matrice monde,
 * pas par son inverse : les deux ne coïncident que pour une rotation. Or le
 * corps est écrasé et cisaillé (`fighter.squash`, `shear`) — à la glissade,
 * basse et large, le sol ainsi calculé penchait, et la traîne de l'écharpe
 * passait jusqu'à 6 cm dessous.
 */
export function localFloor(obj: THREE.Object3D, floorY: number, out: { n: THREE.Vector3; d: number }) {
  _inv2.copy(obj.matrixWorld).invert()
  obj.getWorldPosition(_t)
  _t.y = floorY
  _t.applyMatrix4(_inv2)
  const e = obj.matrixWorld.elements
  out.n.set(e[1], e[5], e[9]).normalize()
  out.d = out.n.dot(_t)
  return out
}
