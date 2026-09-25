// Planche d'audit : une ligne par poupée, cinq vues par ligne.
// node render.mjs <style> <seed> <out.png> [count]
import { Canvas, render } from './raster'
import { bodyMeshes, dolls, hairMeshes } from './scene'
import type { HairStyle } from '../src/doll/hairstyles'

const style = (process.argv[2] ?? 'meches') as HairStyle
const seed = Number(process.argv[3] ?? 4413)
const outPath = process.argv[4] ?? 'out.png'
const count = Number(process.argv[5] ?? 4)
const C = Number(process.argv[6] ?? 230)
const zoom = Number(process.argv[7] ?? 1)
const lift = Number(process.argv[8] ?? 0)

const VIEWS = [
  { yaw: 0, pitch: 0.08 },
  { yaw: -0.75, pitch: 0.12 },
  { yaw: -Math.PI / 2, pitch: 0.05 },
  { yaw: Math.PI, pitch: 0.12 },
  { yaw: 0.4, pitch: 1.1 },
]
const ps = dolls(seed, 6).slice(0, count)
const cv = new Canvas(C * VIEWS.length, C * ps.length)
ps.forEach((p, row) => {
  const t0 = performance.now()
  const { meshes, stats } = hairMeshes(p, style)
  const ms = performance.now() - t0
  const all = [...bodyMeshes(p), ...meshes]
  const R = p.shape.headRadius
  VIEWS.forEach((v, col) => {
    render(cv, all, { ...v, cx: 0, cy: -R * 0.3 + lift * R, cz: 0, half: (R * 1.75) / zoom }, col * C, row * C, C, C)
  })
  console.log(style, 'seed', p.seed, 'R', R.toFixed(3), JSON.stringify(stats), `${ms.toFixed(0)} ms`)
})
cv.save(outPath)
