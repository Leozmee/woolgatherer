import * as THREE from 'three'
import { BONES, restPose, type BoneName, type Pose, type RigMetrics } from './rig'

/**
 * Le combattant : ce qu'on contrôle, et comment ça bouge.
 *
 * **Pose à pose, tirées par des ressorts.** Une animation rejouée — une courbe
 * par geste, fondue dans la suivante — lit comme un jeu de construction : tout
 * part et arrive à l'heure, rien ne pèse. Ici chaque geste ne donne que des
 * **poses clés** (armé, frappe, retour) ; chaque partie du corps les rejoint
 * par une dynamique du second ordre, avec sa fréquence, son amortissement et
 * sa réponse. Le dépassement, le rebond, la tête qui arrive après le buste, le
 * bras qui fouette puis revient : tout ça sort des ressorts, rien n'est écrit.
 * Et un geste interrompu repart de là où le corps **est**, pas de là où la
 * courbe en était — c'est ce qui rend un combo souple sous les doigts.
 *
 * Par-dessus : l'étirement et l'écrasement du corps entier (à volume
 * constant), l'arme lourde qui traîne et fouette, le gel d'impact, la
 * secousse. Hors React, comme la platine : clavier et manette l'appellent
 * directement.
 */

// ---------------------------------------------------------------- dynamique

/**
 * Dynamique du second ordre (fréquence `f`, amortissement `z`, réponse `r`).
 *
 * `r` > 1 dépasse la cible dès le départ — un fouet ; `r` < 0 part d'abord à
 * l'envers — une anticipation. `z` < 1 rebondit à l'arrivée. Intégration
 * semi-implicite, stabilisée pour les grands pas de temps.
 */
export class Dyn {
  readonly y: Float32Array
  private yd: Float32Array
  private xp: Float32Array
  private k1 = 0
  private k2 = 0
  private k3 = 0

  constructor(
    readonly n: number,
    f: number,
    z: number,
    r: number,
    init?: ArrayLike<number>,
  ) {
    this.y = new Float32Array(n)
    this.yd = new Float32Array(n)
    this.xp = new Float32Array(n)
    if (init) {
      this.y.set(init)
      this.xp.set(init)
    }
    this.tune(f, z, r)
  }

  tune(f: number, z: number, r: number) {
    const w = 2 * Math.PI * f
    this.k1 = z / (Math.PI * f)
    this.k2 = 1 / (w * w)
    this.k3 = (r * z) / w
  }

  update(dt: number, x: ArrayLike<number>) {
    if (dt <= 0) return this.y
    const k2 = Math.max(this.k2, (dt * dt) / 2 + (dt * this.k1) / 2, dt * this.k1)
    for (let i = 0; i < this.n; i++) {
      const xd = (x[i] - this.xp[i]) / dt
      this.xp[i] = x[i]
      this.y[i] += dt * this.yd[i]
      this.yd[i] += (dt * (x[i] + this.k3 * xd - this.y[i] - this.k1 * this.yd[i])) / k2
    }
    return this.y
  }

  /** Décale l'état et la cible ensemble — un tour complet ramené à zéro. */
  shift(i: number, by: number) {
    this.y[i] += by
    this.xp[i] += by
  }

  /** Plancher : la composante `i` ne descend pas sous `v`, et y perd son élan. */
  floor(i: number, v: number) {
    if (this.y[i] >= v) return false
    this.y[i] = v
    this.yd[i] = Math.max(0, this.yd[i]) * 0.3
    return true
  }

  /** Impulsion : de la vitesse, sans toucher à la position. */
  kick(i: number, v: number) {
    this.yd[i] += v
  }

  /** Recale d'un coup sur une valeur, à l'arrêt. */
  snap(i: number, v: number) {
    this.y[i] = v
    this.xp[i] = v
    this.yd[i] = 0
  }
}

type Tune = [f: number, z: number, r: number]

/**
 * Réglage de repos de chaque partie. `f` plus bas = plus lent à suivre.
 *
 * **Mou, pas élastique.** Premier réglage peu amorti (z 0,2 à 0,5) : le bassin
 * dépassait sa pose de près du double, le corps tremblotait entre 0,6 et 1,2
 * d'écrasement — une gelée, jugée « trop de rebond ». Le mou se lit au
 * **retard** (la tête après le buste, l'arme après la main), pas au rebond.
 * Puis trop amorti (0,6 à 0,85, fréquences hautes) : tout arrivait à l'heure,
 * « trop rigide ». Réglage retenu : fréquences basses — du poids, du retard —
 * et amortissements de 0,5 à 0,7, dépassement de quelques pour cent.
 */
const DYN: Record<BoneName | 'hipsPos' | 'squash' | 'weapon', Tune> = {
  hips: [2.7, 0.64, 0.15],
  hipsPos: [3.2, 0.66, 0],
  // La tête arrive toujours après le reste : c'est la moitié de l'effet mou.
  neck: [2, 0.5, 0],
  // Bras de l'arme : alourdi par elle. L'autre est un peu plus libre.
  'arm-1': [3.1, 0.62, 0.15],
  arm1: [2.6, 0.55, 0.25],
  'leg-1': [5, 0.7, 0.2],
  leg1: [5, 0.7, 0.2],
  // Écrasement : il se tasse et revient, à peine un rebond.
  squash: [4, 0.55, 0],
  // Direction de l'arme : lourde, elle suit avec retard.
  weapon: [3.6, 0.64, 0.2],
}

// ---------------------------------------------------------------- gestes

type Target = Pose & { squash: number; weapon: [number, number, number] }

function blankTarget(): Target {
  return Object.assign(restPose(), { squash: 1, weapon: [0, -1, 0] as [number, number, number] })
}

function clearTarget(t: Target) {
  for (const k of [...BONES, 'hipsPos'] as const) t[k].fill(0)
  t.squash = 1
}

type Phase = {
  dur: number
  /** Pose visée pendant la phase ; `u` de 0 à 1. */
  pose: (t: Target, u: number, m: RigMetrics) => void
  /** Réglages de ressorts propres à la phase (une frappe est bien plus vive). */
  tune?: Partial<Record<keyof typeof DYN, Tune>>
  /** À l'entrée de la phase. */
  enter?: (f: Fighter) => void
  /** Traînée de l'arme pendant la phase (0 à 1). */
  trail?: number
  /** Raideur des membres (0 à 1). */
  firm?: number
  /** Déplacement autorisé, fraction de la course. */
  steer?: number
}

type ActionName = 'attack1' | 'attack2' | 'attack3' | 'dodge' | 'parry' | 'hit' | 'ko'

type Action = {
  phases: Phase[]
  /** Phase à partir de laquelle un appui en file peut enchaîner. */
  cancelFrom: number
  /** Reste sur sa dernière phase (K.O.). */
  hold?: boolean
  next?: ActionName
}

const set = (v: [number, number, number], x: number, y: number, z: number) => {
  v[0] = x
  v[1] = y
  v[2] = z
}

/** Vivacité d'une frappe : bras et bassin fouettent, l'arme claque. */
const STRIKE: Phase['tune'] = {
  'arm-1': [9, 0.72, 1],
  hips: [6.5, 0.75, 0.7],
  weapon: [10, 0.72, 0.9],
  arm1: [6, 0.72, 0.5],
}

/** Armé : un temps plus mou, qui laisse le corps s'enrouler. */
const WIND: Phase['tune'] = {
  'arm-1': [5, 0.8, -0.15],
  hips: [4, 0.82, -0.1],
  weapon: [4.5, 0.82, -0.1],
}

/**
 * Conventions (repère du corps, os de pose avant l'écartement) : bras et
 * jambes pendent le long de −y, `x < 0` les porte en avant, `côté × z > 0` les
 * écarte ; bassin `x > 0` penche en avant, `y > 0` tourne vers la gauche de
 * la poupée (+x), `z > 0` bascule le haut vers la droite (−x, côté de l'arme).
 * Direction de l'arme en repère du bassin : +z devant, −x côté de l'arme.
 */
const ACTIONS: Record<ActionName, Action> = {
  /** Fauche : de la droite vers la gauche, en passant devant, avec fente. */
  attack1: {
    cancelFrom: 1,
    next: 'attack2',
    phases: [
      {
        dur: 0.16,
        tune: WIND,
        firm: 0.6,
        steer: 0.2,
        pose: (t, _u, m) => {
          set(t.hips, 0.05, -0.55, 0.12)
          set(t.hipsPos, 0, -m.legLength * 0.08, -m.torsoRadius * 0.15)
          set(t['arm-1'], -0.5, 0.2, -0.9)
          set(t.arm1, -0.4, 0, 0.5)
          set(t.neck, 0.05, 0.35, 0)
          set(t['leg-1'], 0.25, 0, -0.1)
          set(t.leg1, -0.35, 0, 0.1)
          t.squash = 0.96
          set(t.weapon, -0.9, 0.3, -0.35)
        },
      },
      {
        dur: 0.12,
        tune: STRIKE,
        firm: 0.95,
        trail: 1,
        enter: (f) => f.lunge(3.2),
        pose: (t, _u, m) => {
          set(t.hips, 0.3, 0.65, -0.1)
          set(t.hipsPos, 0, -m.legLength * 0.12, m.torsoRadius * 0.4)
          set(t['arm-1'], -1.35, -0.2, 1.25)
          set(t.arm1, 0.3, 0, 0.9)
          set(t.neck, 0.2, -0.3, 0)
          set(t['leg-1'], -0.6, 0, 0)
          set(t.leg1, 0.5, 0, 0.1)
          t.squash = 1.05
          set(t.weapon, 0.85, -0.05, 0.55)
        },
      },
      {
        dur: 0.32,
        firm: 0.5,
        trail: 0.3,
        steer: 0.3,
        pose: (t, u, m) => {
          const k = 1 - u * 0.6
          set(t.hips, 0.2 * k, 0.45 * k, 0)
          set(t.hipsPos, 0, -m.legLength * 0.08 * k, m.torsoRadius * 0.2 * k)
          set(t['arm-1'], -1 * k, 0, 0.9 * k)
          set(t.arm1, 0.2, 0, 0.6)
          set(t['leg-1'], -0.4 * k, 0, 0)
          set(t.leg1, 0.3 * k, 0, 0.1)
          set(t.weapon, 0.7, -0.45, 0.2)
        },
      },
    ],
  },

  /** Revers : de gauche à droite, plus haut, le corps tourne de l'autre côté. */
  attack2: {
    cancelFrom: 1,
    next: 'attack3',
    phases: [
      {
        dur: 0.1,
        tune: WIND,
        firm: 0.7,
        steer: 0.2,
        pose: (t, _u, m) => {
          set(t.hips, 0.1, 0.8, -0.1)
          set(t.hipsPos, 0, -m.legLength * 0.1, 0)
          set(t['arm-1'], -1.5, 0.3, 1.35)
          set(t.arm1, -0.3, 0, 0.7)
          set(t.neck, 0, -0.4, 0.1)
          set(t['leg-1'], -0.3, 0, 0)
          set(t.leg1, 0.3, 0, 0.1)
          t.squash = 0.96
          set(t.weapon, 0.8, 0.4, 0.1)
        },
      },
      {
        dur: 0.12,
        tune: STRIKE,
        firm: 0.95,
        trail: 1,
        enter: (f) => f.lunge(2.6),
        pose: (t, _u, m) => {
          set(t.hips, 0.25, -0.75, 0.15)
          set(t.hipsPos, 0, -m.legLength * 0.1, m.torsoRadius * 0.35)
          set(t['arm-1'], -1.2, 0, -1.1)
          set(t.arm1, -0.5, 0, 0.3)
          set(t.neck, 0.15, 0.45, -0.1)
          set(t['leg-1'], 0.4, 0, -0.1)
          set(t.leg1, -0.5, 0, 0)
          t.squash = 1.04
          set(t.weapon, -0.85, 0.15, 0.5)
        },
      },
      {
        dur: 0.3,
        firm: 0.5,
        trail: 0.3,
        steer: 0.3,
        pose: (t, u, m) => {
          const k = 1 - u * 0.6
          set(t.hips, 0.15 * k, -0.5 * k, 0.1 * k)
          set(t.hipsPos, 0, -m.legLength * 0.06 * k, 0)
          set(t['arm-1'], -0.8 * k, 0, -0.9 * k)
          set(t.arm1, 0, 0, 0.4)
          set(t.weapon, -0.8, -0.35, 0.2)
        },
      },
    ],
  },

  /**
   * Écrasement : petit saut, l'arme passe au-dessus de la tête, et tout le
   * poids retombe avec elle. L'impact gèle l'image un instant, secoue la
   * caméra et écrase la poupée — c'est le coup qui ferme le combo.
   */
  attack3: {
    cancelFrom: 2,
    phases: [
      {
        dur: 0.24,
        tune: { ...WIND, hipsPos: [3.5, 0.8, 0] },
        firm: 0.75,
        steer: 0.35,
        enter: (f) => f.bump(4),
        pose: (t, u, m) => {
          set(t.hips, -0.4, 0, 0)
          set(t.hipsPos, 0, m.legLength * 0.55 * Math.sin(Math.PI * Math.min(1, u * 1.1)), -m.torsoRadius * 0.1)
          set(t['arm-1'], -2.9, 0, 0.45)
          set(t.arm1, -2.7, 0, -0.45)
          set(t.neck, -0.3, 0, 0)
          set(t['leg-1'], -0.7, 0, -0.1)
          set(t.leg1, -0.5, 0, 0.1)
          t.squash = 1.07
          set(t.weapon, 0, 0.85, -0.5)
        },
      },
      {
        dur: 0.1,
        tune: { ...STRIKE, hipsPos: [9, 0.8, 0] },
        firm: 1,
        trail: 1,
        enter: (f) => f.lunge(1.5),
        pose: (t, _u, m) => {
          set(t.hips, 0.6, 0, 0)
          set(t.hipsPos, 0, -m.legLength * 0.22, m.torsoRadius * 0.45)
          set(t['arm-1'], -1.2, 0, 0.55)
          set(t.arm1, -1.1, 0, -0.5)
          set(t.neck, 0.4, 0, 0)
          set(t['leg-1'], -0.5, 0, -0.2)
          set(t.leg1, 0.4, 0, 0.2)
          t.squash = 0.92
          set(t.weapon, 0, -0.7, 0.72)
        },
      },
      {
        dur: 0.46,
        firm: 0.4,
        trail: 0.15,
        enter: (f) => f.impact(),
        pose: (t, u, m) => {
          const k = 1 - Math.max(0, u - 0.35) / 0.65
          set(t.hips, 0.45 * k, 0, 0)
          set(t.hipsPos, 0, -m.legLength * 0.18 * k, m.torsoRadius * 0.4 * k)
          set(t['arm-1'], -0.9 * k, 0, 0.5 * k)
          set(t.arm1, -0.6 * k, 0, -0.3 * k)
          set(t.neck, 0.25 * k, 0, 0)
          set(t['leg-1'], -0.4 * k, 0, -0.2)
          set(t.leg1, 0.3 * k, 0, 0.2)
          set(t.weapon, 0, -0.75, 0.66)
        },
      },
    ],
  },

  /**
   * Esquive : roulade dans la direction voulue, en boule. Se déclenche aussi
   * pendant la fin d'un coup : c'est l'annulation qui donne la souplesse.
   */
  dodge: {
    cancelFrom: 1,
    phases: [
      {
        dur: 0.36,
        tune: { hips: [9, 0.85, 0], hipsPos: [9, 0.85, 0], squash: [7, 0.8, 0] },
        firm: 0.6,
        trail: 0.35,
        enter: (f) => f.dash(5.2),
        pose: (t, u, m) => {
          const e = 1 - (1 - u) ** 2
          set(t.hips, Math.PI * 2 * e, 0, 0)
          set(t.hipsPos, 0, -m.centerHeight * 0.4 * Math.sin(Math.PI * u), 0)
          set(t['arm-1'], -1.2, 0, 0.9)
          set(t.arm1, -1.3, 0, -0.9)
          set(t['leg-1'], -1.3, 0, 0.1)
          set(t.leg1, -1.3, 0, -0.1)
          set(t.neck, 0.6, 0, 0)
          t.squash = 0.88
          set(t.weapon, -0.3, 0.2, -0.95)
        },
      },
      {
        dur: 0.14,
        firm: 0.3,
        enter: (f) => f.endRoll(),
        pose: (t, _u, m) => {
          set(t.hipsPos, 0, -m.legLength * 0.1, 0)
          t.squash = 0.94
          set(t.weapon, -0.35, -0.5, -0.8)
        },
      },
    ],
  },

  /** Parade : l'arme en travers devant le visage, bras tendus, corps tassé. */
  parry: {
    cancelFrom: 1,
    phases: [
      {
        dur: 0.08,
        tune: { 'arm-1': [9, 0.75, 0.6], arm1: [9, 0.75, 0.6], weapon: [10, 0.78, 0.5] },
        firm: 1,
        pose: (t, _u, m) => parryPose(t, m),
      },
      {
        dur: 0.36,
        firm: 1,
        pose: (t, _u, m) => parryPose(t, m),
      },
    ],
  },

  /** Coup reçu : repoussée en arrière, écrasée, tête rejetée, bras en l'air. */
  hit: {
    cancelFrom: 1,
    phases: [
      {
        dur: 0.12,
        tune: { neck: [5, 0.6, 0.8], hips: [7, 0.7, 0.6] },
        enter: (f) => f.knock(),
        pose: (t, _u, m) => {
          set(t.hips, -0.55, 0, 0.15)
          set(t.hipsPos, 0, 0, -m.torsoRadius * 0.4)
          set(t.neck, -0.7, 0.2, 0.2)
          set(t['arm-1'], -0.6, 0, -1)
          set(t.arm1, -0.9, 0, 1.1)
          set(t['leg-1'], -0.4, 0, 0)
          set(t.leg1, -0.2, 0, 0)
          t.squash = 0.9
          set(t.weapon, -0.7, 0.6, -0.4)
        },
      },
      {
        dur: 0.4,
        pose: (t, u) => {
          const k = 1 - u
          set(t.hips, -0.25 * k, 0, 0)
          set(t.neck, -0.2 * k, 0, 0)
          set(t.weapon, -0.5, -0.3, -0.8)
        },
      },
    ],
  },

  /** K.O. : bascule sur le dos, et y reste. L'arme tombe à côté. */
  ko: {
    cancelFrom: 99,
    hold: true,
    phases: [
      {
        dur: 0.9,
        tune: { hips: [2.4, 0.75, 0], hipsPos: [3, 0.8, 0] },
        enter: (f) => f.knock(),
        pose: (t, _u, m) => {
          set(t.hips, -1.5, 0.3, 0)
          set(t.hipsPos, 0, m.torsoRadius * 0.95 - m.centerHeight, -m.centerHeight * 0.5)
          set(t.neck, -0.3, 0.6, 0)
          set(t['arm-1'], -0.3, 0, -1.2)
          set(t.arm1, 0, 0, 1)
          set(t['leg-1'], -0.6, 0, -0.3)
          set(t.leg1, -0.2, 0, 0.35)
          t.squash = 0.96
          set(t.weapon, -0.9, -0.3, 0.3)
        },
      },
    ],
  },
}

function parryPose(t: Target, m: RigMetrics) {
  set(t.hips, -0.12, 0.1, 0)
  set(t.hipsPos, 0, -m.legLength * 0.14, -m.torsoRadius * 0.1)
  set(t['arm-1'], -1.55, 0, 1)
  set(t.arm1, -1.7, 0, -1.05)
  set(t.neck, 0.3, 0, 0)
  set(t['leg-1'], -0.35, 0, -0.2)
  set(t.leg1, 0.35, 0, 0.2)
  t.squash = 0.95
  set(t.weapon, 0.95, 0.2, 0.25)
}

/**
 * Butées articulaires par axe (x, y, z), en radians. Le bassin n'en a pas :
 * il fait un tour complet dans la roulade.
 */
const ARM_LIM: [number, number][] = [[-3, 1.3], [-0.9, 0.9], [-1.6, 1.6]]
const LEG_LIM: [number, number][] = [[-1.6, 1.2], [-0.5, 0.5], [-0.8, 0.8]]
const LIMITS: Partial<Record<BoneName, [number, number][]>> = {
  neck: [[-0.9, 0.9], [-0.9, 0.9], [-0.6, 0.6]],
  'arm-1': ARM_LIM,
  arm1: ARM_LIM,
  'leg-1': LEG_LIM,
  leg1: LEG_LIM,
}

// ---------------------------------------------------------------- combattant

/** Vitesse de course, unités par seconde. */
const RUN_SPEED = 2
/** Rayon de l'arène : on ne sort pas du tapis. */
const ARENA = 2.3
/** Temps pendant lequel un appui reste en file. */
const BUFFER = 0.28

export type Press = 'attack' | 'dodge' | 'parry' | 'hit' | 'ko'

export class Fighter {
  /** Pilote la racine (arène) ; sinon la platine tourne la poupée (planche). */
  drive: boolean
  readonly pos = new THREE.Vector3()
  readonly vel = new THREE.Vector3()
  facing = 0
  /** Entrée de déplacement brute, repère de l'écran : x à droite, y vers le haut. */
  readonly input = { x: 0, y: 0 }
  /** Cap de la caméra, publié par le rig : l'entrée est relative à l'écran. */
  camYaw = 0

  readonly pose = restPose()
  squash = 1
  /** Direction de l'arme visée, repère du bassin, amortie. */
  readonly weaponDir = new THREE.Vector3(-0.35, -0.5, -0.8).normalize()
  /** Raideur des membres pour les ressorts de la poupée. */
  firm = 0
  /** Traînée de l'arme (0 à 1). */
  trail = 0
  /** Secousse de caméra, décroissante. */
  shake = 0
  /** Gel d'impact restant, en secondes. */
  freeze = 0
  /** Vitesse de lecture — ralenti de mise au point. */
  speed = 1
  /** Pointe et milieu de l'arme en repère monde, écrits par la poupée. */
  readonly tipWorld = new THREE.Vector3()
  readonly midWorld = new THREE.Vector3()
  /** Hauteur du sol en repère monde, publiée par la poupée. */
  floorY = 0
  /** Vie, de 0 à 1. À zéro, la poupée tombe K.O. */
  hp = 1
  /** Pas de temps du dernier `update`, gel d'impact compris : l'arme le suit. */
  dt = 0

  private target = blankTarget()
  private dyn = {} as Record<keyof typeof DYN, Dyn>
  private action: { name: ActionName; phase: number; t: number } | null = null
  private queued: { press: Press; t: number } | null = null
  private time: number
  private gait = 0
  /** Pas en cours : pied posé en dernier, temps écoulé, durée d'un pas. */
  private step = { side: 1 as -1 | 1, t: 0, dur: 0.15 }
  /** Report du poids sur le pied d'appui (dandinement), amorti. */
  private waddle = 0
  /**
   * Cisaillement du corps (x : côté, z : avant), pieds fixes. Voir `update`.
   */
  readonly shear = { x: 0, z: 0 }
  private shearDyn = new Dyn(2, 3.2, 0.42, 0)
  private turnRate = 0
  private accel = new THREE.Vector3()
  private rollOffset = false

  constructor(opts: { drive?: boolean; phase?: number } = {}) {
    this.drive = !!opts.drive
    this.time = opts.phase ?? 0
    for (const k of Object.keys(DYN) as (keyof typeof DYN)[]) {
      const [f, z, r] = DYN[k]
      const n = k === 'squash' ? 1 : 3
      const init = k === 'squash' ? [1] : k === 'weapon' ? this.weaponDir.toArray() : [0, 0, 0]
      this.dyn[k] = new Dyn(n, f, z, r, init)
    }
  }

  get current(): string {
    return this.action?.name ?? (this.vel.lengthSq() > 0.05 ? 'run' : 'idle')
  }

  /** Un appui. Mis en file s'il ne peut pas partir tout de suite. */
  press(p: Press) {
    if (p === 'ko' && this.action?.name === 'ko') {
      // Relevée : la vie revient.
      this.action = null
      this.hp = 1
      return
    }
    if (this.action?.name === 'ko') return
    if (p === 'hit') {
      this.hp = Math.max(0, this.hp - 0.18)
      if (this.hp <= 0) p = 'ko'
    }
    if (!this.tryStart(p)) this.queued = { press: p, t: BUFFER }
  }

  // --- effets appelés par les phases

  /** Élan vers l'avant, à l'entrée d'une frappe. */
  lunge(v: number) {
    this.vel.x += Math.sin(this.facing) * v
    this.vel.z += Math.cos(this.facing) * v
  }

  /** Esquive : part dans la direction voulue, ou en arrière sans direction. */
  dash(v: number) {
    const w = this.wish()
    if (w.lengthSq() > 0.01) this.facing = Math.atan2(w.x, w.z)
    this.vel.set(Math.sin(this.facing) * v, 0, Math.cos(this.facing) * v)
    this.dyn.squash.kick(0, -0.8)
  }

  endRoll() {
    // Le tour complet est ramené à zéro, état et cible ensemble : le bassin
    // ne déroule pas la roulade à l'envers.
    if (!this.rollOffset) {
      this.dyn.hips.shift(0, -Math.PI * 2)
      this.rollOffset = true
    }
    this.dyn.squash.kick(0, -0.6)
  }

  /**
   * Pied posé : le corps se tasse un peu, d'autant plus qu'on court. C'est le
   * rythme des pas qui rythme le corps — pas une horloge.
   */
  land(speed: number, side: -1 | 1 = 1, dur = 0.15) {
    const run = Math.min(1, speed / RUN_SPEED)
    this.step.side = side
    this.step.t = 0
    this.step.dur = dur
    this.dyn.squash.kick(0, -0.5 * run - 0.1)
    this.dyn.hipsPos.kick(1, -0.35 * run)
  }

  /** Au sol et libre d'y marcher : ni roulade, ni K.O., ni en l'air. */
  get grounded() {
    const a = this.action?.name
    if (a === 'dodge' || a === 'ko') return false
    return this.pose.hipsPos[1] < 0.06
  }

  /** Petit rebond d'élan. */
  bump(v: number) {
    this.dyn.squash.kick(0, v)
  }

  /** Impact au sol : gel d'image, secousse, écrasement. */
  impact() {
    this.freeze = 0.075
    this.shake = 1
    this.dyn.squash.kick(0, -1.6)
    this.vel.multiplyScalar(0.2)
  }

  /** Repoussée en arrière. */
  knock() {
    this.vel.x -= Math.sin(this.facing) * 3
    this.vel.z -= Math.cos(this.facing) * 3
    this.dyn.squash.kick(0, -1.2)
    this.shake = Math.max(this.shake, 0.5)
    this.freeze = 0.05
  }

  // --- boucle

  private wish() {
    // Entrée écran → monde, par le cap de la caméra.
    const c = Math.cos(this.camYaw)
    const s = Math.sin(this.camYaw)
    const x = this.input.x * c - this.input.y * s
    const z = -this.input.x * s - this.input.y * c
    return _wish.set(x, 0, z)
  }

  private tryStart(p: Press): boolean {
    const a = this.action
    if (a?.name === 'ko') return false
    const cur = a ? ACTIONS[a.name] : null
    const canCancel = !a || a.phase >= cur!.cancelFrom
    if (p === 'hit' || p === 'ko') {
      this.start(p)
      return true
    }
    if (p === 'dodge') {
      // L'esquive annule tout sauf l'instant même d'une frappe.
      if (!a || canCancel || a.name === 'parry') {
        this.start('dodge')
        return true
      }
      return false
    }
    if (!canCancel) return false
    if (p === 'parry') {
      this.start('parry')
      return true
    }
    // Attaque : enchaîne sur le coup suivant du combo.
    const next = a && a.name.startsWith('attack') ? cur!.next : 'attack1'
    if (!next) return false
    this.start(next)
    return true
  }

  private start(name: ActionName) {
    // Une attaque part dans la direction du stick : on vise en frappant.
    const w = this.wish()
    if (name.startsWith('attack') && w.lengthSq() > 0.04) this.facing = Math.atan2(w.x, w.z)
    this.action = { name, phase: 0, t: 0 }
    this.rollOffset = false
    this.queued = null
    ACTIONS[name].phases[0].enter?.(this)
  }

  update(realDt: number, m: RigMetrics) {
    let dt = Math.min(realDt, 1 / 20) * this.speed
    // Gel d'impact : l'image s'arrête un instant, tout repart ensuite.
    if (this.freeze > 0) {
      this.freeze -= dt
      dt *= 0.04
    }
    this.time += dt
    this.dt = dt
    this.shake *= Math.exp(-realDt * 9)

    const t = this.target
    clearTarget(t)
    let firm = 0
    let trail = 0
    let steer = 1
    let tune: Phase['tune'] | undefined

    // --- geste en cours
    const a = this.action
    if (a) {
      const act = ACTIONS[a.name]
      a.t += dt
      let ph = act.phases[a.phase]
      while (a.t >= ph.dur) {
        if (a.phase + 1 < act.phases.length) {
          a.t -= ph.dur
          a.phase++
          ph = act.phases[a.phase]
          ph.enter?.(this)
        } else if (act.hold) {
          a.t = ph.dur
          break
        } else {
          if (a.name === 'dodge' && !this.rollOffset) this.endRoll()
          this.action = null
          break
        }
      }
      if (this.action) {
        ph.pose(t, Math.min(1, a.t / ph.dur), m)
        tune = ph.tune
        firm = ph.firm ?? 0
        trail = ph.trail ?? 0
        steer = ph.steer ?? 0
      }
    }

    // File d'attente : l'appui part dès que le geste le permet.
    if (this.queued) {
      this.queued.t -= dt
      if (this.queued.t <= 0) this.queued = null
      else if (this.tryStart(this.queued.press)) this.queued = null
    }

    // --- déplacement
    const w = this.wish()
    const wl = Math.min(1, w.length())
    if (this.drive) {
      _prev.copy(this.vel)
      if (!this.action) {
        _tv.copy(w).multiplyScalar((RUN_SPEED * wl) / Math.max(w.length(), 1e-6))
        // Démarrage vif, arrêt un peu glissé : une peluche a peu d'adhérence.
        // Arrêt net (mesuré : 22 images de glissade avec 7, savonneux) : c'est
        // le corps qui dit l'inertie, en continuant vers l'avant, pas la
        // racine qui glisse.
        const rate = wl > 0.1 ? 11 : 16
        this.vel.lerp(_tv, Math.min(1, dt * rate))
      } else {
        // Pendant un geste l'élan s'amortit, et le stick corrige un peu.
        this.vel.multiplyScalar(Math.exp(-dt * 6))
        this.vel.addScaledVector(w, RUN_SPEED * steer * dt * 4)
      }
      this.accel.subVectors(this.vel, _prev).divideScalar(Math.max(dt, 1e-4))
      this.pos.addScaledVector(this.vel, dt)
      const r = Math.hypot(this.pos.x, this.pos.z)
      if (r > ARENA) {
        this.pos.x *= ARENA / r
        this.pos.z *= ARENA / r
      }
      // Cap : vers la direction voulue, vite mais pas instantanément.
      const prevFacing = this.facing
      if (wl > 0.15 && (!this.action || steer > 0)) {
        const want = Math.atan2(w.x, w.z)
        let d = want - this.facing
        d = Math.atan2(Math.sin(d), Math.cos(d))
        this.facing += d * Math.min(1, dt * (this.action ? 4 : 13))
      }
      let df = this.facing - prevFacing
      df = Math.atan2(Math.sin(df), Math.cos(df))
      this.turnRate += (df / Math.max(dt, 1e-4) - this.turnRate) * Math.min(1, dt * 10)
    }

    // --- pose de fond : attente et course, sous le geste
    if (!this.action) this.locomotion(t, m, dt)

    // --- ressorts : chaque partie vers sa cible
    for (const k of Object.keys(DYN) as (keyof typeof DYN)[]) {
      const [f, z, r] = tune?.[k] ?? DYN[k]
      this.dyn[k].tune(f, z, r)
    }
    for (const k of BONES) {
      const y = this.dyn[k].update(dt, t[k])
      const lim = LIMITS[k]
      for (let i = 0; i < 3; i++) {
        // Butées : sous des appuis en rafale, un ressort pouvait emmener un
        // bras à 3,7 rad — à travers la tête. Une peluche a des coutures.
        this.pose[k][i] = lim ? Math.max(lim[i][0], Math.min(lim[i][1], y[i])) : y[i]
      }
    }
    const hp = this.dyn.hipsPos.update(dt, t.hipsPos)
    this.pose.hipsPos[0] = hp[0]
    this.pose.hipsPos[1] = hp[1]
    this.pose.hipsPos[2] = hp[2]
    _sq[0] = t.squash
    this.squash = Math.min(1.45, Math.max(0.6, this.dyn.squash.update(dt, _sq)[0]))
    _wd.set(...t.weapon).normalize()
    const wd = this.dyn.weapon.update(dt, _wd.toArray(_arr))
    this.weaponDir.set(wd[0], wd[1], wd[2])
    if (this.weaponDir.lengthSq() < 1e-6) this.weaponDir.set(0, -1, 0)
    this.weaponDir.normalize()

    /*
     * **Cisaillement : la peluche ploie, elle ne pivote pas.** Le haut du
     * corps reste en arrière quand elle accélère, continue quand elle freine,
     * se pose sur le pied d'appui — pieds fixés au sol. Mesuré avant lui : un
     * penché de course constant à 0,01 près, les pas (7 par seconde) étant
     * lissés par le ressort du bassin ; un corps rigide qui tourne lit comme
     * un objet, un corps qui ploie comme de la mousse. Peu amorti exprès : un
     * soupçon de balancement quand il se redresse.
     */
    if (this.drive) {
      const cf = Math.cos(this.facing)
      const sf = Math.sin(this.facing)
      const aFwd = this.accel.x * sf + this.accel.z * cf
      const aSide = this.accel.x * cf - this.accel.z * sf
      const lim = (v: number) => Math.max(-0.13, Math.min(0.13, v))
      _sh[0] = lim(-aSide * 0.009 - this.waddle * 0.6)
      _sh[1] = lim(-aFwd * 0.009)
    } else {
      _sh[0] = 0
      _sh[1] = 0
    }
    const sh = this.shearDyn.update(dt, _sh)
    // Borne finale : le ressort dépassait sa cible bornée (0,17 mesuré).
    this.shear.x = Math.max(-0.15, Math.min(0.15, sh[0]))
    this.shear.z = Math.max(-0.15, Math.min(0.15, sh[1]))

    this.firm += (firm - this.firm) * Math.min(1, dt * 20)
    this.trail += (trail - this.trail) * Math.min(1, dt * (trail > this.trail ? 40 : 10))
  }

  /**
   * Attente et course.
   *
   * La foulée avance avec la **distance parcourue**, pas avec le temps : les
   * pas suivent le sol. Course en petits bonds — une peluche n'a pas de
   * genoux, elle sautille — avec l'écrasement à chaque appui. Le corps penche
   * dans l'accélération et dans les virages, l'arme traîne derrière, pointe au
   * sol.
   */
  private locomotion(t: Target, m: RigMetrics, dt: number) {
    const speed = Math.hypot(this.vel.x, this.vel.z)
    const run = Math.min(1, speed / RUN_SPEED)
    /*
     * Phase de la foulée, **calée sur les vrais pas** (`land`) : chaque pied
     * posé fait un demi-tour de phase. Réglée sur une horloge ou la distance,
     * elle se décalait des pas et les bras balançaient à contretemps des pieds.
     */
    this.step.t += dt
    const stepU = Math.min(1, this.step.t / this.step.dur)
    this.gait = (this.step.side === -1 ? 0 : Math.PI) + Math.PI * stepU
    const s = Math.sin(this.gait)
    const hop = Math.abs(s)
    // Dandinement : le poids passe sur le pied d'appui — celui qui vient de
    // se poser —, puis revient au milieu à l'arrêt.
    const wTarget = run > 0.1 ? -this.step.side * 0.1 * run : 0
    this.waddle += (wTarget - this.waddle) * Math.min(1, dt * 12)
    const breathe = Math.sin(this.time * 2.3)
    const sway = Math.sin(this.time * 1.15)

    // Accélération dans le repère de la poupée : avant / côté.
    const cf = Math.cos(this.facing)
    const sf = Math.sin(this.facing)
    const aFwd = this.accel.x * sf + this.accel.z * cf
    const clampA = (v: number, k: number, lim: number) => Math.max(-lim, Math.min(lim, v * k))

    set(
      t.hips,
      // Inertie : le corps reste en arrière quand on accélère et continue
      // vers l'avant quand on freine — la racine obéit, le corps traîne.
      0.04 + 0.18 * run + hop * 0.05 * run - clampA(aFwd, 0.045, 0.4),
      s * 0.16 * run,
      // Penché vers l'arme au repos (son poids), dans le virage, et sur le
      // pied d'appui en course.
      0.07 * (1 - run) + clampA(this.turnRate, -0.07, 0.35) + sway * 0.03 * (1 - run) + this.waddle,
    )
    // Le rebond de course vient surtout des pas posés (`land`) ; ici un fond.
    // Corps un peu plus bas en course : les jambes plient au lieu de
    // s'étirer pour suivre.
    set(t.hipsPos, 0, (hop * 0.05 - 0.12) * m.legLength * run + breathe * m.torsoRadius * 0.015, 0)
    t.squash = 1 + breathe * 0.015 * (1 - run) + (hop - 0.55) * 0.05 * run
    set(t['leg-1'], -s * 0.8 * run, 0, 0)
    set(t.leg1, s * 0.8 * run, 0, 0)
    // Bras de l'arme tiré vers l'arrière et vers le bas par le poids ; l'autre
    // balance à contretemps et compense.
    set(t['arm-1'], 0.35 * run - 0.1, 0, 0.3 - 0.1 * run)
    set(t.arm1, s * 0.9 * run - 0.1 + sway * 0.06 * (1 - run), 0, -0.1 * run + 0.08)
    // La tête exagère ce que fait le corps, avec retard : elle part en
    // arrière au démarrage, pique en avant à l'arrêt, contre le dandinement.
    set(
      t.neck,
      -0.12 * run + Math.sin(this.time * 2.3 + 1) * 0.04 - clampA(aFwd, 0.05, 0.45),
      clampA(this.turnRate, 0.06, 0.4),
      -sway * 0.06 * (1 - run) - this.waddle * 0.8,
    )
    // Au repos, plantée pointe au sol devant elle, du côté de l'arme : on la
    // voit, et on voit qu'elle est trop grande. En course elle traîne derrière.
    set(t.weapon, -0.5 + 0.28 * run, -0.72 + 0.34 * run, 0.42 - 1.3 * run)
  }
}

const _wish = new THREE.Vector3()
const _prev = new THREE.Vector3()
const _tv = new THREE.Vector3()
const _wd = new THREE.Vector3()
const _sq = [1]
const _sh = [0, 0]
const _arr: number[] = [0, 0, 0]
