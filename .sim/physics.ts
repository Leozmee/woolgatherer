// Rejoue la physique des coiffures (ressorts + formule du vertex shader) sur
// des scénarios de mouvement de la tête, et mesure par zone.
// node physics.mjs <style> <seed> [count]
import * as THREE from 'three'
import { SpringBone, type Collider } from '../src/core/springBone'
import { onHead, onHeadPolar } from '../src/doll/surface'
import { buildHair, type HairStyle } from '../src/doll/hairstyles'
import { dolls, eyesOf } from './scene'
import type { DollParams } from '../src/doll/params'

type Scenario = { name: string; T: number; pose: (t: number, head: THREE.Object3D) => void }
const SCENARIOS: Scenario[] = [
  {
    name: 'rotation',
    T: 1.6,
    // Demi-tour à 5 rad/s puis arrêt net : l'agitation de la platine.
    pose: (t, h) => h.rotation.set(0, Math.min(t, 0.6) * 5, 0),
  },
  {
    name: 'agiter',
    T: 1.6,
    pose: (t, h) => h.rotation.set(0, t < 1 ? 0.5 * Math.sin(t * Math.PI * 2 * 2) : 0, 0),
  },
  {
    name: 'course',
    T: 1.6,
    // Démarrage à 2 u/s en 0,1 s, arrêt à 0,8 s en 0,15 s.
    pose: (t, h) => {
      const v = (s: number) => (s < 0.1 ? 10 * s * s : s < 0.8 ? 0.1 + 2 * (s - 0.1) : 0.1 + 1.4 + 2 * Math.min(s - 0.8, 0.15) - (2 / 0.3) * Math.min(s - 0.8, 0.15) ** 2)
      h.position.set(0, 0, v(t))
    },
  },
  {
    name: 'bonds',
    T: 1.4,
    pose: (t, h) => h.position.set(0, t < 1 ? 0.06 * Math.abs(Math.sin(t * Math.PI * 7)) : 0, 0),
  },
  {
    name: 'pique',
    T: 1.4,
    // Tête qui pique en avant puis se relève (écrasement, coup reçu).
    pose: (t, h) => h.rotation.set(t < 0.3 ? 0.9 * (t / 0.3) : Math.max(0, 0.9 - (t - 0.3) * 3), 0, 0),
  },
]

const FLING_SPEED = 5
function simulate(p: DollParams, style: HairStyle) {
  const built = buildHair(p, style)
  const geo = built.yarn
  const movers = built.movers
  const world = new THREE.Object3D()
  const head = new THREE.Object3D()
  world.add(head)
  const bones: THREE.Object3D[] = []
  movers.forEach((m, i) => {
    const b = new THREE.Object3D()
    const parent = (m as { parent?: number }).parent
    if (parent !== undefined) {
      b.position.copy(m.pivot).sub(movers[parent].pivot)
      bones[parent].add(b)
    } else {
      b.position.copy(m.pivot)
      head.add(b)
    }
    bones[i] = b
  })
  const R = p.shape.headRadius
  const collides = movers.map(
    (m) => m.pivot.lengthSq() > 1e-6 && m.pivot.clone().addScaledVector(m.dir, m.length).length() > R * 0.97,
  )
  const e = eyesOf(p)
  const lift = p.shape.lumps * R * 0.7 + 0.004
  const eyes = [[-e.spacing / 2, e.leftSize], [e.spacing / 2, e.rightSize]].map(([x, r]) => ({
    c: onHead(p, x, p.face.eyeHeight, lift).pos,
    r,
  }))

  const groups: { geo: THREE.BufferGeometry; name: string }[] = []
  if (built.yarn) groups.push({ geo: built.yarn, name: 'yarn' })
  if (built.braid) groups.push({ geo: built.braid, name: 'braid' })
  if (built.ribbon) groups.push({ geo: built.ribbon, name: 'ribbon' })
  void geo

  const results: Record<string, unknown> = {}
  for (const sc of SCENARIOS) {
    world.clear()
    world.add(head)
    head.position.set(0, 0, 0)
    head.rotation.set(0, 0, 0)
    const springs = movers.map((m, i) => new SpringBone(bones[i], m.length, m.dir))
    const angle = new Float32Array(movers.length)
    const axis = movers.map(() => new THREE.Vector3(1, 0, 0))
    const q = new THREE.Quaternion()
    const last = new THREE.Quaternion()
    const dq = new THREE.Quaternion()
    let fling = 0
    const collider: Collider = { center: new THREE.Vector3(), radius: R * 0.95 }
    const dt = 1 / 60
    // Par mover : déplacement max (repère de la tête), et global.
    const maxBy = new Map<number, number>()
    let eyeMin = Infinity
    let inSkull = 0
    let deepest = 0
    const deepBy = new Map<number, number>()
    let eyeRest = Infinity
    let restMove = 0
    const steps = Math.round(sc.T / dt)
    for (let s = 0; s <= steps; s++) {
      const t = s * dt
      sc.pose(t, head)
      head.updateMatrixWorld(true)
      head.getWorldQuaternion(q)
      if (s > 0) {
        dq.copy(q).multiply(last.clone().invert())
        if (dq.w < 0) dq.set(-dq.x, -dq.y, -dq.z, -dq.w)
        const ang = 2 * Math.acos(Math.min(1, Math.max(-1, dq.w)))
        const sn = Math.sqrt(Math.max(0, 1 - dq.w * dq.w))
        const spin = sn > 1e-5 ? (ang * Math.abs(dq.y / sn)) / dt : 0
        const target = Math.min(1, spin / FLING_SPEED)
        const rate = target > fling ? 10 : 2.5
        fling += (target - fling) * Math.min(1, dt * rate)
      }
      last.copy(q)
      head.getWorldPosition(collider.center)
      movers.forEach((m, i) => {
        springs[i].update(dt, m.cfg, collides[i] ? collider : undefined)
        const bq = bones[i].quaternion.clone()
        if (bq.w < 0) bq.set(-bq.x, -bq.y, -bq.z, -bq.w)
        const sn = Math.sqrt(Math.max(0, 1 - bq.w * bq.w))
        if (sn < 1e-5) {
          angle[i] = 0
          return
        }
        axis[i].set(bq.x / sn, bq.y / sn, bq.z / sn)
        angle[i] = Math.min(2 * Math.acos(Math.min(1, bq.w)), m.maxAngle)
      })
      if (s % 3 !== 0 && s !== steps) continue
      // Formule du shader, sommet par sommet.
      const v = new THREE.Vector3()
      const r0 = new THREE.Vector3()
      for (const g of groups) {
        const pos = g.geo.attributes.position
        const am = g.geo.attributes.aMover.array
        const af = g.geo.attributes.aFree.array
        const afl = g.geo.attributes.aFling.array
        const am2 = g.geo.attributes.aMover2?.array
        const af2 = g.geo.attributes.aFree2?.array
        for (let k = 0; k < pos.count; k += 2) {
          r0.fromBufferAttribute(pos, k)
          v.copy(r0)
          if (am2 && am2[k] > -0.5 && af2![k] > 0) {
            const m2 = Math.round(am2[k])
            v.sub(movers[m2].pivot).applyAxisAngle(axis[m2], angle[m2] * af2![k]).add(movers[m2].pivot)
          }
          const m = Math.round(am[k])
          if (am[k] > -0.5 && af[k] > 0) v.sub(movers[m].pivot).applyAxisAngle(axis[m], angle[m] * af[k]).add(movers[m].pivot)
          const hx = v.x
          const hz = v.z
          const hl = Math.hypot(hx, hz)
          v.x += hx * 0.5 * fling * afl[k]
          v.z += hz * 0.5 * fling * afl[k]
          v.y += hl * 0.12 * fling * afl[k]
          const d = v.distanceTo(r0)
          const key = am2 && am2[k] > -0.5 ? Math.round(am2[k]) : Math.round(am[k])
          maxBy.set(key, Math.max(maxBy.get(key) ?? 0, d))
          if (s === steps) restMove = Math.max(restMove, d)
          // Dans le crâne : enfoncement **gagné** par rapport au repos, de plus de 8 mm.
          {
            const pen = (w: THREE.Vector3) => {
              const sy = w.y / (R * p.shape.headSquash)
              if (Math.abs(sy) >= 0.97) return -1
              const surf = onHeadPolar(p, Math.atan2(w.x, w.z), sy, 0).pos
              return Math.hypot(surf.x, surf.z) - Math.hypot(w.x, w.z)
            }
            const gain = pen(v) - Math.max(0, pen(r0))
            if (gain > 0.008) inSkull++
            deepest = Math.max(deepest, gain)
            if (gain > 0.008) deepBy.set(key, Math.max(deepBy.get(key) ?? 0, gain))
          }
          // Devant les boutons : distance dans le plan de face.
          if (v.z > R * 0.3) {
            for (const ey of eyes) {
              eyeMin = Math.min(eyeMin, Math.hypot(v.x - ey.c.x, v.y - ey.c.y) - ey.r)
              if (s === 0) eyeRest = Math.min(eyeRest, Math.hypot(r0.x - ey.c.x, r0.y - ey.c.y) - ey.r)
            }
          }
        }
      }
    }
    const byMover: Record<string, number> = {}
    for (const [k, d] of [...maxBy.entries()].sort((a, b) => a[0] - b[0])) byMover[k] = +d.toFixed(3)
    const deep: Record<string, number> = {}
    for (const [k, d] of deepBy) deep[k] = +d.toFixed(3)
    results[sc.name] = { deep, byMover, eyeRest: +eyeRest.toFixed(3), eyeMin: +eyeMin.toFixed(3), inSkull, deepest: +deepest.toFixed(3), rest: +restMove.toFixed(4) }
  }
  return { results, movers: movers.length }
}

const style = (process.argv[2] ?? 'frange') as HairStyle
const seed = Number(process.argv[3] ?? 4413)
const count = Number(process.argv[4] ?? 2)
for (const p of dolls(seed, 6).slice(0, count)) {
  const r = simulate(p, style)
  console.log(style, p.seed, 'movers', r.movers)
  for (const [k, v] of Object.entries(r.results)) console.log('  ', k.padEnd(9), JSON.stringify(v))
}
