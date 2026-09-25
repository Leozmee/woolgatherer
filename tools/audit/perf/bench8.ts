// Banc 2 : témoin, profils d'allocation, variantes proposées (écharpe).
import * as THREE from 'three'
import v8 from 'node:v8'
import { Session } from 'node:inspector/promises'

const fakeCtx = () =>
  new Proxy({} as Record<string, unknown>, {
    get: (t, k) => (k in t ? t[k as string] : () => ({ addColorStop() {} })),
    set: (t, k, v) => ((t[k as string] = v), true),
  })
;(globalThis as any).document = { createElement: () => ({ width: 1, height: 1, style: {}, getContext: () => fakeCtx() }) }

import { useDollParams, type DollParams } from '/home/user/woolgatherer/src/doll/params'
import { applyMorph, boardMorphs } from '/home/user/woolgatherer/src/doll/morph'
import { ClothSheet } from '/home/user/woolgatherer/src/core/cloth'
import { Fighter } from '/home/user/woolgatherer/src/doll/fighter'
import { rigMetrics, FrameCarry } from '/home/user/woolgatherer/src/doll/rig'
import { Stepper, solveLeg } from '/home/user/woolgatherer/src/doll/limbs'
import { sheetGeometry, writeSheet } from '/home/user/woolgatherer/src/doll/sheet'
import { Scarf, scarfMetrics, __restGrid, __scarfColliders, __ROWS, __COLS, __RCOLS } from '/home/user/woolgatherer/src/doll/scarf'
import type { Collider } from '/home/user/woolgatherer/src/core/springBone'

const G = globalThis as any
const now = () => performance.now()
const newSpace = () => v8.getHeapSpaceStatistics().find((s) => s.space_name === 'new_space')!.space_used_size
let harness = 0
function bench(name: string, frame: (i: number) => void, n = 800, warm = 400, extra?: string) {
  for (let i = 0; i < warm; i++) frame(i)
  const runs: number[] = []
  const allocs: number[] = []
  for (let rep = 0; rep < 3; rep++) {
    const t0 = now()
    for (let i = 0; i < n; i++) frame(warm + rep * n + i)
    runs.push((now() - t0) / n)
    for (let i = 0; i < 60; i++) {
      const a0 = newSpace()
      frame(i)
      const a1 = newSpace()
      if (a1 >= a0) allocs.push(a1 - a0)
    }
  }
  allocs.sort((a, b) => a - b)
  const alloc = (allocs[allocs.length >> 1] ?? 0) - harness
  const r = { name, minMeanMs: +Math.min(...runs).toFixed(4), meanMs: +(runs.reduce((a, b) => a + b) / runs.length).toFixed(4), allocKB: +(alloc / 1024).toFixed(2), extra }
  console.log(JSON.stringify(r))
  return r
}

async function allocProfile(name: string, frame: (i: number) => void, n = 300) {
  const s = new Session()
  s.connect()
  await s.post('HeapProfiler.enable')
  await s.post('HeapProfiler.startSampling', { samplingInterval: 128, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true } as any)
  for (let i = 0; i < n; i++) frame(i)
  const { profile } = (await s.post('HeapProfiler.stopSampling')) as any
  s.disconnect()
  const agg = new Map<string, number>()
  const walk = (node: any, stack: string[]) => {
    const cf = node.callFrame
    const here = `${cf.functionName || '(anon)'} ${String(cf.url).split('/').slice(-1)[0]}:${cf.lineNumber + 1}`
    if (node.selfSize) agg.set(here, (agg.get(here) ?? 0) + node.selfSize)
    for (const c of node.children) walk(c, stack)
  }
  walk(profile.head, [])
  const top = [...agg.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k} ≈${(v / n / 1024).toFixed(1)}KB/img`)
  console.log(JSON.stringify({ allocProfile: name, top }))
}

// témoin du banc
harness = 0
{
  const allocs: number[] = []
  for (let i = 0; i < 200; i++) { const a0 = newSpace(); const a1 = newSpace(); if (a1 >= a0) allocs.push(a1 - a0) }
  allocs.sort((a, b) => a - b)
  harness = allocs[allocs.length >> 1]
  console.log(JSON.stringify({ harnessBytes: harness }))
}

const { params: base } = useDollParams()
const morphs = boardMorphs(base, 6)
const dollParams = (i: number): DollParams => applyMorph({ ...base, seed: base.seed + i * 137 }, morphs[i].morph)

// combattant sauté
if (false) {
  const p = dollParams(0)
  const m = rigMetrics(p)
  const idle = new Fighter({ phase: 1.3 })
  const fIdle = () => idle.update(1 / 60, m)
  bench('Fighter.update (attente, 1 poupée)', fIdle)
  await allocProfile('Fighter.update attente', fIdle)
  const f = new Fighter({ drive: true })
  const st = new Stepper()
  const rest = { [-1]: new THREE.Vector3(-0.1, -0.5, 0), 1: new THREE.Vector3(0.1, -0.5, 0) } as Record<-1 | 1, THREE.Vector3>
  const hips = { [-1]: new THREE.Vector3(), 1: new THREE.Vector3() } as Record<-1 | 1, THREE.Vector3>
  const root = new THREE.Vector3()
  const run = (i: number) => {
    f.input.x = Math.sin(i * 0.01)
    f.input.y = 1
    f.sprint = (i >> 7) % 2 === 1
    if (i % 90 === 0) f.press('attack')
    f.update(1 / 60, m)
    root.copy(f.pos)
    hips[-1].set(root.x - 0.1, root.y + 0.1, root.z)
    hips[1].set(root.x + 0.1, root.y + 0.1, root.z)
    st.update(f.dt, { root, facing: f.facing, vel: f.vel, rest, hips, splay: 0.05, grounded: f.grounded, legLength: p.limbs.legLength, onLand: (side, speed, dur) => f.land(speed, side, dur, st.feet[side].pos), cycle: f.cycle })
    f.puffs.length = 0
  }
  bench('Fighter.update + Stepper (arène, course)', run)
  await allocProfile('Fighter+Stepper course', run)
}

// ---------------------------------------------------------------- écharpe : actuel vs variantes
const p = dollParams(1)
const m = scarfMetrics(p)
const grid = __restGrid(p, m)
const colliders = __scarfColliders(p, m)
const gdir = new THREE.Vector3(0, -1, 0)
const floor = { n: new THREE.Vector3(0, 1, 0), d: -1.2 }
const carryM = new THREE.Matrix4()
const mkCloth = () => new ClothSheet(grid.rest, grid.pin, __ROWS, __COLS, { shear: 0.5, bend: p.scarf.bend, slack: p.scarf.slack }, p.seed)
const stepArgs = (i: number) => {
  carryM.makeRotationY(Math.sin(i * 0.05) * 0.03).setPosition(Math.sin(i * 0.03) * 0.01, 0, 0.02)
  return { carry: carryM, carryK: 0.92, floor }
}
const cfg = { gravity: p.scarf.weight, damping: p.scarf.drape, iterations: 9 }
const c0 = mkCloth()
bench('ClothSheet.step actuel', (i) => c0.step(1 / 60, cfg, colliders, gdir, undefined, stepArgs(i)))

// Variante A : test de sphère au carré, racine seulement au contact
const _push = new THREE.Vector3()
function collideSq(this: any, colliders: readonly Collider[], floor: any) {
  const n = this.points.length
  for (let i = 0; i < n; i++) {
    const p = this.points[i]
    for (let c = 0; c < colliders.length; c++) {
      const s = colliders[c]
      const dx = p.x - s.center.x, dy = p.y - s.center.y, dz = p.z - s.center.z
      const d2 = dx * dx + dy * dy + dz * dz
      if (d2 >= s.radius * s.radius || d2 < 1e-12) continue
      const k = s.radius / Math.sqrt(d2)
      p.set(s.center.x + dx * k, s.center.y + dy * k, s.center.z + dz * k)
    }
    if (floor) {
      const under = floor.d - floor.n.dot(p)
      if (under > 0) { p.addScaledVector(floor.n, under); this.prev[i].lerp(p, 0.35) }
    }
  }
}
const _d = new THREE.Vector3()
const _c = new THREE.Vector3()
function stepVariant(this: any, dt: number, cfg: any, colliders: readonly Collider[], gravityDir: THREE.Vector3, extra: any, collideEvery: number) {
  const h = Math.min(dt, 1 / 45)
  const g = cfg.gravity * h * h * 60
  const n = this.points.length
  const carry = extra?.carry
  if (carry) {
    const k = extra?.carryK ?? 1
    for (let i = 0; i < n; i++) {
      const w = k * (1 - this.pin[i])
      if (w <= 0) continue
      this.points[i].lerp(_c.copy(this.points[i]).applyMatrix4(carry), w)
      this.prev[i].lerp(_c.copy(this.prev[i]).applyMatrix4(carry), w)
    }
  }
  for (let i = 0; i < n; i++) {
    const p = this.points[i], q = this.prev[i]
    _d.subVectors(p, q).multiplyScalar(1 - cfg.damping)
    q.copy(p); p.add(_d); p.addScaledVector(gravityDir, g)
    if (this.pin[i] > 0) p.lerp(this.rest[i], this.pin[i] * 0.4)
  }
  const links = this.links
  for (let k = 0; k < cfg.iterations; k++) {
    if (this.__pre) {
      const L = this.__pre
      for (let l = 0; l < L.length; l++) {
        const c = L[l]
        const a = c.pa, b = c.pb
        const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z
        const len = Math.sqrt(dx * dx + dy * dy + dz * dz)
        if (len < 1e-8) continue
        const diff = ((len - c.len) / len) * c.k
        const fa = diff * c.wa, fb = -diff * c.wb
        a.x += dx * fa; a.y += dy * fa; a.z += dz * fa
        b.x += dx * fb; b.y += dy * fb; b.z += dz * fb
      }
    } else
    for (let l = 0; l < links.length; l++) {
      const c = links[l]
      const a = this.points[c.a], b = this.points[c.b]
      _d.subVectors(b, a)
      const len = _d.length()
      if (len < 1e-8) continue
      const diff = ((len - c.len) / len) * c.k
      const wa = 1 - this.pin[c.a], wb = 1 - this.pin[c.b]
      const total = wa + wb
      if (total < 1e-6) continue
      a.addScaledVector(_d, (diff * wa) / total)
      b.addScaledVector(_d, (-diff * wb) / total)
    }
    if ((k + 1) % collideEvery === 0 || k === cfg.iterations - 1) collideSq.call(this, colliders, extra?.floor)
  }
}
const c1 = mkCloth()
bench('ClothSheet.step variante A (distance au carré)', (i) => stepVariant.call(c1, 1 / 60, cfg, colliders, gdir, stepArgs(i), 1))
const c2 = mkCloth()
bench('ClothSheet.step variante B (au carré + collisions 1 itér. sur 3)', (i) => stepVariant.call(c2, 1 / 60, cfg, colliders, gdir, stepArgs(i), 3))
// écart de forme entre actuel et A après 600 pas (doit être ~0 : même calcul)
{
  const a = mkCloth(), b = mkCloth(), c = mkCloth()
  for (let i = 0; i < 600; i++) {
    a.step(1 / 60, cfg, colliders, gdir, undefined, stepArgs(i))
    stepVariant.call(b, 1 / 60, cfg, colliders, gdir, stepArgs(i), 1)
    stepVariant.call(c, 1 / 60, cfg, colliders, gdir, stepArgs(i), 3)
  }
  let dA = 0, dB = 0
  a.points.forEach((pt, i) => { dA = Math.max(dA, pt.distanceTo(b.points[i])); dB = Math.max(dB, pt.distanceTo(c.points[i])) })
  // pénétration max dans les sphères après un pas (variante B)
  let pen = 0
  for (const pt of c.points) for (const s of colliders) pen = Math.max(pen, s.radius - pt.distanceTo(s.center))
  console.log(JSON.stringify({ maxDevA: dA, maxDevB: dB, maxPenetrationB: pen, band: m.band }))
}


const c3 = mkCloth() as any
c3.__pre = c3.links.filter((c: any) => (2 - c3.pin[c.a] - c3.pin[c.b]) >= 1e-6).map((c: any) => {
  const wa = 1 - c3.pin[c.a], wb = 1 - c3.pin[c.b], t = wa + wb
  return { pa: c3.points[c.a], pb: c3.points[c.b], len: c.len, k: c.k, wa: wa / t, wb: wb / t }
})
bench('ClothSheet.step variante C (au carré + poids précalculés, liens directs)', (i) => stepVariant.call(c3, 1 / 60, cfg, colliders, gdir, stepArgs(i), 1))
{
  const a = mkCloth() as any, c = mkCloth() as any
  c.__pre = c3.links.filter((l: any) => (2 - c.pin[l.a] - c.pin[l.b]) >= 1e-6).map((l: any) => { const wa = 1 - c.pin[l.a], wb = 1 - c.pin[l.b], t = wa + wb; return { pa: c.points[l.a], pb: c.points[l.b], len: l.len, k: l.k, wa: wa / t, wb: wb / t } })
  for (let i = 0; i < 600; i++) { a.step(1 / 60, cfg, colliders, gdir, undefined, stepArgs(i)); stepVariant.call(c, 1 / 60, cfg, colliders, gdir, stepArgs(i), 1) }
  let dC = 0
  a.points.forEach((pt: any, i: number) => { dC = Math.max(dC, pt.distanceTo(c.points[i])) })
  console.log(JSON.stringify({ maxDevC: dC }))
}
process.exit(0)
