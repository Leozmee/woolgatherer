import * as THREE from 'three'
import { useMemo } from 'react'
import { useDisposableList } from '../core/useDisposable'
import { mulberry32, clamp } from '../core/rand'
import { ButtonEye, Thread, jitterColor, type ButtonHoles, type ButtonThread } from './parts'
import { onHead } from './surface'
import {
  EXPRESSIONS,
  LiveFace,
  TUBE_T,
  type Expression,
  type LidPose,
  type LidPoses,
  type LidSpot,
  type LiveSlot,
  type LiveThreads,
} from './expression'
import type { Fighter } from './fighter'
import type { WoodMaps } from './wood'
import type { DollParams } from './params'

/**
 * Visage de la poupée : humeur, point de bouche, boutons et un détail.
 *
 * Deux boutons et une rangée de points de croix, c'est la signature de la
 * poupée vaudou — et c'est aussi ce qui rendait les six visages d'une planche
 * interchangeables : morphologie, laine et ornements avaient beau changer, on
 * voyait six fois la même tête. Chaque visage se compose donc de quatre choix
 * qui restent tous **cousus** — fil, boutons, feutre, points noués — pour ne
 * pas quitter la matière de la série :
 *
 * - une **humeur**, qui décide ensemble de la courbe de la bouche, des
 *   sourcils brodés et des paupières de feutre : tirés séparément, un sourire
 *   sous des sourcils froncés lit comme une erreur, pas comme une expression ;
 * - un **point** pour la bouche : croix, points avant, suture, zigzag ;
 * - des **boutons** à deux ou quatre trous, cousus en croix, en parallèle, en
 *   barre ou par l'arrière — parfois dépareillés ;
 * - un **détail**, le seul élément qui ne soit pas sur toutes les poupées :
 *   bouton arraché, œil cousu en croix, cicatrice, joues brodées, taches de
 *   rousseur, bouton-nez, larme.
 *
 * Ce qui exprime — bouche, sourcils, paupières — est animé (`expression.tsx`)
 * : dans l'arène le visage répond au combattant. Le reste est fixe et fusionné.
 */
/**
 * Agrandissement des boutons-yeux, en plus du panneau.
 *
 * Le rendu anime passe par le visage : des yeux plus grands portent plus
 * d'expression et se lisent de loin. Tout ce qui se place autour — sourcils,
 * pommettes, larme, lisière des franges — se prend sur la taille réelle des
 * boutons, donc suit.
 */
export const EYE_SCALE = 1.2

export type Mood = 'joyeux' | 'triste' | 'fache' | 'surpris' | 'espiegle' | 'placide' | 'endormi' | 'inquiet'
export type MouthStitch = 'croix' | 'avant' | 'suture' | 'zigzag'
export type Accent = 'arrache' | 'croix' | 'cicatrice' | 'joues' | 'rousseur' | 'nez' | 'larme'

/**
 * Huit humeurs pour six poupées : la planche en tire six différentes, et
 * d'une génération à l'autre ce ne sont pas toujours les mêmes six. Les deux
 * dernières n'existent que depuis les paupières — un œil lourd ou inquiet ne
 * se dit pas avec une bouche et deux traits.
 */
export const MOODS: readonly Mood[] = ['joyeux', 'triste', 'fache', 'surpris', 'espiegle', 'placide', 'endormi', 'inquiet']
const STITCHES: readonly MouthStitch[] = ['croix', 'avant', 'suture', 'zigzag']
const ACCENTS: readonly Accent[] = ['arrache', 'croix', 'cicatrice', 'joues', 'rousseur', 'nez', 'larme']

type EyeLook = { holes: ButtonHoles; pattern: ButtonThread }

export type FaceLook = {
  mood: Mood
  stitch: MouthStitch
  accent: Accent
  /** Côté du détail et de l'humeur asymétrique : −1 gauche, +1 droite. */
  side: -1 | 1
  /** Écart au nombre de points du panneau. */
  stitchDelta: number
  eyes: [EyeLook, EyeLook]
  /** Graine propre au visage : taches de rousseur, bouts de fil, clignement. */
  seed: number
}

function drawEye(rnd: () => number): EyeLook {
  const holes: ButtonHoles = rnd() < 0.7 ? 4 : 2
  const u = rnd()
  const pattern: ButtonThread =
    holes === 2 ? (u < 0.75 ? 'bar' : 'none') : u < 0.5 ? 'x' : u < 0.8 ? 'parallel' : 'none'
  return { holes, pattern }
}

function drawRest(rnd: () => number) {
  const side: -1 | 1 = rnd() < 0.5 ? -1 : 1
  const stitchDelta = Math.floor(rnd() * 3) - 1
  const left = drawEye(rnd)
  // Tiré dans tous les cas, gardé une fois sur quatre : sauter le tirage
  // décalerait toute la suite de la graine.
  const other = drawEye(rnd)
  const odd = rnd() < 0.25
  const seed = Math.floor(rnd() * 1e6)
  return { side, stitchDelta, eyes: [left, odd ? other : left] as [EyeLook, EyeLook], seed }
}

function shuffled<T>(list: readonly T[], rnd: () => number): T[] {
  const out = [...list]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

const pick = <T,>(list: readonly T[], rnd: () => number) => list[Math.floor(rnd() * list.length)]

/** Visage d'une poupée seule. */
export function faceLook(seed: number): FaceLook {
  const rnd = mulberry32(seed + 3301)
  return {
    mood: pick(MOODS, rnd),
    stitch: pick(STITCHES, rnd),
    accent: pick(ACCENTS, rnd),
    ...drawRest(rnd),
  }
}

/**
 * Visages d'une planche : six humeurs et six détails **tous différents**.
 *
 * Même règle que pour les laines et les archétypes : tirés poupée par poupée,
 * deux visages d'une même génération tombent vite sur la même humeur ou le même
 * détail, et c'est précisément la répétition que l'œil relève. Les humeurs sont
 * distribuées sans répétition, les détails aussi, et le point de bouche au plus
 * deux fois — quatre points pour six poupées, la répétition est inévitable, le
 * doublé est le mieux qu'on puisse faire.
 */
export function boardFaces(seed: number, count: number): FaceLook[] {
  const rnd = mulberry32(seed + 3301)
  const moods = shuffled(MOODS, rnd)
  const accents = shuffled(ACCENTS, rnd)
  const stitches = shuffled([...STITCHES, ...STITCHES], rnd)
  return Array.from({ length: count }, (_, i) => ({
    mood: moods[i % moods.length],
    accent: accents[i % accents.length],
    stitch: stitches[i % stitches.length],
    ...drawRest(rnd),
  }))
}

// ---------------------------------------------------------------- poses

/**
 * Sourcil, en tailles de bouton **au-dessus du centre de l'œil** : hauteur du
 * bout intérieur, du bout extérieur, bombé au milieu, et resserrement vers le
 * nez (le froncement rapproche les sourcils autant qu'il les abaisse).
 */
type BrowPose = { inner: number; outer: number; arch: number; knit: number }

/**
 * Bouche, en largeurs de bouche du panneau : largeur, sourire (+) ou moue
 * (−), coin relevé du côté de l'humeur, ondulation, ouverture et forme de
 * l'ouverture (1 : un « o » centré sur la ligne ; 0 : un « D », lèvre du haut
 * droite et tout le creux en bas — le cri), décalage vertical.
 */
type MouthPose = { width: number; curve: number; tilt: number; wave: number; open: number; round: number; dy: number }

/** Tout ce qu'une expression décide : bouche, sourcils, paupières, croix du K.O. */
export type FacePose = { mouth: MouthPose; brows: [BrowPose, BrowPose]; lids: [LidPose, LidPose]; cross: boolean }

const M = (o: Partial<MouthPose>): MouthPose => ({ width: 0.8, curve: 0, tilt: 0, wave: 0, open: 0, round: 1, dy: 0, ...o })
const B = (inner: number, outer: number, arch = 0.1, knit = 0): BrowPose => ({ inner, outer, arch, knit })
const Lp = (upper: number, tilt = 0, lower = 0): LidPose => ({ upper, tilt, lower })
const both = <T,>(x: T): [T, T] => [x, x]
/** Paire (gauche, droite) dont `own` va du côté `side`. */
const bySide = <T,>(side: -1 | 1, own: T, other: T): [T, T] => (side < 0 ? [own, other] : [other, own])

/**
 * Humeurs au repos.
 *
 * Les paupières portent la moitié de l'expression : une bouche seule dit
 * content ou pas content, l'œil dit le reste — lourd (placide, endormi),
 * incliné vers le nez (fâché) ou vers la tempe (triste, inquiet), plissé par
 * en bas (joyeux). Les sourcils n'ont plus d'humeur « sans » : un visage sans
 * sourcils lisait comme un visage inachevé, pas comme un visage neutre.
 */
const REST: Record<Mood, (side: -1 | 1) => FacePose> = {
  joyeux: () => ({ mouth: M({ width: 1, curve: 0.16 }), brows: both(B(1.6, 1.56, 0.26)), lids: both(Lp(0.04, 0, 0.3)), cross: false }),
  triste: () => ({ mouth: M({ width: 0.9, curve: -0.13, dy: -0.05 }), brows: both(B(1.86, 1.36, 0.06)), lids: both(Lp(0.3, -0.7)), cross: false }),
  fache: () => ({ mouth: M({ width: 0.75, curve: -0.05, dy: -0.02 }), brows: both(B(1.3, 1.8, 0, 0.1)), lids: both(Lp(0.3, 0.85)), cross: false }),
  surpris: () => ({ mouth: M({ width: 0.4, open: 0.44 }), brows: both(B(1.92, 1.86, 0.3)), lids: both(Lp(0)), cross: false }),
  espiegle: (s) => ({
    mouth: M({ width: 0.9, curve: 0.05, tilt: 0.13 }),
    brows: bySide(s, B(1.86, 1.82, 0.28), B(1.36, 1.5, 0.02, 0.05)),
    lids: bySide(s, Lp(0.04), Lp(0.44, 0.25, 0.14)),
    cross: false,
  }),
  placide: () => ({ mouth: M({ width: 0.7 }), brows: both(B(1.48, 1.48, 0.04)), lids: both(Lp(0.36)), cross: false }),
  endormi: () => ({ mouth: M({ width: 0.34, open: 0.2, dy: -0.02 }), brows: both(B(1.44, 1.36, 0.08)), lids: both(Lp(0.64, -0.15, 0.12)), cross: false }),
  inquiet: () => ({ mouth: M({ width: 0.72, wave: 0.03, curve: -0.03 }), brows: both(B(1.94, 1.38, 0.02, 0.08)), lids: both(Lp(0.12, -0.55)), cross: false }),
}

/**
 * Repos de la poupée : son humeur, avec des paupières **toujours visibles**.
 *
 * Plusieurs humeurs ouvraient l'œil en grand (0 à 0,12 de paupière) : le
 * feutre disparaissait derrière le bord du bouton et l'œil perdait ce qui le
 * fait vivre. Chaque poupée tire donc un plancher de paupière, plus ou moins
 * lourd (0,2 à 0,4), avec un léger écart d'un œil à l'autre ; une humeur plus
 * lourde garde la sienne. Les expressions du combat, elles, peuvent ouvrir
 * grand (surprise) : c'est un instant, pas un repos.
 */
function restPose(look: FaceLook): FacePose {
  const pose = REST[look.mood](look.side)
  const rnd = mulberry32(look.seed + 77)
  const floor = 0.2 + rnd() * 0.2
  const lids = pose.lids.map((l) => ({ ...l, upper: Math.max(l.upper, floor + (rnd() - 0.5) * 0.08) })) as [
    LidPose,
    LidPose,
  ]
  return { ...pose, lids }
}

/** Expressions du combat (voir `WANTS` dans `expression.tsx` pour ce qui les déclenche). */
const EXPR: Record<Expression, (side: -1 | 1) => FacePose> = {
  focus: () => ({ mouth: M({ width: 0.6, curve: -0.05 }), brows: both(B(1.3, 1.8, 0, 0.14)), lids: both(Lp(0.4, 0.9, 0.12)), cross: false }),
  effort: () => ({ mouth: M({ width: 0.95, open: 0.46, round: 0.1, curve: -0.03 }), brows: both(B(1.3, 1.86, -0.04, 0.16)), lids: both(Lp(0.42, 1, 0.2)), cross: false }),
  ouch: () => ({ mouth: M({ width: 0.92, wave: 0.06, curve: -0.09 }), brows: both(B(1.9, 1.38, -0.02, 0.1)), lids: both(Lp(0.74, -0.3, 0.46)), cross: false }),
  surprise: () => ({ mouth: M({ width: 0.46, open: 0.54 }), brows: both(B(2.0, 1.9, 0.34)), lids: both(Lp(0)), cross: false }),
  ko: () => ({ mouth: M({ width: 0.72, wave: 0.045, open: 0.16, round: 0.6, dy: -0.02 }), brows: both(B(1.6, 1.32, 0.06)), lids: both(Lp(0.1)), cross: true }),
  dazed: (s) => ({
    mouth: M({ width: 0.76, wave: 0.04, tilt: 0.08, curve: -0.02 }),
    brows: bySide(s, B(1.9, 1.78, 0.24), B(1.38, 1.3, 0.04)),
    lids: bySide(s, Lp(0.3, -0.1), Lp(0.62, -0.3)),
    cross: false,
  }),
  weary: () => ({ mouth: M({ width: 0.7, curve: -0.08, dy: -0.02 }), brows: both(B(1.78, 1.34, 0.04)), lids: both(Lp(0.5, -0.35)), cross: false }),
}

// ---------------------------------------------------------------- tracés

type V2 = [number, number]
/** Un point de couture : un brin du point `a` au point `b` du visage. */
type Seg = {
  a: V2
  b: V2
  /** Plongeon **minimal** des bouts ; `place` l'augmente si la courbure l'exige. */
  dip: number
  radius: number
  color: string
  /**
   * Fil couché le long d'une plaie : ses bouts affleurent la surface sans y
   * plonger. Chaque maillon plongeant, le fil continu ferait une guirlande.
   */
  flush?: boolean
}

/** Polyligne rééchantillonnée à abscisse curviligne régulière. */
function resample(pts: V2[], n: number, closed: boolean): V2[] {
  const path = closed ? [...pts, pts[0]] : pts
  const acc = [0]
  for (let i = 1; i < path.length; i++) {
    acc.push(acc[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]))
  }
  const total = acc[acc.length - 1]
  const out: V2[] = []
  const steps = closed ? n : n - 1
  for (let k = 0; k < n; k++) {
    const s = (total * k) / Math.max(1, steps)
    let i = 1
    while (i < acc.length - 1 && acc[i] < s) i++
    const t = (s - acc[i - 1]) / Math.max(1e-9, acc[i] - acc[i - 1])
    out.push([
      path[i - 1][0] + (path[i][0] - path[i - 1][0]) * t,
      path[i - 1][1] + (path[i][1] - path[i - 1][1]) * t,
    ])
  }
  return out
}

function pathLength(pts: V2[]) {
  let l = 0
  for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
  return l
}

/** Tangente unitaire à l'échantillon `i`. */
function tangent(pts: V2[], i: number, closed: boolean): V2 {
  const n = pts.length
  const a = closed ? pts[(i - 1 + n) % n] : pts[Math.max(0, i - 1)]
  const b = closed ? pts[(i + 1) % n] : pts[Math.min(n - 1, i + 1)]
  const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
  return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]
}

const rot = ([x, y]: V2, a: number): V2 => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)]
const add = (p: V2, d: V2, k: number): V2 => [p[0] + d[0] * k, p[1] + d[1] * k]

/**
 * Coud un tracé avec l'un des quatre points.
 *
 * `n` est le nombre de points du panneau ; chaque point le convertit à sa
 * façon, pour qu'à réglage égal les quatre occupent la même longueur de fil.
 * Le nombre de brins ne dépend que du point et de `n`, jamais du tracé : c'est
 * ce qui permet de passer d'une bouche à l'autre brin pour brin.
 *
 * `between` décale les croix d'un demi-pas : la lèvre du bas d'une bouche
 * ouverte ne pose pas de croix sur les coins, déjà cousus par celle du haut.
 */
function stitchPath(
  path: V2[],
  closed: boolean,
  style: MouthStitch,
  n: number,
  size: number,
  base: Omit<Seg, 'a' | 'b'>,
  between = false,
): Seg[] {
  const out: Seg[] = []
  const seg = (a: V2, b: V2, over: Partial<Seg> = {}) => out.push({ ...base, a, b, ...over })

  if (style === 'croix') {
    // Le point historique de la poupée : des croix régulières, alignées sur la
    // tangente pour suivre la courbe au lieu de rester toutes droites. Même
    // ouverture que l'ancienne croix fixe : ±0,28 π depuis la verticale, soit
    // ±0,22 π depuis la tangente.
    const pts = between ? resample(path, n * 2 + 1, false).filter((_, i) => i % 2 === 1) : resample(path, n, closed)
    pts.forEach((c, i) => {
      const t = tangent(pts, i, closed)
      for (const sa of [1, -1]) {
        const d = rot(t, sa * Math.PI * 0.22)
        seg(add(c, d, -size * 0.5), add(c, d, size * 0.5))
      }
    })
  } else if (style === 'avant') {
    // Points avant : un tiret sur deux, les vides comptent autant que le fil.
    const m = closed ? n * 2 : n * 2 - 1
    const pts = resample(path, m + (closed ? 0 : 1), closed)
    for (let k = 0; k < m; k += 2) seg(pts[k], pts[(k + 1) % pts.length])
  } else if (style === 'suture') {
    // Suture : un fil continu le long de la plaie et des points en travers.
    // Le fil continu plonge à peine — plongeant à chaque maillon il ferait une
    // guirlande — ce sont les points en travers qui entrent dans le tissu.
    const m = n * 2
    const pts = resample(path, m + (closed ? 0 : 1), closed)
    for (let k = 0; k < m; k++) {
      seg(pts[k], pts[(k + 1) % pts.length], { flush: true, radius: base.radius * 0.85 })
    }
    for (let k = closed ? 0 : 1; k < pts.length - (closed ? 0 : 1); k += 2) {
      const t = tangent(pts, k, closed)
      const nrm: V2 = [-t[1], t[0]]
      seg(add(pts[k], nrm, -size * 0.45), add(pts[k], nrm, size * 0.45))
    }
  } else {
    // Zigzag : chaque branche est un point, qui entre dans le tissu à chaque
    // sommet — d'où le plongeon plein partout.
    const m = n * 2
    const pts = resample(path, m + (closed ? 0 : 1), closed)
    const zz = pts.map((c, k) => {
      const t = tangent(pts, k, closed)
      return add(c, [-t[1], t[0]], (k % 2 ? 1 : -1) * size * 0.28)
    })
    for (let k = 0; k < m; k++) seg(zz[k], zz[(k + 1) % zz.length])
  }
  return out
}

/**
 * Lèvres d'une pose de bouche, en coordonnées de visage : lèvre du haut et du
 * bas, de coin à coin. Fermée, les deux sont confondues.
 *
 * Le profil de l'ouverture est une ellipse (`√(1 − u²)`) qui s'annule aux
 * coins : les deux lèvres se rejoignent toujours au coin, la bouche ouverte
 * reste un contour fermé sans qu'on ait à le fermer.
 */
function lips(m: MouthPose, side: number, w: number, h: number): { upper: V2[]; lower: V2[] } {
  const N = 32
  const half = w * 0.5 * m.width
  const upper: V2[] = []
  const lower: V2[] = []
  for (let i = 0; i < N; i++) {
    const u = (i / (N - 1)) * 2 - 1
    const bow = 1 - u * u
    // Sourire : le milieu descend sous les coins ; moue : il remonte.
    const y =
      h + m.dy * w - m.curve * w * bow + m.tilt * side * u * w + m.wave * w * Math.sin(u * Math.PI * 2)
    const e = Math.sqrt(Math.max(0, bow)) * m.open * w
    upper.push([u * half, y + e * m.round * 0.5])
    lower.push([u * half, y - e * (1 - m.round * 0.5)])
  }
  return { upper, lower }
}

/** Teinte de fil plus sombre : la cicatrice, recousue d'un fil plus foncé que la bouche. */
function darker(hex: string, k: number) {
  const c = new THREE.Color(hex)
  const hsl = { h: 0, s: 0, l: 0 }
  c.getHSL(hsl)
  c.setHSL(hsl.h, clamp(hsl.s * 1.1, 0, 1), hsl.l * k)
  return `#${c.getHexString()}`
}

/**
 * Fils sombres de broderie, pour les sourcils et la lisière des paupières.
 *
 * Pas le fil de bouche : clair, il est choisi pour la bouche et sa croix
 * vaudou, et il disparaissait en sourcil sur les laines claires — or ce sont
 * les sourcils qui portent l'expression à la taille d'une planche. Pas la
 * laine des cheveux non plus : elle va jusqu'à la paille, et le même trait
 * s'effaçait sur un corps clair. Un fil presque noir, teinté, ressort sur les
 * quinze laines du corps.
 */
const INKS = ['#2b2320', '#2a2a33', '#3a2530', '#23302c', '#2e2a40', '#3a2a1e']

/** Remplissage d'une bouche ouverte : le fond de la bouche, brodé. */
const MOUTH_FILL = '#3b2024'

// ---------------------------------------------------------------- rendu

export type FaceEyes = {
  spacing: number
  leftSize: number
  rightSize: number
  leftColor: string
  rightColor: string
}

export type Placed = { pos: THREE.Vector3; quat: THREE.Quaternion; length: number; angle: number; seg: Seg }

/**
 * Pose un brin sur le crâne.
 *
 * Les deux bouts sont projetés sur la surface, et l'angle se relit dans le
 * repère **local** du milieu : lu sur les coordonnées de face, il dévierait
 * d'autant plus qu'on s'éloigne de l'axe, et un point de joue partirait de
 * biais.
 */
function place(p: DollParams, seg: Seg, lift: number): Placed {
  const mid = onHead(p, (seg.a[0] + seg.b[0]) * 0.5, (seg.a[1] + seg.b[1]) * 0.5, lift)
  const pa = onHead(p, seg.a[0], seg.a[1], lift).pos
  const pb = onHead(p, seg.b[0], seg.b[1], lift).pos
  const d = pb.clone().sub(pa).applyQuaternion(mid.quat.clone().invert())
  const length = pa.distanceTo(pb)
  const angle = Math.atan2(-d.x, d.y)

  /**
   * Plongeon mesuré, pas supposé.
   *
   * Le brin est droit, le crâne courbe : ses bouts, posés dans le plan tangent
   * au milieu, s'écartent de la surface d'autant plus que le brin est long et
   * le crâne serré. Avec un plongeon fixe, mesuré sur des centaines de visages,
   * les grandes croix d'un œil recousu finissaient 0,025 au-dessus de la peau —
   * plus haut que le duvet, donc visiblement en l'air. On mesure donc la
   * hauteur réelle de chaque bout et on plonge d'autant, plus le rayon du fil
   * pour qu'il entre en entier.
   */
  const dir = new THREE.Vector3(-Math.sin(angle), Math.cos(angle), 0).applyQuaternion(mid.quat)
  const rise = Math.max(
    ...[1, -1].map((k) => {
      const e = mid.pos.clone().addScaledVector(dir, (k * length) / 2)
      const s = onHead(p, e.x, e.y, 0)
      return e.sub(s.pos).dot(s.normal)
    }),
  )
  const dip = seg.flush ? Math.max(0, rise) : Math.max(seg.dip, rise + seg.radius)
  return { pos: mid.pos, quat: mid.quat, length, angle, seg: { ...seg, dip } }
}

const Z = new THREE.Vector3(0, 0, 1)

/**
 * Brin posé → points du tube animé : la même courbe que `Thread` (Bézier
 * quadratique, bouts à −dip, sommet sur l'axe), échantillonnée.
 */
function slotOf(pl: Placed): LiveSlot {
  const up = Z.clone().applyQuaternion(pl.quat)
  const c = Math.cos(pl.angle)
  const s = Math.sin(pl.angle)
  const pts = Array.from({ length: TUBE_T + 1 }, (_, i) => {
    const t = i / TUBE_T
    const y = (t - 0.5) * pl.length
    const z = -pl.seg.dip + 4 * pl.seg.dip * t * (1 - t)
    return new THREE.Vector3(-y * s, y * c, z).applyQuaternion(pl.quat).add(pl.pos)
  })
  return { pts, up, radius: pl.seg.radius }
}

/**
 * Emplacement replié : un point sous la peau, au milieu du brin qu'il
 * remplace. Une expression qui n'en a pas l'usage l'y cache ; en transition,
 * le brin en sort en poussant.
 */
function folded(pl: Placed): LiveSlot {
  const up = Z.clone().applyQuaternion(pl.quat)
  const at = pl.pos.clone().addScaledVector(up, -(pl.seg.dip + pl.seg.radius * 3))
  return { pts: Array.from({ length: TUBE_T + 1 }, () => at), up, radius: 0 }
}

/**
 * Pommette : où poser ce qui se brode sur une joue.
 *
 * Juste sous le bouton, et **en dehors du coin de la bouche** : prise à une
 * distance fixe sous l'œil, elle tombait à hauteur de bouche sur un petit
 * visage, et les taches de rousseur ou les joues brodées se mêlaient aux
 * points de la bouche. Se prend sur le visage réel — taille du bouton de ce
 * côté, largeur de la bouche.
 */
export function cheekSpot(p: DollParams, eyes: FaceEyes, s: -1 | 1): V2 {
  const f = p.face
  const size = s < 0 ? eyes.leftSize : eyes.rightSize
  const mouthHalf = f.mouthWidth * 0.5
  const x = Math.max(eyes.spacing * 0.5 + size * 0.2, mouthHalf + size * 0.75)
  const y = Math.max(f.eyeHeight - size * 1.55, f.mouthHeight + size * 0.45)
  return [s * x, y]
}

/**
 * Longueur et largeur d'un sourcil, en tailles de bouton.
 *
 * À 1,6 × 0,28, sur les gros boutons les deux sourcils se rejoignaient au
 * milieu du front en une seule chenille — un monosourcil, qui dit « fâché »
 * quelle que soit l'humeur. Plus courts, centrés un peu vers la tempe, ils
 * gardent un écart d'au moins un bouton entre eux.
 */
const BROW_LEN = 1.3
const BROW_W = 0.22

/** Nombre de points du bout de sourcil au bout : un passé plat serré. */
function browCount(eyes: FaceEyes, tr: number) {
  const size = (eyes.leftSize + eyes.rightSize) * 0.5
  return clamp(Math.round((size * BROW_LEN) / (tr * 2.2)), 6, 12)
}

/**
 * Sourcil brodé en **passé plat** : des points serrés en travers d'une bande
 * qui s'effile de la tête vers la queue.
 *
 * Deux brins en chevron, comme avant, faisaient un trait d'un pixel à la
 * taille d'une planche : l'humeur ne se lisait plus qu'à la bouche. Une bande
 * pleine d'un cinquième de bouton se lit de loin, et de près on voit le fil. Les
 * points sont inclinés vers la tempe par le haut — **en miroir** d'un côté à
 * l'autre : c'est une chiralité, elle porte le signe du côté.
 *
 * Les deux bouts restent au-dessus du bouton, bord de bande compris : un
 * sourcil froncé qui descend plus bas passait **sous** le bouton, cousu sur la
 * laine qu'il recouvre.
 */
function browStitches(
  p: DollParams,
  eyes: FaceEyes,
  s: -1 | 1,
  b: BrowPose,
  count: number,
  base: Omit<Seg, 'a' | 'b'>,
): Seg[] {
  const f = p.face
  const size = (eyes.leftSize + eyes.rightSize) * 0.5
  const own = s < 0 ? eyes.leftSize : eyes.rightSize
  const L = size * BROW_LEN
  const W = size * BROW_W
  const floor = own * 1.2 + W * 0.5
  const cx = s * (eyes.spacing * 0.5 + size * (0.14 - b.knit))
  const yi = f.eyeHeight + Math.max(floor, b.inner * own)
  const yo = f.eyeHeight + Math.max(floor, b.outer * own)
  const a: V2 = [cx - s * L * 0.5, yi]
  const c: V2 = [cx + s * L * 0.5, yo]
  // Point de contrôle tel que la courbe passe par le milieu bombé.
  const m: V2 = [cx, (yi + yo) * 0.5 + b.arch * own]
  const ctrl: V2 = [2 * m[0] - (a[0] + c[0]) * 0.5, 2 * m[1] - (a[1] + c[1]) * 0.5]
  const at = (t: number): V2 => [
    (1 - t) * (1 - t) * a[0] + 2 * t * (1 - t) * ctrl[0] + t * t * c[0],
    (1 - t) * (1 - t) * a[1] + 2 * t * (1 - t) * ctrl[1] + t * t * c[1],
  ]
  const out: Seg[] = []
  const slant = s * 0.45
  for (let k = 0; k < count; k++) {
    const t = (k + 0.5) / count
    const q = at(t)
    const d0 = at(Math.max(0, t - 0.02))
    const d1 = at(Math.min(1, t + 0.02))
    const tl = Math.hypot(d1[0] - d0[0], d1[1] - d0[1]) || 1
    let nx = -(d1[1] - d0[1]) / tl
    let ny = (d1[0] - d0[0]) / tl
    if (ny < 0) {
      nx = -nx
      ny = -ny
    }
    const dir = rot([nx, ny], -slant)
    // Tête pleine et arrondie, queue effilée.
    const head = Math.min(1, 0.55 + t * 3)
    const w = W * head * (1 - 0.55 * Math.pow(t, 1.4))
    const half = w / (2 * Math.cos(slant))
    out.push({ ...base, a: add(q, dir, -half), b: add(q, dir, half) })
  }
  return out
}

/**
 * Remplissage d'une bouche ouverte : des rangs horizontaux sombres, en passé
 * plat, entre les deux lèvres. Un contour seul lisait comme un anneau ; plein,
 * il lit comme une bouche. `count` rangs toujours : ceux dont la bouche n'a
 * pas la place sont repliés au milieu de la ligne des lèvres (`null`).
 */
function mouthFill(upper: V2[], lower: V2[], count: number, inset: number, gap: number, base: Omit<Seg, 'a' | 'b'>): (Seg | null)[] {
  let top = -Infinity
  let bottom = Infinity
  for (let i = 0; i < upper.length; i++) {
    top = Math.max(top, upper[i][1])
    bottom = Math.min(bottom, lower[i][1])
  }
  const height = top - bottom - inset * 2
  const rows = height > gap * 0.8 ? clamp(Math.round(height / gap), 1, count) : 0
  const out: (Seg | null)[] = []
  for (let k = 0; k < count; k++) {
    if (k >= rows) {
      out.push(null)
      continue
    }
    const y = top - inset - ((k + 0.5) / rows) * height
    let lo = Infinity
    let hi = -Infinity
    for (let i = 0; i < upper.length; i++) {
      if (upper[i][1] - inset >= y && lower[i][1] + inset <= y) {
        lo = Math.min(lo, upper[i][0])
        hi = Math.max(hi, upper[i][0])
      }
    }
    if (!(hi - lo > inset)) {
      out.push(null)
      continue
    }
    out.push({ ...base, a: [lo + inset * 0.5, y], b: [hi - inset * 0.5, y] })
  }
  return out
}

/** Rangs de remplissage par bouche, borne haute : une grande bouche ouverte en demande cinq ou six. */
const FILL_ROWS = 7

type FaceCtx = {
  p: DollParams
  look: FaceLook
  eyes: FaceEyes
  mouthLift: number
  stitchDip: number
  /** Boutons présents : pose sur le crâne, pour la croix du K.O. */
  buttons: { side: -1 | 1; at: ReturnType<typeof onHead>; radius: number }[]
  ink: string
}

/**
 * Tous les fils animés d'une pose, emplacement par emplacement : lèvre du
 * haut, lèvre du bas, remplissage, sourcils, croix du K.O. Même nombre
 * d'emplacements pour toutes les poses d'une poupée ; `null` = replié.
 */
function poseSlots(ctx: FaceCtx, pose: FacePose): { slots: LiveSlot[]; colors: string[]; flat: Placed[] } {
  const { p, look, eyes, mouthLift, stitchDip } = ctx
  const f = p.face
  const tr = p.thread.radius
  const n = clamp(f.mouthStitches + look.stitchDelta, 3, 10)
  const slots: LiveSlot[] = []
  const colors: string[] = []
  const flat: Placed[] = []
  const push = (pl: Placed, show: boolean) => {
    slots.push(show ? slotOf(pl) : folded(pl))
    colors.push(pl.seg.color)
    if (show) flat.push(pl)
  }

  // --- bouche : lèvre du haut, lèvre du bas
  // Fil de bouche un peu plus gros que celui des boutons : à 1 px sur une
  // planche, la bouche disparaissait.
  const mouthBase = { dip: stitchDip, radius: tr * 1.2, color: p.thread.mouthColor }
  // Sous un bouton-nez, la bouche s'ouvre vers le bas : un « o » centré sur
  // la ligne montait jusqu'à chevaucher le bouton (mesuré : 0,14 bouton de
  // recouvrement sur la surprise).
  const mouth = look.accent === 'nez' ? { ...pose.mouth, round: 0 } : pose.mouth
  const { upper, lower } = lips(mouth, look.side, f.mouthWidth, f.mouthHeight)
  const open = pose.mouth.open > 0.02
  // La taille d'un point suit la longueur à coudre : les croix d'un petit « o »
  // se chevauchaient à la taille prévue pour une bouche entière.
  const size = (lip: V2[]) => Math.min(f.mouthWidth * 0.28, (pathLength(lip) / n) * 1.05)
  const top = stitchPath(upper, false, look.stitch, n, size(upper), mouthBase)
  // Fermée, la lèvre du bas est repliée **sur** la ligne de la bouche : quand
  // elle s'ouvre, ses points en sortent et descendent.
  const bottom = stitchPath(open ? lower : upper, false, look.stitch, n, size(lower), mouthBase, true)
  for (const s of top) push(place(p, s, mouthLift), true)
  for (const s of bottom) push(place(p, s, mouthLift), open)

  // --- fond de la bouche ouverte
  const fillBase = { dip: stitchDip * 0.8, radius: tr * 1.05, color: MOUTH_FILL }
  const rows = mouthFill(upper, lower, FILL_ROWS, tr * 2.4, tr * 2.1, fillBase)
  const mid = upper[Math.floor(upper.length / 2)]
  rows.forEach((row) => {
    const s = row ?? { ...fillBase, a: [mid[0] - tr, mid[1]] as V2, b: [mid[0] + tr, mid[1]] as V2 }
    push(place(p, s, mouthLift), !!row && open)
  })

  // --- sourcils
  const browBase = { dip: stitchDip * 0.8, radius: tr * 0.95, color: ctx.ink }
  const K = browCount(eyes, tr)
  for (const s of [-1, 1] as const) {
    for (const seg of browStitches(p, eyes, s, pose.brows[s < 0 ? 0 : 1], K, browBase)) push(place(p, seg, mouthLift), true)
  }

  // --- croix du K.O. : deux longs points sur chaque bouton
  for (const s of [-1, 1] as const) {
    const btn = ctx.buttons.find((b) => b.side === s)
    for (const sa of [1, -1]) {
      if (!btn) {
        // Œil absent : emplacement replié sous la peau, là où il aurait été.
        const at = onHead(p, s * eyes.spacing * 0.5, f.eyeHeight, -tr * 4)
        slots.push({ pts: Array.from({ length: TUBE_T + 1 }, () => at.pos), up: at.normal, radius: 0 })
        colors.push(p.thread.color)
        continue
      }
      slots.push(crossOver(p, btn, sa, tr, pose.cross))
      colors.push(p.thread.color)
    }
  }
  return { slots, colors, flat }
}

/**
 * Un bras de la croix du K.O., cousu **par-dessus** le bouton.
 *
 * Posé sur le crâne comme les autres points, il passerait sous le bouton.
 * Une Bézier d'un bout à l'autre ne convient pas non plus : elle descend
 * dès qu'elle quitte le centre et traverse le biseau. Le fil suit donc le
 * plateau du bouton, au-dessus du fil qui le coud, puis plonge au-delà du bord
 * jusque sous la laine — la hauteur de la peau au bout est mesurée, comme le
 * plongeon des autres points.
 */
function crossOver(
  p: DollParams,
  btn: FaceCtx['buttons'][number],
  sa: number,
  tr: number,
  show: boolean,
): LiveSlot {
  const r = btn.radius
  // Au-dessus du fil qui coud le bouton (face à 0,12 r, fil jusqu'à 1,14 tr) :
  // à 2,2 tr le bas du brin frôlait ce fil et le traversait par endroits.
  const top = r * 0.12 + tr * 2.6
  const reach = r * 1.3
  const dir = new THREE.Vector3(Math.SQRT1_2, sa * Math.SQRT1_2, 0)
  const up = Z.clone().applyQuaternion(btn.at.quat)
  if (!show) {
    const at = btn.at.pos.clone()
    return { pts: Array.from({ length: TUBE_T + 1 }, () => at), up, radius: 0 }
  }
  const pts = Array.from({ length: TUBE_T + 1 }, (_, i) => {
    const u = (i / TUBE_T) * 2 - 1
    const rho = u * reach
    const local = dir.clone().multiplyScalar(rho)
    local.z = top
    const q = local.applyQuaternion(btn.at.quat).add(btn.at.pos)
    if (Math.abs(rho) <= r * 1.02) return q
    // Au-delà du bord : sous la peau à cet endroit, d'un rayon et demi de fil.
    const s = onHead(p, q.x, q.y, -tr * 1.5)
    return s.pos
  })
  return { pts, up, radius: tr * 1.35 }
}

/** Distance d'un point au segment [a, b]. */
function segDist(q: V2, a: V2, b: V2) {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const t = Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)))
  return Math.hypot(q[0] - a[0] - t * dx, q[1] - a[1] - t * dy)
}

/**
 * Tracé de la cicatrice : en diagonale sur la joue, de sous l'œil vers la
 * mâchoire, en fuyant vers l'extérieur. Courte et verticale près du coin de
 * la bouche, elle se lisait comme un prolongement de la bouche, pas comme une
 * plaie.
 *
 * Et elle ne **touche jamais** la bouche : sur une bouche large, son bout
 * venait mordre le coin des lèvres. Le dégagement se mesure contre toutes les
 * bouches que la poupée peut faire — repos et expressions du combat, qui
 * l'élargissent ou l'ouvrent — et vaut une demi-croix de cicatrice, une
 * demi-croix de bouche et deux fils. Tant qu'il manque, le bout bascule vers
 * l'extérieur et remonte.
 */
export function scarPath(p: DollParams, look: FaceLook, eyes: FaceEyes) {
  const f = p.face
  const size = (eyes.leftSize + eyes.rightSize) * 0.5
  const eyeX = eyes.spacing * 0.5
  const side = look.side
  const mouths = [REST[look.mood](side), ...EXPRESSIONS.map((e) => EXPR[e](side))].flatMap((pose) => {
    const { upper, lower } = lips(pose.mouth, side, f.mouthWidth, f.mouthHeight)
    return [...upper, ...lower]
  })
  const clear = size * 0.375 + f.mouthWidth * 0.14 + p.thread.radius * 2
  const gap = (a: V2, b: V2) => Math.min(...mouths.map((q) => segDist(q, a, b)))
  // Le départ, sous l'œil, peut lui-même tomber à côté du coin d'une bouche
  // large (sous un gros bouton) : les deux bouts reculent ensemble.
  let a: V2 = [side * (eyeX - size * 0.1), f.eyeHeight - size * 1.3]
  let b: V2 = [side * (eyeX + size * 1.5), f.mouthHeight - size * 1.1]
  for (let i = 0; i < 24 && gap(a, b) < clear; i++) {
    a = [a[0] + side * size * 0.1, a[1] + size * 0.04]
    b = [b[0] + side * size * 0.12, b[1] + size * 0.08]
  }
  return { path: [a, b] as V2[], gap: gap(a, b), clear }
}

/**
 * Détails cousus à plat, fixes : ce qui ne bouge pas avec l'expression.
 */
function accentStitches(p: DollParams, look: FaceLook, eyes: FaceEyes, stitchDip: number): Seg[] {
  const f = p.face
  const tr = p.thread.radius
  const size = (eyes.leftSize + eyes.rightSize) * 0.5
  const eyeX = eyes.spacing * 0.5
  const { side, accent } = look
  const segs: Seg[] = []
  const base = { dip: stitchDip, radius: tr, color: p.thread.mouthColor }

  if (accent === 'croix') {
    // Œil recousu : une grande croix à la place du bouton.
    const c: V2 = [side * eyeX, f.eyeHeight]
    const r = size * 1.05
    for (const sa of [1, -1]) {
      segs.push({ ...base, radius: tr * 1.35, a: [c[0] - r * 0.7, c[1] - sa * r * 0.7], b: [c[0] + r * 0.7, c[1] + sa * r * 0.7] })
    }
  } else if (accent === 'arrache') {
    // Les points d'attache restent quand le bouton part : deux petites
    // croix serrées à l'emplacement des trous.
    const c: V2 = [side * eyeX, f.eyeHeight]
    const r = size * 0.3
    for (const sa of [1, -1]) {
      segs.push({ ...base, color: p.thread.color, radius: tr * 0.7, dip: stitchDip * 0.8, a: [c[0] - r, c[1] - sa * r], b: [c[0] + r, c[1] + sa * r] })
    }
  } else if (accent === 'cicatrice') {
    const { path } = scarPath(p, look, eyes)
    segs.push(...stitchPath(path, false, 'suture', 4, size * 0.75, { ...base, color: darker(p.thread.mouthColor, 0.72) }))
  } else if (accent === 'joues') {
    // Joues brodées : trois traits obliques serrés sur chaque pommette, en
    // fil rose.
    const pink = jitterColor('#d98a8f', mulberry32(look.seed), 0.4)
    for (const s of [-1, 1] as const) {
      const c0 = cheekSpot(p, eyes, s)
      for (let k = -1; k <= 1; k++) {
        const c: V2 = [c0[0] + k * size * 0.26, c0[1]]
        const d = rot([0, 1], -0.5)
        segs.push({ ...base, color: pink, radius: tr * 0.85, a: add(c, d, -size * 0.26), b: add(c, d, size * 0.26) })
      }
    }
  } else if (accent === 'larme') {
    /**
     * Larme : une goutte **pleine**, collée sous le bouton, pointe en haut.
     *
     * Posée à deux tailles de bouton sous l'œil, elle tombait à hauteur de
     * bouche ; brodée en contour pointillé, elle se lisait comme un « o ».
     * Une larme brodée est un **passé plat** : des points parallèles qui
     * remplissent la forme. On trace la goutte, puis on la coupe en rangs.
     */
    const eyeSize = side < 0 ? eyes.leftSize : eyes.rightSize
    const r = size * 0.36
    const h = r * 1.4
    const top = f.eyeHeight - eyeSize - size * 0.1
    const c: V2 = [side * (eyeX + eyeSize * 0.15), top - h]
    const outline = Array.from({ length: 48 }, (_, i): V2 => {
      const t = (i / 48) * Math.PI * 2
      return [c[0] + Math.sin(t) * Math.pow(Math.abs(Math.sin(t / 2)), 1.2) * r, c[1] + Math.cos(t) * h]
    })
    // Des rangs fins et nombreux : à six rangs épais, la pointe et le rond
    // disparaissaient, on voyait un petit empilement.
    const rows = 9
    const blue = '#6f8fb3'
    for (let k = 0; k < rows; k++) {
      const y = c[1] + h - ((k + 0.5) / rows) * 2 * h
      const xs: number[] = []
      for (let i = 0; i < outline.length; i++) {
        const a = outline[i]
        const b = outline[(i + 1) % outline.length]
        if ((a[1] - y) * (b[1] - y) <= 0 && a[1] !== b[1]) {
          xs.push(a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]))
        }
      }
      if (xs.length < 2) continue
      const lo = Math.min(...xs) + tr * 0.4
      const hi = Math.max(...xs) - tr * 0.4
      if (hi - lo < tr * 1.5) continue
      segs.push({ ...base, color: blue, radius: tr * 0.62, dip: stitchDip * 0.8, a: [lo, y], b: [hi, y] })
    }
  }
  return segs
}

/**
 * Tous les brins cousus à plat du visage **au repos** — bouche, sourcils,
 * détails —, posés sur le crâne. Fonction pure, hors du composant : c'est
 * elle qu'on mesure pour vérifier qu'aucun point ne décolle de la tête.
 * (`faceLive(…).flat` donne les mêmes brins pour chaque expression.)
 */
export function faceStitches(
  p: DollParams,
  look: FaceLook,
  eyes: FaceEyes,
  mouthLift: number,
  stitchDip: number,
): Placed[] {
  const ctx: FaceCtx = { p, look, eyes, mouthLift, stitchDip, buttons: [], ink: INKS[0] }
  return [
    ...poseSlots(ctx, REST[look.mood](look.side)).flat,
    ...accentStitches(p, look, eyes, stitchDip).map((s) => place(p, s, mouthLift)),
  ]
}

/** Côté privé de son bouton, par le détail : arraché ou recousu en croix (0 sinon). */
function missingSide(look: FaceLook): -1 | 0 | 1 {
  return look.accent === 'arrache' || look.accent === 'croix' ? look.side : 0
}

/**
 * Pose des deux boutons sur le crâne, **enfoncés** de la moitié de leur flèche.
 *
 * Un disque plat sur un crâne courbe ne touche qu'en son centre : son bord
 * reste en l'air de la flèche de l'arc — un gros bouton, un centimètre — et
 * de profil il lisait comme une assiette posée sur la laine. Cousu serré, un
 * bouton creuse la laine. Pas plus de la moitié : au-delà, sa face passerait
 * sous la pointe des fibres et le duvet la traverserait.
 */
export function eyeSpots(p: DollParams, eyes: FaceEyes, lift: number) {
  const sunk = (radius: number) => lift - (radius * radius) / (2 * p.shape.headRadius) * 0.5
  const x = eyes.spacing * 0.5
  return {
    left: onHead(p, -x, p.face.eyeHeight, sunk(eyes.leftSize)),
    right: onHead(p, x, p.face.eyeHeight, sunk(eyes.rightSize)),
  }
}

/**
 * Partie animée du visage, fonction pure : fils de chaque pose (repos puis
 * `EXPRESSIONS`), poses des paupières, boutons qui en portent une, fil sombre.
 * C'est elle qu'on mesure pour vérifier qu'aucune expression ne décolle.
 */
export function faceLive(
  p: DollParams,
  look: FaceLook,
  eyes: FaceEyes,
  spots: ReturnType<typeof eyeSpots>,
  mouthLift: number,
  stitchDip: number,
) {
  const tr = p.thread.radius
  const missing = missingSide(look)
  const ink = INKS[Math.floor(mulberry32(look.seed + 5)() * INKS.length)]
  const buttons = ([[-1, spots.left, eyes.leftSize], [1, spots.right, eyes.rightSize]] as const)
    .filter(([s]) => s !== missing)
    .map(([s, at, radius]) => ({ side: s as -1 | 1, at, radius }))
  const ctx: FaceCtx = { p, look, eyes, mouthLift, stitchDip, buttons, ink }
  const poses = [restPose(look), ...EXPRESSIONS.map((e) => EXPR[e](look.side))]
  const built = poses.map((pose) => poseSlots(ctx, pose))
  const threads: LiveThreads = { targets: built.map((b) => b.slots), colors: built[0].colors }
  const lidPoses: LidPoses = poses.map((pose) => pose.lids)
  // Plateau du feutre : au-dessus du fil qui traverse les trous du bouton
  // (face à 0,12 r, fil jusqu'à 1,14 tr au-dessus), plus un cinquantième de
  // rayon d'épaisseur.
  const lids: LidSpot[] = buttons.map((b) => ({
    side: b.side,
    pos: b.at.pos,
    quat: b.at.quat,
    radius: b.radius,
    top: b.radius * 0.14 + tr * 1.25,
  }))
  return { threads, lidPoses, lids, ink, flat: built.map((b) => b.flat), poses }
}

export function Face({
  p,
  look,
  eyes,
  wood,
  lift,
  mouthLift,
  stitchDip,
  fighter,
  felt,
}: {
  p: DollParams
  look: FaceLook
  eyes: FaceEyes
  wood: WoodMaps
  /** Relèvement des boutons : posés sur la laine. */
  lift: number
  /** Relèvement des points : enfoncés dans la laine. */
  mouthLift: number
  stitchDip: number
  /**
   * Combattant piloté (arène) : le visage répond à son état. Absent (planche,
   * présentation) : l'humeur de repos, qui cligne de temps en temps.
   */
  fighter?: Fighter
  /** Laine du corps, pour le feutre des paupières. */
  felt?: string
}) {
  const f = p.face
  const tr = p.thread.radius
  const size = (eyes.leftSize + eyes.rightSize) * 0.5
  const eyeX = eyes.spacing * 0.5
  const { side, accent } = look

  const missing = missingSide(look)
  const { left: eyeL, right: eyeR } = useMemo(() => eyeSpots(p, eyes, lift), [p, eyes, lift])

  // --- brins fixes : les détails
  const stitches = useMemo(
    () => accentStitches(p, look, eyes, stitchDip).map((s) => place(p, s, mouthLift)),
    [p, look, eyes, mouthLift, stitchDip],
  )

  // --- partie animée : repos + une pose par expression, et les paupières
  const live = useMemo(
    () => faceLive(p, look, eyes, { left: eyeL, right: eyeR }, mouthLift, stitchDip),
    [p, look, eyes, eyeL, eyeR, mouthLift, stitchDip],
  )

  // --- points noués : taches de rousseur ---
  /**
   * Taches de rousseur : un **amas** serré sur chaque pommette.
   *
   * Tirées n'importe où dans une large zone de joue, les points s'éparpillaient
   * jusqu'à la bouche et ne lisaient plus comme des taches de rousseur. Un
   * semis, c'est quelques points rapprochés sur le haut de la joue, sans se
   * toucher — tirage avec rejet sous une distance minimale.
   */
  const knots = useMemo(() => {
    if (accent !== 'rousseur') return []
    const rnd = mulberry32(look.seed + 7)
    const color = jitterColor('#6a4630', rnd, 0.4)
    const out: { pos: THREE.Vector3; r: number; color: string }[] = []
    for (const s of [-1, 1] as const) {
      const c = cheekSpot(p, eyes, s)
      const count = 4 + Math.floor(rnd() * 3)
      const placed: V2[] = []
      for (let tries = 0; placed.length < count && tries < 60; tries++) {
        const a = rnd() * Math.PI * 2
        const d = Math.sqrt(rnd()) * size * 0.4
        const q: V2 = [c[0] + Math.cos(a) * d * 1.35, c[1] + Math.sin(a) * d * 0.75]
        if (placed.some((o) => Math.hypot(o[0] - q[0], o[1] - q[1]) < tr * 3.2)) continue
        placed.push(q)
      }
      for (const q of placed) {
        const r = tr * (1.05 + rnd() * 0.45)
        out.push({ pos: onHead(p, q[0], q[1], mouthLift + r * 0.1).pos, r, color })
      }
    }
    return out
  }, [p, eyes, accent, look.seed, size, tr, mouthLift])

  // --- bouts de fil qui pendent de l'orbite vide ---
  //
  // Tracés **sur la surface**, point par point, et non dans le plan tangent à
  // l'orbite : sous l'œil la joue fuit vers l'arrière, et un fil tendu dans ce
  // plan partait en l'air devant le visage — vu de profil, deux baguettes
  // plantées dans la tête. Un bout de fil lâché tombe contre la laine ; seul
  // son extrémité s'en écarte un peu, sur le duvet.
  const looseGeo = useDisposableList(() => {
    if (accent !== 'arrache') return []
    const rnd = mulberry32(look.seed + 11)
    return [0, 1].map((k) => {
      const len = size * (1.3 + rnd() * 0.9) * (k ? 0.6 : 1)
      const x0 = side * eyeX + (k ? -1 : 1) * size * 0.18
      const y0 = f.eyeHeight + (rnd() - 0.5) * size * 0.2
      // Dérive vers le milieu du visage : vers la tempe, le crâne fuit si vite
      // que le fil sortait de la silhouette dès qu'on tournait la poupée.
      const drift = ((rnd() - 0.5) * 0.3 - (k ? 0.3 : 0.1) * side) * len
      const N = 10
      const pts = Array.from({ length: N + 1 }, (_, i) => {
        const t = i / N
        // Le fil sort du trou (sous la peau) puis descend en s'incurvant.
        const lift = i === 0 ? mouthLift - stitchDip : mouthLift + tr + t * t * p.shell.height * 0.4
        return onHead(p, x0 + drift * t * t, y0 - len * t, lift).pos
      })
      return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, tr * 0.7, 6, false)
    })
  }, [p, accent, look.seed, side, eyeX, f.eyeHeight, size, tr, stitchDip, mouthLift])

  const nose = useMemo(() => {
    if (accent !== 'nez') return null
    const gap = f.eyeHeight - f.mouthHeight
    const r = Math.min(size * 0.42, gap * 0.2)
    return { at: onHead(p, 0, f.mouthHeight + gap * 0.55, lift - (r * r) / (4 * p.shape.headRadius)), r }
  }, [p, accent, f.eyeHeight, f.mouthHeight, size, lift])

  const eye = (s: -1 | 1, at: ReturnType<typeof onHead>) =>
    missing === s ? null : (
      <group position={at.pos} quaternion={at.quat}>
        <ButtonEye
          radius={s < 0 ? eyes.leftSize : eyes.rightSize}
          color={s < 0 ? eyes.leftColor : eyes.rightColor}
          threadColor={p.thread.color}
          threadRadius={tr * 0.6}
          wood={wood}
          holes={look.eyes[s < 0 ? 0 : 1].holes}
          pattern={look.eyes[s < 0 ? 0 : 1].pattern}
        />
      </group>
    )

  return (
    <group>
      {eye(-1, eyeL)}
      {eye(1, eyeR)}

      {/* Hors fusion : ses maillages portent `noBatch` (voir `expression.tsx`). */}
      <LiveFace
        threads={live.threads}
        lids={live.lids}
        lidPoses={live.lidPoses}
        felt={felt ?? '#b9a88f'}
        ink={live.ink}
        fighter={fighter}
        seed={look.seed}
      />

      {stitches.map((st, i) => (
        <group key={i} position={st.pos} quaternion={st.quat}>
          <Thread
            length={st.length}
            radius={st.seg.radius}
            color={st.seg.color}
            dip={st.seg.dip}
            rotation={[0, 0, st.angle]}
          />
        </group>
      ))}

      {knots.map((k, i) => (
        <mesh key={i} position={k.pos}>
          <sphereGeometry args={[k.r, 8, 6]} />
          <meshPhysicalMaterial color={k.color} roughness={0.8} sheen={0.5} />
        </mesh>
      ))}

      {looseGeo.map((geo, i) => (
        <mesh key={i} geometry={geo} castShadow>
          <meshPhysicalMaterial color={p.thread.color} roughness={0.7} sheen={0.6} sheenRoughness={0.5} />
        </mesh>
      ))}

      {nose && (
        <group position={nose.at.pos} quaternion={nose.at.quat}>
          <ButtonEye
            radius={nose.r}
            color={jitterColor(eyes.leftColor, mulberry32(look.seed + 3), 0.5)}
            threadColor={p.thread.color}
            threadRadius={tr * 0.5}
            wood={wood}
            holes={2}
            pattern="bar"
          />
        </group>
      )}
    </group>
  )
}
