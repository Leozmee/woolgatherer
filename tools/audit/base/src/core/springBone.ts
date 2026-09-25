import * as THREE from 'three'

export type SpringConfig = {
  /** Rappel vers la pose de repos. 0 = membre totalement mou, 1 = rigide. */
  stiffness: number
  /** Amortissement de l'inertie. 0 = ballotte sans fin, 1 = s'arrête net. */
  drag: number
  /** Poids ressenti du membre. */
  gravity: number
}

const _boneWorld = new THREE.Vector3()
const _parentQuat = new THREE.Quaternion()
const _parentQuatInv = new THREE.Quaternion()
const _restDir = new THREE.Vector3()
const _restTail = new THREE.Vector3()
const _next = new THREE.Vector3()
const _tmp = new THREE.Vector3()
const _localDir = new THREE.Vector3()
const _push = new THREE.Vector3()
const GRAVITY_DIR = new THREE.Vector3(0, -1, 0)
const _b = new THREE.Vector3()
const _r = new THREE.Vector3()
/** Pas de la simulation : celui auquel tous les réglages ont été faits. */
const STEP = 1 / 60

/** Sphère contre laquelle une chaîne ne doit pas s'enfoncer (le crâne). */
export type Collider = { center: THREE.Vector3; radius: number }

/**
 * Spring bone façon VRM : la queue de l'os poursuit sa position de repos avec
 * du retard. Quand le parent tourne, la pose de repos se déplace dans le monde
 * mais la queue traîne — d'où le ballottement.
 *
 * On ne simule pas une chaîne : un os par membre suffit pour une peluche.
 */
export class SpringBone {
  private prevTail = new THREE.Vector3()
  private currTail = new THREE.Vector3()
  private restLocal: THREE.Vector3
  private initialised = false
  /** Temps écoulé non encore simulé, moins d'un pas. */
  private acc = 0
  /** Articulation et bout de repos à l'image précédente, pour les sous-pas. */
  private lastBone = new THREE.Vector3()
  private lastRest = new THREE.Vector3()

  constructor(
    private bone: THREE.Object3D,
    private length: number,
    /** Direction du membre dans son espace local, au repos. */
    restLocal = new THREE.Vector3(0, -1, 0),
  ) {
    this.restLocal = restLocal.clone().normalize()
  }

  setLength(length: number) {
    this.length = length
  }

  private restWorld(target: THREE.Vector3) {
    const parent = this.bone.parent
    if (parent) parent.getWorldQuaternion(_parentQuat)
    else _parentQuat.identity()
    target.copy(this.restLocal).applyQuaternion(_parentQuat).normalize()
  }

  /**
   * **Pas fixe de 1/60 s.** Les réglages sont donnés « par image à 60 i/s » ;
   * appliqués à chaque image, un écran à 120 ou 144 Hz amortissait deux fois
   * plus (le `drag` tombait deux fois plus souvent) et un 30 Hz ballottait
   * sans fin. Une conversion en taux ne suffit pas — elle déplaçait
   * l'équilibre sous la gravité. On avance donc toujours par pas de 1/60 s,
   * autant qu'il en tient dans le temps écoulé : zéro, un ou plusieurs par
   * image. Pendant les sous-pas, l'articulation et le repos sont interpolés
   * sur l'image ; à l'affichage, le bout est extrapolé de la fraction de pas
   * restante, pour rester fluide entre deux pas. À 60 i/s c'est exactement
   * l'ancien calcul.
   */
  update(dt: number, cfg: SpringConfig, colliders?: Collider | readonly Collider[]) {
    const bone = this.bone
    bone.updateWorldMatrix(true, false)
    _boneWorld.setFromMatrixPosition(bone.matrixWorld)
    this.restWorld(_restDir)
    _restTail.copy(_boneWorld).addScaledVector(_restDir, this.length)

    if (!this.initialised) {
      this.prevTail.copy(_restTail)
      this.currTail.copy(_restTail)
      this.lastBone.copy(_boneWorld)
      this.lastRest.copy(_restTail)
      this.initialised = true
      return
    }

    // Image longue (onglet en arrière-plan) : bornée, sinon le ressort
    // rattraperait des secondes d'un coup.
    const span = Math.min(Math.max(dt, 0), 1 / 15)
    const acc0 = this.acc
    this.acc += span
    const n = Math.floor(this.acc / STEP + 1e-6)
    this.acc = Math.max(0, this.acc - n * STEP)
    const list = colliders ? (Array.isArray(colliders) ? colliders : [colliders as Collider]) : null
    for (let k = 1; k <= n; k++) {
      const u = span > 0 ? Math.min(1, Math.max(0, (k * STEP - acc0) / span)) : 1
      _b.lerpVectors(this.lastBone, _boneWorld, u)
      _r.lerpVectors(this.lastRest, _restTail, u)
      this.step(_b, _r, cfg, list)
    }
    this.lastBone.copy(_boneWorld)
    this.lastRest.copy(_restTail)

    // Affichage : le bout extrapolé de la fraction de pas en cours.
    _next.subVectors(this.currTail, this.prevTail).multiplyScalar(this.acc / STEP).add(this.currTail)

    // On repasse la direction obtenue dans l'espace du parent pour en faire une rotation locale.
    const parent = bone.parent
    if (parent) parent.getWorldQuaternion(_parentQuatInv).invert()
    else _parentQuatInv.identity()
    _localDir.subVectors(_next, _boneWorld)
    if (_localDir.lengthSq() < 1e-12) return
    _localDir.normalize().applyQuaternion(_parentQuatInv)
    bone.quaternion.setFromUnitVectors(this.restLocal, _localDir)
  }

  /** Un pas de 1/60 s : l'articulation en `origin`, le bout visé en `rest`. */
  private step(origin: THREE.Vector3, rest: THREE.Vector3, cfg: SpringConfig, colliders: readonly Collider[] | null) {
    _next.copy(this.currTail)
    // inertie
    _tmp.subVectors(this.currTail, this.prevTail).multiplyScalar(1 - cfg.drag)
    _next.add(_tmp)
    // rappel élastique vers le repos
    _tmp.subVectors(rest, this.currTail).multiplyScalar(cfg.stiffness)
    _next.add(_tmp)
    // poids
    _next.addScaledVector(GRAVITY_DIR, cfg.gravity * STEP)

    // contrainte de longueur : l'os ne s'étire pas
    _next.sub(origin).normalize().multiplyScalar(this.length).add(origin)

    if (colliders) {
      // Sans ça, la gravité fait plonger la chaîne à l'intérieur du corps :
      // rien dans un système de ressorts ne connaît sa forme. Plusieurs sphères
      // plutôt qu'une seule — un corps allongé n'est pas approchable par une
      // sphère, et une chaîne plus longue que celle-ci ressort en dessous.
      for (const c of colliders) {
        _push.subVectors(_next, c.center)
        const d = _push.length()
        if (d > 1e-6 && d < c.radius) {
          _next.copy(c.center).addScaledVector(_push, c.radius / d)
          // On rétablit la longueur après le dégagement, sinon l'os s'allonge.
          _next.sub(origin).normalize().multiplyScalar(this.length).add(origin)
        }
      }
    }

    this.prevTail.copy(this.currTail)
    this.currTail.copy(_next)
  }
}
