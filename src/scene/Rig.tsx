import * as THREE from 'three'
import { useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { stepTurntable, turntable } from '../core/turntable'
import type { Fighter } from '../doll/fighter'

/**
 * Caméra et platine tournante.
 *
 * Sorti de `Doll` : avec trois poupées à l'écran, la platine était intégrée et
 * la caméra repositionnée trois fois par frame. Ce composant doit être monté
 * **avant** les poupées dans l'arbre, pour que son `useFrame` s'exécute en
 * premier et qu'elles lisent une rotation déjà à jour.
 *
 * Dans l'arène (`follow`), la poupée se déplace elle-même : la platine fait
 * alors **tourner la caméra** autour d'elle, et la caméra la suit avec un
 * léger retard — un suivi collé au pixel rend chaque à-coup du personnage
 * désagréable à l'œil. La secousse des impacts s'ajoute par-dessus.
 */
export function Rig({
  spin,
  distanceScale,
  follow,
}: {
  spin: number
  distanceScale: number
  follow?: Fighter | null
}) {
  const aim = useMemo(() => new THREE.Vector3(), [])
  const zoom = useMemo(() => ({ v: 1 }), [])
  useFrame((state, dt) => {
    if (import.meta.env.DEV) {
      const w = window as unknown as Record<string, number>
      w.__frames = (w.__frames ?? 0) + 1
    }
    stepTurntable(dt, spin)

    const cam = state.camera as THREE.PerspectiveCamera
    // Au sprint la caméra recule un peu : la vitesse se lit mieux de loin.
    zoom.v += ((follow ? 1 + 0.12 * follow.dash : 1) - zoom.v) * Math.min(1, dt * 2)
    const dist = turntable.distance * distanceScale * zoom.v

    // Barème du geste, republié à chaque frame pour le gestionnaire de molette :
    // c'est ici qu'on connaît l'ouverture de la caméra et la hauteur du viewport.
    turntable.worldPerPixel = (2 * dist * Math.tan((cam.fov * Math.PI) / 360)) / state.size.height

    if (follow) {
      // Un peu d'avance dans le sens de la course : au sprint, suivie avec
      // retard, la poupée sortait par le bord arrière du cadre. Le saut n'est
      // suivi qu'à moitié : on voit qu'elle monte.
      aim.lerp(
        _t.set(follow.pos.x + follow.vel.x * 0.18, 0.05 + follow.pos.y * 0.4, follow.pos.z + follow.vel.z * 0.18),
        1 - Math.exp(-dt * 5),
      )
      const yaw = turntable.yaw
      // Vue plongeante de jeu : on voit le sol autour de la poupée.
      const pitch = 0.42 + turntable.pitch * 0.8
      follow.camYaw = yaw
      const sh = follow.shake * 0.06
      cam.position.set(
        aim.x + Math.sin(yaw) * Math.cos(pitch) * dist + (Math.random() - 0.5) * sh,
        aim.y + Math.sin(pitch) * dist + (Math.random() - 0.5) * sh,
        aim.z + Math.cos(yaw) * Math.cos(pitch) * dist,
      )
      cam.lookAt(aim)
      return
    }
    aim.set(0, 0, 0)

    // Recadrage : la caméra et sa cible se déplacent **ensemble**, sinon on
    // pivote autour du sujet au lieu de le déplacer dans le cadre.
    cam.position.set(turntable.panX, 0.18 + turntable.panY, dist)
    cam.lookAt(turntable.panX, turntable.panY, 0)
    // −2 : avant les poupées (−1), qui lisent la platine.
  }, -2)
  return null
}

const _t = new THREE.Vector3()
