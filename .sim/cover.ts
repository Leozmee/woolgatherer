// Couverture **visible** du cuir chevelu, par vue : part des pixels de crâne
// (zone chevelue) qui restent visibles une fois la coiffure posée.
// node cover.mjs <styles> <seeds> [thicknesses]
import * as THREE from 'three'
import { render, type Mesh } from './raster'
import { dolls, hairMeshes } from './scene'
import { headGeometry } from '../src/doll/geometry'
import { EYE_SCALE } from '../src/doll/face'
import type { DollParams } from '../src/doll/params'
import type { HairStyle } from '../src/doll/hairstyles'

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/** Zone chevelue : au-dessus des sourcils devant, des oreilles sur les côtés, de la nuque derrière. */
function inZone(p: DollParams, v: THREE.Vector3) {
  const R = p.shape.headRadius
  const ry = R * p.shape.headSquash
  const size = Math.max(p.face.leftSize, p.face.rightSize) * EYE_SCALE * 1.14
  const fore = Math.min(0.85, Math.max(0.3, (p.face.eyeHeight + size * 2.0) / ry))
  const d = v.clone().normalize()
  const c = d.z / Math.max(1e-6, Math.hypot(d.x, d.z))
  const wf = smooth(0.25, 0.85, c)
  const wb = smooth(0.2, 0.8, -c)
  const low = -0.2 + (fore + 0.2) * wf - 0.15 * wb
  return v.y / ry > low
}

function headSplit(p: DollParams): Mesh[] {
  const s = p.shape
  const g = headGeometry(s.headRadius, s.headEgg, s.headSquash, s.headPuff, s.headCheekY, s.headCheekSpread, s.lumps, s.lumpScale, p.seed)
  const pos = g.attributes.position
  const idx = g.index!
  const zone: number[] = []
  const other: number[] = []
  const v = new THREE.Vector3()
  for (let t = 0; t < idx.count; t += 3) {
    let all = true
    for (let k = 0; k < 3; k++) if (!inZone(p, v.fromBufferAttribute(pos, idx.getX(t + k)))) all = false
    ;(all ? zone : other).push(idx.getX(t), idx.getX(t + 1), idx.getX(t + 2))
  }
  const a = g.clone()
  a.setIndex(zone)
  const b = g.clone()
  b.setIndex(other)
  return [
    { geo: a, color: [255, 0, 0] },
    { geo: b, color: [0, 255, 0] },
  ]
}

export const VIEWS = {
  face: { yaw: 0, pitch: 0.08 },
  '3/4': { yaw: -0.75, pitch: 0.12 },
  profil: { yaw: -Math.PI / 2, pitch: 0.05 },
  dos: { yaw: Math.PI, pitch: 0.12 },
  dessus: { yaw: 0.4, pitch: 1.1 },
}

export function coverage(p: DollParams, style: HairStyle) {
  const head = headSplit(p)
  const { meshes, stats } = hairMeshes(p, style)
  const R = p.shape.headRadius
  const W = 360
  const out: Record<string, number> = {}
  for (const [name, v] of Object.entries(VIEWS)) {
    const view = { ...v, cx: 0, cy: 0, cz: 0, half: R * 1.4 }
    const a = render(null, head, view, 0, 0, W, W)
    const b = render(null, [...head, ...meshes], view, 0, 0, W, W)
    let z1 = 0
    let z2 = 0
    for (let i = 0; i < a.length; i++) {
      if (a[i] === 0) z1++
      if (b[i] === 0) z2++
    }
    out[name] = z1 ? 1 - z2 / z1 : 1
  }
  return { out, stats }
}

const styles = (process.argv[2] ?? 'couettes').split(',') as HairStyle[]
const seeds = (process.argv[3] ?? '4413').split(',').map(Number)
const thick = (process.argv[4] ?? '').split(',').filter(Boolean).map(Number)
for (const style of styles) {
  const acc: Record<string, number[]> = {}
  let tris = 0
  let n = 0
  for (const seed of seeds) {
    for (const p0 of dolls(seed, 6)) {
      for (const th of thick.length ? thick : [p0.hair.thickness]) {
        const p = { ...p0, hair: { ...p0.hair, thickness: th } }
        const { out, stats } = coverage(p, style)
        for (const [k, v] of Object.entries(out)) (acc[k] ??= []).push(v)
        tris += stats.tris
        n++
      }
    }
  }
  const fmt = (a: number[]) => {
    const s = [...a].sort((x, y) => x - y)
    const mean = a.reduce((x, y) => x + y, 0) / a.length
    return `${(mean * 100).toFixed(1)} (min ${(s[0] * 100).toFixed(1)})`
  }
  console.log(style.padEnd(10), Object.entries(acc).map(([k, a]) => `${k} ${fmt(a)}`).join(' · '), `· ${Math.round(tris / n / 1000)} k tri`)
}
