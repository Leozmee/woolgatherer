import { clamp } from './rand'

/**
 * État de la platine tournante, hors React.
 *
 * C'est la poupée qui tourne, pas la caméra : sans ça les spring bones ne
 * verraient aucun mouvement et les membres resteraient inertes.
 */
export const turntable = {
  yaw: 0,
  pitch: 0.05,
  /** Vitesses angulaires, en rad/frame. */
  vYaw: 0,
  vPitch: 0,
  distance: 4.4,
  /**
   * Recadrage, en **unités monde**.
   *
   * Pas en pixels : un recadrage en pixels se retraduit à chaque frame avec la
   * distance du moment, donc il enfle en dézoomant et le sujet part hors champ.
   * En unités monde le cadrage reste où on l'a mis, quel que soit le zoom.
   */
  panX: 0,
  panY: 0,
  /**
   * Unités monde par pixel à la distance courante — écrit par le rig, seul à
   * connaître l'ouverture de la caméra et la hauteur du viewport. C'est ce qui
   * rend le geste 1:1 sous les doigts.
   */
  worldPerPixel: 0.004,
  dragging: false,
  /** Passe à false dès la première interaction. */
  idle: true,
}

export const PITCH_MIN = -0.45
export const PITCH_MAX = 0.55
const DRAG_TO_RAD = 0.0075
/** Recadrage maximal, en unités monde : on ne peut pas perdre la poupée hors champ. */
const PAN_MAX = 2.4
const DIST_MIN = 1.4
const DIST_MAX = 12

let lastX = 0
let lastY = 0

export function bindTurntable(el: HTMLElement) {
  const down = (e: PointerEvent) => {
    turntable.dragging = true
    turntable.idle = false
    lastX = e.clientX
    lastY = e.clientY
    el.setPointerCapture(e.pointerId)
    el.classList.add('dragging')
  }

  const move = (e: PointerEvent) => {
    if (!turntable.dragging) return
    const dx = e.clientX - lastX
    const dy = e.clientY - lastY
    lastX = e.clientX
    lastY = e.clientY
    turntable.vYaw = dx * DRAG_TO_RAD
    turntable.vPitch = dy * DRAG_TO_RAD
  }

  const up = (e: PointerEvent) => {
    if (!turntable.dragging) return
    turntable.dragging = false
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)
    el.classList.remove('dragging')
  }

  /**
   * Molette et trackpad.
   *
   * Un pincement à deux doigts arrive comme un `wheel` avec `ctrlKey` — c'est
   * la convention que tous les navigateurs suivent, et le seul signal qui
   * distingue un pincement d'un glissement. Pincer zoome donc, glisser recadre.
   * Une molette de souris garde le zoom avec la même touche.
   */
  const wheel = (e: WheelEvent) => {
    e.preventDefault()
    turntable.idle = false

    if (e.ctrlKey || e.metaKey) {
      // Zoom **multiplicatif** : un pincement doit couvrir toute la plage d'un
      // geste. En additif, chaque cran vaut la même distance absolue — le pas
      // devient dérisoire de loin et brutal de près, et il faut recommencer le
      // geste cinq fois pour approcher.
      turntable.distance = clamp(turntable.distance * Math.exp(e.deltaY * 0.03), DIST_MIN, DIST_MAX)
      return
    }

    // Convention du défilement d'un document : `deltaY > 0` fait monter le
    // contenu. Le sujet suit donc les doigts.
    const k = turntable.worldPerPixel
    turntable.panX = clamp(turntable.panX + e.deltaX * k, -PAN_MAX, PAN_MAX)
    turntable.panY = clamp(turntable.panY - e.deltaY * k, -PAN_MAX, PAN_MAX)
  }

  el.addEventListener('pointerdown', down)
  el.addEventListener('pointermove', move)
  el.addEventListener('pointerup', up)
  el.addEventListener('pointercancel', up)
  el.addEventListener('wheel', wheel, { passive: false })

  return () => {
    el.removeEventListener('pointerdown', down)
    el.removeEventListener('pointermove', move)
    el.removeEventListener('pointerup', up)
    el.removeEventListener('pointercancel', up)
    el.removeEventListener('wheel', wheel)
  }
}

/** Intègre la platine d'une frame. `spin` = dérive automatique tant qu'on n'a rien touché. */
export function stepTurntable(dt: number, spin: number) {
  const step = Math.min(dt, 1 / 30) * 60

  if (turntable.idle && spin !== 0) turntable.vYaw = spin * 0.01

  turntable.yaw += turntable.vYaw * step
  turntable.pitch = clamp(turntable.pitch + turntable.vPitch * step, PITCH_MIN, PITCH_MAX)

  if (!turntable.dragging) {
    // Inertie après relâchement : la poupée continue puis s'immobilise.
    const decay = turntable.idle ? 1 : Math.pow(0.94, step)
    turntable.vYaw *= decay
    turntable.vPitch *= decay
    if (Math.abs(turntable.vYaw) < 1e-5) turntable.vYaw = 0
    if (Math.abs(turntable.vPitch) < 1e-5) turntable.vPitch = 0
  }
}
