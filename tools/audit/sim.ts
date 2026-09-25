import * as THREE from 'three'
import { solveLeg } from '/home/user/woolgatherer/src/doll/limbs'
import { SpringBone } from '/home/user/woolgatherer/src/core/springBone'
import { Fighter } from '/home/user/woolgatherer/src/doll/fighter'

// --- 1. IK : le pied tombe-t-il sur la cible ?
{
  let worst = 0
  const q = new THREE.Quaternion()
  for (let i = 0; i < 2000; i++) {
    const a = 0.19, b = 0.19 + 0.036
    const d = new THREE.Vector3(Math.random() - 0.5, -Math.random(), Math.random() - 0.5).normalize().multiplyScalar(0.1 + Math.random() * 0.32)
    const want = d.clone()
    const k = solveLeg(d.clone(), a, b, new THREE.Vector3(0, 0, 1), q)
    // cuisse : −y du repère ; tibia : rotation x de k autour de x local
    const knee = new THREE.Vector3(0, -a, 0).applyQuaternion(q)
    const shin = new THREE.Vector3(0, -b, 0).applyAxisAngle(new THREE.Vector3(1, 0, 0), k).applyQuaternion(q)
    const foot = knee.clone().add(shin)
    const D = want.length()
    if (D > Math.abs(a - b) + 0.01 && D < a + b - 0.001) worst = Math.max(worst, foot.distanceTo(want))
    if (i === 0) console.log('knee forward z>0 ?', knee.z.toFixed(3), 'k', k.toFixed(2))
  }
  console.log('IK worst foot error', worst.toExponential(2))
}

// --- 2. Ressort : même trajectoire à 30 / 60 / 144 Hz ?
{
  const run = (hz: number) => {
    const parent = new THREE.Object3D()
    const bone = new THREE.Object3D()
    parent.add(bone)
    const sb = new SpringBone(bone, 0.3)
    const cfg = { stiffness: 0.3, drag: 0.5, gravity: 1.2 }
    const out: number[] = []
    const dt = 1 / hz
    let t = 0
    let nextSample = 0
    while (t < 1.5) {
      parent.rotation.z = t < 0.3 ? t * 5 : 1.5
      parent.updateMatrixWorld(true)
      sb.update(dt, cfg)
      t += dt
      if (t >= nextSample) {
        out.push(new THREE.Euler().setFromQuaternion(bone.quaternion).z)
        nextSample += 0.1
      }
    }
    return out
  }
  const r60 = run(60)
  for (const hz of [30, 144]) {
    const r = run(hz)
    const err = Math.max(...r60.map((v, i) => Math.abs(v - (r[i] ?? v))))
    console.log(`spring ${hz}Hz vs 60Hz max diff (rad)`, err.toFixed(3), 'peak60', Math.max(...r60.map(Math.abs)).toFixed(3))
  }
}

// --- 3. Combattant
const m = { centerHeight: 0.93, torsoRadius: 0.26, legLength: 0.38, armSpread: 0.95, height: 1.96 }
const sim = (f: Fighter, secs: number, each?: (t: number) => void) => {
  const dt = 1 / 60
  for (let t = 0; t < secs; t += dt) {
    each?.(t)
    f.update(dt, m)
  }
}
const range = (xs: number[]) => Math.max(...xs) - Math.min(...xs)
{
  // Roulis en marche : bassin z, cisaillement x, tête z — hors régime transitoire.
  const f = new Fighter({ drive: true })
  f.input.y = 1
  const hz: number[] = [], sx: number[] = [], nz: number[] = [], hy: number[] = []
  let side: -1 | 1 = 1, acc = 0
  sim(f, 3, (t) => {
    acc += 1 / 60
    if (acc > 0.12) { acc = 0; side = side === 1 ? -1 : 1; f.land(2, side, 0.12) }
    if (t > 1) { hz.push(f.pose.hips[2]); sx.push(f.shear.x); nz.push(f.pose.neck[2]); hy.push(f.pose.hips[1]) }
  })
  console.log('walk sway ranges: hips roll', range(hz).toFixed(3), 'shear x', range(sx).toFixed(3), 'neck roll', range(nz).toFixed(3), 'hips yaw', range(hy).toFixed(3))
  const approxHead = hz.map((v, i) => Math.sin(v) * 0.9 + sx[i] * 1.6)
  console.log('  ≈ head lateral travel (units)', range(approxHead).toFixed(3))
}
{
  const f = new Fighter({ drive: true })
  f.input.y = 1
  f.sprint = true
  let tFull = -1
  sim(f, 2, (t) => { if (tFull < 0 && Math.hypot(f.vel.x, f.vel.z) > 4.5) tFull = t })
  console.log('sprint speed', Math.hypot(f.vel.x, f.vel.z).toFixed(2), 'time to 4.5 u/s', tFull.toFixed(2), 'current', f.current, 'hips pitch', f.pose.hips[0].toFixed(2), 'dash', f.dash.toFixed(2))
  f.input.y = 0
  const x0 = f.pos.clone()
  sim(f, 1)
  console.log('  stop slide distance', f.pos.distanceTo(x0).toFixed(2), 'puffs queued', f.puffs.length)
}
{
  // Saut tenu, saut bref
  for (const hold of [true, false]) {
    const f = new Fighter({ drive: true })
    sim(f, 0.5)
    f.press('jump')
    let apex = 0, air = 0, landed = -1
    sim(f, 1.5, (t) => {
      if (!hold && t > 0.05) f.release('jump')
      apex = Math.max(apex, f.pos.y)
      if (f.airborne) air += 1 / 60
      if (landed < 0 && air > 0 && !f.airborne) landed = t
    })
    console.log(`jump ${hold ? 'held' : 'tap '}: apex`, apex.toFixed(2), '(height 1.96) airtime', air.toFixed(2), 'state', f.current, 'squash', f.squash.toFixed(2))
  }
}
{
  // Plongeon
  const f = new Fighter({ drive: true })
  sim(f, 0.3)
  f.press('jump')
  const seq: string[] = []
  sim(f, 1.5, (t) => {
    if (Math.abs(t - 0.25) < 0.009) f.press('attack')
    const c = f.current
    if (seq[seq.length - 1] !== c) seq.push(c)
  })
  console.log('plunge sequence', seq.join(' → '), 'shake max?', f.shake.toFixed(2))
}
{
  // Pas de côté : cap conservé, distance
  for (const [ix, iy, name] of [[1, 0, 'right'], [0, 0, 'none'], [-1, 0, 'left']] as const) {
    const f = new Fighter({ drive: true })
    sim(f, 0.3)
    const face0 = f.facing
    f.input.x = ix; f.input.y = iy
    f.press('dodge')
    f.input.x = 0; f.input.y = 0
    // stick relâché après l'appui : on regarde la seule esquive
    f.input.x = ix
    const p0 = f.pos.clone()
    let maxY = 0
    const seq: string[] = []
    sim(f, 0.5, () => { maxY = Math.max(maxY, f.pos.y); const c = f.current; if (seq[seq.length - 1] !== c) seq.push(c); f.input.x = 0 })
    const d = f.pos.clone().sub(p0)
    console.log(`dodge ${name}: moved (${d.x.toFixed(2)}, ${d.z.toFixed(2)}) hop ${maxY.toFixed(2)} facing Δ ${(f.facing - face0).toFixed(3)} seq ${seq.join('→')}`)
  }
}
