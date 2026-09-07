import type * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { stepTurntable, turntable } from '../core/turntable'

/**
 * Caméra et platine tournante.
 *
 * Sorti de `Doll` : avec trois poupées à l'écran, la platine était intégrée et
 * la caméra repositionnée trois fois par frame. Ce composant doit être monté
 * **avant** les poupées dans l'arbre, pour que son `useFrame` s'exécute en
 * premier et qu'elles lisent une rotation déjà à jour.
 */
export function Rig({ spin, distanceScale }: { spin: number; distanceScale: number }) {
  useFrame((state, dt) => {
    if (import.meta.env.DEV) {
      const w = window as unknown as Record<string, number>
      w.__frames = (w.__frames ?? 0) + 1
    }
    stepTurntable(dt, spin)

    // Recadrage : la caméra et sa cible se déplacent **ensemble**, sinon on
    // pivote autour du sujet au lieu de le déplacer dans le cadre.
    const cam = state.camera as THREE.PerspectiveCamera
    const dist = turntable.distance * distanceScale

    // Barème du geste, republié à chaque frame pour le gestionnaire de molette :
    // c'est ici qu'on connaît l'ouverture de la caméra et la hauteur du viewport.
    turntable.worldPerPixel = (2 * dist * Math.tan((cam.fov * Math.PI) / 360)) / state.size.height

    cam.position.set(turntable.panX, 0.18 + turntable.panY, dist)
    cam.lookAt(turntable.panX, turntable.panY, 0)
  })
  return null
}
