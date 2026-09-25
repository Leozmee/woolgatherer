// Banc de mesure temporaire (supprimé avant commit).
import * as THREE from 'three'
import type { DollParams } from './doll/params'
import { applyMorph, boardMorphs } from './doll/morph'
import { dollLayout } from './doll/layout'
import { Fighter } from './__up/fighter'
import { FrameCarry, localFloor, rigMetrics } from './doll/rig'
import * as NewScarf from './doll/scarf'
import * as OldScarf from './__up/scarf_old'
import { ClothSheet as NewCloth } from './core/cloth'
import { ClothSheet as OldCloth } from './__up/cloth_old'
import type { Collider } from './core/springBone'
import { necklaceRig, stepNecklace } from './doll/traits'

export function baseParams(seed = 4413): DollParams {
  return {
    seed,
    wool: { base: '#cdbfa4', stitch: '#e0d4bb', roughness: 1, sheen: 0.85, sheenColor: '#fff4e0', sheenRoughness: 1, knitScale: 6, relief: 0.6, normalStrength: 0.3, fuzz: 6 },
    shape: { headRadius: 0.43, headEgg: 0, headPuff: 0.09, headCheekY: -0.6, headCheekSpread: 0.66, headSquash: 1.04, torsoHeight: 0.78, torsoRadius: 0.26, torsoTaper: 0.64, lumps: 0.03, lumpScale: 2 },
    limbs: { armLength: 0.33, armRadius: 0.1, armSpread: 0.95, legLength: 0.38, legRadius: 0.12, legSpread: 0.14 },
    face: { eyeSpacing: 0.29, eyeHeight: 0.04, leftSize: 0.1, rightSize: 0.09, leftColor: '#a3947b', rightColor: '#865936', mouthWidth: 0.24, mouthHeight: -0.16, mouthStitches: 5 },
    thread: { color: '#e5d1c1', mouthColor: '#e5d1c1', radius: 0.01 },
    hair: { count: 16, length: 0.34, thickness: 0.03, segments: 11, crown: 0.95, rooting: 8, droop: 1, strands: 2, turns: 1, color: '#4b3109', stiffness: 0.01, drag: 0.69, gravity: 5.3 },
    scarf: { width: 0.78, front: 0.68, back: 0.76, drop: 0.28, thickness: 0.05, wraps: 3, diagonal: 0.55, layers: 1.25, loop: 0.34, shoulder: 0.35, weight: 0.18, drape: 0.09, bend: 0.09, slack: 0.04, curl: 0.17, twist: 0.42, tuck: 0.13, hug: 6, fringe: 1, strands: 7, ribs: 4, ribDepth: 1.1, relief: 1.5, sheen: 0.45 },
    chain: { size: 1.42, elong: 0.8, wire: 0.27, drop: 0.62, dip: 1.7, weight: 0.05, drape: 0.44, scatter: 1.5, grip: 0.18 },
    pins: { count: 0, head: 1 },
    shell: { count: 14, height: 0.02, density: 2200 },
    spring: { stiffness: 0.3, drag: 0.39, gravity: 1.2, headStiffness: 0.53 },
    motion: { spin: -0.3, breathe: 0.01 },
    board: { gallery: true, light: true, single: 'couture', morph: 1, hairStyle: 'auto' },
  }
}

export function boardDoll(seed: number, i: number) {
  const base = baseParams(seed)
  const morphs = boardMorphs(base, 6)
  return { p: applyMorph({ ...base, seed: base.seed + i * 137 }, morphs[i].morph), name: morphs[i].archetype.name }
}

/** Hiérarchie de `Doll.tsx` jusqu'au cou, pilotée par un Fighter. */
export function makeRig(p: DollParams, drive: boolean) {
  const L = dollLayout(p)
  const root = new THREE.Group()
  const hips = new THREE.Group()
  const g1 = new THREE.Group()
  const squash = new THREE.Group()
  const g2 = new THREE.Group()
  const body = new THREE.Group()
  const neck = new THREE.Group()
  root.add(hips); hips.add(g1); g1.add(squash); squash.add(g2); g2.add(body); body.add(neck)
  g1.position.y = L.floorY
  g2.position.y = -L.floorY
  body.position.y = -L.centerY
  neck.position.y = L.neckY
  squash.matrixAutoUpdate = false
  const fighter = new Fighter({ drive, phase: 0.3 })
  const metrics = rigMetrics(p)
  const yaw = { v: 0 }
  function update(dt: number) {
    fighter.update(dt, metrics)
    if (drive) {
      root.position.set(fighter.pos.x, fighter.pos.y, fighter.pos.z)
      root.rotation.set(0, fighter.facing, 0)
    } else root.rotation.set(0.05, yaw.v, 0)
    const pose = fighter.pose
    const sq = fighter.squash
    const w = 1 / Math.sqrt(sq)
    squash.matrix.set(w, fighter.shear.x, 0, 0, 0, sq, 0, 0, 0, fighter.shear.z, w, 0, 0, 0, 0, 1)
    squash.matrixWorldNeedsUpdate = true
    hips.position.fromArray(pose.hipsPos)
    hips.rotation.fromArray(pose.hips)
    root.updateMatrixWorld(true)
  }
  return { L, root, body, neck, fighter, update, yaw }
}

type Variant = 'old' | 'new'

export function makeScarf(p: DollParams, neck: THREE.Object3D, v: Variant) {
  const S = (v === 'old' ? OldScarf : NewScarf) as typeof NewScarf
  const m = S.scarfMetrics(p)
  const grid = S.restGrid(p, m)
  const colliders = S.bodyColliders(p, m)
  const Cloth = v === 'old' ? OldCloth : NewCloth
  const cloth = new Cloth(grid.rest, grid.pin, S.ROWS, S.COLS, { shear: 0.5, bend: p.scarf.bend, slack: p.scarf.slack }, p.seed)
  const group = new THREE.Group()
  group.position.y = m.localY
  neck.add(group)
  const carry = new FrameCarry()
  const floor = { n: new THREE.Vector3(0, 1, 0), d: -1e9 }
  const gravityDir = new THREE.Vector3()
  const quat = new THREE.Quaternion()
  const phys = v === 'new' && (S as unknown as { scarfPhysics?: (p: DollParams) => { carryK: number; lift: number; iterations: number } }).scarfPhysics
  const cfgNew = phys ? phys(p) : { carryK: 0.92, lift: 0, iterations: 9 }
  function step(dt: number, floorY: number) {
    group.updateWorldMatrix(true, false)
    group.getWorldQuaternion(quat)
    gravityDir.set(0, -1, 0).applyQuaternion(quat.invert())
    const delta = carry.update(group)
    localFloor(group, floorY + p.shape.headRadius * 0.02, floor)
    cloth.step(dt, { gravity: p.scarf.weight, damping: p.scarf.drape, iterations: cfgNew.iterations }, colliders, gravityDir, undefined,
      { carry: delta, carryK: cfgNew.carryK, floor, lift: cfgNew.lift } as never)
  }
  const ROWS = S.ROWS
  const COLS = S.COLS
  const backStart = S.FRONT_PTS + S.WRAP_PTS
  // Longueurs au repos des liens de rang, pour mesurer l'étirement.
  const restLen: number[] = []
  for (let i = 0; i + 1 < ROWS; i++) for (let j = 0; j < COLS; j++) restLen.push(grid.rest[i * COLS + j].distanceTo(grid.rest[(i + 1) * COLS + j]))
  return { m, grid, cloth, group, step, backStart, colliders, ROWS, COLS, restLen }
}

type Sc = ReturnType<typeof makeScarf>

/** Mesures instantanées. */
function measure(sc: Sc, floorY: number) {
  const pts = sc.cloth.points
  let stretch = 0
  let at = ''
  let k = 0
  for (let i = 0; i + 1 < sc.ROWS; i++)
    for (let j = 0; j < sc.COLS; j++, k++) {
      const r = pts[i * sc.COLS + j].distanceTo(pts[(i + 1) * sc.COLS + j]) / sc.restLen[k]
      if (r > stretch) { stretch = r; at = `${i}/${j}` }
    }
  // Longueur du pan arrière (colonne du milieu) / repos.
  const mid = sc.COLS >> 1
  let len = 0
  let rest = 0
  for (let i = sc.backStart; i + 1 < sc.ROWS; i++) {
    len += pts[i * sc.COLS + mid].distanceTo(pts[(i + 1) * sc.COLS + mid])
    rest += sc.grid.rest[i * sc.COLS + mid].distanceTo(sc.grid.rest[(i + 1) * sc.COLS + mid])
  }
  // Pénétration dans le corps (sphères du tronc seulement : les membres ne
  // suivent pas leurs os ici) et sous le sol.
  let pen = 0
  const body = sc.colliders.slice(0, sc.colliders.length - 16)
  for (const p of pts)
    for (const c of body as Collider[]) {
      const d = c.radius - p.distanceTo(c.center)
      if (d > pen) pen = d
    }
  let under = 0
  const w = new THREE.Vector3()
  for (const p of pts) {
    w.copy(p).applyMatrix4(sc.group.matrixWorld)
    under = Math.max(under, floorY - w.y)
  }
  return { stretch, at, tail: len / rest, pen, under }
}

const SEQ: [string, number, (f: Fighter, t: number) => void][] = [
  ['repos', 2, (f) => { f.input.x = 0; f.input.y = 0 }],
  ['marche', 1.5, (f) => { f.input.y = 1 }],
  ['sprint+virage', 1.5, (f, t) => { f.sprint = true; f.input.y = 1; f.input.x = t > 0.7 ? 0.8 : 0 }],
  ['arrêt', 0.8, (f) => { f.sprint = false; f.input.x = 0; f.input.y = 0 }],
  ['dash+glissade', 1.4, (f, t) => { f.input.y = 1; if (t === 0) f.press('dodge'); if (t > 1.0) f.release('dodge') }],
  ['arrêt2', 0.8, (f) => { f.input.y = 0; f.input.x = 0 }],
  ['saut+salto', 1.6, (f, t) => { if (t === 0) f.press('jump'); if (Math.abs(t - 0.25) < 1e-6) f.press('jump'); if (t > 0.5) f.release('jump') }],
  ['attaques', 1.8, (f, t) => { for (const a of [0, 0.3, 0.6]) if (Math.abs(t - a) < 1e-6) f.press('attack') }],
  ['K.O.', 2.2, (f, t) => { if (t === 0) f.press('ko') }],
  ['relevée', 2.0, (f, t) => { if (t === 0) f.press('ko') }],
]

function run() {
  const hz = +(process.argv[3] ?? 60)
  const which = (process.argv[2] ?? 'both') as 'old' | 'new' | 'both'
  const variants: Variant[] = which === 'both' ? ['old', 'new'] : [which]
  const seeds = [4413, 1234, 777]
  for (const v of variants) {
    console.log(`\n######## ${v} à ${hz} i/s`)
    const acc: Record<string, { stretch: number; at: string; tail: number; pen: number; under: number; jit: number; j2s: number[]; hs: number[]; ds: number[] }> = {}
    for (const seed of seeds) {
      const { p } = boardDoll(seed, 1)
      const rig = makeRig(p, true)
      rig.update(0)
      const sc = makeScarf(p, rig.neck, v)
      const dt = 1 / hz
      const floorY = rig.L.floorY
      // Suivi du bout pour la gigue : 2e différence en repère monde.
      const tip = (sc.ROWS - 1) * sc.COLS + (sc.COLS >> 1)
      const hist: THREE.Vector3[] = []
      for (const [name, dur, fn] of SEQ) {
        const n = Math.round(dur * hz)
        const a = (acc[name] ??= { stretch: 0, at: '', tail: 0, pen: 0, under: 0, jit: 0, j2s: [], hs: [], ds: [] })
        let jit = 0
        for (let k = 0; k < n; k++) {
          fn(rig.fighter, k / hz)
          rig.update(dt)
          sc.step(dt, floorY)
          const m = measure(sc, floorY)
          if (m.stretch > a.stretch) { a.stretch = m.stretch; a.at = `${m.at}@${seed}` }
          if (process.env.STR === name && seed === +(process.env.SEED ?? 777) && (m.stretch > 1.6 || m.pen > 0.02)) {
            const hp = rig.fighter.pose.hips
            console.log(`${name} k=${k} ${rig.fighter.current} str=${m.stretch.toFixed(2)}@${m.at} pen=${m.pen.toFixed(3)} hips=(${hp[0].toFixed(2)},${hp[1].toFixed(2)},${hp[2].toFixed(2)}) hipsY=${rig.fighter.pose.hipsPos[1].toFixed(2)}`)
          }
          a.tail = Math.max(a.tail, m.tail)
          a.pen = Math.max(a.pen, m.pen)
          a.under = Math.max(a.under, m.under)
          const w = sc.cloth.points[tip].clone().applyMatrix4(sc.group.matrixWorld)
          hist.push(w)
          const inv = rig.root.matrixWorld.clone().invert()
          const lr = w.clone().applyMatrix4(inv)
          a.hs.push(w.y - floorY)
          a.ds.push(Math.hypot(lr.x, lr.z))
          if (hist.length > 3) hist.shift()
          if (hist.length === 3) {
            const j2 = hist[2].clone().sub(hist[1]).sub(hist[1].clone().sub(hist[0])).length()
            jit = Math.max(jit, j2)
            a.j2s.push(j2)
            if (process.env.TRACE === name && j2 > +(process.env.JMIN ?? -1)) {
              const lp = sc.cloth.points[tip]
              console.log(`${name} s=${seed} k=${k} ${rig.fighter.current} v=${Math.hypot(rig.fighter.vel.x, rig.fighter.vel.z).toFixed(2)} face=${rig.fighter.facing.toFixed(2)} j2=${j2.toFixed(3)} tipW=(${w.x.toFixed(2)},${w.y.toFixed(2)},${w.z.toFixed(2)}) tipL=(${lp.x.toFixed(2)},${lp.y.toFixed(2)},${lp.z.toFixed(2)})`)
            }
          }
        }
        a.jit = Math.max(a.jit, jit)
      }
    }
    console.log('phase'.padEnd(16), 'étir.max', 'pan/repos', 'pénétr.', 'sous sol', 'gigue95', 'haut moy/max', 'écart moy/max')
    for (const [name] of SEQ) {
      const a = acc[name]
      const q = (xs: number[], f: number) => { const s = xs.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * f))] ?? 0 }
      const mean = (xs: number[]) => xs.reduce((x, y) => x + y, 0) / Math.max(1, xs.length)
      console.log(name.padEnd(16), a.stretch.toFixed(2).padStart(8), a.tail.toFixed(2).padStart(9), a.pen.toFixed(3).padStart(8), a.under.toFixed(3).padStart(8), q(a.j2s, 0.95).toFixed(3).padStart(7),
        `${mean(a.hs).toFixed(2)}/${Math.max(...a.hs).toFixed(2)}`.padStart(12), `${mean(a.ds).toFixed(2)}/${Math.max(...a.ds).toFixed(2)}`.padStart(13), a.at)
    }
  }
}

// ------------------------------------------------------------------ collier
export function runNecklace() {
  const hz = 60
  for (const seed of [4413, 1234, 777, 42, 9000]) {
    const { p, name } = boardDoll(seed, 3)
    const rig = makeRig(p, true)
    rig.update(0)
    const n = necklaceRig(p, p.seed)
    const group = new THREE.Group()
    rig.neck.add(group)
    const carry = new FrameCarry()
    const floor = { n: new THREE.Vector3(0, 1, 0), d: -1e9 }
    const gravity = new THREE.Vector3()
    const q = new THREE.Quaternion()
    const extra = { carry: null as THREE.Matrix4 | null, carryK: 1, floor: floor as typeof floor | null }
    const hl = n.hang.links
    const T = p.shape.torsoHeight
    const body = n.colliders.slice(0, n.colliders.length - 8)
    const out: Record<string, { pen: number; ang: number; dev: number; y: number[] }> = {}
    let restLock: THREE.Vector3 | null = null
    for (const [ph, dur, fn] of SEQ) {
      const o = (out[ph] ??= { pen: 0, ang: 0, dev: 0, y: [] })
      for (let k = 0; k < Math.round(dur * hz); k++) {
        fn(rig.fighter, k / hz)
        rig.update(1 / hz)
        group.updateWorldMatrix(true, false)
        group.getWorldQuaternion(q)
        gravity.set(0, -1, 0).applyQuaternion(q.invert())
        extra.carry = carry.update(group)
        localFloor(group, rig.L.floorY + n.tube, floor)
        stepNecklace(n, p, 1 / hz, gravity, extra as never)
        const lock = n.drop.points[hl + 1]
        const top = n.drop.points[0]
        // Corps du cadenas dans le ventre : demi-épaisseur moins le jeu des sphères.
        for (const c of body) o.pen = Math.max(o.pen, c.radius - n.tube * 0.6 + n.hang.pad[hl + 1] - n.tube - lock.distanceTo(c.center))
        const v = lock.clone().sub(top)
        o.ang = Math.max(o.ang, Math.acos(Math.max(-1, Math.min(1, -v.y / v.length()))))
        if (ph === 'repos' && k === Math.round(dur * hz) - 1) restLock = lock.clone()
        if (restLock) o.dev = Math.max(o.dev, lock.distanceTo(restLock))
        // Hauteur du cadenas en fraction du torse : +1 haut, −1 bas.
        o.y.push((lock.y + 0.44 * T) / (0.5 * T))
      }
    }
    console.log(`\n== collier graine ${seed} (${name}) maillons pendants ${hl}, cadenas ${n.L.toFixed(3)}`)
    for (const [ph] of SEQ) {
      const o = out[ph]
      console.log(ph.padEnd(16), `pénétr ${o.pen.toFixed(3)}`, `angle max ${(o.ang * 57.3).toFixed(0)}°`.padStart(14), `écart ${o.dev.toFixed(2)}`, `hauteur torse ${Math.min(...o.y).toFixed(2)}..${Math.max(...o.y).toFixed(2)}`)
    }
  }
}

if (process.argv[2] === 'collier') runNecklace()
else run()
