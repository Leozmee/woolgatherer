import * as THREE from 'three'

/**
 * Membres de peluche : des boudins de tissu, pas des bâtons.
 *
 * Deux choses faisaient « poupée rigide » : des jambes qui pivotent en bloc à
 * la hanche — les pieds glissent et flottent sous un corps qui avance — et des
 * membres qui restent droits quoi qu'il arrive. Ici :
 *
 * - **les pieds se posent** (`Stepper`) : chacun reste planté au sol tant que
 *   le corps passe au-dessus, puis fait un pas quand il est trop loin de là où
 *   il devrait être. La jambe se réoriente pour rejoindre son pied, s'étire ou
 *   se tasse — c'est ce qui les ancre au sol ;
 * - **les membres se courbent** (`bowShader`) : le milieu du boudin sort de
 *   l'axe, les deux bouts restent en place. Une jambe tassée plie comme un
 *   genou de tissu, un bras qui traîne derrière son mouvement se cambre comme
 *   une corde molle.
 */

// ---------------------------------------------------------------- courbure

/** Courbure d'un membre : décalage du milieu, dans le repère du membre. */
export type Bow = { uBow: { value: THREE.Vector3 }; uLen: { value: number } }

export function makeBow(length: number): Bow {
  return { uBow: { value: new THREE.Vector3() }, uLen: { value: length } }
}

/**
 * Le membre descend le long de −y depuis l'articulation : chaque sommet est
 * décalé de `uBow × sin(π t)`, `t` allant de 0 à l'épaule à 1 au bout. Les deux
 * extrémités ne bougent pas — main et pied restent où ils sont. À composer
 * avec d'autres injections (duvet) : on ne touche qu'à `begin_vertex`.
 */
export function bowShader(bow: Bow) {
  return (sh: THREE.WebGLProgramParametersWithUniforms) => {
    sh.uniforms.uBow = bow.uBow
    sh.uniforms.uLen = bow.uLen
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uBow;\nuniform float uLen;')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\ntransformed += uBow * sin(3.14159265 * clamp(-position.y / uLen, 0.0, 1.0));',
      )
  }
}

// ---------------------------------------------------------------- pas

type Foot = {
  /** Où le pied est posé. */
  plant: THREE.Vector3
  /** Où il est, pas en cours compris. */
  pos: THREE.Vector3
  from: THREE.Vector3
  to: THREE.Vector3
  t: number
  dur: number
  lift: number
  swinging: boolean
  /** Vitesse du pied, pour cambrer la jambe qui traîne. */
  vel: THREE.Vector3
}

const newFoot = (): Foot => ({
  plant: new THREE.Vector3(),
  pos: new THREE.Vector3(),
  from: new THREE.Vector3(),
  to: new THREE.Vector3(),
  t: 0,
  dur: 0.2,
  lift: 0,
  swinging: false,
  vel: new THREE.Vector3(),
})

const _ideal = new THREE.Vector3()
const _prev = new THREE.Vector3()

/**
 * Pas procéduraux : un pied à la fois, posé là où la poupée va être.
 *
 * Chaque pied a une place idéale — sous sa hanche, un peu en avant dans la
 * direction de la course. Tant qu'il n'en est pas trop loin, il reste planté
 * **au sol, en repère monde** : le corps passe au-dessus et la jambe s'incline.
 * Au-delà, il fait un pas en arc vers cette place, avec un peu d'avance pour ne
 * pas courir derrière. Jamais les deux pieds en l'air : c'est ce qui donne le
 * rythme. À l'arrêt, un petit pas de rattrapage replace les pieds.
 */
export class Stepper {
  readonly feet: Record<-1 | 1, Foot> = { [-1]: newFoot(), 1: newFoot() }
  /** Part de l'ancrage (0 : pose du geste seule, 1 : pieds au sol). */
  weight = 0
  private ready = false
  /** Dernier pied posé : en course, c'est l'autre qui part. */
  private last: -1 | 1 = 1

  update(
    dt: number,
    o: {
      /** Position monde de la racine, et son cap. */
      root: THREE.Vector3
      facing: number
      vel: THREE.Vector3
      /** Pied au repos, repère de la racine (hauteur comprise). */
      rest: Record<-1 | 1, THREE.Vector3>
      /**
       * Hanches **réelles**, repère monde. La place d'un pied se prend sous
       * elles, pas sous la racine : une fente, un penché ou une torsion
       * déplacent les hanches sans la racine, et la jambe s'étirait à une
       * fois et demie sa longueur pendant les coups.
       */
      hips?: Record<-1 | 1, THREE.Vector3>
      /** Écart latéral du pied sous sa hanche, repère de la racine. */
      splay?: number
      /** Au sol et libre d'y marcher (pas en roulade, pas en l'air). */
      grounded: boolean
      legLength: number
      onLand?: (side: -1 | 1, speed: number, dur: number) => void
    },
  ) {
    this.weight += ((o.grounded ? 1 : 0) - this.weight) * Math.min(1, dt * 14)
    const speed = Math.hypot(o.vel.x, o.vel.z)
    const moving = speed > 0.25
    const cf = Math.cos(o.facing)
    const sf = Math.sin(o.facing)
    const ideal = (side: -1 | 1) => {
      const r = o.rest[side]
      const h = o.hips?.[side]
      if (h) {
        const lx = side * (o.splay ?? 0)
        return _ideal.set(h.x + lx * cf, o.root.y + r.y, h.z - lx * sf)
      }
      return _ideal.set(o.root.x + r.x * cf + r.z * sf, o.root.y + r.y, o.root.z - r.x * sf + r.z * cf)
    }

    for (const side of [-1, 1] as const) {
      const f = this.feet[side]
      _prev.copy(f.pos)
      if (!this.ready || !o.grounded) {
        // En l'air ou en roulade, les pieds suivent le corps ; ils se
        // reposeront à l'atterrissage.
        f.plant.copy(ideal(side))
        f.pos.copy(f.plant)
        f.swinging = false
      } else if (f.swinging) {
        f.t += dt / f.dur
        const u = Math.min(1, f.t)
        const e = u * u * (3 - 2 * u)
        /*
         * Cible **recalculée à chaque image** : là où sera la hanche à
         * l'atterrissage, plus une demi-course d'appui. Figée au départ du pas,
         * elle laissait le corps avancer encore de toute sa course pendant le
         * pas — mesuré, les pieds se posaient derrière la hanche, jamais
         * devant, et la jambe traînait à 1,8 fois sa longueur. Recalculée,
         * elle suit aussi un changement de direction en plein pas.
         */
        f.to.copy(ideal(side)).addScaledVector(o.vel, f.dur * (1 - u) + f.dur * 0.5)
        f.pos.lerpVectors(f.from, f.to, e)
        f.pos.y += f.lift * Math.sin(Math.PI * u)
        if (u >= 1) {
          f.swinging = false
          f.plant.copy(f.to)
          this.last = side
          o.onLand?.(side, speed, f.dur)
        }
      } else {
        f.pos.copy(f.plant)
      }
      f.vel.subVectors(f.pos, _prev).divideScalar(Math.max(dt, 1e-4))
    }
    this.ready = true
    if (!o.grounded) return

    /*
     * Rattrapage : un pied planté resté trop loin — poussée brutale d'une
     * fente ou d'un coup reçu — part tout de suite, même si l'autre est en
     * l'air. Sans lui la jambe s'étirait à plus d'une fois et demie sa
     * longueur dans 1 % des images, et le pied décrochait de son appui.
     */
    for (const sd of [-1, 1] as const) {
      const f = this.feet[sd]
      if (f.swinging) continue
      const i = ideal(sd)
      if (Math.hypot(f.plant.x - i.x, f.plant.z - i.z) < o.legLength * 0.75) continue
      f.dur = 0.11
      f.lift = 0.22 * o.legLength
      f.from.copy(f.plant)
      f.to.copy(i).addScaledVector(o.vel, f.dur * 1.5)
      f.t = 0
      f.swinging = true
    }

    // Un seul pied en l'air : on choisit celui qui est le plus loin de sa place.
    if (this.feet[-1].swinging || this.feet[1].swinging) return
    const stride = o.legLength * 1.4
    /*
     * Durée d'un pas : elle raccourcit avec la vitesse — la cadence monte.
     * Une peluche a de toutes petites jambes : à pas longs, chaque appui
     * balayait plus de sol qu'elles n'en couvrent (jambe à 1,3 fois sa
     * longueur en médiane). Elle trottine : pas vifs et courts.
     */
    const dur = moving ? THREE.MathUtils.clamp(0.22 - speed * 0.05, 0.1, 0.2) : 0.16
    const err = (side: -1 | 1) => {
      const f = this.feet[side]
      const i = ideal(side)
      return Math.hypot(f.plant.x - i.x, f.plant.z - i.z)
    }
    const eL = err(-1)
    const eR = err(1)
    // En course on alterne strictement : choisi à l'écart, le pied tout juste
    // posé — déjà en avance — repartait parfois, et l'autre restait derrière.
    const side: -1 | 1 = moving ? (this.last === 1 ? -1 : 1) : eL > eR ? -1 : 1
    const e = side === -1 ? eL : eR
    /*
     * En course, **à la cadence** : dès qu'un pied se pose, l'autre part. Au
     * seuil de distance, des jambes aussi courtes ne suivaient pas — mesuré,
     * étirées à 1,8 fois leur longueur. Et le pied se pose en avant de la
     * hanche d'une demi-course d'appui : il repart derrière d'autant, et la
     * jambe reste à portée pendant tout l'appui.
     */
    const thresh = moving ? o.legLength * 0.04 : o.legLength * 0.12
    if (e < thresh) return
    const f = this.feet[side]
    f.dur = dur
    f.lift = (moving ? 0.3 : 0.14) * o.legLength
    f.from.copy(f.plant)
    f.to.copy(ideal(side)).addScaledVector(o.vel, dur * 1.5)
    // Trop loin (téléport, fin de roulade) : on repose sans enjamber le monde.
    if (e > stride * 3) {
      f.plant.copy(f.to)
      f.pos.copy(f.to)
      return
    }
    f.t = 0
    f.swinging = true
  }
}
