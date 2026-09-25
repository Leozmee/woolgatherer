import * as THREE from 'three'
import { Fighter } from './doll/fighter'
import { Stepper } from './doll/limbs'
const m = { centerHeight: 0.93, torsoRadius: 0.26, legLength: 0.38, armSpread: 0.95, height: 1.96 }
const H = 0.93, reach = 0.416, hipX = 0.114
for (const sprint of [false, true]) {
  const f = new Fighter({ drive: true }); const st = new Stepper()
  f.pos.set(0, 0, 7); f.input.y = 1; f.sprint = sprint
  const rest = { [-1]: new THREE.Vector3(-hipX, -H, 0), 1: new THREE.Vector3(hipX, -H, 0) } as Record<-1|1, THREE.Vector3>
  const hips = { [-1]: new THREE.Vector3(), 1: new THREE.Vector3() } as Record<-1|1, THREE.Vector3>
  const prev: THREE.Vector3[] = [], prev2: THREE.Vector3[] = []
  let worst = 0, where = '', hy: number[] = []
  const dt = 1 / 60
  for (let i = 0; i < 150; i++) {
    f.update(dt, m)
    const cf = Math.cos(f.facing), sf = Math.sin(f.facing)
    for (const s of [-1, 1] as const) hips[s].set(f.pos.x + s * hipX * cf, f.pos.y - H + reach + f.pose.hipsPos[1], f.pos.z - s * hipX * sf)
    st.update(dt, { root: f.pos, facing: f.facing, vel: f.vel, rest, hips, splay: 0, grounded: f.grounded, legLength: 0.38, cycle: f.cycle })
    ;[-1, 1].forEach((s, k) => {
      const p = st.feet[s as -1|1].pos
      if (i > 60 && prev2[k]) {
        const a = p.clone().sub(prev[k]).sub(prev[k].clone().sub(prev2[k])).length()
        if (a > worst) { worst = a; where = `pied ${s} ψ=${(((f.cycle.phase + (s === -1 ? 0 : 0.5)) % 1)).toFixed(2)} duty=${f.cycle.duty.toFixed(2)}` }
      }
      prev2[k] = prev[k]?.clone(); prev[k] = p.clone()
    })
    if (i > 60) hy.push(f.pose.hipsPos[1])
  }
  let hj = 0; for (let i = 2; i < hy.length; i++) hj = Math.max(hj, Math.abs(hy[i] - 2 * hy[i-1] + hy[i-2]))
  console.log(`${sprint ? 'course' : 'marche'} : à-coup max du pied ${worst.toFixed(4)} u/image² (${where}) · bassin ${hj.toFixed(4)}`)
}
// vitesse de pointe du pied en vol, et jambe max
for (const sprint of [false, true]) {
  const f = new Fighter({ drive: true }); const st = new Stepper()
  f.pos.set(0, 0, 7); f.input.y = 1; f.sprint = sprint
  const rest = { [-1]: new THREE.Vector3(-hipX, -H, 0), 1: new THREE.Vector3(hipX, -H, 0) } as Record<-1|1, THREE.Vector3>
  const hips = { [-1]: new THREE.Vector3(), 1: new THREE.Vector3() } as Record<-1|1, THREE.Vector3>
  let vmax = 0, kmax = 0, flight = 0, n = 0
  for (let i = 0; i < 150; i++) {
    f.update(1 / 60, m)
    const cf = Math.cos(f.facing), sf = Math.sin(f.facing)
    for (const s of [-1, 1] as const) hips[s].set(f.pos.x + s * hipX * cf, f.pos.y - H + reach + f.pose.hipsPos[1], f.pos.z - s * hipX * sf)
    st.update(1 / 60, { root: f.pos, facing: f.facing, vel: f.vel, rest, hips, splay: 0, grounded: f.grounded, legLength: 0.38, cycle: f.cycle })
    if (i < 60) continue
    n++; let air = 0
    for (const s of [-1, 1] as const) { vmax = Math.max(vmax, st.feet[s].vel.length()); if (!st.feet[s].swinging) kmax = Math.max(kmax, st.feet[s].pos.distanceTo(hips[s]) / reach); else air++ }
    if (air === 2) flight++
  }
  console.log(`${sprint ? 'course' : 'trot'} : pied en vol ≤ ${vmax.toFixed(1)} u/s · jambe d'appui ≤ ${kmax.toFixed(2)} × portée · vol ${(100 * flight / n).toFixed(0)} % · appui ${f.cycle.duty.toFixed(2)}`)
}
