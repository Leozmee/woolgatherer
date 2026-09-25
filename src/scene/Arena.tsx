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
