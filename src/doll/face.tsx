import * as THREE from 'three'
import { useMemo } from 'react'
import { useDisposableList } from '../core/useDisposable'
import { mulberry32, clamp } from '../core/rand'
import { ButtonEye, Thread, jitterColor, type ButtonHoles, type ButtonThread } from './parts'
import { onHead } from './surface'
import type { WoodMaps } from './wood'
import type { DollParams } from './params'

/**
 * Visage de la poupée : humeur, point de bouche, boutons et un détail.
 *
 * Deux boutons et une rangée de points de croix, c'est la signature de la
 * poupée vaudou — et c'est aussi ce qui rendait les six visages d'une planche
 * interchangeables : morphologie, laine et ornements avaient beau changer, on
 * voyait six fois la même tête. Chaque visage se compose donc de quatre choix
 * qui restent tous **cousus** — fil, boutons, points noués — pour ne pas
 * quitter la matière de la série :
 *
 * - une **humeur**, qui décide ensemble de la courbe de la bouche et des
 *   sourcils brodés : tirés séparément, un sourire sous des sourcils froncés
 *   lit comme une erreur, pas comme une expression ;
 * - un **point** pour la bouche : croix, points avant, suture, zigzag ;
 * - des **boutons** à deux ou quatre trous, cousus en croix, en parallèle, en
 *   barre ou par l'arrière — parfois dépareillés ;
 * - un **détail**, le seul élément qui ne soit pas sur toutes les poupées :
 *   bouton arraché, œil cousu en croix, cicatrice, joues brodées, taches de
 *   rousseur, bouton-nez, larme.
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

export type Mood = 'joyeux' | 'triste' | 'fache' | 'surpris' | 'espiegle' | 'placide'
export type MouthStitch = 'croix' | 'avant' | 'suture' | 'zigzag'
export type Accent = 'arrache' | 'croix' | 'cicatrice' | 'joues' | 'rousseur' | 'nez' | 'larme'

export const MOODS: readonly Mood[] = ['joyeux', 'triste', 'fache', 'surpris', 'espiegle', 'placide']
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
  /** Graine propre au visage : taches de rousseur, bouts de fil. */
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
 * distribuées toutes, les détails sans répétition, et le point de bouche au plus
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
 */
function stitchPath(
  path: V2[],
  closed: boolean,
  style: MouthStitch,
  n: number,
  size: number,
  base: Omit<Seg, 'a' | 'b'>,
): Seg[] {
  const out: Seg[] = []
  const seg = (a: V2, b: V2, over: Partial<Seg> = {}) => out.push({ ...base, a, b, ...over })

  if (style === 'croix') {
    // Le point historique de la poupée : des croix régulières, alignées sur la
    // tangente pour suivre la courbe au lieu de rester toutes droites. Même
    // ouverture que l'ancienne croix fixe : ±0,28 π depuis la verticale, soit
    // ±0,22 π depuis la tangente.
    const pts = resample(path, n, closed)
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

/** Courbe de la bouche selon l'humeur, en coordonnées de visage. */
function mouthPath(mood: Mood, side: number, w: number, h: number): { pts: V2[]; closed: boolean } {
  const N = 32
  if (mood === 'surpris') {
    // Bouche en « o », un peu plus haute que large.
    const r = w * 0.2
    const pts = Array.from({ length: N }, (_, i): V2 => {
      const a = (i / N) * Math.PI * 2
      return [Math.cos(a) * r, h + Math.sin(a) * r * 1.2]
    })
    return { pts, closed: true }
  }
  const width = { joyeux: 1, triste: 0.9, fache: 0.75, espiegle: 0.9, placide: 0.7 }[mood]
  const half = w * 0.5 * width
  const y = (u: number) => {
    const bow = 1 - u * u
    switch (mood) {
      case 'joyeux': return h - bow * w * 0.16
      // Coins tombants : le milieu remonte au-dessus des coins.
      case 'triste': return h + bow * w * 0.13 - w * 0.05
      case 'fache': return h + bow * w * 0.05 - w * 0.02
      // Sourire en coin : un seul côté remonte.
      case 'espiegle': return h - bow * w * 0.05 + side * u * w * 0.13
      default: return h
    }
  }
  const pts = Array.from({ length: N }, (_, i): V2 => {
    const u = (i / (N - 1)) * 2 - 1
    return [u * half, y(u)]
  })
  return { pts, closed: false }
}

/** Teinte de fil plus sombre : la cicatrice, recousue d'un fil plus foncé que la bouche. */
function darker(hex: string, k: number) {
  const c = new THREE.Color(hex)
  const hsl = { h: 0, s: 0, l: 0 }
  c.getHSL(hsl)
  c.setHSL(hsl.h, clamp(hsl.s * 1.1, 0, 1), hsl.l * k)
  return `#${c.getHexString()}`
}

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
 * Tous les brins cousus à plat du visage — bouche, sourcils, détails —, posés
 * sur le crâne. Fonction pure, hors du composant : c'est elle qu'on mesure pour
 * vérifier qu'aucun point ne décolle de la tête.
 */
export function faceStitches(
  p: DollParams,
  look: FaceLook,
  eyes: FaceEyes,
  mouthLift: number,
  stitchDip: number,
): Placed[] {
    const f = p.face
    const tr = p.thread.radius
    const size = (eyes.leftSize + eyes.rightSize) * 0.5
    const eyeX = eyes.spacing * 0.5
    const { side, accent } = look
    const segs: Seg[] = []
    const base = { dip: stitchDip, radius: tr, color: p.thread.mouthColor }
    const n = clamp(f.mouthStitches + look.stitchDelta, 3, 10)

    // Bouche
    const mouth = mouthPath(look.mood, side, f.mouthWidth, f.mouthHeight)
    segs.push(...stitchPath(mouth.pts, mouth.closed, look.stitch, n, f.mouthWidth * 0.28, base))

    // Sourcils : seulement là où l'humeur en a besoin. Joyeux et placide s'en
    // passent — un sourcil neutre n'ajoute rien, il encombre.
    // Même fil que la bouche : teints dans la laine des locks, ils
    // disparaissaient sur un corps foncé — et le fil de bouche, lui, est
    // choisi pour ressortir sur toutes les laines.
    const browBase = { dip: stitchDip * 0.8, radius: tr * 1.25, color: p.thread.mouthColor }
    const L = size * 1.7
    for (const s of [-1, 1] as const) {
      const y0 = f.eyeHeight + (s < 0 ? eyes.leftSize : eyes.rightSize) * 1.75
      let inner = 0, outer = 0, arch = 0, raise = 0
      switch (look.mood) {
        case 'fache': inner = -0.24; outer = 0.16; raise = -0.2; break
        case 'triste': inner = 0.2; outer = -0.16; break
        case 'surpris': arch = 0.2; raise = 0.45; break
        case 'espiegle':
          if (s === side) { arch = 0.16; raise = 0.5 } else { inner = -0.08; outer = 0.02 }
          break
        default: continue
      }
      const cx = s * eyeX
      const y = y0 + raise * size
      const a: V2 = [cx - s * L * 0.5, y + inner * L]
      const b: V2 = [cx + s * L * 0.5, y + outer * L]
      const m: V2 = [cx, (a[1] + b[1]) * 0.5 + arch * L]
      segs.push({ ...browBase, a, b: m }, { ...browBase, a: m, b })
    }

    // Détails cousus à plat
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
      // En diagonale sur la joue, de sous l'œil vers la mâchoire, en fuyant
      // vers l'extérieur. Courte et verticale près du coin de la bouche, elle
      // se lisait comme un prolongement de la bouche, pas comme une plaie.
      const path: V2[] = [
        [side * (eyeX - size * 0.1), f.eyeHeight - size * 1.3],
        [side * (eyeX + size * 1.5), f.mouthHeight - size * 1.1],
      ]
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

    return segs.map((s) => place(p, s, mouthLift))
}

export function Face({
  p,
  look,
  eyes,
  wood,
  lift,
  mouthLift,
  stitchDip,
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
}) {
  const f = p.face
  const tr = p.thread.radius
  const size = (eyes.leftSize + eyes.rightSize) * 0.5
  const eyeX = eyes.spacing * 0.5
  const { side, accent } = look

  // Côté privé de son bouton, par le détail : arraché ou recousu en croix.
  const missing = accent === 'arrache' || accent === 'croix' ? side : 0

  /**
   * Relèvement d'un bouton, **enfoncé** de la moitié de sa flèche.
   *
   * Un disque plat sur un crâne courbe ne touche qu'en son centre : son bord
   * reste en l'air de la flèche de l'arc — un gros bouton, un centimètre — et
   * de profil il lisait comme une assiette posée sur la laine. Cousu serré, un
   * bouton creuse la laine. Pas plus de la moitié : au-delà, sa face passerait
   * sous la pointe des fibres et le duvet la traverserait.
   */
  const sunk = (radius: number) => lift - (radius * radius) / (2 * p.shape.headRadius) * 0.5
  const eyeL = useMemo(() => onHead(p, -eyeX, f.eyeHeight, sunk(eyes.leftSize)), [p, eyeX, f.eyeHeight, lift, eyes.leftSize])
  const eyeR = useMemo(() => onHead(p, eyeX, f.eyeHeight, sunk(eyes.rightSize)), [p, eyeX, f.eyeHeight, lift, eyes.rightSize])

  // --- tous les brins cousus à plat : bouche, sourcils, détails ---
  const stitches = useMemo(
    () => faceStitches(p, look, eyes, mouthLift, stitchDip),
    [p, look, eyes, mouthLift, stitchDip],
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
