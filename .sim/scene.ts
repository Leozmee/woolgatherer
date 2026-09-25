// Scène d'audit : tête, visage, torse, bras et coiffure, dans le repère de la tête.
import * as THREE from 'three'
import { useDollParams, type DollParams } from '../src/doll/params'
import { applyMorph, boardMorphs } from '../src/doll/morph'
import { headGeometry, torsoGeometry } from '../src/doll/geometry'
import { onHead, armSpheres } from '../src/doll/surface'
import { dollLayout } from '../src/doll/layout'
import { EYE_SCALE } from '../src/doll/face'
import { mulberry32 } from '../src/core/rand'
import { buildHairParts, type HairStyle } from '../src/doll/hairstyles'
import type { Mesh } from './raster'

export const base: DollParams = useDollParams().params

/** Six morphologies d'une planche (archétypes), graine décalée comme `App`. */
export function dolls(seed: number, count = 6): DollParams[] {
  const b = { ...base, seed }
  const m = boardMorphs(b, count)
  return m.map((mm, i) => applyMorph({ ...b, seed: seed + i * 137 }, mm.morph))
}

export function eyesOf(p: DollParams) {
  const rnd = mulberry32(p.seed + 2024)
  return {
    spacing: p.face.eyeSpacing * (0.88 + rnd() * 0.24),
    leftSize: p.face.leftSize * (0.86 + rnd() * 0.28) * EYE_SCALE,
    rightSize: p.face.rightSize * (0.86 + rnd() * 0.28) * EYE_SCALE,
  }
}

export function bodyMeshes(p: DollParams): Mesh[] {
  const s = p.shape
  const L = dollLayout(p)
  const head = headGeometry(s.headRadius, s.headEgg, s.headSquash, s.headPuff, s.headCheekY, s.headCheekSpread, s.lumps, s.lumpScale, p.seed)
  const skin: [number, number, number] = [226, 212, 188]
  const out: Mesh[] = [{ geo: head, color: skin }]
  const torso = torsoGeometry(s.torsoRadius, s.torsoHeight, s.torsoTaper, s.lumps, s.lumpScale, p.seed)
  torso.translate(0, -L.neckY - L.headY, 0)
  out.push({ geo: torso, color: [205, 192, 170] })
  for (const c of armSpheres(p, 0, -L.headY)) {
    const g = new THREE.SphereGeometry(c.radius, 16, 12)
    g.translate(c.center.x, c.center.y, c.center.z)
    out.push({ geo: g, color: [205, 192, 170] })
  }
  const e = eyesOf(p)
  const lift = s.lumps * s.headRadius * 0.7 + 0.004
  for (const [x, r] of [[-e.spacing / 2, e.leftSize], [e.spacing / 2, e.rightSize]]) {
    const sp = onHead(p, x, p.face.eyeHeight, lift + 0.004)
    const g = new THREE.CylinderGeometry(r, r, 0.01, 24)
    g.rotateX(Math.PI / 2)
    g.applyQuaternion(sp.quat)
    g.translate(sp.pos.x, sp.pos.y, sp.pos.z)
    out.push({ geo: g, color: [70, 45, 35] })
    // Sourcil de référence (hauteur des sourcils brodés).
    const b = onHead(p, x, p.face.eyeHeight + r * 1.75, lift + 0.002)
    const bg = new THREE.BoxGeometry(r * 1.2, 0.006, 0.01)
    bg.applyQuaternion(b.quat)
    bg.translate(b.pos.x, b.pos.y, b.pos.z)
    out.push({ geo: bg, color: [90, 60, 50] })
  }
  return out
}

export const HAIR: [number, number, number] = [176, 104, 62]
export const RIBBON: [number, number, number] = [80, 120, 190]

export function hairMeshes(p: DollParams, style: HairStyle) {
  const { out, yarnR } = buildHairParts(p, style)
  const strands = { yarn: out.yarn.length, braid: out.braid.length, ribbon: out.ribbon.length }
  const built = out.build()
  const tri = (g: THREE.BufferGeometry | null) => (g ? (g.index ? g.index.count / 3 : g.attributes.position.count / 3) : 0)
  const stats = {
    strands,
    tris: tri(built.yarn) + tri(built.braid) + tri(built.ribbon),
    calls: [built.yarn, built.braid, built.ribbon].filter(Boolean).length,
    movers: built.movers.length,
    yarnR,
  }
  const meshes: Mesh[] = []
  if (built.yarn) meshes.push({ geo: built.yarn, color: HAIR })
  if (built.braid) meshes.push({ geo: built.braid, color: HAIR })
  if (built.ribbon) meshes.push({ geo: built.ribbon, color: RIBBON })
  return { meshes, stats, built }
}
