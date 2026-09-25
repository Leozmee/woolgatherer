// Banc CPU des simulations par image (Node). Bundlé par build-bench.mjs.
import * as THREE from 'three'
import v8 from 'node:v8'

// --- canvas factice : quelques textures sont fabriquées au montage.
const fakeCtx = () =>
  new Proxy({} as Record<string, unknown>, {
    get: (t, k) => {
      if (k in t) return t[k as string]
      if (k === 'getImageData' || k === 'createImageData')
        return (a: number, b: number, w?: number, h?: number) => {
          const W = (w ?? a) | 0 || 1
          const H = (h ?? b) | 0 || 1
          return { data: new Uint8ClampedArray(W * H * 4), width: W, height: H }
        }
      return () => ({ addColorStop() {} })
    },
    set: (t, k, v) => ((t[k as string] = v), true),
  })
;(globalThis as any).document = { createElement: () => ({ width: 1, height: 1, style: {}, getContext: () => fakeCtx() }) }

import { useDollParams, type DollParams } from '/home/user/woolgatherer/src/doll/params'
import { applyMorph, boardMorphs } from '/home/user/woolgatherer/src/doll/morph'
import { SpringBone, type Collider, type SpringConfig } from '/home/user/woolgatherer/src/core/springBone'
import { ClothSheet } from '/home/user/woolgatherer/src/core/cloth'
import { Fighter } from '/home/user/woolgatherer/src/doll/fighter'
import { rigMetrics, FrameCarry } from '/home/user/woolgatherer/src/doll/rig'
import { Stepper, solveLeg } from '/home/user/woolgatherer/src/doll/limbs'
import { dollLayout } from '/home/user/woolgatherer/src/doll/layout'
import { sheetGeometry, writeSheet } from '/home/user/woolgatherer/src/doll/sheet'
import { fringeGeometry, writeFringe } from '/home/user/woolgatherer/src/doll/fringe'
import {
  Scarf, scarfMetrics, __restGrid, __scarfColliders, __ROWS, __COLS, __RCOLS,
} from '/home/user/woolgatherer/src/doll/scarf'
import { __Necklace } from '/home/user/woolgatherer/src/doll/traits'
import { buildHair, HAIR_STYLES } from '/home/user/woolgatherer/src/doll/hairstyles'

const G = globalThis as any
const now = () => performance.now()

function newSpace() {
  return v8.getHeapSpaceStatistics().find((s) => s.space_name === 'new_space')!.space_used_size
}

type Res = { name: string; meanMs: number; p95Ms: number; allocKB: number; extra?: string }
const results: Res[] = []

function bench(name: string, frame: (i: number) => void, n = 600, warm = 300, extra?: string) {
  for (let i = 0; i < warm; i++) frame(i)
  const ts: number[] = []
  const allocs: number[] = []
  for (let i = 0; i < n; i++) {
    const a0 = newSpace()
    const t0 = now()
    frame(warm + i)
    const t1 = now()
    const a1 = newSpace()
    ts.push(t1 - t0)
    if (a1 >= a0) allocs.push(a1 - a0)
  }
  ts.sort((a, b) => a - b)
  allocs.sort((a, b) => a - b)
  const r = {
    name,
    meanMs: +(ts.reduce((s, x) => s + x, 0) / ts.length).toFixed(4),
    p95Ms: +ts[Math.floor(ts.length * 0.95)].toFixed(4),
    allocKB: +((allocs[Math.floor(allocs.length / 2)] ?? 0) / 1024).toFixed(2),
    extra,
  }
  results.push(r)
  console.log(JSON.stringify(r))
  return r
}

// --- réglages : ceux du panneau, morphologie de la planche
const { params: base } = useDollParams()
const morphs = boardMorphs(base, 6)
const dollParams = (i: number, light = false): DollParams => {
  const p = applyMorph({ ...base, seed: base.seed + i * 137 }, morphs[i].morph)
  if (!light) return p
  return {
    ...p,
    shell: { ...p.shell, count: Math.min(p.shell.count, 5) },
    hair: { ...p.hair, segments: Math.min(p.hair.segments, 6) },
    wool: { ...p.wool, mapSize: 512 },
  }
}

// --- hiérarchie profonde : la poupée est à ~8 niveaux sous la scène, la tête à ~12
const scene = new THREE.Scene()
function chain(parent: THREE.Object3D, depth: number) {
  let o = parent
  for (let i = 0; i < depth; i++) {
    const g = new THREE.Group()
    g.position.set(0.01 * i, 0.05, 0)
    g.rotation.set(0.01, 0.02 * i, 0.005)
    o.add(g)
    o = g
  }
  return o
}
const appRoot = new THREE.Group()
scene.add(appRoot)
const animate = (i: number) => {
  appRoot.rotation.y = Math.sin(i * 0.05) * 1.5
  appRoot.position.x = Math.sin(i * 0.02) * 2
  appRoot.position.z = i * 0.01
}

// --- SpringBone « parent frais » : la variante proposée (O(1) par os au lieu d'O(profondeur))
const _pq = new THREE.Quaternion()
const _pqi = new THREE.Quaternion()
const _bw = new THREE.Vector3()
const _rd = new THREE.Vector3()
const _rt = new THREE.Vector3()
const _nx = new THREE.Vector3()
const _tp = new THREE.Vector3()
const _ld = new THREE.Vector3()
const _ps = new THREE.Vector3()
const _b = new THREE.Vector3()
const _r = new THREE.Vector3()
const _dp = new THREE.Vector3()
const _ds = new THREE.Vector3()
const GRAV = new THREE.Vector3(0, -1, 0)
const STEP = 1 / 60
class FastSpring {
  prevTail = new THREE.Vector3()
  currTail = new THREE.Vector3()
  lastBone = new THREE.Vector3()
  lastRest = new THREE.Vector3()
  acc = 0
  init = false
  restLocal: THREE.Vector3
  constructor(public bone: THREE.Object3D, public length: number, rest: THREE.Vector3) {
    this.restLocal = rest.clone().normalize()
  }
  /** Suppose `bone.parent.parent.matrixWorld` à jour ; laisse `bone.matrixWorld` à jour. */
  update(dt: number, cfg: SpringConfig, colliders?: readonly Collider[] | null) {
    const bone = this.bone
    const parent = bone.parent!
    parent.updateWorldMatrix(false, false)
    parent.matrixWorld.decompose(_dp, _pq, _ds)
    bone.updateMatrix()
    _bw.setFromMatrixPosition(bone.matrix).applyMatrix4(parent.matrixWorld)
    _rd.copy(this.restLocal).applyQuaternion(_pq).normalize()
    _rt.copy(_bw).addScaledVector(_rd, this.length)
    if (!this.init) {
      this.prevTail.copy(_rt); this.currTail.copy(_rt); this.lastBone.copy(_bw); this.lastRest.copy(_rt); this.init = true
      bone.matrixWorld.multiplyMatrices(parent.matrixWorld, bone.matrix)
      return
    }
    const span = Math.min(Math.max(dt, 0), 1 / 15)
    const acc0 = this.acc
    this.acc += span
    const n = Math.floor(this.acc / STEP + 1e-6)
    this.acc = Math.max(0, this.acc - n * STEP)
    for (let k = 1; k <= n; k++) {
      const u = span > 0 ? Math.min(1, Math.max(0, (k * STEP - acc0) / span)) : 1
      _b.lerpVectors(this.lastBone, _bw, u)
      _r.lerpVectors(this.lastRest, _rt, u)
      _nx.copy(this.currTail)
      _tp.subVectors(this.currTail, this.prevTail).multiplyScalar(1 - cfg.drag)
      _nx.add(_tp)
      _tp.subVectors(_r, this.currTail).multiplyScalar(cfg.stiffness)
      _nx.add(_tp)
      _nx.addScaledVector(GRAV, cfg.gravity * STEP)
      _nx.sub(_b).normalize().multiplyScalar(this.length).add(_b)
      if (colliders)
        for (const c of colliders) {
          _ps.subVectors(_nx, c.center)
          const d = _ps.length()
          if (d > 1e-6 && d < c.radius) {
            _nx.copy(c.center).addScaledVector(_ps, c.radius / d)
            _nx.sub(_b).normalize().multiplyScalar(this.length).add(_b)
          }
        }
      this.prevTail.copy(this.currTail)
      this.currTail.copy(_nx)
    }
    this.lastBone.copy(_bw)
    this.lastRest.copy(_rt)
    _nx.subVectors(this.currTail, this.prevTail).multiplyScalar(this.acc / STEP).add(this.currTail)
    _pqi.copy(_pq).invert()
    _ld.subVectors(_nx, _bw)
    if (_ld.lengthSq() > 1e-12) bone.quaternion.setFromUnitVectors(this.restLocal, _ld.normalize().applyQuaternion(_pqi))
    bone.updateMatrix()
    bone.matrixWorld.multiplyMatrices(parent.matrixWorld, bone.matrix)
  }
}

// ================================================================ 1. ressorts du corps (9)
{
  const p = dollParams(0)
  const body = chain(appRoot, 8)
  const mk = (depth: number) => chain(body, depth)
  const bones = [mk(3), mk(4), mk(4), mk(4), mk(4), mk(6), mk(6), mk(6), mk(6)]
  const cols: Collider[] = [0, 1, 2].map((i) => ({ center: new THREE.Vector3(0, i * 0.2, 0), radius: 0.3 }))
  const cfg = { stiffness: 0.3, drag: 0.5, gravity: 1.2 }
  const sp = bones.map((b) => new SpringBone(b, 0.35, new THREE.Vector3(0, -1, 0)))
  bench('corps: 9 SpringBone (actuel)', (i) => {
    animate(i)
    // ce que fait Doll : 3 objets de config étalés par image
    const limb = { ...p.spring, drag: 0.5, stiffness: 0.3, gravity: 1 }
    const head = { stiffness: 0.5, drag: 0.5, gravity: 0.2 }
    const low = { ...limb, stiffness: limb.stiffness * 0.7 }
    sp.forEach((s, k) => s.update(1 / 60, k === 0 ? head : k < 5 ? limb : low, k === 5 || k === 6 ? cols : undefined))
  })
}

// ================================================================ 2. locks
function locksBench(label: string, count: number, segments: number, fast: boolean) {
  const head = chain(appRoot, 14)
  const skull = new THREE.Object3D()
  head.add(skull)
  const segLen = 0.34 / segments
  const chains: THREE.Object3D[][] = []
  for (let l = 0; l < count; l++) {
    const anchor = new THREE.Group()
    anchor.position.set(Math.cos(l) * 0.4, 0.2, Math.sin(l) * 0.4)
    anchor.rotation.set(0.3 * Math.sin(l), l, 0.2)
    head.add(anchor)
    let parent: THREE.Object3D = anchor
    const list: THREE.Object3D[] = []
    for (let s = 0; s < segments; s++) {
      const seg = new THREE.Group()
      parent.add(seg)
      list.push(seg)
      const off = new THREE.Group()
      off.position.y = -segLen
      seg.add(off)
      parent = off
    }
    chains.push(list)
  }
  const collider = { center: new THREE.Vector3(), radius: 0.43 }
  const cfg = { stiffness: 0, drag: 0, gravity: 0 }
  const DOWN = new THREE.Vector3(0, -1, 0)
  const springs = chains.map((c) => c.map((b) => (fast ? new FastSpring(b, segLen, DOWN) : new SpringBone(b, segLen, DOWN))))
  return bench(`${label} (${count}×${segments}${fast ? ', variante parent frais' : ''})`, (i) => {
    animate(i)
    if (fast) head.updateWorldMatrix(true, false)
    skull.getWorldPosition(collider.center)
    for (const ch of springs) {
      const n = ch.length
      for (let k = 0; k < n; k++) {
        const t = n === 1 ? 0 : k / (n - 1)
        const e = t * t * (3 - 2 * t)
        cfg.stiffness = 0.01 * (1 - e * 0.4)
        cfg.drag = 0.69
        cfg.gravity = 5.3 * (0.7 + e * 0.7)
        if (fast) (ch[k] as FastSpring).update(1 / 60, cfg, [collider])
        else (ch[k] as SpringBone).update(1 / 60, cfg, collider)
      }
    }
  })
}
locksBench('locks arène', 16, 11, false)
locksBench('locks arène', 16, 11, true)
locksBench('locks arène', 30, 11, false)
locksBench('locks planche', 16, 6, false)

// ================================================================ 3. coiffures : ressorts + génération
{
  const p = dollParams(1)
  for (const style of HAIR_STYLES) {
    if (style === 'locks') continue
    const t0 = now()
    let built
    try {
      built = buildHair(p, style)
    } catch (e) {
      console.log(JSON.stringify({ name: `buildHair ${style}`, error: String(e).slice(0, 120) }))
      continue
    }
    const ms = now() - t0
    const tris = ['yarn', 'braid', 'ribbon'].reduce((s, k) => {
      const g = (built as any)[k] as THREE.BufferGeometry | undefined
      return s + (g ? (g.index ? g.index.count : g.attributes.position.count) / 3 : 0)
    }, 0)
    console.log(JSON.stringify({ name: `buildHair ${style}`, ms: +ms.toFixed(1), movers: built.movers.length, tris }))
  }
  const head = chain(appRoot, 13)
  const skull = new THREE.Object3D()
  head.add(skull)
  const bones = Array.from({ length: 32 }, (_, k) => {
    const o = new THREE.Object3D()
    o.position.set(Math.cos(k) * 0.3, 0.2, Math.sin(k) * 0.3)
    skull.add(o)
    return o
  })
  const sp = bones.map((b) => new SpringBone(b, 0.2, new THREE.Vector3(0, -1, 0)))
  const cfg = { stiffness: 0.2, drag: 0.5, gravity: 1 }
  bench('coiffure: 32 SpringBone (plafond MAX_MOVERS)', (i) => {
    animate(i)
    sp.forEach((s) => s.update(1 / 60, cfg))
  })
}

// ================================================================ 4. écharpe
{
  const p = dollParams(1)
  const m = scarfMetrics(p)
  const neck = chain(appRoot, 10)
  // pièces isolées
  const grid = __restGrid(p, m)
  const colliders = __scarfColliders(p, m)
  const cloth = new ClothSheet(grid.rest, grid.pin, __ROWS, __COLS, { shear: 0.5, bend: p.scarf.bend, slack: p.scarf.slack }, p.seed)
  const group = new THREE.Group()
  group.position.y = m.localY
  neck.add(group)
  const carry = new FrameCarry()
  const gdir = new THREE.Vector3(0, -1, 0)
  const floor = { n: new THREE.Vector3(0, 1, 0), d: -1.2 }
  const links = (cloth as any).links.length
  bench('écharpe: ClothSheet.step seul (9 itér.)', (i) => {
    animate(i)
    const delta = carry.update(group)
    cloth.step(1 / 60, { gravity: p.scarf.weight, damping: p.scarf.drape, iterations: 9 }, colliders, gdir, undefined, { carry: delta, carryK: 0.92, floor })
  }, 600, 300, `${__ROWS}×${__COLS} = ${__ROWS * __COLS} particules, ${links} liens, ${colliders.length} sphères`)
  const geo = sheetGeometry(__ROWS, __RCOLS)
  const mid = new Float32Array(__ROWS * __RCOLS * 3)
  const rib = new Float32Array(__RCOLS).map((_, j) => 0.5 - 0.5 * Math.cos((j / (__RCOLS - 1)) * p.scarf.ribs * Math.PI * 2))
  const tris = geo.index!.count / 3
  bench('écharpe: writeSheet seul', () => {
    writeSheet(geo, cloth.points, __ROWS, __COLS, __RCOLS, mid, m.band * p.scarf.thickness, rib, p.scarf.ribDepth)
  }, 600, 300, `${geo.attributes.position.count} sommets, ${tris} triangles`)
  bench('écharpe: dont computeVertexNormals', () => { geo.computeVertexNormals() })
  bench('écharpe: dont computeBoundingSphere', () => { geo.computeBoundingSphere() })
  const fgeo = fringeGeometry(28, 10)
  const ends = [0, 1].map(() => ({
    roots: Array.from({ length: p.scarf.strands }, () => new THREE.Vector3(Math.random(), -1, 0)),
    flow: new THREE.Vector3(0, -1, 0),
    across: new THREE.Vector3(1, 0, 0),
  }))
  const lengths = Array.from({ length: 14 }, () => 0.05)
  const spread = Array.from({ length: 14 }, () => 0.1)
  bench('écharpe: writeFringe seul', () => {
    writeFringe(fgeo, ends, 10, 0.004, lengths, spread, gdir, colliders, 0.1, false)
  })

  // composant entier, crochets bouchonnés : le useFrame réel
  G.__refs = []; G.__frames = []; G.__effects = []
  const rigBones = (() => {
    const mkb = (d: number) => chain(appRoot, d)
    return {
      arm: { [-1]: mkb(12), 1: mkb(12) },
      leg: { [-1]: mkb(12), 1: mkb(12) },
      forearm: { [-1]: mkb(14), 1: mkb(14) },
      shin: { [-1]: mkb(14), 1: mkb(14) },
      floorY: -1,
    }
  })()
  G.__ctx = rigBones
  Scarf({ p, tint: '#9ab0c8' })
  const cb = G.__frames[0]
  for (const r of G.__refs) if (r.current === null) { const g = new THREE.Group(); g.position.y = m.localY; neck.add(g); r.current = g }
  bench('écharpe: useFrame complet (Scarf)', (i) => { animate(i); cb({}, 1 / 60) })
  G.__ctx = null
}

// ================================================================ 5. collier
{
  const p = dollParams(3)
  const neck = chain(appRoot, 9)
  G.__refs = []; G.__frames = []; G.__effects = []
  G.__ctx = {
    arm: { [-1]: chain(appRoot, 12), 1: chain(appRoot, 12) },
    leg: { [-1]: chain(appRoot, 12), 1: chain(appRoot, 12) },
    forearm: { [-1]: chain(appRoot, 14), 1: chain(appRoot, 14) },
    shin: { [-1]: chain(appRoot, 14), 1: chain(appRoot, 14) },
    floorY: -1,
  }
  __Necklace({ p, seed: p.seed })
  const cb = G.__frames[0]
  for (const r of G.__refs) if (r.current === null) { const g = new THREE.Group(); neck.add(g); r.current = g }
  bench('collier: useFrame complet (Necklace)', (i) => { animate(i); cb({}, 1 / 60) })
  G.__ctx = null
}

// ================================================================ 6. combattant + pas + IK
{
  const p = dollParams(0)
  const m = rigMetrics(p)
  const L = dollLayout(p)
  const f = new Fighter({ drive: true })
  const st = new Stepper()
  const rest = { [-1]: new THREE.Vector3(-0.1, -0.5, 0), 1: new THREE.Vector3(0.1, -0.5, 0) } as Record<-1 | 1, THREE.Vector3>
  const hips = { [-1]: new THREE.Vector3(), 1: new THREE.Vector3() } as Record<-1 | 1, THREE.Vector3>
  const root = new THREE.Vector3()
  const d = new THREE.Vector3()
  const q = new THREE.Quaternion()
  const FWD = new THREE.Vector3(0, 0, 1)
  bench('combattant: Fighter.update + Stepper + 2×solveLeg (course/sprint/attaques)', (i) => {
    f.input.x = Math.sin(i * 0.01)
    f.input.y = 1
    f.sprint = (i >> 7) % 2 === 1
    if (i % 90 === 0) f.press('attack')
    if (i % 400 === 200) f.press('jump')
    f.update(1 / 60, m)
    root.copy(f.pos)
    hips[-1].set(root.x - 0.1, root.y + 0.1, root.z)
    hips[1].set(root.x + 0.1, root.y + 0.1, root.z)
    st.update(f.dt, {
      root, facing: f.facing, vel: f.vel, rest, hips, splay: 0.05, grounded: f.grounded, legLength: p.limbs.legLength,
      onLand: (side, speed, dur) => f.land(speed, side, dur, st.feet[side].pos), cycle: f.cycle,
    })
    for (const s of [-1, 1] as const) {
      d.subVectors(st.feet[s].pos, hips[s])
      solveLeg(d, 0.19, 0.2, FWD, q)
    }
    f.puffs.length = 0
  }, 1200, 300)
  const idle = new Fighter({ phase: 1.3 })
  bench('planche: Fighter.update ×6 (attente)', () => {
    for (let k = 0; k < 6; k++) idle.update(1 / 60, m)
  })
  void L
}

console.log('RESULTS ' + JSON.stringify(results))
