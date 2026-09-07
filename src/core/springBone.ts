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

  update(dt: number, cfg: SpringConfig, colliders?: Collider | readonly Collider[]) {
    const bone = this.bone
    bone.updateWorldMatrix(true, false)
    _boneWorld.setFromMatrixPosition(bone.matrixWorld)
    this.restWorld(_restDir)
    _restTail.copy(_boneWorld).addScaledVector(_restDir, this.length)

    if (!this.initialised) {
      this.prevTail.copy(_restTail)
      this.currTail.copy(_restTail)
      this.initialised = true
      return
    }

    // Pas de temps borné : une frame longue (onglet en arrière-plan) ferait exploser le ressort.
    const h = Math.min(dt, 1 / 30)
    const step = h * 60

    _next.copy(this.currTail)
    // inertie
    _tmp.subVectors(this.currTail, this.prevTail).multiplyScalar(1 - cfg.drag)
    _next.add(_tmp)
    // rappel élastique vers le repos
    _tmp.subVectors(_restTail, this.currTail).multiplyScalar(cfg.stiffness * step)
    _next.add(_tmp)
    // poids
    _next.addScaledVector(GRAVITY_DIR, cfg.gravity * h)

    // contrainte de longueur : l'os ne s'étire pas
    _next.sub(_boneWorld).normalize().multiplyScalar(this.length).add(_boneWorld)

    if (colliders) {
      // Sans ça, la gravité fait plonger la chaîne à l'intérieur du corps :
      // rien dans un système de ressorts ne connaît sa forme. Plusieurs sphères
      // plutôt qu'une seule — un corps allongé n'est pas approchable par une
      // sphère, et une chaîne plus longue que celle-ci ressort en dessous.
      const list = Array.isArray(colliders) ? colliders : [colliders as Collider]
      for (const c of list) {
        _push.subVectors(_next, c.center)
        const d = _push.length()
        if (d > 1e-6 && d < c.radius) {
          _next.copy(c.center).addScaledVector(_push, c.radius / d)
          // On rétablit la longueur après le dégagement, sinon l'os s'allonge.
          _next.sub(_boneWorld).normalize().multiplyScalar(this.length).add(_boneWorld)
        }
      }
    }

    this.prevTail.copy(this.currTail)
    this.currTail.copy(_next)

    // On repasse la direction obtenue dans l'espace du parent pour en faire une rotation locale.
    const parent = bone.parent
    if (parent) parent.getWorldQuaternion(_parentQuatInv).invert()
    else _parentQuatInv.identity()
    _localDir.subVectors(this.currTail, _boneWorld).normalize().applyQuaternion(_parentQuatInv)
    bone.quaternion.setFromUnitVectors(this.restLocal, _localDir)
  }
}
