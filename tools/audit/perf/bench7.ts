import * as THREE from 'three'
import v8 from 'node:v8'
const fakeCtx = () => new Proxy({} as any, { get: (t, k) => (k in t ? t[k] : () => ({ addColorStop() {} })), set: (t, k, v) => ((t[k] = v), true) })
;(globalThis as any).document = { createElement: () => ({ width: 1, height: 1, style: {}, getContext: () => fakeCtx() }) }
import { useDollParams } from '/home/user/woolgatherer/src/doll/params'
import { ClothSheet } from '/home/user/woolgatherer/src/core/cloth'
import { sheetGeometry, writeSheet } from '/home/user/woolgatherer/src/doll/sheet'
import { scarfMetrics, __restGrid, __scarfColliders, __ROWS, __COLS, __RCOLS } from '/home/user/woolgatherer/src/doll/scarf'

const newSpace = () => v8.getHeapSpaceStatistics().find((s) => s.space_name === 'new_space')!.space_used_size
function bench(name: string, f: () => void, n = 400) {
  for (let i = 0; i < 200; i++) f()
  const runs: number[] = []
  for (let r = 0; r < 3; r++) { const t = performance.now(); for (let i = 0; i < n; i++) f(); runs.push((performance.now() - t) / n) }
  const al: number[] = []
  for (let i = 0; i < 50; i++) { const a = newSpace(); f(); const b = newSpace(); if (b >= a) al.push(b - a) }
  al.sort((a, b) => a - b)
  console.log(JSON.stringify({ name, minMeanMs: +Math.min(...runs).toFixed(3), allocKB: +((al[al.length >> 1] - 2496) / 1024).toFixed(1) }))
}

/** writeSheet réécrit : mêmes formules, tableaux typés, sans fermeture ni setXYZ ni computeVertexNormals. */
function writeSheetFast(geo: THREE.BufferGeometry, points: readonly THREE.Vector3[], rows: number, simCols: number, cols: number, mid: Float32Array, thickness: number, rib: Float32Array, ribBump: number) {
  const n = rows * cols
  const posAttr = geo.attributes.position as THREE.BufferAttribute
  const pos = posAttr.array as Float32Array
  const ht = thickness * 0.5
  const span = (simCols - 1) / (cols - 1)
  const last = simCols - 1
  for (let i = 0; i < rows; i++) {
    const base = i * simCols
    for (let j = 0; j < cols; j++) {
      const x = j * span
      const s = Math.min(last, Math.max(0, Math.floor(x)))
      const t = x - s, t2 = t * t, t3 = t2 * t
      const p0 = points[base + Math.max(0, s - 1)], p1 = points[base + s]
      const p2 = points[base + Math.min(last, s + 1)], p3 = points[base + Math.min(last, s + 2)]
      const w0 = 0.5 * (-t + 2 * t2 - t3), w1 = 0.5 * (2 - 5 * t2 + 3 * t3), w2 = 0.5 * (t + 4 * t2 - 3 * t3), w3 = 0.5 * (-t2 + t3)
      const k = (i * cols + j) * 3
      mid[k] = p0.x * w0 + p1.x * w1 + p2.x * w2 + p3.x * w3
      mid[k + 1] = p0.y * w0 + p1.y * w1 + p2.y * w2 + p3.y * w3
      mid[k + 2] = p0.z * w0 + p1.z * w1 + p2.z * w2 + p3.z * w3
    }
  }
  for (let i = 0; i < rows; i++) {
    const im = Math.max(0, i - 1) * cols, ip = Math.min(rows - 1, i + 1) * cols, ic = i * cols
    for (let j = 0; j < cols; j++) {
      const jm = Math.max(0, j - 1), jp = Math.min(cols - 1, j + 1)
      const a = (ip + j) * 3, b = (im + j) * 3, c = (ic + jp) * 3, d = (ic + jm) * 3
      const ux = mid[a] - mid[b], uy = mid[a + 1] - mid[b + 1], uz = mid[a + 2] - mid[b + 2]
      const vx = mid[c] - mid[d], vy = mid[c + 1] - mid[d + 1], vz = mid[c + 2] - mid[d + 2]
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
      const l2 = nx * nx + ny * ny + nz * nz
      if (l2 < 1e-14) { nx = 0; ny = 0; nz = 1 } else { const il = 1 / Math.sqrt(l2); nx *= il; ny *= il; nz *= il }
      const h = ht * (1 + ribBump * rib[j])
      const k = (ic + j) * 3, m = k
      pos[k] = mid[m] + nx * h; pos[k + 1] = mid[m + 1] + ny * h; pos[k + 2] = mid[m + 2] + nz * h
      const q = (n + ic + j) * 3
      pos[q] = mid[m] - nx * h; pos[q + 1] = mid[m + 1] - ny * h; pos[q + 2] = mid[m + 2] - nz * h
    }
  }
  posAttr.needsUpdate = true
  // normales : même algorithme que computeVertexNormals (somme des normales de faces), en tableaux typés
  let nrmAttr = geo.attributes.normal as THREE.BufferAttribute | undefined
  if (!nrmAttr) { nrmAttr = new THREE.BufferAttribute(new Float32Array(pos.length), 3); geo.setAttribute('normal', nrmAttr) }
  const out = nrmAttr.array as Float32Array
  out.fill(0)
  const idx = geo.index!.array
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3
    const e1x = pos[c] - pos[b], e1y = pos[c + 1] - pos[b + 1], e1z = pos[c + 2] - pos[b + 2]
    const e2x = pos[a] - pos[b], e2y = pos[a + 1] - pos[b + 1], e2z = pos[a + 2] - pos[b + 2]
    const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x
    out[a] += nx; out[a + 1] += ny; out[a + 2] += nz
    out[b] += nx; out[b + 1] += ny; out[b + 2] += nz
    out[c] += nx; out[c + 1] += ny; out[c + 2] += nz
  }
  for (let v = 0; v < out.length; v += 3) {
    const l2 = out[v] * out[v] + out[v + 1] * out[v + 1] + out[v + 2] * out[v + 2]
    const il = l2 > 0 ? 1 / Math.sqrt(l2) : 1
    out[v] *= il; out[v + 1] *= il; out[v + 2] *= il
  }
  nrmAttr.needsUpdate = true
  geo.computeBoundingSphere()
}

const { params: p } = useDollParams()
const m = scarfMetrics(p)
const grid = __restGrid(p, m)
const cloth = new ClothSheet(grid.rest, grid.pin, __ROWS, __COLS, { shear: 0.5, bend: p.scarf.bend, slack: p.scarf.slack }, p.seed)
const cols = __scarfColliders(p, m)
for (let i = 0; i < 200; i++) cloth.step(1 / 60, { gravity: p.scarf.weight, damping: p.scarf.drape, iterations: 9 }, cols, new THREE.Vector3(0, -1, 0))
const pts = cloth.points
for (const RC of [__RCOLS, p.scarf.ribs * 4 + 1]) {
  const rib = new Float32Array(RC).map((_, j) => 0.5 - 0.5 * Math.cos((j / (RC - 1)) * p.scarf.ribs * Math.PI * 2))
  const g1 = sheetGeometry(__ROWS, RC), g2 = sheetGeometry(__ROWS, RC)
  const m1 = new Float32Array(__ROWS * RC * 3), m2 = new Float32Array(__ROWS * RC * 3)
  bench(`writeSheet actuel ${RC} col`, () => writeSheet(g1, pts, __ROWS, __COLS, RC, m1, m.band * p.scarf.thickness, rib, p.scarf.ribDepth))
  bench(`writeSheet réécrit ${RC} col`, () => writeSheetFast(g2, pts, __ROWS, __COLS, RC, m2, m.band * p.scarf.thickness, rib, p.scarf.ribDepth))
  let dp = 0, dn = 0
  const a1 = g1.attributes.position.array as Float32Array, a2 = g2.attributes.position.array as Float32Array
  const n1 = g1.attributes.normal.array as Float32Array, n2 = g2.attributes.normal.array as Float32Array
  for (let i = 0; i < a1.length; i++) { dp = Math.max(dp, Math.abs(a1[i] - a2[i])); dn = Math.max(dn, Math.abs(n1[i] - n2[i])) }
  console.log(JSON.stringify({ RC, maxPosDiff: dp, maxNormalDiff: dn, tris: g1.index!.count / 3 }))
}
