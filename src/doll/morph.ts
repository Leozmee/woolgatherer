import { mulberry32, clamp } from '../core/rand'
import { dollLayout } from './layout'
import type { DollParams } from './params'

/**
 * Morphologie tirée de la graine, **autour des réglages du panneau**.
 *
 * Sans elle, les six poupées d'une planche avaient exactement la même
 * silhouette : seules la laine, les locks et les ornements changeaient, et la
 * planche lisait comme six fois le même patron rhabillé.
 *
 * La morphologie n'est pas un tirage indépendant par curseur — une tête plus
 * grosse avec des yeux restés à leur place, des jambes allongées et des bras
 * raccourcis, un torse amaigri sur des membres de lutteur : chaque curseur
 * tiré seul casse la cohérence de la peluche. On tire donc quelques **facteurs
 * latents** qui ont un sens de couturier (grosse tête, stature, embonpoint,
 * allonge…), et chacun pilote ensemble toutes les cotes qu'il concerne. Le
 * visage suit la tête : écartement et hauteurs en proportion du crâne.
 *
 * Toutes les cotes sont des **écarts relatifs au panneau** : le panneau garde
 * la main sur le patron, la graine n'en tire que des variantes. `amount` à 0
 * rend exactement le panneau.
 */
export type Morph = Record<(typeof KEYS)[number], number>

const KEYS = [
  // types de corps — les deux seules variables tirées librement
  'build', //    corpulence : -1 fluet et élancé, +1 dodu et trapu
  'youth', //    âge : -1 adulte, +1 poupon (grosse tête, membres courts)
  // cotes dérivées — ce que `applyMorph` lit
  'head', //     tête plus ou moins grosse par rapport au corps
  'stature', //  torse long ou trapu
  'girth', //    embonpoint : torse et membres ensemble
  'reach', //    allonge : bras et jambes ensemble
  'shoulders', // épaules tombantes ou carrées
  'egg', //      crâne en poire ou en pomme
  'squash', //   crâne haut ou aplati
  'cheeks', //   bajoues
  'cheekY',
  'limbBias', // bras plus longs que les jambes, ou l'inverse
  'limbThick', // bras plus épais que les jambes, ou l'inverse
  'limbGirth', // membres épais ou fins, indépendamment du tronc
  'stance', //   bras et jambes écartés ou serrés
  'lumps',
  'eyeY',
  'eyeGap',
  'mouthY',
  'mouthW',
] as const

/**
 * Un **type de corps**, pas une dizaine de curseurs indépendants.
 *
 * Tirées chacune de son côté, les cotes produisaient des peluches qui ne
 * tenaient pas ensemble — grosse tête sur un corps long et maigre, membres de
 * lutteur sur un torse fluet — et la sélection de planche, qui cherche l'écart
 * maximal, allait justement chercher ces coins-là : les combinaisons les plus
 * contradictoires sont aussi les plus éloignées de toutes les autres.
 *
 * On ne tire donc librement que deux axes, ceux qu'un couturier varie d'un
 * patron à l'autre :
 * - la **corpulence** : dodu = torse large, membres épais et courts, joues
 *   pleines, crâne en poire, bras écartés par le ventre ; fluet = l'inverse ;
 * - l'**âge** : poupon = grosse tête, torse et membres courts, yeux écartés ;
 *   adulte = petite tête sur un corps allongé.
 * Toutes les cotes en dérivent ensemble, et chacune ne garde qu'un **résidu**
 * individuel nettement plus petit que la part commune — assez pour que deux
 * poupées du même type ne soient pas jumelles, jamais assez pour la contredire.
 */
function sample(rnd: () => number, type: Archetype): Morph {
  // Le type se tire **dans** la zone de l'archétype : assez de jeu pour que
  // deux générations ne ramènent pas la même peluche, pas assez pour qu'il
  // déborde sur la zone voisine.
  const build = type.build + (rnd() * 2 - 1) * 0.2
  const youth = type.youth + (rnd() * 2 - 1) * 0.2
  // Résidu en cloche : il décore le type, il ne doit pas le brouiller.
  const r = (span: number) => (rnd() + rnd() - 1) * span
  const b = (key: keyof Morph) => type.bias?.[key] ?? 0
  const c = (key: keyof Morph, v: number) => clamp(v + b(key), -2.4, 2.4)

  return {
    build,
    youth,
    head: c('head', 0.85 * youth + 0.2 * build + r(0.15)),
    girth: c('girth', build + r(0.15)),
    reach: c('reach', -0.55 * build - 0.55 * youth + r(0.15)),
    stature: c('stature', -0.3 * build - 0.45 * youth + r(0.2)),
    shoulders: c('shoulders', -0.3 * build + r(0.3)),
    egg: c('egg', 0.4 * build + r(0.3)),
    squash: c('squash', -0.3 * build + r(0.3)),
    cheeks: c('cheeks', 0.6 * build + 0.3 * youth + r(0.25)),
    cheekY: c('cheekY', r(0.4)),
    limbBias: c('limbBias', r(0.3)),
    limbThick: c('limbThick', r(0.3)),
    limbGirth: c('limbGirth', r(0.15)),
    stance: c('stance', 0.4 * build + r(0.3)),
    lumps: c('lumps', r(0.5)),
    eyeY: c('eyeY', r(0.4)),
    eyeGap: c('eyeGap', 0.4 * youth + r(0.3)),
    mouthY: c('mouthY', r(0.4)),
    mouthW: c('mouthW', 0.2 * build + r(0.35)),
  }
}

/**
 * Archétypes de morphologie : des **silhouettes-types**, une par poupée d'une
 * planche.
 *
 * Première version : six points du plan corpulence × âge, plus une petite
 * signature chacun. Même poussés, ils ne différaient que par des proportions
 * — plus gros, plus petit — et Leo les trouvait trop proches. Une silhouette
 * se reconnaît à **ce qui la rend singulière** : la boule qui n'a presque pas
 * de membres, le têtard qui n'est qu'une tête, le gorille aux bras qui
 * traînent, l'araignée aux membres écartés, le haricot sans épaules… Chaque
 * archétype garde un point du plan (pour que toutes ses cotes restent liées)
 * mais porte surtout une **signature forte** sur les cotes qui le définissent.
 *
 * Neuf archétypes ; une planche en tire six, tous différents, dans un ordre
 * mélangé : deux générations ne ramènent pas la même distribution.
 */
export type Archetype = {
  id: string
  name: string
  build: number
  youth: number
  bias?: Partial<Morph>
}

export const ARCHETYPES: readonly Archetype[] = [
  {
    // Une boule : tronc énorme et court, membres réduits à des moignons.
    id: 'bouboule', name: 'bouboule',
    build: 1, youth: 0.3,
    bias: { girth: 1.6, stature: -0.8, reach: -1.4, limbGirth: -1.6, cheeks: 0.6, stance: 0.9, head: -1.3 },
  },
  {
    // Rien qu'une tête : crâne immense sur un petit corps, membres de poupon.
    id: 'tetard', name: 'têtard',
    build: -0.3, youth: 1,
    bias: { head: 1.1, stature: -1, girth: -0.5, reach: -0.9, eyeGap: 0.6 },
  },
  {
    // Un bâton : petite tête, tronc et membres longs et minces.
    id: 'echalas', name: 'échalas',
    build: -1, youth: -1,
    bias: { head: -0.6, stature: 1.3, reach: 0.9, girth: -0.3, limbGirth: 0.5, stance: -0.4 },
  },
  {
    // Épaules massives, bras longs et épais qui traînent, jambes courtes.
    id: 'gorille', name: 'gorille',
    build: 0.7, youth: -0.8,
    bias: { shoulders: 1.9, limbBias: 1.8, limbThick: 1.4, head: -0.6, stance: -0.9, reach: 0.2 },
  },
  {
    // Tout dans le bas : épaules étroites, hanches larges, crâne en poire.
    id: 'poire', name: 'poire',
    build: 0.6, youth: 0,
    bias: { shoulders: -1.9, egg: 1.2, girth: 0.8, limbBias: -1, limbThick: -0.8, limbGirth: -0.7, reach: -0.3 },
  },
  {
    // Petit corps, membres interminables et très écartés.
    id: 'araignee', name: 'araignée',
    build: -0.8, youth: -0.2,
    bias: { reach: 1.9, girth: 0, stature: -1.1, stance: 2.2, limbGirth: -0.4, head: 0.2 },
  },
  {
    // Un haricot : tronc long et rond sans épaules, membres courts.
    id: 'haricot', name: 'haricot',
    build: 0, youth: 0.2,
    bias: { stature: 1.9, shoulders: -0.9, reach: -1.8, limbGirth: -0.3, head: -0.3, stance: -0.3 },
  },
  {
    // Un pavé : large, carré, tassé, tout en épaules et en cou de taureau.
    id: 'pave', name: 'pavé',
    build: 1, youth: -0.6,
    bias: { stature: -1.1, girth: 1.1, shoulders: 1.4, reach: -0.4, limbThick: 0.6, limbGirth: 0.8, head: -0.2 },
  },
  {
    // Bras qui pendent jusqu'aux genoux, épaules tombantes, corps maigre.
    id: 'degingande', name: 'dégingandé',
    build: -0.3, youth: 0,
    bias: { limbBias: 2.4, shoulders: -1.2, stance: -1, reach: 0.8, head: 0.1 },
  },
]

/**
 * **Bornes de la série** : ce qui garde un air de famille aux neuf silhouettes.
 *
 * Chaque archétype pousse sa singularité, mais une peluche reste une peluche :
 * grosse tête bouffie, membres de boudin rembourrés. Poussées sans limite, les
 * signatures fabriquaient des baguettes (bras de l'araignée à 0,58 du patron),
 * une tête d'épingle sur une tige (échalas à 0,63) — plus des poupées d'une
 * même série, mais des objets d'une autre fabrique. Facteurs relatifs au
 * panneau, appliqués après les signatures : une silhouette y garde son sens
 * (l'échalas reste le plus long, la bouboule la plus ronde), seuls les
 * extrêmes qui sortaient de la famille sont ramenés.
 */
const SERIES = {
  head: [0.8, 1.38],
  torsoHeight: [0.6, 1.65],
  torsoRadius: [0.66, 1.85],
  limbLength: [0.5, 1.75],
  limbRadius: [0.72, 1.7],
} as const
const series = (v: number, [lo, hi]: readonly [number, number]) => clamp(v, lo, hi)

/** Paramètres de la poupée une fois sa morphologie appliquée. */
export function applyMorph(p: DollParams, m: Morph, amount = p.board.morph): DollParams {
  if (amount <= 0) return p
  const s = p.shape
  const lb = p.limbs
  const f = p.face
  const a = amount
  // Borné : aux signatures fortes, un facteur libre pouvait tomber sous la
  // moitié (torse d'un têtard) ou dépasser le double.
  const k = (v: number, span: number) => clamp(1 + v * span * a, 0.5, 1.9)

  // --- tête ---
  const headRadius = s.headRadius * series(k(m.head, 0.2), SERIES.head)
  // La tête reste **bouffie** quel que soit l'archétype — pas seulement ronde :
  // c'est la signature de la série. Bouffi, c'est des bajoues **basses et
  // latérales** plus un bas de crâne plein ; un crâne simplement agrandi ou
  // arrondi ne le dit pas. Bajoues et ovale ne peuvent donc que gagner sur le
  // panneau, avec un plancher visible — au 0,09 du patron les joues d'un
  // fluet se lisaient comme une boule.
  //
  // Mais bouffi n'est pas soucoupe. Trois choses fabriquent la soucoupe, et
  // les dodus les cumulaient : des bajoues trop gonflées, une gaussienne
  // **resserrée** — qui fait une arête nette à hauteur des joues — et un crâne
  // **aplati**, qui met cette arête sous une calotte plate. D'où un gonflement
  // plafonné et à peine plus fort chez les dodus, une gaussienne jamais
  // resserrée mais descendue quand elle gonfle — la joue tombe en bajoue au
  // lieu de s'étaler en bord — et un crâne qui ne s'aplatit plus.
  const up = (v: number) => clamp(0.5 + 0.5 * v, 0, 1)
  const headPuff = clamp(s.headPuff + (0.045 + up(m.cheeks) * 0.035) * a, 0, 0.6)
  const headEgg = clamp(s.headEgg + (0.03 + up(m.egg) * 0.05) * a, -0.3, 0.4)
  const headCheekY = clamp(s.headCheekY - up(m.cheeks) * 0.06 * a + m.cheekY * 0.03 * a, -0.9, 0.3)
  const headCheekSpread = clamp(s.headCheekSpread * (1 + up(m.cheeks) * 0.04 * a), 0.12, 0.9)
  // Allongé d'un cran au plus, jamais aplati : haut et étroit, le crâne
  // dégonfle les joues ; aplati, il pose l'arête des bajoues sous une calotte
  // plate — la soucoupe.
  const headSquash = clamp(s.headSquash * k(clamp(m.squash, 0, 0.3), 0.07), 0.7, 1.4)

  // --- torse ---
  const torsoHeight = s.torsoHeight * series(k(m.stature, 0.3), SERIES.torsoHeight)
  const torsoRadius = s.torsoRadius * series(k(m.girth, 0.35), SERIES.torsoRadius)
  const torsoTaper = clamp(s.torsoTaper + m.shoulders * 0.15 * a, 0.4, 1.25)
  // Une peluche dodue est bourrée plus serré qu'une maigre : moins de bosses.
  const lumps = clamp(s.lumps * k(m.lumps * 0.7 - m.girth * 0.3, 0.45), 0, 0.25)

  // --- membres ---
  // L'épaisseur suit l'embonpoint, un peu moins vite que le torse : les
  // membres restent attachés dans l'écart des hanches (`hipX` ∝ torsoRadius).
  // Et un membre long s'affine — sinon l'allonge fabrique des bras de lutteur.
  // Les membres épaississent avec le tronc, mais une signature peut les en
  // détacher (`limbGirth`) : une boule à gros membres cache son tronc derrière
  // eux et ne lit plus comme une boule.
  const thick = k(m.girth, 0.2) * k(-m.reach, 0.08) * k(m.limbGirth, 0.3)
  const armLength = lb.armLength * series(k(m.reach + m.limbBias * 0.7, 0.32), SERIES.limbLength)
  const legLength = lb.legLength * series(k(m.reach - m.limbBias * 0.5 + m.stature * 0.3, 0.3), SERIES.limbLength)
  const armRadius = lb.armRadius * series(thick * k(m.limbThick, 0.09), SERIES.limbRadius)
  const legRadius = lb.legRadius * series(thick * k(-m.limbThick, 0.09), SERIES.limbRadius)
  const armSpread = clamp(lb.armSpread + m.stance * 0.2 * a, 0, 1.4)
  const legSpread = clamp(lb.legSpread + m.stance * 0.12 * a, 0.02, 0.8)

  // --- visage : il suit le crâne ---
  // Les cotes du visage sont absolues : sans mise à l'échelle, une grosse tête
  // garde des yeux serrés au milieu et une petite les voit filer sur les côtés.
  const rw = headRadius / s.headRadius
  const rh = rw * (headSquash / s.headSquash)
  const eyeHeight = f.eyeHeight * rh + m.eyeY * 0.05 * headRadius * a
  let mouthHeight = f.mouthHeight * rh + m.mouthY * 0.04 * headRadius * a
  // La bouche reste sous les yeux, avec au moins les quatre cinquièmes de
  // l'écart du panneau : plus près, le visage se tasse en grimace.
  const minGap = Math.max(0, f.eyeHeight - f.mouthHeight) * rh * 0.8
  if (eyeHeight - mouthHeight < minGap) mouthHeight = eyeHeight - minGap

  return {
    ...p,
    shape: {
      ...s,
      headRadius, headSquash, headEgg, headPuff, headCheekY, headCheekSpread,
      torsoHeight, torsoRadius, torsoTaper, lumps,
    },
    limbs: { armLength, armRadius, armSpread, legLength, legRadius, legSpread },
    face: {
      ...f,
      eyeSpacing: f.eyeSpacing * rw * k(m.eyeGap, 0.08),
      eyeHeight,
      leftSize: f.leftSize * rw,
      rightSize: f.rightSize * rw,
      mouthWidth: f.mouthWidth * rw * k(m.mouthW, 0.14),
      mouthHeight,
    },
  }
}

/**
 * Garde-fous d'ensemble, que les facteurs pris un à un ne voient pas.
 *
 * Grande stature, longues jambes et grosse tête sont chacun dans leur marge,
 * mais cumulés ils donnent une poupée d'un cinquième plus haute que ses
 * voisines, qui déborde de sa case. Même chose pour le rapport tête/corps : une
 * grosse tête sur un torse amaigri cesse d'être une peluche pour devenir une
 * sucette.
 */
function coherent(base: DollParams, q: DollParams) {
  const h = dollLayout(q).height / dollLayout(base).height
  const ratio =
    q.shape.headRadius / q.shape.torsoRadius / (base.shape.headRadius / base.shape.torsoRadius)
  return h > 0.62 && h < 1.32 && ratio > 0.35 && ratio < 2.4
}

export type MorphPick = { morph: Morph; archetype: Archetype }

function draw(base: DollParams, rnd: () => number, type: Archetype): MorphPick {
  for (let tries = 0; tries < 64; tries++) {
    const morph = sample(rnd, type)
    if (coherent(base, applyMorph(base, morph))) return { morph, archetype: type }
  }
  // Panneau réglé aux limites : aucun tirage ne passe, on rend le patron nu.
  const flat = Object.fromEntries(KEYS.map((key) => [key, 0])) as Morph
  return { morph: flat, archetype: type }
}

/** Morphologie d'une poupée seule : un archétype au hasard, ou celui imposé. */
export function dollMorph(base: DollParams, forced?: string): MorphPick {
  const rnd = mulberry32(base.seed + 9127)
  const pick = ARCHETYPES[Math.floor(rnd() * ARCHETYPES.length)]
  return draw(base, rnd, ARCHETYPES.find((a) => a.id === forced) ?? pick)
}

/**
 * Morphologies d'une planche : **un archétype différent par poupée**.
 *
 * L'ordre est tiré au sort à chaque génération — sinon la couture intégrale
 * serait toujours la bouboule et l'écharpe toujours la crevette, et la
 * régénération donnerait l'impression de ne rien changer. Au-delà de six
 * poupées, le cycle recommence sur un nouveau mélange.
 */
export function boardMorphs(base: DollParams, count: number): MorphPick[] {
  const rnd = mulberry32(base.seed + 9127)
  const order: Archetype[] = []
  while (order.length < count) {
    const deck = [...ARCHETYPES]
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1))
      ;[deck[i], deck[j]] = [deck[j], deck[i]]
    }
    order.push(...deck)
  }
  return order.slice(0, count).map((type) => draw(base, rnd, type))
}
