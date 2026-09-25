// Banc 3 : ressorts des locks — actuel, « une seule remontée », « parent frais » ; coût de updateMatrixWorld.
import * as THREE from 'three'
import { SpringBone, type Collider, type SpringConfig } from '/home/user/woolgatherer/src/core/springBone'

const now = () => performance.now()
function bench(name: string, frame: (i: number) => void, n = 600, warm = 300) {
  for (let i = 0; i < warm; i++) frame(i)
  const runs: number[] = []
  for (let rep = 0; rep < 3; rep++) {
    const t0 = now()
    for (let i = 0; i < n; i++) frame(warm + rep * n + i)
    runs.push((now() - t0) / n)
  }
  console.log(JSON.stringify({ name, minMeanMs: +Math.min(...runs).toFixed(4) }))
}

const STEP = 1 / 60
const GRAV = new THREE.Vector3(0, -1, 0)
const _pq = new THREE.Quaternion(), _pqi = new THREE.Quaternion(), _pp = new THREE.Vector3(), _ps = new THREE.Vector3()
const _bw = new THREE.Vector3(), _rd = new THREE.Vector3(), _rt = new THREE.Vector3(), _nx = new THREE.Vector3()
const _tp = new THREE.Vector3(), _ld = new THREE.Vector3(), _push = new THREE.Vector3(), _b = new THREE.Vector3(), _r = new THREE.Vector3()

/** Même calcul que SpringBone ; `fresh` : le grand-parent est à jour, on ne remonte pas. */
class Spring2 {
  prevTail = new THREE.Vector3(); currTail = new THREE.Vector3(); lastBone = new THREE.Vector3(); lastRest = new THREE.Vector3()
  acc = 0; init = false; restLocal: THREE.Vector3
  constructor(public bone: THREE.Object3D, public length: number, rest: THREE.Vector3, public fresh: boolean) { this.restLocal = rest.clone().normalize() }
  update(dt: number, cfg: SpringConfig, colliders?: readonly Collider[] | null) {
    const bone = this.bone, parent = bone.parent!
    if (this.fresh) { parent.updateWorldMatrix(false, false); bone.updateMatrix(); bone.matrixWorld.multiplyMatrices(parent.matrixWorld, bone.matrix) }
    else bone.updateWorldMatrix(true, false)
    _bw.setFromMatrixPosition(bone.matrixWorld)
    parent.matrixWorld.decompose(_pp, _pq, _ps) // une fois, au lieu de deux getWorldQuaternion (deux remontées)
    _rd.copy(this.restLocal).applyQuaternion(_pq).normalize()
    _rt.copy(_bw).addScaledVector(_rd, this.length)
    if (!this.init) { this.prevTail.copy(_rt); this.currTail.copy(_rt); this.lastBone.copy(_bw); this.lastRest.copy(_rt); this.init = true; return }
    const span = Math.min(Math.max(dt, 0), 1 / 15), acc0 = this.acc
    this.acc += span
    const n = Math.floor(this.acc / STEP + 1e-6)
    this.acc = Math.max(0, this.acc - n * STEP)
    for (let k = 1; k <= n; k++) {
      const u = span > 0 ? Math.min(1, Math.max(0, (k * STEP - acc0) / span)) : 1
      _b.lerpVectors(this.lastBone, _bw, u); _r.lerpVectors(this.lastRest, _rt, u)
      _nx.copy(this.currTail)
      _tp.subVectors(this.currTail, this.prevTail).multiplyScalar(1 - cfg.drag); _nx.add(_tp)
      _tp.subVectors(_r, this.currTail).multiplyScalar(cfg.stiffness); _nx.add(_tp)
      _nx.addScaledVector(GRAV, cfg.gravity * STEP)
      _nx.sub(_b).normalize().multiplyScalar(this.length).add(_b)
      if (colliders) for (const c of colliders) {
        _push.subVectors(_nx, c.center); const d = _push.length()
        if (d > 1e-6 && d < c.radius) { _nx.copy(c.center).addScaledVector(_push, c.radius / d); _nx.sub(_b).normalize().multiplyScalar(this.length).add(_b) }
      }
      this.prevTail.copy(this.currTail); this.currTail.copy(_nx)
    }
    this.lastBone.copy(_bw); this.lastRest.copy(_rt)
    _nx.subVectors(this.currTail, this.prevTail).multiplyScalar(this.acc / STEP).add(this.currTail)
    _pqi.copy(_pq).invert()
    _ld.subVectors(_nx, _bw)
    if (_ld.lengthSq() < 1e-12) return
    bone.quaternion.setFromUnitVectors(this.restLocal, _ld.normalize().applyQuaternion(_pqi))
    if (this.fresh) { bone.updateMatrix(); bone.matrixWorld.multiplyMatrices(parent.matrixWorld, bone.matrix) }
  }
}

function setup(count: number, segments: number) {
  const scene = new THREE.Scene()
  const app = new THREE.Group()
  scene.add(app)
  let head: THREE.Object3D = app
  for (let i = 0; i < 14; i++) { const g = new THREE.Group(); g.position.set(0.01, 0.05, 0); g.rotation.set(0.01, 0.02 * i, 0); head.add(g); head = g }
  const skull = new THREE.Object3D(); head.add(skull)
  const segLen = 0.34 / segments
  const chains: THREE.Object3D[][] = []
  for (let l = 0; l < count; l++) {
    const a = new THREE.Group(); a.position.set(Math.cos(l) * 0.4, 0.2, Math.sin(l) * 0.4); a.rotation.set(0.3 * Math.sin(l), l, 0.2); head.add(a)
    let parent: THREE.Object3D = a
    const list: THREE.Object3D[] = []
    for (let s = 0; s < segments; s++) { const seg = new THREE.Group(); parent.add(seg); list.push(seg); const off = new THREE.Group(); off.position.y = -segLen; seg.add(off); parent = off }
    chains.push(list)
  }
  return { scene, app, head, skull, chains, segLen }
}
const DOWN = new THREE.Vector3(0, -1, 0)
function run(kind: 'actuel' | 'une remontée' | 'parent frais', count: number, segments: number) {
  const s = setup(count, segments)
  const collider = { center: new THREE.Vector3(), radius: 0.43 }
  const cfg = { stiffness: 0, drag: 0, gravity: 0 }
  const springs = s.chains.map((c) => c.map((b) => (kind === 'actuel' ? new SpringBone(b, s.segLen, DOWN) : new Spring2(b, s.segLen, DOWN, kind === 'parent frais'))))
  const tips: THREE.Vector3[] = []
  const f = (i: number) => {
    s.app.rotation.y = Math.sin(i * 0.05) * 1.5; s.app.position.x = Math.sin(i * 0.02) * 2
    if (kind === 'parent frais') s.head.updateWorldMatrix(true, false)
    s.skull.getWorldPosition(collider.center)
    for (const ch of springs) {
      const n = ch.length
      for (let k = 0; k < n; k++) {
        const t = n === 1 ? 0 : k / (n - 1), e = t * t * (3 - 2 * t)
        cfg.stiffness = 0.01 * (1 - e * 0.4); cfg.drag = 0.69; cfg.gravity = 5.3 * (0.7 + e * 0.7)
        if (ch[k] instanceof SpringBone) (ch[k] as SpringBone).update(1 / 60, cfg, collider)
        else (ch[k] as Spring2).update(1 / 60, cfg, [collider])
      }
    }
  }
  bench(`locks ${count}×${segments} ${kind}`, f)
  // équivalence : position des bouts après 300 images
  const s2 = { tips }
  s.scene.updateMatrixWorld(true)
  for (const c of s.chains) tips.push(new THREE.Vector3().setFromMatrixPosition(c[c.length - 1].matrixWorld))
  return s2.tips
}

for (const kind of ['actuel', 'une remontée'] as const) {
  const scene = new THREE.Scene(); const app = new THREE.Group(); scene.add(app)
  let head: THREE.Object3D = app
  for (let i = 0; i < 13; i++) { const g = new THREE.Group(); g.position.y = 0.05; g.rotation.y = 0.02 * i; head.add(g); head = g }
  const bones = Array.from({ length: 32 }, (_, k) => { const o = new THREE.Object3D(); o.position.set(Math.cos(k) * 0.3, 0.2, Math.sin(k) * 0.3); head.add(o); return o })
  const sp = bones.map((b) => kind === 'actuel' ? new SpringBone(b, 0.2, DOWN) : new Spring2(b, 0.2, DOWN, false))
  const cfg = { stiffness: 0.2, drag: 0.5, gravity: 1 }
  bench(`coiffure 32 ressorts ${kind}`, (i) => { app.rotation.y = Math.sin(i * 0.05); sp.forEach((s: any) => s.update(1 / 60, cfg)) })
}
