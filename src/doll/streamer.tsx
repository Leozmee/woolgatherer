import * as THREE from 'three'
import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import { ClothSheet } from '../core/cloth'
import type { Collider } from '../core/springBone'
import { Inertia, followLimbs, useRigBones } from './rig'
import { armSpheres, bodySpheres, legSpheres } from './surface'
import { sheetGeometry, writeSheet, writeSheetUv } from './sheet'
import type { DollParams } from './params'

/**
 * Ruban de tissu simulé : la même nappe Verlet que l'écharpe (`ClothSheet`),
 * en petit — pans d'un nœud papillon, bout de ceinture.
 *
 * Tout ce qui pend sur une silhouette doit **réagir** au geste : un ruban figé
 * lit comme une pièce moulée. La nappe vit dans le repère du cou (celui des
 * obstacles de `surface.ts`) ; les sphères des membres relisent la pose animée
 * à chaque image, comme pour l'écharpe, sinon un bras levé traverse le ruban.
 *
 * `rest` est une grille `rows × cols` (rangée par rangée, du haut vers le bas),
 * `pin` la retenue de chaque particule vers sa pose de repos.
 */
export type StreamerRest = { rest: THREE.Vector3[]; pin: number[]; rows: number; cols: number }

/** Colonnes de rendu : le ruban se lisse en travers sans coûter de particules. */
const RENDER_COLS = 5

export function streamerColliders(p: DollParams, skin: number): Collider[] {
  return [
    ...bodySpheres(p, p.shape.headRadius * p.shape.headSquash * 1.5, -p.shape.torsoHeight * 0.9, skin),
    // Les bras levés passent sous ce qui est retenu (voir `Collider.loose`).
    ...armSpheres(p, skin).map((c) => ({ ...c, loose: true })),
    ...legSpheres(p, skin),
  ]
}

export function Streamer({
  p,
  shape,
  thickness,
  colliders,
  cfg,
  children,
}: {
  p: DollParams
  shape: StreamerRest
  thickness: number
  colliders: Collider[]
  /** Poids, amortissement : un ruban de soie flotte, une lanière de cuir pend. */
  cfg: { gravity: number; damping: number }
  /** Matériau. */
  children: ReactNode
}) {
  const { rest, pin, rows, cols } = shape
  const cloth = useMemo(
    () => new ClothSheet(rest, pin, rows, cols, { shear: 0.5, bend: 0.04, slack: 0 }, p.seed),
    [rest, pin, rows, cols, p.seed],
  )
  const geo = useMemo(() => {
    const g = sheetGeometry(rows, RENDER_COLS)
    // UV en longueur réelle, comme le tissu de l'écharpe.
    const w = rest[0].distanceTo(rest[cols - 1])
    const across = Array.from({ length: RENDER_COLS }, (_, j) => (j / (RENDER_COLS - 1)) * w * 8)
    let arc = 0
    const along = rest.filter((_, k) => k % cols === 0).map((v, i, a) => (arc += i ? v.distanceTo(a[i - 1]) : 0) * 8)
    writeSheetUv(g, rows, RENDER_COLS, across, along, thickness * 8)
    return g
  }, [rows, cols, rest, thickness])
  useEffect(() => () => geo.dispose(), [geo])

  const flat = useMemo(() => new Float32Array(RENDER_COLS), [])
  const mid = useMemo(() => new Float32Array(rows * RENDER_COLS * 3), [rows])
  const group = useRef<THREE.Group>(null!)
  const rig = useRigBones()
  const inertia = useMemo(() => new Inertia(), [])
  const scratch = useMemo(() => ({ q: new THREE.Quaternion(), g: new THREE.Vector3() }), [])
  // Réglages du pas, écrits sur place : pas d'objet neuf par image.
  const step = useMemo(() => ({ gravity: 0, damping: 0, iterations: 6 }), [])

  // Pose de repos écrite une fois : le premier rendu n'attend pas la simulation.
  useEffect(() => {
    writeSheet(geo, cloth.points, rows, cols, RENDER_COLS, mid, thickness, flat, 0)
  }, [geo, cloth, rows, cols, mid, thickness, flat])

  useFrame((_, dt) => {
    if (rig) {
      const n = colliders.length
      followLimbs(rig, group.current, colliders, n - 16, 'arm', p.limbs.armLength)
      followLimbs(rig, group.current, colliders, n - 8, 'leg', p.limbs.legLength)
    }
    group.current.getWorldQuaternion(scratch.q)
    scratch.g.set(0, -1, 0).applyQuaternion(scratch.q.invert())
    const accel = inertia.update(group.current, dt)
    step.gravity = cfg.gravity
    step.damping = cfg.damping
    cloth.step(dt, step, colliders, scratch.g, accel)
    writeSheet(geo, cloth.points, rows, cols, RENDER_COLS, mid, thickness, flat, 0)
  })

  return (
    <group ref={group}>
      <mesh geometry={geo} castShadow receiveShadow>
        {children}
      </mesh>
    </group>
  )
}
