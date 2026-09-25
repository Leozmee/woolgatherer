import * as THREE from 'three'
import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Fighter } from '../doll/fighter'

/** Échantillons de la traînée ; trois par image, interpolés. */
const N = 36
const SUB = 3

/**
 * Traînée de l'arme : le ruban balayé par la lame pendant un coup.
 *
 * C'est elle qui fait lire la frappe comme **un arc**, pas comme une pose qui
 * saute à la suivante : à cette vitesse l'œil ne voit que deux images de la
 * lame. Bord extérieur opaque, bord intérieur transparent, et tout s'efface en
 * un dixième de seconde. Elle s'allume selon `fighter.trail`, que chaque phase
 * de geste règle.
 */
export function WeaponTrail({ fighter }: { fighter: Fighter }) {
  const trail = useMemo(() => {
    const pos = new Float32Array(N * 2 * 3)
    const alpha = new Float32Array(N * 2)
    const index: number[] = []
    for (let i = 0; i < N - 1; i++) {
      const a = i * 2
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1))
    geo.setIndex(index)
    const mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color('#6f7c96') } },
      vertexShader: /* glsl */ `
        attribute float aAlpha;
        varying float vAlpha;
        void main() {
          vAlpha = aAlpha;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        varying float vAlpha;
        void main() {
          gl_FragColor = vec4(uColor, vAlpha);
        }`,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    })
    return {
      geo,
      mat,
      tip: Array.from({ length: N }, () => new THREE.Vector3()),
      mid: Array.from({ length: N }, () => new THREE.Vector3()),
      a: new Float32Array(N),
      lastTip: new THREE.Vector3(),
      lastMid: new THREE.Vector3(),
      started: false,
    }
  }, [])
  useEffect(
    () => () => {
      trail.geo.dispose()
      trail.mat.dispose()
    },
    [trail],
  )

  useFrame((_, dt) => {
    const t = trail
    if (!t.started) {
      t.lastTip.copy(fighter.tipWorld)
      t.lastMid.copy(fighter.midWorld)
      t.started = true
    }
    // Décalage de l'historique, puis SUB échantillons interpolés depuis
    // l'image précédente : à 60 i/s une frappe ne dure que sept images.
    for (let i = N - 1; i >= SUB; i--) {
      t.tip[i].copy(t.tip[i - SUB])
      t.mid[i].copy(t.mid[i - SUB])
      t.a[i] = t.a[i - SUB]
    }
    for (let k = 0; k < SUB; k++) {
      const u = 1 - k / SUB
      t.tip[k].lerpVectors(t.lastTip, fighter.tipWorld, u)
      t.mid[k].lerpVectors(t.lastMid, fighter.midWorld, u)
      t.a[k] = fighter.trail
    }
    t.lastTip.copy(fighter.tipWorld)
    t.lastMid.copy(fighter.midWorld)
    const fade = Math.exp(-dt * 20)
    for (let i = SUB; i < N; i++) t.a[i] *= fade

    const pos = t.geo.attributes.position as THREE.BufferAttribute
    const alpha = t.geo.attributes.aAlpha as THREE.BufferAttribute
    for (let i = 0; i < N; i++) {
      pos.setXYZ(i * 2, t.tip[i].x, t.tip[i].y, t.tip[i].z)
      pos.setXYZ(i * 2 + 1, t.mid[i].x, t.mid[i].y, t.mid[i].z)
      const edge = t.a[i] * (1 - i / N) ** 1.5 * 0.6
      alpha.setX(i * 2, edge)
      alpha.setX(i * 2 + 1, 0)
    }
    pos.needsUpdate = true
    alpha.needsUpdate = true
  })

  return <mesh geometry={trail.geo} material={trail.mat} frustumCulled={false} renderOrder={10} />
}

// ---------------------------------------------------------------- poussière

/** Boules par bouffée, et bouffées vivantes au plus. */
const PER_PUFF = 5
const MAX_BALLS = 120
const LIFE = 0.5

type Ball = { x: number; y: number; z: number; vx: number; vy: number; vz: number; size: number; age: number }

/**
 * Bouffées de laine soulevées au sol : sous chaque pas de sprint, à la
 * réception d'un saut, dans une glissade, à l'impact de l'arme. De petites
 * boules de duvet qui gonflent vite puis fondent — opaques, pour que le trait
 * d'encre les cerne comme le reste. Sur un fond blanc sans repère, ce sont
 * elles qui disent la vitesse.
 */
export function Dust({ fighter }: { fighter: Fighter }) {
  const mesh = useMemo(() => {
    const geo = new THREE.IcosahedronGeometry(1, 1)
    const mat = new THREE.MeshStandardMaterial({ color: '#f1ebe1', roughness: 1 })
    const m = new THREE.InstancedMesh(geo, mat, MAX_BALLS)
    m.frustumCulled = false
    m.count = 0
    return m
  }, [])
  useEffect(
    () => () => {
      mesh.geometry.dispose()
      ;(mesh.material as THREE.Material).dispose()
    },
    [mesh],
  )
  const balls = useMemo<Ball[]>(() => [], [])

  useFrame((_, realDt) => {
    const dt = Math.min(realDt, 1 / 20)
    for (const p of fighter.puffs.splice(0)) {
      for (let i = 0; i < PER_PUFF; i++) {
        if (balls.length >= MAX_BALLS) balls.shift()
        const a = Math.random() * Math.PI * 2
        const r = p.size * (0.1 + Math.random() * 0.25)
        balls.push({
          x: p.x + Math.cos(a) * r,
          y: p.y + p.size * 0.05,
          z: p.z + Math.sin(a) * r,
          vx: Math.cos(a) * p.size * 1.6,
          vy: p.size * (0.6 + Math.random() * 0.8),
          vz: Math.sin(a) * p.size * 1.6,
          // Petites : grosses, elles lisaient comme des boules de neige.
          size: p.size * (0.055 + Math.random() * 0.06),
          age: 0,
        })
      }
    }
    let n = 0
    for (let i = balls.length - 1; i >= 0; i--) {
      const b = balls[i]
      b.age += dt
      if (b.age >= LIFE) {
        balls.splice(i, 1)
        continue
      }
      // Freinée par l'air : la laine ne vole pas loin.
      const drag = Math.exp(-dt * 6)
      b.vx *= drag
      b.vy *= drag
      b.vz *= drag
      b.x += b.vx * dt
      b.y += b.vy * dt
      b.z += b.vz * dt
      const u = b.age / LIFE
      // Gonfle en un cinquième de sa vie, puis fond.
      const k = u < 0.2 ? u / 0.2 : 1 - (u - 0.2) / 0.8
      _o.position.set(b.x, b.y, b.z)
      _o.scale.setScalar(Math.max(1e-4, b.size * (0.6 + 0.4 * k) * Math.sqrt(k)))
      _o.updateMatrix()
      mesh.setMatrixAt(n++, _o.matrix)
    }
    mesh.count = n
    mesh.instanceMatrix.needsUpdate = true
  })

  return <primitive object={mesh} />
}

const _o = new THREE.Object3D()

// ---------------------------------------------------------------- tapis

/**
 * Le tapis de l'arène : une couture en points avant qui en marque le bord, et
 * quelques croix de fil semées dessus. Sans eux, sur le blanc, rien ne bouge
 * autour de la poupée quand la caméra la suit — on ne voit pas qu'elle court.
 */
export function ArenaFloor({ y, radius }: { y: number; radius: number }) {
  const { ring, crosses } = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({ color: '#d8cdbb', roughness: 1 })
    const matX = new THREE.MeshStandardMaterial({ color: '#e7dfd2', roughness: 1 })
    const R = radius + 0.25
    const n = Math.round((2 * Math.PI * R) / 0.34)
    const ring = new THREE.InstancedMesh(new THREE.BoxGeometry(0.17, 0.01, 0.035), mat, n)
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2
      _o.position.set(Math.cos(a) * R, 0, Math.sin(a) * R)
      _o.rotation.set(0, -a + Math.PI / 2, 0)
      _o.scale.setScalar(1)
      _o.updateMatrix()
      ring.setMatrixAt(i, _o.matrix)
    }
    // Croix : deux points croisés, semés au hasard (graine fixe) sur le disque.
    let seed = 7
    const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
    const count = 90
    const crosses = new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 0.008, 0.022), matX, count * 2)
    for (let i = 0; i < count; i++) {
      const r = Math.sqrt(rnd()) * radius
      const a = rnd() * Math.PI * 2
      const turn = rnd() * Math.PI
      for (let k = 0; k < 2; k++) {
        _o.position.set(Math.cos(a) * r, 0, Math.sin(a) * r)
        _o.rotation.set(0, turn + (k ? Math.PI / 4 : -Math.PI / 4), 0)
        _o.updateMatrix()
        crosses.setMatrixAt(i * 2 + k, _o.matrix)
      }
    }
    ring.receiveShadow = true
    crosses.receiveShadow = true
    return { ring, crosses }
  }, [radius])
  useEffect(
    () => () => {
      for (const m of [ring, crosses]) {
        m.geometry.dispose()
        ;(m.material as THREE.Material).dispose()
      }
    },
    [ring, crosses],
  )
  return (
    <group position={[0, y + 0.004, 0]}>
      <primitive object={ring} />
      <primitive object={crosses} />
    </group>
  )
}
