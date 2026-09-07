import * as THREE from 'three'

/**
 * Ombre au sol approchée : un disque à dégradé radial.
 *
 * `ContactShadows` de drei rend une passe hors écran par instance — six
 * poupées coûteraient six passes par frame. Ici c'est un seul appel de rendu et
 * une texture partagée, ce qui suffit largement à ancrer les poupées au sol
 * dans une planche de comparaison.
 */
let cached: THREE.CanvasTexture | null = null

function blobTexture() {
  if (cached) return cached
  const size = 256
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')!
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(74,64,56,0.55)')
  g.addColorStop(0.45, 'rgba(74,64,56,0.28)')
  g.addColorStop(1, 'rgba(74,64,56,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  cached = new THREE.CanvasTexture(c)
  return cached
}

export function BlobShadow({ y, radius }: { y: number; radius: number }) {
  return (
    <mesh position={[0, y, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[radius * 2, radius * 2]} />
      <meshBasicMaterial map={blobTexture()} transparent depthWrite={false} />
    </mesh>
  )
}
