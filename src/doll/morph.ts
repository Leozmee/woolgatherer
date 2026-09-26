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
  'legSplay', //  jambes écartées, sans toucher aux bras
  'handScale', // mains plus grosses ou plus petites
  'footScale', // pieds plus grands ou plus petits
  'armTaper', //  galbe des bras : > 0 massue, < 0 fuseau
  'legTaper', //  galbe des jambes
  'torsoSquare', // tronc en bloc
  // sculpture du tronc (voir `torsoSculpt`) : ce qui fait la silhouette
  'chest', //    poitrine, pectoraux
  'waist', //    taille marquée
  'belly', //    ventre
  'hips', //     hanches
  'hunch', //    dos voûté
  'depth', //    tronc épais ou plat d'avant en arrière
  // galbe musculaire et articulations
  'armUpper', // biceps
  'armLower', // avant-bras
  'legUpper', // cuisses
  'legLower', // mollets
  'elbow', //    coudes pliés au repos
  'knee', //     genoux fléchis au repos
  'kneeOut', //  genoux en dehors (grenouille)
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
  const b = (key: keyof Morph) => (type.bias?.[key] ?? 0) * CHARGE
  const c = (key: keyof Morph, v: number) => clamp(v + b(key), -3, 3)

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
    legSplay: c('legSplay', r(0.1)),
    handScale: c('handScale', r(0.05)),
    footScale: c('footScale', r(0.05)),
    armTaper: c('armTaper', r(0.05)),
    legTaper: c('legTaper', r(0.05)),
    torsoSquare: c('torsoSquare', 0),
    chest: c('chest', r(0.15)),
    waist: c('waist', r(0.15)),
    belly: c('belly', 0.4 * build + r(0.15)),
    hips: c('hips', r(0.15)),
    hunch: c('hunch', r(0.1)),
    depth: c('depth', 0.3 * build + r(0.15)),
    armUpper: c('armUpper', r(0.1)),
    armLower: c('armLower', r(0.1)),
    legUpper: c('legUpper', 0.2 * build + r(0.1)),
    legLower: c('legLower', r(0.1)),
    elbow: c('elbow', r(0.1)),
    knee: c('knee', 0),
    kneeOut: c('kneeOut', 0),
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
 * Neuf archétypes, validés avec Leo sur croquis (26 sept.) ; une planche en
 * tire six, tous différents, dans un ordre mélangé : deux générations ne
 * ramènent pas la même distribution.
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
    // Un bâton : petite tête, tronc long, plat et droit, membres longs et
    // minces aux articulations saillantes.
    id: 'echalas', name: 'échalas',
    build: -1, youth: -1,
    bias: {
      head: -0.6, stature: 1.3, reach: 0.9, girth: -0.3, limbGirth: 0.5, stance: -0.4,
      depth: -1, chest: -0.4, waist: 0.3, hips: -0.3, armUpper: -0.4, legUpper: -0.4,
    },
  },
  {
    // Thorax en tonneau et dos voûté, bassin étroit ; avant-bras énormes,
    // bras arqués qui pendent, jambes courtes fléchies.
    id: 'gorille', name: 'gorille',
    build: 0.7, youth: -0.8,
    bias: {
      shoulders: 1.6, limbBias: 1.8, limbThick: 1.1, head: -0.6, stance: -0.9, reach: 0.2,
      armTaper: 0.1, handScale: 0,
      chest: 1.3, hunch: 1.6, belly: 0.4, hips: -0.8, depth: 0.8,
      armUpper: 0.3, armLower: 1, legUpper: 0.3, elbow: 0.8, knee: 1, kneeOut: 0.5,
    },
  },
  {
    // Petit corps, membres interminables, effilés et très écartés.
    id: 'araignee', name: 'araignée',
    build: -0.8, youth: -0.2,
    bias: {
      reach: 1.9, girth: 0, stature: -1.1, stance: 2.2, limbGirth: -0.4, head: 0.2,
      armTaper: -0.35, legTaper: -0.35, handScale: -0.2, footScale: -0.2,
      // Taille de guêpe et abdomen rond, genoux et coudes cassés haut.
      waist: 1.3, belly: 0.9, chest: 0.4, elbow: 0.9, knee: 3, kneeOut: 1,
    },
  },
  {
    // Bras qui pendent jusqu'aux genoux, épaules tombantes, poitrine creuse
    // et dos rond, petite bedaine, genoux mous.
    id: 'degingande', name: 'dégingandé',
    build: -0.3, youth: 0,
    bias: {
      limbBias: 2.4, shoulders: -1.2, stance: -1, reach: 0.8, head: 0.1, handScale: 0.2,
      chest: -0.9, hunch: 1.1, belly: 0.7, depth: -0.3, knee: 0.6, elbow: 0.2,
    },
  },
  {
    // Grosse tête de bébé, petit corps, bras et jambes courts mais bien là.
    id: 'poupon', name: 'poupon',
    build: -0.1, youth: 1,
    bias: {
      head: 1.1, stature: -0.9, girth: -0.2, reach: -0.6, eyeGap: 0.6,
      // Ventre rond de bébé, tronc épais, cuisses et bras potelés.
      belly: 1.2, hips: 0.4, depth: 1, chest: -0.3, armUpper: 0.6, legUpper: 0.8, legLower: 0.3,
    },
  },
  {
    // Torse en V : épaules très larges, taille fine, gros bras, petite tête.
    id: 'hercule', name: 'hercule',
    build: 0.5, youth: -0.8,
    bias: {
      shoulders: 2.6, girth: 0.3, stature: 0.3, limbThick: 0.7, head: -0.7, handScale: -0.1,
      torsoSquare: 0.2, legSplay: 0.3,
      // Le V : pectoraux, taille et bassin serrés ; biceps, mollets.
      chest: 1.4, waist: 1.3, hips: -1, belly: -0.6, depth: 0.3,
      armUpper: 1.2, armLower: 0.5, legUpper: 0.9, legLower: 0.9, elbow: 0.5, knee: 0.2,
    },
  },
  {
    // Accroupi : tronc large et bas, jambes courtes très écartées, grands pieds.
    id: 'crapaud', name: 'crapaud',
    build: 0.9, youth: 0.3,
    bias: {
      stature: -1.2, girth: 0.9, legSplay: 1.2, stance: -0.6, reach: 0.5, limbThick: 0.3, limbGirth: -0.9,
      footScale: 0.9, head: 0.3, cheeks: 0.5,
      // Ventre qui tombe entre les cuisses, hanches larges, accroupi.
      belly: 1.5, hips: 1.1, chest: -0.5, depth: 0.7, legUpper: 0.5, elbow: 0.8, knee: 3.2, kneeOut: 1.2,
    },
  },
  {
    // Fine et élancée : longues jambes serrées, petits pieds, bras fins,
    // épaules étroites.
    id: 'ballerine', name: 'ballerine',
    build: -0.8, youth: -0.4,
    bias: {
      stature: 0.3, reach: 1, limbBias: -0.7, girth: -0.7, limbGirth: -0.5, shoulders: -0.6,
      footScale: -0.4, handScale: -0.3, legTaper: -0.35, stance: -0.8, head: -0.1,
      // Taille marquée, hanches rondes, mollets de danseuse, bras arrondis.
      waist: 1.5, hips: 1.1, chest: 0.3, depth: -0.5, legLower: 0.9, legUpper: 0.2, elbow: 0.7,
    },
  },
  {
    // Cuisses énormes qui s'effilent, grands pieds, petits bras, buste droit.
    id: 'kangourou', name: 'kangourou',
    build: 0.2, youth: -0.2,
    bias: {
      limbThick: -1.2, legTaper: -0.3, footScale: 1, limbBias: -1.2, handScale: -0.3, stature: 0.3,
      // Bassin lourd, poitrine menue ; cuisses énormes, petits bras repliés
      // contre la poitrine, genoux fléchis.
      hips: 1.2, belly: 0.5, chest: -0.5, hunch: 0.4, depth: 0.4,
      legUpper: 2, legLower: -0.4, armLower: -0.3, elbow: 2.2, knee: 1.2,
    },
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
  head: [0.78, 1.45],
  torsoHeight: [0.55, 1.75],
  torsoRadius: [0.62, 1.95],
  limbLength: [0.48, 1.85],
  limbRadius: [0.66, 1.85],
} as const

/**
 * Intensité des signatures, **entre marqué et caricatural** (choix de Leo sur
 * l'échelle de croquis, 26 sept.) : chaque signature est poussée de 30 %,
 * bornes de la série élargies d'autant.
 */
const CHARGE = 1.3
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
  const k = (v: number, span: number) => clamp(1 + v * span * a, 0.45, 2.1)

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
  const torsoTaper = clamp(s.torsoTaper + m.shoulders * 0.25 * a, 0.4, 1.6)
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
  const armRadius = lb.armRadius * series(thick * k(m.limbThick, 0.18), SERIES.limbRadius)
  const legRadius = lb.legRadius * series(thick * k(-m.limbThick, 0.18), SERIES.limbRadius)
  const armSpread = clamp(lb.armSpread + m.stance * 0.2 * a, 0, 1.4)
  const legSpread = clamp(lb.legSpread + m.stance * 0.12 * a + m.legSplay * 0.2 * a, 0.02, 0.8)

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
      torsoSquare: clamp((s.torsoSquare ?? 0) + m.torsoSquare * a, 0, 1),
      // Sculpture : ~0,26 par unité de signature (CHARGE compris).
      chest: clamp((s.chest ?? 0) + m.chest * 0.2 * a, -0.3, 0.5),
      waist: clamp((s.waist ?? 0) + m.waist * 0.2 * a, -0.3, 0.5),
      belly: clamp((s.belly ?? 0) + m.belly * 0.22 * a, -0.3, 0.6),
      hips: clamp((s.hips ?? 0) + m.hips * 0.2 * a, -0.3, 0.6),
      hunch: clamp((s.hunch ?? 0) + m.hunch * 0.2 * a, 0, 0.6),
      torsoDepth: clamp((s.torsoDepth ?? 0.86) + m.depth * 0.09 * a, 0.6, 1.15),
    },
    limbs: {
      ...lb,
      armLength, armRadius, armSpread, legLength, legRadius, legSpread,
      // Formes : mains, pieds et galbe des membres (voir `ARCHETYPES`).
      handScale: clamp((lb.handScale ?? 1) * (1 + m.handScale * a), 0.6, 2),
      footScale: clamp((lb.footScale ?? 1) * (1 + m.footScale * a), 0.6, 2),
      armTaper: clamp((lb.armTaper ?? 0) + m.armTaper * a, -0.6, 0.8),
      legTaper: clamp((lb.legTaper ?? 0) + m.legTaper * a, -0.6, 0.8),
      armUpper: clamp((lb.armUpper ?? 0) + m.armUpper * 0.22 * a, -0.3, 0.6),
      armLower: clamp((lb.armLower ?? 0) + m.armLower * 0.22 * a, -0.3, 0.6),
      legUpper: clamp((lb.legUpper ?? 0) + m.legUpper * 0.22 * a, -0.3, 0.6),
      legLower: clamp((lb.legLower ?? 0) + m.legLower * 0.22 * a, -0.3, 0.6),
      // Plis de repos : ~0,4 rad par unité de signature.
      elbowRest: clamp((lb.elbowRest ?? 0) + m.elbow * 0.3 * a, 0, 1.2),
      kneeRest: clamp((lb.kneeRest ?? 0) + m.knee * 0.4 * a, 0, 1.3),
      kneeOut: clamp((lb.kneeOut ?? 0) + m.kneeOut * 0.8 * a, 0, 1),
    },
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
  return h > 0.6 && h < 1.38 && ratio > 0.35 && ratio < 2.6
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
