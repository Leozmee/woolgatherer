import * as THREE from 'three'
import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { ContactShadows, Environment, Lightformer } from '@react-three/drei'
import type { Lighting } from './toon'
import type { Fighter } from '../doll/fighter'

const KEY: [number, number, number] = [3.4, 4.6, 3.2]

/**
 * Éclairage studio, entièrement local : l'environnement est peint avec des
 * Lightformer et rendu en cubemap, donc aucun HDRI n'est téléchargé.
 *
 * Le contre-jour n'est pas décoratif : combiné au `sheen` du matériau, c'est
 * lui qui allume le duvet sur le contour et fait lire « laine » plutôt que
 * « plastique mat ».
 *
 * Dans l'arène (`follow`) la poupée court loin de l'origine : la lumière qui
 * porte l'ombre et les ombres de contact la suivent — fixes, elles ne
 * couvraient que 2,5 unités autour du centre.
 */
export function Lights({
  floorY,
  contact = true,
  lighting,
  follow,
}: {
  floorY: number
  follow?: Fighter | null
  contact?: boolean
  /** Dosage des lumières, propre à chaque rendu (voir `toon.ts`). */
  lighting: Lighting
}) {
  const scene = useThree((st) => st.scene)
  const key = useRef<THREE.DirectionalLight>(null)
  const contactGroup = useRef<THREE.Group>(null)
  useFrame(() => {
    const x = follow?.pos.x ?? 0
    const z = follow?.pos.z ?? 0
    const k = key.current
    if (k) {
      k.position.set(KEY[0] + x, KEY[1], KEY[2] + z)
      k.target.position.set(x, 0, z)
      k.target.updateMatrixWorld()
    }
    contactGroup.current?.position.set(x, 0, z)
  })
  useEffect(() => {
    scene.environmentIntensity = lighting.env
  }, [scene, lighting.env])
  return (
    <>
      <ambientLight intensity={lighting.ambient} color={lighting.ambientColor ?? '#ffffff'} />

      {/* clé — porte l'ombre */}
      <directionalLight
        ref={key}
        position={KEY}
        intensity={lighting.key}
        color={lighting.keyColor ?? '#ffffff'}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0009}
        shadow-normalBias={0.02}
        shadow-camera-left={-2.5}
        shadow-camera-right={2.5}
        shadow-camera-top={2.5}
        shadow-camera-bottom={-2.5}
        shadow-camera-near={0.5}
        shadow-camera-far={14}
      />

      {/* déboucheur froid, côté opposé */}
      <directionalLight position={[-3.4, 1.4, 2.2]} intensity={lighting.fill} color={lighting.fillColor ?? '#cdd8e8'} />

      {/* contre-jour rasant */}
      <directionalLight position={[-1.1, 2.1, -4.2]} intensity={lighting.rim} color={lighting.rimColor ?? '#ffe6c8'} />

      <Environment resolution={256}>
        <Lightformer intensity={1.1} position={[0, 5, 1]} scale={[9, 9, 1]} color="#fffaf2" />
        <Lightformer intensity={0.6} position={[-4, 1, 3]} scale={[5, 6, 1]} color="#ffe8cf" />
        <Lightformer intensity={0.9} position={[3, 1.5, -4]} scale={[6, 6, 1]} color="#dbe5f4" />
        <Lightformer intensity={0.3} position={[0, -3, 0]} scale={[8, 8, 1]} color="#e8e2d6" />
      </Environment>

      {contact && (
      <group ref={contactGroup}>
      <ContactShadows
        position={[0, floorY, 0]}
        opacity={0.45}
        scale={5}
        blur={2.6}
        far={2.2}
        resolution={512}
        color="#4a4038"
      />
      </group>
      )}
    </>
  )
}
