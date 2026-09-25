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
  // Coudes : plus vifs que l'épaule mais peu amortis — l'avant-bras arrive en
  // dernier et ballotte un peu, c'est ce qui fait vivre un bras.
  'elbow-1': [3.4, 0.5, 0.1],
  elbow1: [3.2, 0.45, 0.1],
  // Genoux : ils ne comptent qu'en l'air (au sol, l'IK les plie).
  'knee-1': [5, 0.6, 0],
  knee1: [5, 0.6, 0],
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
  pose: (t: Target, u: number, m: RigMetrics, f: Fighter) => void
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
  /** Freinage au sol pendant la phase (6 par défaut). */
  brake?: number
  /** Déplacement libre, comme hors geste (l'accroupi d'appel du saut). */
  free?: boolean
}

type ActionName =
  | 'attack1' | 'attack2' | 'attack3' | 'dodge' | 'parry' | 'hit' | 'ko'
  | 'jump' | 'plunge' | 'slam' | 'rise'

type Action = {
  phases: Phase[]
  /** Phase à partir de laquelle un appui en file peut enchaîner. */
  cancelFrom: number
  /** Reste sur sa dernière phase (K.O., plongeon jusqu'au sol). */
  hold?: boolean
  next?: ActionName
  /** À la fin du geste (pas s'il est interrompu). */
  exit?: (f: Fighter) => void
}

const set = (v: [number, number, number], x: number, y: number, z: number) => {
  v[0] = x
  v[1] = y
  v[2] = z
}

/** Angle d'un pli (coude, genou) : seul x compte. */
const bend = (v: [number, number, number], x: number) => set(v, x, 0, 0)

/** Os d'un côté : −1 bras de l'arme (droite de la poupée), 1 l'autre. */
const ARM = { [-1]: 'arm-1', 1: 'arm1' } as const
const LEG = { [-1]: 'leg-1', 1: 'leg1' } as const
const ELBOW = { [-1]: 'elbow-1', 1: 'elbow1' } as const
const KNEE = { [-1]: 'knee-1', 1: 'knee1' } as const

/**
 * Vivacité d'une frappe : bras et bassin fouettent, l'arme claque. Le coude
 * part **après** l'épaule et la dépasse (`r` > 1) : le bras se déplie en fouet.
 */
const STRIKE: Phase['tune'] = {
  'arm-1': [9, 0.72, 1],
  'elbow-1': [11, 0.55, 1.6],
  hips: [6.5, 0.75, 0.7],
  weapon: [10, 0.72, 0.9],
  arm1: [6, 0.72, 0.5],
}

/** Armé : un temps plus mou, qui laisse le corps s'enrouler. */
const WIND: Phase['tune'] = {
  'arm-1': [5, 0.8, -0.15],
  'elbow-1': [6, 0.7, 0],
  hips: [4, 0.82, -0.1],
  weapon: [4.5, 0.82, -0.1],
}

/**
 * Relevée après un K.O. : on s'assoit en poussant sur les bras, on se ramasse
 * accroupie, les mains sur les genoux, puis debout d'une détente — et la tête
 * qui secoue, sonnée.
 */
const RISE: Action = {
  cancelFrom: 2,
  phases: [
    {
      dur: 0.34,
      tune: { hips: [3.5, 0.8, 0], hipsPos: [3.5, 0.85, 0] },
      firm: 0.3,
      pose: (t, _u, m) => {
        set(t.hips, -0.4, 0, 0)
        set(t.hipsPos, 0, m.torsoRadius * 1.1 - m.centerHeight, -m.centerHeight * 0.6)
        set(t['arm-1'], 0.8, 0, -0.35)
        set(t.arm1, 0.8, 0, 0.35)
        bend(t['elbow-1'], -0.15)
        bend(t.elbow1, -0.15)
        set(t['leg-1'], -1.4, 0, -0.1)
        set(t.leg1, -1.3, 0, 0.1)
        bend(t['knee-1'], 0.9)
        bend(t.knee1, 1.2)
        set(t.neck, 0.35, 0, 0)
        t.squash = 0.95
        set(t.weapon, -0.8, -0.4, 0.2)
      },
    },
    {
      dur: 0.3,
      tune: { hips: [4.5, 0.75, 0], hipsPos: [4.5, 0.8, 0] },
      firm: 0.4,
      pose: (t, _u, m) => {
        set(t.hips, 0.55, 0, 0)
        set(t.hipsPos, 0, -m.legLength * 0.42, -m.centerHeight * 0.15)
        set(t['arm-1'], -0.7, 0, 0.2)
        set(t.arm1, -0.7, 0, -0.2)
        bend(t['elbow-1'], -0.8)
        bend(t.elbow1, -0.8)
        set(t.neck, -0.15, 0, 0)
        t.squash = 0.9
        set(t.weapon, -0.6, -0.7, 0.3)
      },
    },
    {
      dur: 0.4,
      firm: 0.2,
      enter: (f) => f.bump(3),
      pose: (t, u) => {
        const k = 1 - u
        set(t.hips, -0.12 * k, 0, 0)
        bend(t['elbow-1'], -0.4)
        bend(t.elbow1, -0.3)
        // Sonnée : la tête secoue, de moins en moins.
        set(t.neck, 0.05, Math.sin(u * Math.PI * 5) * 0.35 * k, Math.sin(u * Math.PI * 5 + 1) * 0.12 * k)
      },
    },
  ],
}

/**
 * Conventions (repère du corps, os de pose avant l'écartement) : bras et
 * jambes pendent le long de −y, `x < 0` les porte en avant, `côté × z > 0` les
 * écarte ; bassin `x > 0` penche en avant, `y > 0` tourne vers la gauche de
 * la poupée (+x), `z > 0` bascule le haut vers la droite (−x, côté de l'arme).
 * Coude `x < 0` : l'avant-bras remonte devant ; genou `x > 0` : le tibia
 * se replie derrière. Direction de l'arme en repère du bassin : +z devant, −x
 * côté de l'arme.
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
          bend(t['elbow-1'], -1.3)
          set(t.arm1, -0.4, 0, 0.5)
          bend(t.elbow1, -0.9)
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
          bend(t['elbow-1'], -0.08)
          set(t.arm1, 0.3, 0, 0.9)
          bend(t.elbow1, -0.5)
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
          bend(t['elbow-1'], -0.35)
          set(t.arm1, 0.2, 0, 0.6)
          bend(t.elbow1, -0.45)
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
          bend(t['elbow-1'], -1.15)
          set(t.arm1, -0.3, 0, 0.7)
          bend(t.elbow1, -0.8)
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
          bend(t['elbow-1'], -0.1)
          set(t.arm1, -0.5, 0, 0.3)
          bend(t.elbow1, -1)
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
          bend(t['elbow-1'], -0.4)
          set(t.arm1, 0, 0, 0.4)
          bend(t.elbow1, -0.5)
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
          bend(t['elbow-1'], -0.9)
          bend(t.elbow1, -0.9)
          set(t.neck, -0.3, 0, 0)
          set(t['leg-1'], -0.7, 0, -0.1)
          set(t.leg1, -0.5, 0, 0.1)
          bend(t['knee-1'], 1.3)
          bend(t.knee1, 0.9)
          t.squash = 1.07
          set(t.weapon, 0, 0.85, -0.5)
        },
      },
      {
        dur: 0.1,
        tune: { ...STRIKE, hipsPos: [9, 0.8, 0], 'elbow1': [11, 0.55, 1.6] },
        firm: 1,
        trail: 1,
        enter: (f) => f.lunge(1.5),
        pose: (t, _u, m) => slamPose(t, m, 1),
      },
      {
        dur: 0.46,
        firm: 0.4,
        trail: 0.15,
        enter: (f) => f.impact(),
        pose: (t, u, m) => slamPose(t, m, 1 - Math.max(0, u - 0.35) / 0.65, true),
      },
    ],
  },

  /**
   * Esquive : **un pas de côté**, pas une roulade. La poupée garde son cap —
   * elle reste face à ce qu'elle esquive — et bondit bas dans la direction du
   * stick (en arrière sans direction). Le corps penche dans le mouvement, la
   * jambe de tête s'écarte pour recevoir le poids, l'autre se replie, les bras
   * partent à l'opposé pour l'équilibre, la tête compense. Petit vol
   * physique : la gravité la repose, et c'est l'atterrissage qui la tasse.
   */
  dodge: {
    cancelFrom: 1,
    phases: [
      {
        dur: 0.17,
        tune: { hips: [7, 0.7, 0.4], hipsPos: [7, 0.7, 0], squash: [7, 0.6, 0], neck: [4, 0.55, 0] },
        firm: 0.45,
        trail: 0.25,
        steer: 0,
        enter: (f) => f.sidestep(),
        pose: (t, u, m, f) => stepPose(t, m, f, Math.sin(Math.PI * Math.min(1, 0.35 + u * 0.8))),
      },
      {
        dur: 0.18,
        firm: 0.3,
        steer: 0,
        brake: 13,
        pose: (t, u, m, f) => stepPose(t, m, f, 0.45 * (1 - u)),
      },
    ],
  },

  /** Parade : l'arme en travers devant le visage, bras repliés, corps tassé. */
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

  /**
   * Coup reçu : repoussée en arrière, écrasée, tête rejetée, bras en l'air. Le
   * coup arrive d'un côté ou de l'autre, tiré au sort (`hitSide`) : deux coups
   * de suite ne jouent pas la même réaction.
   */
  hit: {
    cancelFrom: 1,
    phases: [
      {
        dur: 0.12,
        tune: { neck: [5, 0.6, 0.8], hips: [7, 0.7, 0.6] },
        enter: (f) => f.knock(),
        pose: (t, _u, m, f) => {
          const hs = f.hitSide
          set(t.hips, -0.55, 0.35 * hs, 0.15 + 0.12 * hs)
          set(t.hipsPos, 0, -m.legLength * 0.12, -m.torsoRadius * 0.4)
          set(t.neck, -0.7, -0.3 * hs, 0.3 * hs)
          set(t['arm-1'], -0.6, 0, -1)
          set(t.arm1, -0.9, 0, 1.1)
          bend(t['elbow-1'], -0.2)
          bend(t.elbow1, -0.15)
          set(t['leg-1'], -0.4, 0, 0)
          set(t.leg1, -0.2, 0, 0)
          bend(t['knee-1'], 0.5)
          bend(t.knee1, 0.3)
          t.squash = 0.9
          set(t.weapon, -0.7, 0.6, -0.4)
        },
      },
      {
        dur: 0.4,
        pose: (t, u, m, f) => {
          const k = 1 - u
          set(t.hips, -0.25 * k, 0.15 * f.hitSide * k, 0)
          set(t.hipsPos, 0, -m.legLength * 0.08 * k, 0)
          set(t.neck, -0.2 * k, 0, 0.1 * f.hitSide * k)
          bend(t['elbow-1'], -0.4)
          bend(t.elbow1, -0.35)
          set(t.weapon, -0.5, -0.3, -0.8)
        },
      },
    ],
  },

  /**
   * K.O. : bascule sur le dos, et y reste. L'arme tombe à côté. Le buste et le
   * bassin ne suivent pas une pose : ils **tombent** (`topple`) — les bras et
   * la tête, eux, visent cette pose, mollement.
   */
  ko: {
    cancelFrom: 99,
    hold: true,
    phases: [
      {
        dur: 0.9,
        tune: { hips: [2.4, 0.75, 0], hipsPos: [3, 0.8, 0] },
        enter: (f) => {
          f.knock(0.5)
          f.fall()
        },
        pose: (t, _u, m) => {
          set(t.hips, -1.5, 0.3, 0)
          set(t.hipsPos, 0, m.torsoRadius * 0.95 - m.centerHeight, -m.centerHeight * 0.5)
          set(t.neck, -0.3, 0.6, 0)
          set(t['arm-1'], -0.3, 0, -1.2)
          set(t.arm1, 0, 0, 1)
          bend(t['elbow-1'], -0.25)
          bend(t.elbow1, -0.5)
          set(t['leg-1'], -0.6, 0, -0.3)
          set(t.leg1, -0.2, 0, 0.35)
          bend(t['knee-1'], 0.6)
          bend(t.knee1, 0.2)
          t.squash = 0.96
          set(t.weapon, -0.9, -0.3, 0.3)
        },
      },
    ],
  },

  /**
   * Appel du saut : un accroupi très bref — assez pour qu'on voie le corps se
   * charger, trop court pour qu'on attende. La poussée part à la fin
   * (`launch`) ; pendant l'appel on se déplace librement.
   */
  jump: {
    cancelFrom: 99,
    exit: (f) => f.launch(),
    phases: [
      {
        dur: 0.06,
        free: true,
        firm: 0.4,
        tune: { hipsPos: [9, 0.8, 0], squash: [9, 0.7, 0] },
        enter: (f) => f.bump(-1.2),
        pose: (t, _u, m) => {
          set(t.hips, 0.25, 0, 0)
          set(t.hipsPos, 0, -m.legLength * 0.24, 0)
          set(t['arm-1'], 0.5, 0, 0.2)
          set(t.arm1, 0.7, 0, 0.1)
          bend(t['elbow-1'], -0.3)
          bend(t.elbow1, -0.3)
          set(t.neck, 0.15, 0, 0)
          t.squash = 0.88
          set(t.weapon, -0.4, -0.8, -0.3)
        },
      },
    ],
  },

  /**
   * Attaque plongeante, en l'air : un temps suspendu, l'épingle levée des deux
   * mains, puis la chute droite, pointe en bas, jusqu'au sol (`slam`).
   */
  plunge: {
    cancelFrom: 99,
    hold: true,
    phases: [
      {
        dur: 0.12,
        tune: WIND,
        firm: 0.7,
        enter: (f) => f.hover(),
        pose: (t, _u, m) => {
          set(t.hips, -0.3, 0, 0)
          set(t.hipsPos, 0, m.legLength * 0.1, 0)
          set(t['arm-1'], -2.8, 0, 0.4)
          set(t.arm1, -2.6, 0, -0.4)
          bend(t['elbow-1'], -0.8)
          bend(t.elbow1, -0.8)
          set(t.neck, -0.25, 0, 0)
          set(t['leg-1'], -0.9, 0, -0.1)
          set(t.leg1, -0.6, 0, 0.1)
          bend(t['knee-1'], 1.6)
          bend(t.knee1, 1.2)
          t.squash = 0.95
          set(t.weapon, 0, 0.9, -0.3)
        },
      },
      {
        dur: 0.4,
        tune: STRIKE,
        firm: 1,
        trail: 1,
        enter: (f) => f.dive(),
        pose: (t, _u) => {
          set(t.hips, 0.55, 0, 0)
          set(t['arm-1'], -1.3, 0, 0.35)
          set(t.arm1, -1.1, 0, -0.35)
          bend(t['elbow-1'], -0.1)
          bend(t.elbow1, -0.3)
          set(t.neck, 0.35, 0, 0)
          set(t['leg-1'], -0.3, 0, -0.1)
          set(t.leg1, 0.1, 0, 0.1)
          bend(t['knee-1'], 0.7)
          bend(t.knee1, 0.4)
          t.squash = 1.12
          set(t.weapon, 0, -0.95, 0.3)
        },
      },
    ],
  },

  /** Réception du plongeon : impact au sol, puis on se relève. */
  slam: {
    cancelFrom: 1,
    phases: [
      {
        dur: 0.16,
        firm: 1,
        trail: 0.3,
        brake: 20,
        enter: (f) => f.impact(1.3),
        pose: (t, _u, m) => slamPose(t, m, 1.1),
      },
      {
        dur: 0.36,
        firm: 0.4,
        pose: (t, u, m) => slamPose(t, m, 1 - u, true),
      },
    ],
  },

  rise: RISE,
}

/** Frappe au sol, penchée sur l'arme : `k` de 1 (impact) à 0 (relevée). */
function slamPose(t: Target, m: RigMetrics, k: number, recover = false) {
  set(t.hips, 0.6 * k, 0, 0)
  set(t.hipsPos, 0, -m.legLength * 0.24 * k, m.torsoRadius * 0.45 * k)
  set(t['arm-1'], -1.2 * k, 0, 0.55 * k)
  set(t.arm1, -1.1 * k, 0, -0.5 * k)
  bend(t['elbow-1'], recover ? -0.4 : -0.08)
  bend(t.elbow1, recover ? -0.4 : -0.2)
  set(t.neck, 0.4 * k, 0, 0)
  set(t['leg-1'], -0.5 * k, 0, -0.2)
  set(t.leg1, 0.4 * k, 0, 0.2)
  if (!recover) t.squash = 0.92
  set(t.weapon, 0, recover ? -0.75 : -0.7, recover ? 0.66 : 0.72)
}

function parryPose(t: Target, m: RigMetrics) {
  set(t.hips, -0.12, 0.1, 0)
  set(t.hipsPos, 0, -m.legLength * 0.16, -m.torsoRadius * 0.1)
  set(t['arm-1'], -1.35, 0, 0.8)
  set(t.arm1, -1.5, 0, -0.85)
  bend(t['elbow-1'], -0.9)
  bend(t.elbow1, -1.1)
  set(t.neck, 0.3, 0, 0)
  set(t['leg-1'], -0.35, 0, -0.2)
  set(t.leg1, 0.35, 0, 0.2)
  t.squash = 0.95
  set(t.weapon, 0.95, 0.2, 0.25)
}

/**
 * Pose du pas de côté, dans la direction `f.dodgeDir` (repère du corps),
 * d'intensité `e`. Mélange de trois appuis : latéral, en arrière, en avant.
 */
function stepPose(t: Target, m: RigMetrics, f: Fighter, e: number) {
  const dx = f.dodgeDir.x
  const dz = f.dodgeDir.z
  const lat = Math.abs(dx)
  const back = Math.max(0, -dz)
  const fwd = Math.max(0, dz)
  // Côté vers lequel on part : +x est le côté 1.
  const lead: -1 | 1 = dx >= 0 ? 1 : -1
  // Le haut penche dans le mouvement (`z` < 0 vers +x) ; en arrière, le buste
  // reste au-dessus des pieds qui fuient.
  set(t.hips, (0.22 * back - 0.12 * fwd + 0.04) * e, -0.18 * dx * e, -0.34 * dx * e)
  set(t.hipsPos, 0, -m.legLength * 0.14 * e, 0)
  for (const side of [-1, 1] as const) {
    const isLead = side === lead
    const legX = ((isLead ? -0.12 : 0.08) * lat + (side === 1 ? 0.55 : -0.25) * back + (side === 1 ? -0.55 : 0.25) * fwd) * e
    set(t[LEG[side]], legX, 0, side * (isLead ? 0.5 : -0.18) * lat * e)
    bend(t[KNEE[side]], ((isLead ? 0.3 : 1.05) * lat + (side === 1 ? 0.35 : 0.9) * (back + fwd)) * e + 0.1)
    // Bras : celui du côté du pas se replie, l'autre part à l'opposé.
    const armX = (-0.35 * lat - 0.9 * back - 0.2 * fwd) * e
    set(t[ARM[side]], armX, 0, side * (isLead ? -0.15 : 0.95) * lat * e)
    bend(t[ELBOW[side]], ((isLead ? -1.2 : -0.35) * lat - 0.6 * (back + fwd)) * e - 0.25)
  }
  set(t.neck, 0.15 * back * e, 0.1 * dx * e, 0.26 * dx * e)
  t.squash = 1 - 0.06 * e
  set(t.weapon, -0.6 + 0.35 * dx * e, -0.35, 0.25 - 0.5 * back * e)
}

/**
 * Butées articulaires par axe (x, y, z), en radians. Le bassin n'en a pas.
 * Coudes et genoux ne plient que dans un sens.
 */
const ARM_LIM: [number, number][] = [[-3, 1.3], [-0.9, 0.9], [-1.6, 1.6]]
const LEG_LIM: [number, number][] = [[-1.6, 1.2], [-0.5, 0.5], [-0.8, 0.8]]
const ELBOW_LIM: [number, number][] = [[-2.4, 0.05], [0, 0], [0, 0]]
const KNEE_LIM: [number, number][] = [[-0.05, 2.4], [0, 0], [0, 0]]
const LIMITS: Partial<Record<BoneName, [number, number][]>> = {
  neck: [[-0.9, 0.9], [-0.9, 0.9], [-0.6, 0.6]],
  'arm-1': ARM_LIM,
  arm1: ARM_LIM,
  'leg-1': LEG_LIM,
  leg1: LEG_LIM,
  'elbow-1': ELBOW_LIM,
  elbow1: ELBOW_LIM,
  'knee-1': KNEE_LIM,
  knee1: KNEE_LIM,
}

// ---------------------------------------------------------------- combattant

/** Course normale, unités par seconde. */
const RUN_SPEED = 2
/** Sprint (touche tenue) : deux fois et demie la course. */
const SPRINT_SPEED = 5
/** Rayon de l'arène : on ne sort pas du tapis. Assez grand pour y sprinter. */
export const ARENA = 6
/** Temps pendant lequel un appui reste en file. */
const BUFFER = 0.28
/**
 * Gravité du saut. Montée plus douce que la descente : le sommet flotte, la
 * chute tombe — un saut symétrique lit comme une balle, pas comme un
 * personnage. Bouton lâché, la montée prend la gravité de chute : un appui
 * bref fait un petit bond, un appui tenu le grand saut.
 */
const G_UP = 20
const G_DOWN = 34
/** Angle du corps couché sur le dos, K.O. */
const KO_REST = 1.5
/** Sommet du grand saut, en fraction de la hauteur de la poupée. */
const JUMP_APEX = 0.38
/** Pas de côté : vitesse et petit bond (≈ 0,16 s de vol). */
const DODGE_SPEED = 5.4
const DODGE_HOP = 2.7

export type Press = 'attack' | 'dodge' | 'parry' | 'hit' | 'ko' | 'jump'

/** Bouffée de laine soulevée au sol, repère monde (voir `Dust`). */
export type Puff = { x: number; y: number; z: number; size: number }

export class Fighter {
  /** Pilote la racine (arène) ; sinon la platine tourne la poupée (planche). */
  drive: boolean
  /** Position de la racine ; `y` : hauteur au-dessus du sol (saut). */
  readonly pos = new THREE.Vector3()
  readonly vel = new THREE.Vector3()
  /** Vitesse verticale. */
  vy = 0
  /** En l'air : saut, pas de côté, plongeon. */
  airborne = false
  facing = 0
  /** Entrée de déplacement brute, repère de l'écran : x à droite, y vers le haut. */
  readonly input = { x: 0, y: 0 }
  /** Sprint tenu (Maj, gâchette). */
  sprint = false
  /** Saut tenu : la montée garde sa gravité douce tant qu'il l'est. */
  jumpHeld = false
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
  /** Direction du pas de côté en cours, repère du corps (x : gauche, z : avant). */
  readonly dodgeDir = { x: 0, z: -1 }
  /** Côté d'où vient le dernier coup reçu. */
  hitSide: -1 | 1 = 1
  /** Bouffées de laine à faire naître, vidées par `Dust`. */
  readonly puffs: Puff[] = []

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
  private m: RigMetrics | null = null
  /** Vrai saut en cours (pas un pas de côté) : gravité douce à la montée. */
  private jumping = false
  /** Vitesse au sol à l'appel : l'élan d'un sprint se garde en l'air. */
  private airSpeed = 0
  private skid = 0
  /** Regard d'attente : cible, temps restant, part (0 en mouvement). */
  private glance = { yaw: 0, pitch: 0, shift: 0, t: 1, w: 0, idle: 0 }
  private rnd: () => number
  /** Bascule du K.O. : angle, vitesse, au sol, recul du bassin. */
  private topple = { th: 0, w: 0, landed: false, zc: 0 }

  constructor(opts: { drive?: boolean; phase?: number } = {}) {
    this.drive = !!opts.drive
    this.time = opts.phase ?? 0
    // Tirage propre, déphasé : les six poupées de la planche ne regardent pas
    // ailleurs au même instant.
    let seed = Math.floor((opts.phase ?? 0) * 1e6) + 1
    this.rnd = () => {
      seed = (seed * 16807) % 2147483647
      return (seed - 1) / 2147483646
    }
    this.glance.t = 0.8 + this.rnd() * 2
    for (const k of Object.keys(DYN) as (keyof typeof DYN)[]) {
      const [f, z, r] = DYN[k]
      const n = k === 'squash' ? 1 : 3
      const init = k === 'squash' ? [1] : k === 'weapon' ? this.weaponDir.toArray() : [0, 0, 0]
      this.dyn[k] = new Dyn(n, f, z, r, init)
    }
  }

  get current(): string {
    if (this.action) return this.action.name
    if (this.airborne) return 'air'
    const sp = Math.hypot(this.vel.x, this.vel.z)
    return sp > RUN_SPEED + 0.5 ? 'sprint' : sp > 0.22 ? 'run' : 'idle'
  }

  /** Part du sprint dans l'allure (0 à la course normale, 1 à pleine vitesse). */
  get dash() {
    const sp = Math.hypot(this.vel.x, this.vel.z)
    return Math.max(0, Math.min(1, (sp - RUN_SPEED) / (SPRINT_SPEED - RUN_SPEED)))
  }

  /** Un appui. Mis en file s'il ne peut pas partir tout de suite. */
  press(p: Press) {
    if (p === 'ko' && this.action?.name === 'ko') {
      // Relevée : la vie revient, et on se remet debout.
      this.hp = 1
      this.getUp()
      return
    }
    if (p === 'jump') this.jumpHeld = true
    if (this.action?.name === 'ko') return
    if (p === 'hit') {
      this.hp = Math.max(0, this.hp - 0.18)
      if (this.hp <= 0) p = 'ko'
    }
    if (!this.tryStart(p)) this.queued = { press: p, t: BUFFER }
  }

  /** Relâchement : seul le saut s'en sert (hauteur variable). */
  release(p: Press) {
    if (p === 'jump') this.jumpHeld = false
  }

  // --- effets appelés par les phases

  /** Élan vers l'avant, à l'entrée d'une frappe. */
  lunge(v: number) {
    this.vel.x += Math.sin(this.facing) * v
    this.vel.z += Math.cos(this.facing) * v
  }

  /**
   * Pas de côté : part dans la direction du stick **sans changer de cap**, ou
   * en arrière sans direction. Un petit bond, que la gravité termine.
   */
  sidestep() {
    const w = this.wish()
    let wx = -Math.sin(this.facing)
    let wz = -Math.cos(this.facing)
    const l = Math.hypot(w.x, w.z)
    if (l > 0.1) {
      wx = w.x / l
      wz = w.z / l
    }
    const c = Math.cos(this.facing)
    const s = Math.sin(this.facing)
    // Monde → corps : +x du corps est (cos, −sin), l'avant (sin, cos).
    this.dodgeDir.x = wx * c - wz * s
    this.dodgeDir.z = wx * s + wz * c
    this.vel.set(wx * DODGE_SPEED, 0, wz * DODGE_SPEED)
    this.takeoff(DODGE_HOP, false)
    this.dyn.squash.kick(0, -0.7)
  }

  /** Poussée du saut, à la fin de l'appel. */
  launch() {
    const h = (this.m?.height ?? 2) * JUMP_APEX
    this.takeoff(Math.sqrt(2 * G_UP * h), true)
    this.airSpeed = Math.hypot(this.vel.x, this.vel.z)
    // Étiré par la poussée ; la tête reste un instant en arrière.
    this.dyn.squash.kick(0, 2.2)
    this.dyn.neck.kick(0, -1.5)
    this.puff(this.pos.x, this.pos.z, 0.55)
  }

  private takeoff(vy: number, jump: boolean) {
    this.vy = vy
    this.airborne = true
    this.jumping = jump
    this.pos.y = Math.max(this.pos.y, 1e-3)
  }

  /** Plongeon : un temps suspendu avant la chute. */
  hover() {
    this.vy = Math.max(this.vy, 1.5)
    this.vel.multiplyScalar(0.4)
    this.jumping = false
  }

  dive() {
    this.vy = -11
    this.vel.multiplyScalar(0.5)
  }

  /**
   * Retour au sol. La réception dépend de la vitesse de chute : écrasement,
   * bassin qui descend — les genoux plient —, tête qui pique.
   */
  private touchdown() {
    const v = Math.max(0, -this.vy)
    this.pos.y = 0
    this.vy = 0
    this.airborne = false
    this.jumping = false
    if (this.action?.name === 'plunge') {
      this.start('slam')
      return
    }
    const k = Math.min(1, v / 7)
    this.dyn.squash.kick(0, -0.4 - 2.4 * k)
    this.dyn.hipsPos.kick(1, -0.4 - 1.6 * k)
    this.dyn.neck.kick(0, 2 * k)
    this.dyn.hips.kick(0, 1.2 * k)
    if (k > 0.75) this.shake = Math.max(this.shake, 0.22 * k)
    this.puff(this.pos.x, this.pos.z, 0.35 + 0.7 * k)
  }

  /**
   * Pied posé : le corps se tasse un peu, d'autant plus qu'on court. C'est le
   * rythme des pas qui rythme le corps — pas une horloge. Au sprint, les pas
   * sont deux fois plus nombreux : chacun tasse moins, et soulève sa bouffée.
   */
  land(speed: number, side: -1 | 1 = 1, dur = 0.15, at?: THREE.Vector3) {
    const run = Math.min(1, speed / RUN_SPEED)
    const dash = this.dash
    this.step.side = side
    this.step.t = 0
    this.step.dur = dur
    const k = 1 - 0.55 * dash
    this.dyn.squash.kick(0, (-0.5 * run - 0.1) * k)
    this.dyn.hipsPos.kick(1, -0.35 * run * k)
    if (at && dash > 0.5) this.puff(at.x, at.z, 0.18 + 0.12 * dash)
  }

  puff(x: number, z: number, size: number) {
    if (!this.drive) return
    if (this.puffs.length > 24) this.puffs.shift()
    this.puffs.push({ x, y: this.floorY, z, size })
  }

  /** Au sol et libre d'y marcher : ni en l'air, ni K.O., ni soulevée par un geste. */
  get grounded() {
    if (this.airborne) return false
    const a = this.action
    // Couchée, ou assise en train de se relever : les jambes suivent la pose.
    if (a?.name === 'ko' || (a?.name === 'rise' && a.phase === 0)) return false
    return this.pose.hipsPos[1] < 0.06
  }

  /** Petit rebond d'élan. */
  bump(v: number) {
    this.dyn.squash.kick(0, v)
  }

  /** Impact au sol : gel d'image, secousse, écrasement. */
  impact(k = 1) {
    this.freeze = 0.075
    this.shake = k
    this.dyn.squash.kick(0, -1.6 * k)
    this.vel.multiplyScalar(0.2)
    this.puff(this.tipWorld.x, this.tipWorld.z, 0.7 * k)
  }

  /** Repoussée en arrière, d'un côté ou de l'autre. */
  knock(k = 1) {
    this.hitSide = Math.random() < 0.5 ? -1 : 1
    const c = Math.cos(this.facing)
    const s = Math.sin(this.facing)
    // En arrière, et un peu de côté : le coup vient de `hitSide`.
    this.vel.x += (-s * 3 - c * this.hitSide * 0.8) * k
    this.vel.z += (-c * 3 + s * this.hitSide * 0.8) * k
    this.dyn.squash.kick(0, -1.2)
    this.dyn.hips.kick(1, 2.5 * this.hitSide)
    this.shake = Math.max(this.shake, 0.5)
    this.freeze = 0.05
  }

  /**
   * Chute du K.O. : le corps bascule en arrière **autour des pieds**, comme un
   * bâton qu'on lâche — lentement d'abord, puis de plus en plus vite
   * (`θ'' = g/h · sin θ`). Au contact du dos, rebond amorti, bouffée, secousse ;
   * puis il se balance sur son dos rond jusqu'à s'y poser.
   */
  fall() {
    const T = this.topple
    T.th = Math.max(0, -this.pose.hips[0])
    T.w = 1.1
    T.landed = false
    T.zc = 0
  }

  private toppleStep(dt: number, m: RigMetrics) {
    const T = this.topple
    const c = m.centerHeight
    const lie = m.torsoRadius * 0.95
    if (!T.landed) {
      // Une peluche tombe moins vite qu'un bâton : gravité ressentie réduite.
      T.w += (6 / c) * Math.sin(T.th + 0.05) * dt
      T.th += T.w * dt
      T.zc = -c * Math.sin(T.th)
      if (c * Math.cos(T.th) <= lie) {
        T.landed = true
        const k = Math.min(1, T.w / 5)
        T.w *= -0.3
        this.dyn.squash.kick(0, -1.8 * k)
        this.dyn.neck.kick(0, -3 * k)
        this.shake = Math.max(this.shake, 0.45 * k)
        this.freeze = 0.04
        const cf = Math.cos(this.facing)
        const sf = Math.sin(this.facing)
        this.puff(this.pos.x + sf * T.zc, this.pos.z + cf * T.zc, 0.8)
      }
    } else {
      // Posée : elle se balance sur son dos et s'arrête.
      T.w += (-55 * (T.th - KO_REST) - 7 * T.w) * dt
      T.th += T.w * dt
    }
    this.pose.hips[0] = -T.th
    this.pose.hipsPos[1] = Math.max(c * Math.cos(T.th), lie) - c
    this.pose.hipsPos[2] = T.zc
  }

  /** Relevée : les ressorts repartent de la pose au sol, pas d'une pose rêvée. */
  private getUp() {
    const T = this.topple
    this.dyn.hips.snap(0, -T.th)
    this.dyn.hipsPos.snap(1, this.pose.hipsPos[1])
    this.dyn.hipsPos.snap(2, this.pose.hipsPos[2])
    this.start('rise')
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
    // En l'air : seule l'attaque part (en plongeon) ; le reste attend le sol.
    if (this.airborne) {
      if (p === 'attack' && (!a || a.name === 'dodge')) {
        this.start('plunge')
        return true
      }
      return false
    }
    if (p === 'jump' || p === 'dodge') {
      // Saut et esquive annulent tout sauf l'instant même d'une frappe.
      if (!a || canCancel || a.name === 'parry') {
        this.start(p)
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
    this.queued = null
    ACTIONS[name].phases[0].enter?.(this)
  }

  update(realDt: number, m: RigMetrics) {
    this.m = m
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
    let tune: Phase['tune'] | undefined
    let ph: Phase | null = null

    // --- geste en cours
    const a = this.action
    if (a) {
      const act = ACTIONS[a.name]
      a.t += dt
      let cur = act.phases[a.phase]
      while (a.t >= cur.dur) {
        if (a.phase + 1 < act.phases.length) {
          a.t -= cur.dur
          a.phase++
          cur = act.phases[a.phase]
          cur.enter?.(this)
        } else if (act.hold) {
          a.t = cur.dur
          break
        } else {
          this.action = null
          act.exit?.(this)
          break
        }
      }
      // `exit` a pu lancer un autre geste : on relit.
      if (this.action === a) {
        ph = cur
        cur.pose(t, Math.min(1, a.t / cur.dur), m, this)
        tune = cur.tune
        firm = cur.firm ?? 0
        trail = cur.trail ?? 0
      }
    }

    // File d'attente : l'appui part dès que le geste le permet.
    if (this.queued) {
      this.queued.t -= dt
      if (this.queued.t <= 0) this.queued = null
      else if (this.tryStart(this.queued.press)) this.queued = null
    }
    if (this.action !== a && this.action) {
      // Un geste vient de partir (file, `exit`) : sa phase compte dès cette image.
      const cur = ACTIONS[this.action.name].phases[this.action.phase]
      ph = cur
      clearTarget(t)
      cur.pose(t, 0, m, this)
      tune = cur.tune
      firm = cur.firm ?? 0
      trail = cur.trail ?? 0
    }
    const free = !this.action || !!ph?.free
    const steer = !this.action ? 1 : (ph?.steer ?? 0)

    // --- déplacement
    const w = this.wish()
    const wl = Math.min(1, w.length())
    if (this.drive) this.move(dt, w, wl, free, steer, ph)

    // --- pose de fond : attente, course, vol — sous le geste
    let locoTune: Phase['tune'] | undefined
    if (!this.action) {
      if (this.airborne) this.airPose(t, m)
      else locoTune = this.locomotion(t, m, dt)
    }

    // --- ressorts : chaque partie vers sa cible
    for (const k of Object.keys(DYN) as (keyof typeof DYN)[]) {
      const [f, z, r] = tune?.[k] ?? locoTune?.[k] ?? DYN[k]
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
    if (this.action?.name === 'ko') this.toppleStep(dt, m)
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
     * se pose sur le pied d'appui — pieds fixés au sol. Un corps rigide qui
     * tourne lit comme un objet, un corps qui ploie comme de la mousse.
     *
     * Le report sur le pied d'appui y comptait pour 0,6 du dandinement : avec
     * le roulis du bassin et la tête, la poupée tanguait de droite à gauche à
     * chaque pas — « elle remue trop ». Ramené à 0,35 d'un dandinement lui-même
     * divisé par trois.
     */
    if (this.drive && !this.airborne) {
      const cf = Math.cos(this.facing)
      const sf = Math.sin(this.facing)
      const aFwd = this.accel.x * sf + this.accel.z * cf
      const aSide = this.accel.x * cf - this.accel.z * sf
      const lim = (v: number) => Math.max(-0.13, Math.min(0.13, v))
      _sh[0] = lim(-aSide * 0.007 - this.waddle * 0.35)
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

  /** Racine : course, sprint, vol, gestes ; cap. */
  private move(dt: number, w: THREE.Vector3, wl: number, free: boolean, steer: number, ph: Phase | null) {
    _prev.copy(this.vel)
    const speed0 = Math.hypot(this.vel.x, this.vel.z)
    const wLen = Math.max(w.length(), 1e-6)
    if (this.airborne) {
      // En l'air, on garde son élan ; le stick infléchit, sans freiner un
      // saut pris au sprint.
      if (free && wl > 0.1) {
        const cap = Math.max(RUN_SPEED, this.airSpeed)
        _tv.copy(w).multiplyScalar((cap * wl) / wLen)
        this.vel.lerp(_tv, Math.min(1, dt * 2.5))
      }
      const g = this.vy > 0 && this.jumping && this.jumpHeld ? G_UP : G_DOWN
      this.vy -= g * dt
      this.pos.y += this.vy * dt
      if (this.pos.y <= 0) this.touchdown()
    } else if (free) {
      const cap = this.sprint ? SPRINT_SPEED : RUN_SPEED
      _tv.copy(w).multiplyScalar((cap * wl) / wLen)
      const tl = _tv.length()
      /*
       * Démarrage vif, arrêt net : c'est le corps qui dit l'inertie, pas la
       * racine qui glisse. Sauf au sprint : la prise d'élan se voit (0,35 s
       * jusqu'à pleine vitesse), le virage s'élargit, et l'arrêt glisse — la
       * seule glissade qui se lise comme voulue.
       */
      let rate = wl > 0.1 ? 11 : 16
      if (tl > RUN_SPEED + 0.1 && tl > speed0 + 0.05) rate = 4.5
      else if (speed0 > RUN_SPEED + 0.5) rate = tl < speed0 - 0.5 ? 5.5 : 7
      this.vel.lerp(_tv, Math.min(1, dt * rate))
    } else {
      // Pendant un geste l'élan s'amortit, et le stick corrige un peu.
      this.vel.multiplyScalar(Math.exp(-dt * (ph?.brake ?? 6)))
      this.vel.addScaledVector(w, RUN_SPEED * steer * dt * 4)
    }
    this.accel.subVectors(this.vel, _prev).divideScalar(Math.max(dt, 1e-4))
    // Glissade de sprint : de la laine sous les pieds.
    const speed = Math.hypot(this.vel.x, this.vel.z)
    this.skid -= dt
    if (!this.airborne && speed > 2.6 && this.accel.dot(this.vel) < -8 * speed && this.skid <= 0) {
      this.skid = 0.06
      this.puff(this.pos.x + this.vel.x * 0.05, this.pos.z + this.vel.z * 0.05, 0.22)
    }
    this.pos.x += this.vel.x * dt
    this.pos.z += this.vel.z * dt
    const r = Math.hypot(this.pos.x, this.pos.z)
    if (r > ARENA) {
      this.pos.x *= ARENA / r
      this.pos.z *= ARENA / r
      // Au bord, on perd la part de vitesse qui sort, pas celle qui longe.
      const nx = this.pos.x / ARENA
      const nz = this.pos.z / ARENA
      const out = this.vel.x * nx + this.vel.z * nz
      if (out > 0) {
        this.vel.x -= out * nx
        this.vel.z -= out * nz
      }
    }
    // Cap : vers la direction voulue, vite mais pas instantanément. Au
    // sprint il tourne plus large ; en l'air, à peine.
    const prevFacing = this.facing
    if (wl > 0.15 && steer > 0) {
      const want = Math.atan2(w.x, w.z)
      let d = want - this.facing
      d = Math.atan2(Math.sin(d), Math.cos(d))
      const rate = this.airborne ? 5 : this.action && !free ? 4 : 13 - 6 * this.dash
      this.facing += d * Math.min(1, dt * rate)
    }
    let df = this.facing - prevFacing
    df = Math.atan2(Math.sin(df), Math.cos(df))
    this.turnRate += (df / Math.max(dt, 1e-4) - this.turnRate) * Math.min(1, dt * 10)
  }

  /**
   * Attente, course et sprint.
   *
   * Course en petits bonds — une peluche sautille — avec l'écrasement à chaque
   * appui. Le corps penche dans l'accélération et dans les virages, l'arme
   * traîne derrière, pointe au sol. Au sprint : buste penché loin devant,
   * tête relevée pour compenser, bras pliés qui pompent, arme couchée
   * derrière — et presque plus de roulis.
   *
   * À l'arrêt, la poupée n'est pas une statue : elle respire, et au bout d'un
   * moment regarde ailleurs (`glance`) — la tête d'abord, le buste suit un
   * peu, le poids passe d'un pied sur l'autre.
   */
  private locomotion(t: Target, m: RigMetrics, dt: number): Phase['tune'] | undefined {
    const speed = Math.hypot(this.vel.x, this.vel.z)
    const run = Math.min(1, speed / RUN_SPEED)
    const dash = this.dash
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
    /*
     * Dandinement : le poids passe sur le pied d'appui. **Discret** : à 0,1 rad
     * de roulis par pas, relayé par le cisaillement et la tête, la poupée
     * tanguait comme un culbuto. Presque rien au sprint : on court droit.
     */
    const wTarget = run > 0.1 ? -this.step.side * 0.035 * run * (1 - 0.6 * dash) : 0
    this.waddle += (wTarget - this.waddle) * Math.min(1, dt * 10)
    const breathe = Math.sin(this.time * 2.3)
    const sway = Math.sin(this.time * 1.15)

    // --- regard d'attente
    const g = this.glance
    g.idle = run < 0.1 ? g.idle + dt : 0
    g.t -= dt
    if (g.t <= 0) {
      const back = this.rnd() < 0.35
      g.yaw = back ? 0 : (this.rnd() - 0.5) * 1.1
      g.pitch = back ? 0 : (this.rnd() - 0.6) * 0.35
      g.shift = (this.rnd() - 0.5) * 0.09
      g.t = 1.6 + this.rnd() * 2.8
    }
    g.w += ((g.idle > 1.4 ? 1 : 0) - g.w) * Math.min(1, dt * 2.5)
    const gw = g.w

    // Accélération dans le repère de la poupée : avant / côté.
    const cf = Math.cos(this.facing)
    const sf = Math.sin(this.facing)
    const aFwd = this.accel.x * sf + this.accel.z * cf
    const clampA = (v: number, k: number, lim: number) => Math.max(-lim, Math.min(lim, v * k))
    /*
     * Poids de l'arme : seulement dans l'arène. Sur la planche et en
     * présentation la poupée se tient **droite** — le penché vers l'arme (0,07
     * rad) et le bras tiré la faisaient toutes pencher du même côté dans le
     * menu de sélection. Le balancement y reste, à peine.
     */
    const armed = this.drive ? 1 : 0
    const swayK = this.drive ? 1 : 0.35

    set(
      t.hips,
      // Inertie : le corps reste en arrière quand on accélère et continue
      // vers l'avant quand on freine — la racine obéit, le corps traîne.
      0.04 * armed + 0.16 * run + 0.3 * dash + hop * 0.04 * run * (1 - dash) - clampA(aFwd, 0.045, 0.4),
      // Torsion de foulée : à 0,16 rad elle se lisait comme un roulis de plus.
      s * 0.06 * run * (1 - 0.5 * dash) + g.yaw * 0.25 * gw,
      // Penché vers l'arme au repos (son poids, arène seulement), dans le
      // virage — plus fort au sprint, comme un coureur qui prend un virage —,
      // sur le pied d'appui. Le report de poids du regard d'attente, lui
      // aussi, ne vaut que dans l'arène : sur la planche la poupée reste droite.
      0.07 * armed * (1 - run) +
        clampA(this.turnRate, -0.07 - 0.06 * dash, 0.35 + 0.15 * dash) +
        sway * 0.02 * swayK * (1 - run) +
        this.waddle +
        g.shift * gw * armed,
    )
    // Le rebond de course vient surtout des pas posés (`land`) ; ici un fond.
    // Corps plus bas en course, plus encore au sprint : les genoux plient.
    // Genoux souples à l'arrêt aussi (arène seulement : sur la planche, pas
    // d'IK, les pieds s'enfonceraient).
    const soft = this.drive ? -0.04 * m.legLength * (1 - run) : 0
    set(
      t.hipsPos,
      0,
      (hop * 0.05 * (1 - 0.5 * dash) - 0.12 - 0.06 * dash) * m.legLength * run + breathe * m.torsoRadius * 0.015 + soft,
      0,
    )
    t.squash = 1 + breathe * 0.015 * (1 - run) + (hop - 0.55) * 0.05 * run * (1 - 0.6 * dash)
    set(t['leg-1'], -s * 0.8 * run, 0, 0)
    set(t.leg1, s * 0.8 * run, 0, 0)
    bend(t['knee-1'], 0.15 + 0.3 * run)
    bend(t.knee1, 0.15 + 0.3 * run)
    // Bras de l'arme tiré vers l'arrière et vers le bas par le poids ; l'autre
    // balance à contretemps et compense. Coudes pliés d'autant plus qu'on
    // court : bras ballants à l'arrêt, repliés en course, en équerre au sprint.
    // Le poids de l'arme ne tire le bras que dans l'arène.
    set(t['arm-1'], 0.35 * run - 0.1 * armed + 0.5 * dash, 0, 0.3 * armed - 0.1 * run)
    bend(t['elbow-1'], -0.4 - 0.3 * run - 0.4 * dash + breathe * 0.03 * (1 - run))
    const swing = s * (0.9 + 0.3 * dash) * run
    set(t.arm1, swing - 0.1 * armed + sway * 0.05 * swayK * (1 - run) + 0.1 * dash, 0, -0.1 * run + 0.08 * armed)
    // L'avant-bras remonte quand le bras part devant : un vrai balancier.
    bend(t.elbow1, -0.25 - 0.45 * run - 0.6 * dash - 0.35 * Math.max(0, -s) * run + breathe * 0.04 * (1 - run))
    // La tête exagère ce que fait le corps, avec retard : elle part en
    // arrière au démarrage, pique en avant à l'arrêt, contre le dandinement.
    // Au sprint elle se relève contre le buste penché.
    set(
      t.neck,
      -0.12 * run - 0.24 * dash + Math.sin(this.time * 2.3 + 1) * 0.04 - clampA(aFwd, 0.05, 0.45) + g.pitch * gw,
      clampA(this.turnRate, 0.06, 0.4) + g.yaw * 0.75 * gw,
      -sway * 0.05 * swayK * (1 - run) - this.waddle * 0.8,
    )
    // Au repos, plantée pointe au sol devant elle, du côté de l'arme : on la
    // voit, et on voit qu'elle est trop grande. En course elle traîne derrière,
    // au sprint elle se couche presque à l'horizontale.
    set(
      t.weapon,
      -0.5 + 0.28 * run + 0.2 * dash,
      -0.72 + 0.34 * run + 0.35 * dash,
      0.42 - 1.3 * run - 0.1 * dash,
    )
    if (dash <= 0) return undefined
    // Au sprint le balancier bat deux fois plus vite : le bras libre doit suivre.
    _locoTune.arm1![0] = 2.6 + 4 * dash
    _locoTune.elbow1![0] = 3.2 + 3 * dash
    return _locoTune
  }

  /**
   * En l'air : à la montée le corps s'étire, genoux repliés, bras levés ; à la
   * descente les jambes se tendent vers le sol et les bras moulinent un peu —
   * la chute d'une peluche, pas d'un athlète.
   */
  private airPose(t: Target, m: RigMetrics) {
    const v0 = Math.sqrt(2 * G_UP * m.height * JUMP_APEX)
    const r = Math.max(-1, Math.min(1, this.vy / v0))
    const a = (1 + r) / 2
    const fl = Math.sin(this.time * 16) * (1 - a)
    const hs = Math.min(1, Math.hypot(this.vel.x, this.vel.z) / RUN_SPEED)
    set(t.hips, -0.1 * a + 0.16 * (1 - a) + 0.15 * hs, 0, 0)
    set(t['leg-1'], -0.9 * a - 0.35 * (1 - a), 0, -0.05)
    set(t.leg1, -0.35 * a - 0.1 * (1 - a), 0, 0.08)
    bend(t['knee-1'], 1.7 * a + 0.45 * (1 - a))
    bend(t.knee1, 0.9 * a + 0.25 * (1 - a))
    set(t['arm-1'], -0.9 * a - 0.6 * (1 - a), 0, 0.1 - 0.5 * (1 - a))
    bend(t['elbow-1'], -0.6)
    set(t.arm1, -1.9 * a - 0.7 * (1 - a) + fl * 0.25, 0, 0.2 + 0.9 * (1 - a) + fl * 0.2)
    bend(t.elbow1, -0.3 - 0.5 * a)
    set(t.neck, -0.25 * a + 0.3 * (1 - a), 0, 0)
    t.squash = 1 + 0.1 * Math.abs(r)
    set(t.weapon, -0.4, -0.75 * a + 0.35 * (1 - a), -0.5)
  }
}

const _wish = new THREE.Vector3()
const _prev = new THREE.Vector3()
const _tv = new THREE.Vector3()
const _wd = new THREE.Vector3()
const _sq = [1]
const _sh = [0, 0]
const _arr: number[] = [0, 0, 0]
const _locoTune: NonNullable<Phase['tune']> = { arm1: [2.6, 0.55, 0.25], elbow1: [3.2, 0.45, 0.1] }
