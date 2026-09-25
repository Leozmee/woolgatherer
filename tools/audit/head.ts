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

