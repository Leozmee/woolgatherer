import * as THREE from 'three'

/**
 * Membres de peluche : des boudins de tissu, pas des bâtons.
 *
 * Trois choses faisaient « poupée rigide » : des jambes qui pivotent en bloc à
 * la hanche — les pieds glissent et flottent sous un corps qui avance —, des
 * membres qui restent droits quoi qu'il arrive, et l'absence de genou ou de
 * coude. Ici :
 *
 * - **les pieds se posent** (`Stepper`) : chacun reste planté au sol tant que
 *   le corps passe au-dessus, puis fait un pas quand il est trop loin de là où
 *   il devrait être ;
 * - **chaque membre plie à mi-longueur** (`jointShader`) : genou, coude. Le
 *   boudin reste d'un seul tenant — c'est une pièce cousue —, mais sa moitié
 *   basse suit un second os, et la zone de pli se fond sur un quart du membre,
 *   comme un tissu bourré qui se plisse. La jambe rejoint son pied planté par
 *   une IK à deux segments (`solveLeg`) : quand le corps se tasse, le genou
 *   avance au lieu que la jambe rapetisse en télescope.
 */

// ---------------------------------------------------------------- articulation

/** Position de l'articulation, fraction de la longueur du membre. */
export const JOINT = 0.5
/** Demi-largeur de la zone de pli, fraction de la longueur. */
const BLEND = 0.13

/**
 * Pli d'un membre : où il plie, de combien il s'étire, et où est passée sa
 * moitié basse. `uJoint` envoie un sommet de la moitié basse, pris au repos
 * dans le repère du membre, là où l'os du bas l'a emmené.
 */
export type Joint = {
  uJoint: { value: THREE.Matrix4 }
  uJointY: { value: number }
  uBlend: { value: number }
  uStretch: { value: number }
}

export function makeJoint(length: number): Joint {
  return {
    uJoint: { value: new THREE.Matrix4() },
    uJointY: { value: -length * JOINT },
    uBlend: { value: length * BLEND },
    uStretch: { value: 1 },
  }
}

/**
 * Reporte une nouvelle longueur de membre sur un pli **existant**.
 *
 * Les uniformes d'un pli sont liés au shader à sa compilation : remplacer
 * l'objet quand la longueur change laisse le shader lire l'ancien, figé —
 * sur la planche, une poupée aux bras bien plus longs que la précédente
 * dessinait son avant-bras à l'ancien pli, détaché, la main flottant dessous.
 */
export function setJointLength(j: Joint, length: number) {
  j.uJointY.value = -length * JOINT
  j.uBlend.value = length * BLEND
}

const _m = new THREE.Matrix4()

/**
 * Relit l'os du bas (`pose` : l'angle du geste, puis `spring` : son ressort)
 * pour le shader. Le sommet au repos est ramené au pli (+ longueur haute), puis
 * passé par les deux os.
 */
export function updateJoint(j: Joint, pose: THREE.Object3D, spring: THREE.Object3D) {
  pose.updateMatrix()
  spring.updateMatrix()
  _m.makeTranslation(0, -j.uJointY.value * j.uStretch.value, 0)
  j.uJoint.value.multiplyMatrices(pose.matrix, spring.matrix).multiply(_m)
}

/**
 * Le membre descend le long de −y depuis l'articulation. Au-dessous du pli les
 * sommets suivent `uJoint`, au-dessus ils restent ; entre les deux, fondu.
 *
 * Deux injections :
 * - la **normale** avant `defaultnormal_vertex`, puis rendue telle quelle :
 *   le duvet (`shellShader`) repousse ses coques le long de la normale **au
 *   repos**, dans le repère où elles sont encore droites ;
 * - la **position** juste avant la projection, après toutes les autres
 *   (duvet compris) : on plie le membre déjà habillé.
 */
export function jointShader(j: Joint) {
  return (sh: THREE.WebGLProgramParametersWithUniforms) => {
    Object.assign(sh.uniforms, j)
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
uniform mat4 uJoint;
uniform float uJointY;
uniform float uBlend;
uniform float uStretch;
float jointWeight(float y) { return smoothstep(uJointY + uBlend, uJointY - uBlend, y); }`,
      )
      .replace(
        '#include <defaultnormal_vertex>',
        `vec3 restNormal = objectNormal;
objectNormal = normalize(mix(objectNormal, mat3(uJoint) * objectNormal, jointWeight(position.y)));
#include <defaultnormal_vertex>
objectNormal = restNormal;`,
      )
      .replace(
        '#include <project_vertex>',
        `{
  transformed.y *= uStretch;
  vec3 bent = (uJoint * vec4(transformed, 1.0)).xyz;
  transformed = mix(transformed, bent, jointWeight(position.y));
}
#include <project_vertex>`,
      )
  }
}

// ---------------------------------------------------------------- IK

const _f = new THREE.Vector3()
const _x = new THREE.Vector3()
const _y = new THREE.Vector3()
const _z = new THREE.Vector3()
const _basis = new THREE.Matrix4()

/**
 * IK à deux segments : cuisse `a`, tibia `b` (pied compris), de la hanche à
 * `d` (hanche → pied), dans le repère du parent. Le genou part **vers
 * l'avant** (`fwd`). Écrit l'orientation voulue du fémur dans `out` (son −y le
 * long de la cuisse, son +z vers l'avant : un angle de genou positif autour de
 * son x replie le tibia vers l'arrière) et renvoie l'angle du genou.
 */
export function solveLeg(d: THREE.Vector3, a: number, b: number, fwd: THREE.Vector3, out: THREE.Quaternion) {
  const D = THREE.MathUtils.clamp(d.length(), Math.abs(a - b) + 1e-4, a + b - 1e-5)
  const dir = _y.copy(d).normalize()
  // Avant, orthogonalisé contre la direction du pied. Jambe tendue droit
  // devant (roulade, repli) : on se rabat sur le haut.
  _f.copy(fwd).addScaledVector(dir, -fwd.dot(dir))
  if (_f.lengthSq() < 1e-6) _f.set(0, 1, 0).addScaledVector(dir, -dir.y)
  _f.normalize()
  const cosA = THREE.MathUtils.clamp((a * a + D * D - b * b) / (2 * a * D), -1, 1)
  const sinA = Math.sqrt(1 - cosA * cosA)
  // Cuisse : la direction du pied, tournée vers l'avant de l'angle de hanche.
  // L'avant du fémur est sa perpendiculaire dans le même plan, prise
  // directement : obtenue en projetant `fwd`, elle se retournait dès que la
  // cuisse dépassait l'horizontale (jambe très repliée) et le genou pliait à
  // l'envers.
  _z.copy(_f).multiplyScalar(cosA).addScaledVector(dir, -sinA)
  _y.multiplyScalar(-cosA).addScaledVector(_f, -sinA)
  _x.crossVectors(_y, _z)
  _basis.makeBasis(_x, _y, _z)
  out.setFromRotationMatrix(_basis)
  const cosK = THREE.MathUtils.clamp((a * a + b * b - D * D) / (2 * a * b), -1, 1)
  return Math.PI - Math.acos(cosK)
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
const _fwd = new THREE.Vector3()

/** Cycle de locomotion publié par le combattant (voir `Fighter.cycle`). */
export type Cycle = {
  phase: number
  period: number
  duty: number
  lift: number
  kick: number
  active: boolean
}

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
      /**
       * Cycle de marche : quand il est actif, les pieds le suivent au lieu de
       * partir quand ils sont trop loin. Sa phase peut être recalée à l'entrée.
       */
      cycle?: Cycle
      /** Glissade : les deux pieds au sol, l'un devant l'autre, qui glissent. */
      glide?: boolean
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

    if (o.glide && o.grounded && this.ready) {
      // Le pied du côté tourné vers l'avant (−1, le bassin étant tourné) mène.
      const fx = Math.sin(o.facing)
      const fz = Math.cos(o.facing)
      for (const side of [-1, 1] as const) {
        const f = this.feet[side]
        _prev.copy(f.pos)
        const lead = side === -1 ? 0.5 : -0.45
        f.pos.copy(ideal(side))
        f.pos.x += fx * lead * o.legLength
        f.pos.z += fz * lead * o.legLength
        f.plant.copy(f.pos)
        f.swinging = false
        f.vel.subVectors(f.pos, _prev).divideScalar(Math.max(dt, 1e-4))
      }
      this.cycling = false
      return
    }
    const cyc = !!o.cycle?.active && o.grounded && this.ready
    if (cyc && !this.cycling) this.enterCycle(o.cycle!, ideal)
    if (!cyc && this.cycling) this.leaveCycle()
    this.cycling = cyc
    if (cyc) {
      // Portée de la jambe, pied compris (`legLength` × 1,09).
      this.followCycle(dt, o.legLength * 1.09, o.cycle!, o.vel, ideal, speed, o.onLand)
      this.ready = true
      return
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
    /*
     * Au sprint (au-delà de 2 u/s) la cadence monte encore, jusqu'à 13 pas par
     * seconde : des pas longs mettraient la jambe hors de portée — un tibia et
     * une cuisse ne s'étirent pas. Petites jambes, moulinet rapide : c'est la
     * course d'une peluche.
     */
    const dur = !moving
      ? 0.16
      : speed <= 2
        ? THREE.MathUtils.clamp(0.22 - speed * 0.05, 0.1, 0.2)
        : THREE.MathUtils.lerp(0.12, 0.075, Math.min(1, (speed - 2) / 3))
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
    // Au sprint, genoux hauts : le pied monte plus, et le genou plie avec lui.
    f.lift = (moving ? 0.3 + 0.12 * Math.min(1, Math.max(0, speed - 2) / 3) : 0.14) * o.legLength
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

  /** Dans le cycle de marche. */
  private cycling = false

  /**
   * Entrée dans le cycle : la phase est recalée pour que le pied **le plus en
   * arrière** parte le premier — celui qui en a le plus besoin. L'autre garde
   * son appui s'il en a un.
   */
  private enterCycle(c: Cycle, ideal: (side: -1 | 1) => THREE.Vector3) {
    let back: -1 | 1 = -1
    let worst = -Infinity
    for (const side of [-1, 1] as const) {
      const f = this.feet[side]
      const i = ideal(side)
      const e = Math.hypot(f.plant.x - i.x, f.plant.z - i.z)
      if (e > worst) {
        worst = e
        back = side
      }
    }
    c.phase = (((c.duty - (back === -1 ? 0 : 0.5)) % 1) + 1) % 1
    for (const side of [-1, 1] as const) {
      const f = this.feet[side]
      f.swinging = false
      f.plant.copy(f.pos)
    }
  }

  /** Sortie : un pied en l'air finit son pas par un pas réactif. */
  private leaveCycle() {
    for (const side of [-1, 1] as const) {
      const f = this.feet[side]
      if (!f.swinging) continue
      f.from.copy(f.pos)
      f.t = 0
      f.dur = 0.1
      f.lift = 0
    }
  }

  /**
   * Pieds sur le cycle. Chaque pied est au sol pendant `duty` de son cycle —
   * **fixe**, en repère monde : c'est ce qui l'empêche de glisser — puis vole
   * vers son prochain appui, recalculé à chaque image (là où sera la hanche
   * au milieu de cet appui), en arc : haut et bref à la course, talon relevé
   * en arrière au départ. Le genou, lui, sort de l'IK.
   */
  private followCycle(
    dt: number,
    reach: number,
    c: Cycle,
    vel: THREE.Vector3,
    ideal: (side: -1 | 1) => THREE.Vector3,
    speed: number,
    onLand?: (side: -1 | 1, speed: number, dur: number) => void,
  ) {
    const swingT = (1 - c.duty) * c.period
    _fwd.set(vel.x, 0, vel.z)
    if (_fwd.lengthSq() > 1e-8) _fwd.normalize()
    for (const side of [-1, 1] as const) {
      const f = this.feet[side]
      _prev.copy(f.pos)
      const psi = (c.phase + (side === -1 ? 0 : 0.5)) % 1
      if (psi < c.duty) {
        if (f.swinging) {
          // Pose : au point visé en fin de vol.
          f.swinging = false
          // Posé il y a `psi · période` : la hanche a déjà avancé d'autant.
          // Sans ce décompte, le pied sautait de 1,3 cm à chaque pose.
          f.plant.copy(ideal(side)).addScaledVector(vel, (c.duty / 2 - psi) * c.period)
          f.plant.y = ideal(side).y
          onLand?.(side, speed, c.period / 2)
        }
        /*
         * Rattrapage : si la hanche s'éloigne trop du pied planté — demi-tour
         * brusque, poussée —, le pied glisse juste assez pour rester à
         * portée. Mesuré sur une minute d'appuis au hasard, sans lui : jambe
         * d'appui jusqu'à deux fois sa portée, le pied décrochait du sol.
         */
        const i = ideal(side)
        const dx = f.plant.x - i.x
        const dz = f.plant.z - i.z
        const d = Math.hypot(dx, dz)
        const max = reach * 0.7
        if (d > max) {
          f.plant.x = i.x + (dx / d) * max
          f.plant.z = i.z + (dz / d) * max
        }
        f.pos.copy(f.plant)
      } else {
        if (!f.swinging) {
          f.swinging = true
          f.from.copy(f.pos)
        }
        const u = (psi - c.duty) / (1 - c.duty)
        /*
         * Courbes à **vitesse nulle aux deux bouts**. La levée partait en
         * `sin(π·u^0,75)`, de pente infinie au décollage : le pied sautait
         * d'un coup vers le haut, cinq ou six fois par seconde — mesuré, le
         * pic d'accélération du pied tombait pile au décollage (0,053
         * u/image² à la marche, 0,106 à la course), c'était le « saccadé ».
         * Le pied rejoint aussi son point de pose un peu avant la fin du vol,
         * pour ne pas y sauter à la pose.
         */
        const x = Math.min(1, u / 0.9)
        const e = x * x * x * (x * (x * 6 - 15) + 10)
        f.to.copy(ideal(side)).addScaledVector(vel, (1 - u) * swingT + (c.duty * c.period) / 2)
        f.pos.lerpVectors(f.from, f.to, e)
        // Levée : monte vite, redescend en douceur ; talon relevé derrière au
        // début de l'envol (course).
        const up = Math.sin(Math.PI * Math.pow(x, 0.8))
        f.pos.y += c.lift * up * up
        const heel = Math.sin(Math.PI * x)
        const kick = heel * heel * (1 - x)
        f.pos.addScaledVector(_fwd, -c.kick * kick)
        f.pos.y += c.kick * 0.6 * kick
      }
      f.vel.subVectors(f.pos, _prev).divideScalar(Math.max(dt, 1e-4))
    }
  }
}
