import { useControls, folder, button } from 'leva'
import { useCallback, useMemo } from 'react'

/**
 * Tous les réglages de la poupée en un seul objet typé.
 *
 * Rien n'est codé en dur dans les composants : cet objet deviendra tel quel le
 * « genome » de la galerie générative, sans réécriture.
 */
export type DollParams = {
  seed: number
  wool: {
    base: string
    stitch: string
    roughness: number
    sheen: number
    sheenColor: string
    sheenRoughness: number
    knitScale: number
    /**
     * Côté des cartes de tricot, en pixels ; 1024 par défaut. La planche passe
     * à 512 (voir `App.lightened`).
     */
    mapSize?: number
    fuzz: number
    relief: number
    normalStrength: number
  }
  shape: {
    headRadius: number
    headEgg: number
    headPuff: number
    headCheekY: number
    headCheekSpread: number
    headSquash: number
    torsoHeight: number
    torsoRadius: number
    torsoTaper: number
    lumps: number
    lumpScale: number
  }
  limbs: {
    armLength: number
    armRadius: number
    armSpread: number
    legLength: number
    legRadius: number
    legSpread: number
  }
  face: {
    eyeSpacing: number
    eyeHeight: number
    leftSize: number
    rightSize: number
    leftColor: string
    rightColor: string
    mouthWidth: number
    mouthHeight: number
    mouthStitches: number
  }
  thread: {
    color: string
    mouthColor: string
    radius: number
  }
  hair: {
    count: number
    length: number
    thickness: number
    segments: number
    droop: number
    crown: number
    rooting: number
    strands: number
    turns: number
    color: string
    stiffness: number
    drag: number
    gravity: number
  }
  scarf: {
    // coupe
    width: number
    front: number
    back: number
    drop: number
    thickness: number
    // enroulement
    wraps: number
    diagonal: number
    layers: number
    loop: number
    shoulder: number
    // tissu
    weight: number
    drape: number
    bend: number
    slack: number
    curl: number
    twist: number
    // pans
    tuck: number
    hug: number
    fringe: number
    strands: number
    // aspect
    ribs: number
    ribDepth: number
    relief: number
    sheen: number
  }
  chain: {
    size: number
    elong: number
    wire: number
    drop: number
    dip: number
    weight: number
    drape: number
    scatter: number
    grip: number
  }
  pins: { count: number; head: number }
  shell: { count: number; height: number; density: number }
  spring: { stiffness: number; drag: number; gravity: number; headStiffness: number }
  motion: { spin: number; breathe: number }
  board: { gallery: boolean; light: boolean; single: string; morph: number; hairStyle: string }
}

export function useDollParams(): { params: DollParams; regenerate: () => void } {
  const wool = useControls('Laine', {
    base: '#cdbfa4',
    stitch: '#e0d4bb',
    // La rugosité est pilotée par une carte : cette valeur la multiplie, donc
    // on reste proche de 1.
    roughness: { value: 1, min: 0.3, max: 1 },
    sheen: { value: 0.85, min: 0, max: 1, label: 'sheen (fibres)' },
    sheenColor: '#fff4e0',
    // Une laine diffuse largement ; un sheen trop net donne de la soie.
    sheenRoughness: { value: 1, min: 0, max: 1 },
    knitScale: { value: 6, min: 0.3, max: 16, step: 0.1, label: 'taille maille' },
    relief: { value: 0.6, min: 0, max: 8, step: 0.1 },
    normalStrength: { value: 0.3, min: 0, max: 2, step: 0.05, label: 'force relief' },
    fuzz: { value: 6, min: 0, max: 12, step: 0.1, label: 'duvet' },
  })

  const shape = useControls('Silhouette', {
    Tête: folder({
      headRadius: { value: 0.43, min: 0.25, max: 0.9, step: 0.01 },
      headEgg: { value: 0, min: -0.3, max: 0.4, step: 0.01, label: 'ovale (bas large)' },
      // Bajoues basses et resserrées : hautes et larges, elles aplatissent le
      // crâne en soucoupe au lieu de gonfler les joues.
      headPuff: { value: 0.09, min: 0, max: 0.6, step: 0.01, label: 'bajoues' },
      headCheekY: { value: -0.6, min: -0.9, max: 0.3, step: 0.01, label: 'hauteur bajoues' },
      headCheekSpread: { value: 0.66, min: 0.12, max: 0.9, step: 0.01, label: 'largeur bajoues' },
      headSquash: { value: 1.04, min: 0.7, max: 1.4, step: 0.01 },
    }),
    Torse: folder({
      torsoHeight: { value: 0.78, min: 0.25, max: 1.2, step: 0.01 },
      torsoRadius: { value: 0.26, min: 0.12, max: 0.6, step: 0.01 },
      torsoTaper: { value: 0.64, min: 0.4, max: 1.2, step: 0.01, label: 'épaules' },
    }),
    Rembourrage: folder({
      lumps: { value: 0.03, min: 0, max: 0.25, step: 0.005, label: 'bosses' },
      lumpScale: { value: 2, min: 0.5, max: 8, step: 0.1 },
    }),
  }) as DollParams['shape']

  const limbs = useControls('Membres', {
    armLength: { value: 0.33, min: 0.15, max: 1, step: 0.01 },
    armRadius: { value: 0.1, min: 0.03, max: 0.2, step: 0.002 },
    armSpread: { value: 0.95, min: 0, max: 1.4, step: 0.01 },
    legLength: { value: 0.38, min: 0.15, max: 1, step: 0.01 },
    legRadius: { value: 0.12, min: 0.03, max: 0.2, step: 0.002 },
    legSpread: { value: 0.14, min: 0, max: 0.8, step: 0.01 },
  })

  const face = useControls('Visage', {
    eyeSpacing: { value: 0.29, min: 0.05, max: 0.45, step: 0.005 },
    eyeHeight: { value: 0.04, min: -0.3, max: 0.4, step: 0.005 },
    leftSize: { value: 0.1, min: 0.03, max: 0.22, step: 0.002 },
    rightSize: { value: 0.09, min: 0.03, max: 0.22, step: 0.002, label: 'rightSize (dépareillé)' },
    leftColor: '#a3947b',
    rightColor: '#865936',
    mouthWidth: { value: 0.24, min: 0.05, max: 0.5, step: 0.005 },
    mouthHeight: { value: -0.16, min: -0.45, max: 0.1, step: 0.005 },
    mouthStitches: { value: 5, min: 2, max: 10, step: 1 },
  })

  // Multiplicateurs pour ce que la graine tire déjà — largeur, pans, frange —
  // sinon un curseur en valeur absolue écraserait la variété d'une poupée à
  // l'autre. Valeurs absolues pour ce qui est une propriété du tissu et non de
  // l'exemplaire.
  const scarf = useControls('Écharpe', {
    Coupe: folder({
      width: { value: 0.78, min: 0.5, max: 1.8, step: 0.02, label: 'largeur ×' },
      front: { value: 0.68, min: 0.3, max: 2, step: 0.02, label: 'pan avant ×' },
      back: { value: 0.76, min: 0.3, max: 2, step: 0.02, label: 'pan arrière ×' },
      drop: { value: 0.28, min: -0.2, max: 1, step: 0.01, label: 'hauteur' },
      thickness: { value: 0.05, min: 0.02, max: 0.2, step: 0.005, label: 'épaisseur' },
    }),
    Enroulement: folder({
      // Compté en tours **entiers** ; le code ajoute le demi-tour qui met un
      // bout devant et l'autre derrière. Exposer 1,5 directement ne marche pas :
      // le curseur cale sur la grille du pas et retombe sur un compte entier,
      // qui ramène les deux bouts au même endroit — l'écharpe en bandoulière.
      wraps: { value: 3, min: 1, max: 4, step: 1, label: 'tours' },
      diagonal: { value: 0.55, min: 0, max: 1.4, step: 0.02, label: 'diagonale des bouts' },
      layers: { value: 1.25, min: 0.6, max: 2.6, step: 0.05, label: 'écart des couches' },
      loop: { value: 0.34, min: 0, max: 0.9, step: 0.02, label: 'montée de la boucle' },
      shoulder: { value: 0.35, min: 0, max: 0.9, step: 0.02, label: 'souplesse épaule' },
    }),
    Tissu: folder({
      weight: { value: 0.18, min: 0.05, max: 1.2, step: 0.02, label: 'poids' },
      drape: { value: 0.09, min: 0.02, max: 0.4, step: 0.01, label: 'amortissement' },
      bend: { value: 0.09, min: 0.01, max: 0.5, step: 0.01, label: 'raideur au pli' },
      slack: { value: 0.04, min: 0, max: 0.2, step: 0.005, label: 'surplus de largeur' },
      curl: { value: 0.17, min: 0, max: 0.5, step: 0.01, label: 'roulé des bords' },
      twist: { value: 0.42, min: 0, max: 1.2, step: 0.02, label: 'vrille' },
    }),
    Pans: folder({
      tuck: { value: 0.13, min: 0, max: 0.4, step: 0.01, label: 'enfoncement sous le tour' },
      hug: { value: 6, min: 1, max: 14, step: 1, label: 'rangs de placage' },
      fringe: { value: 1, min: 0, max: 2.5, step: 0.05, label: 'frange ×' },
      strands: { value: 7, min: 3, max: 14, step: 1, label: 'mèches par bout' },
    }),
    Aspect: folder({
      ribs: { value: 4, min: 2, max: 14, step: 1, label: 'côtes en travers' },
      ribDepth: { value: 1.1, min: 0, max: 2.5, step: 0.05, label: 'relief des côtes' },
      relief: { value: 1.5, min: 0, max: 3, step: 0.1, label: 'force du relief' },
      sheen: { value: 0.45, min: 0, max: 1, step: 0.05, label: 'brillance' },
    }),
  }) as DollParams['scarf']

  // Multiplicateurs pour ce que la graine tire — taille et allongement des
  // maillons — et valeurs absolues pour ce qui tient du montage : hauteur sur
  // l'épaule, poids, retenue.
  const chain = useControls('Collier', {
    Maillons: folder({
      size: { value: 1.42, min: 0.4, max: 2.2, step: 0.02, label: 'taille ×' },
      elong: { value: 0.8, min: 0.6, max: 1.8, step: 0.02, label: 'allongement ×' },
      wire: { value: 0.27, min: 0.08, max: 0.4, step: 0.005, label: 'grosseur du fil' },
      scatter: { value: 1.5, min: 0, max: 2, step: 0.05, label: 'désordre' },
    }),
    Montage: folder({
      drop: { value: 0.62, min: -0.4, max: 1.6, step: 0.02, label: 'hauteur sur l’épaule' },
      dip: { value: 1.7, min: 0, max: 9, step: 0.1, label: 'plongée devant' },
      grip: { value: 0.18, min: 0, max: 0.95, step: 0.02, label: 'retenue' },
    }),
    Physique: folder({
      weight: { value: 0.05, min: 0.05, max: 2, step: 0.05, label: 'poids' },
      drape: { value: 0.44, min: 0.03, max: 0.5, step: 0.01, label: 'amortissement' },
    }),
  }) as DollParams['chain']

  const thread = useControls('Fils', {
    color: '#e5d1c1',
    mouthColor: '#e5d1c1',
    radius: { value: 0.01, min: 0.002, max: 0.03, step: 0.001 },
  })

  const hair = useControls('Locks', {
    count: { value: 16, min: 0, max: 40, step: 1, label: 'nombre' },
    length: { value: 0.34, min: 0.08, max: 1.8, step: 0.01, label: 'longueur' },
    thickness: { value: 0.03, min: 0.008, max: 0.1, step: 0.002, label: 'épaisseur' },
    // Plus de segments = fouetté plus fin en bout de mèche, et plus de rendus.
    segments: { value: 11, min: 1, max: 16, step: 1, label: 'segments' },
    crown: { value: 0.95, min: -0.2, max: 0.98, step: 0.01, label: 'implantation' },
    // Enfouissement de la racine, en multiples de l'épaisseur du lock. C'est
    // lui qui donne l'impression que la mèche sort du crâne. Borné côté Doll à
    // une fraction de la longueur d'un segment.
    rooting: { value: 8, min: 0, max: 8, step: 0.1, label: 'enracinement' },
    // 0 = le lock sort perpendiculairement au crâne, 1 = il part couché dessus.
    droop: { value: 1, min: 0, max: 1, step: 0.05, label: 'plaquage racine' },
    strands: { value: 2, min: 2, max: 5, step: 1, label: 'brins tressés' },
    turns: { value: 1, min: 1, max: 20, step: 1, label: 'serrage tresse' },
    color: '#4b3109',
    // Raideur faible + amortissement fort = tissu qui tombe. L'inverse donne
    // une tige qui rebondit : c'est la définition d'un ressort.
    stiffness: { value: 0.01, min: 0.005, max: 0.5, step: 0.005, label: 'rappel' },
    drag: { value: 0.69, min: 0.02, max: 0.95, step: 0.01, label: 'amortissement' },
    gravity: { value: 5.3, min: 0, max: 12, step: 0.1, label: 'poids' },
  })

  const pins = useControls('Épingles', {
    count: { value: 0, min: 0, max: 6, step: 1, label: 'torse' },
    head: { value: 1, min: 0, max: 4, step: 1, label: 'tête' },
  })

  // Duvet volumétrique. `coques` à 0 revient au rendu sans coques — utile pour
  // comparer, et pour la galerie où 14 coques x 8 volumes x 20 poupées serait
  // hors budget.
  const shell = useControls('Duvet 3D', {
    count: { value: 14, min: 0, max: 20, step: 1, label: 'coques' },
    height: { value: 0.02, min: 0, max: 0.06, step: 0.001, label: 'longueur fibre' },
    density: { value: 2200, min: 500, max: 25000, step: 100, label: 'densité fibres' },
  })

  const spring = useControls('Ressorts', {
    stiffness: { value: 0.3, min: 0.01, max: 0.6, step: 0.005, label: 'rappel' },
    drag: { value: 0.39, min: 0.02, max: 0.9, step: 0.01, label: 'amortissement' },
    gravity: { value: 1.2, min: 0, max: 6, step: 0.05 },
    headStiffness: { value: 0.53, min: 0.02, max: 1, step: 0.01, label: 'rappel tête' },
  })

  const motion = useControls('Mouvement', {
    spin: { value: -0.3, min: -2, max: 2, step: 0.05, label: 'dérive auto' },
    breathe: { value: 0.01, min: 0, max: 0.06, step: 0.002 },
  })

  // Regroupé ici avec tous les autres appels leva plutôt que dans `App` :
  // chaque `useControls` injecte une vingtaine de hooks dans le composant
  // appelant, et les répartir entre deux composants rendait l'ordre fragile.
  const board = useControls('Planche', {
    gallery: { value: true, label: '6 variantes' },
    light: { value: true, label: 'allégé' },
    // Amplitude de la morphologie tirée de la graine autour du patron du
    // panneau (`morph.ts`). À 0, toutes les poupées ont exactement la
    // silhouette réglée ici.
    morph: { value: 1, min: 0, max: 1.5, step: 0.05, label: 'variation morpho' },
    // Liste littérale plutôt qu'importée de `traits` : `traits` dépend déjà de
    // ce module, un import en valeur créerait un cycle.
    single: {
      value: 'couture',
      options: ['couture', 'echarpe', 'nu', 'collier', 'ceinture', 'noeudPap'],
      label: 'variante (seule)',
    },
    // Liste littérale pour la même raison : `hairstyles` dépend de ce module.
    hairStyle: {
      value: 'auto',
      options: ['auto', 'locks', 'boucles', 'meches', 'chignon', 'houppette', 'epars', 'couettes', 'queue', 'nattes', 'frange'],
      label: 'coiffure (seule)',
    },
  })

  // Forme fonctionnelle : elle rend le `set` disponible, ce qui permet au
  // bouton de retirer une graine. Tout l'aléatoire de la poupée en dérive —
  // pièces, motifs, membre recousu, bracelet, épingle, couture — donc changer
  // cette seule valeur régénère toute la planche.
  const [{ seed }, setSeed] = useControls('Graine', () => ({
    seed: { value: 4413, min: 0, max: 9999, step: 1 },
  }))

  const regenerate = useCallback(
    () => setSeed({ seed: Math.floor(Math.random() * 10000) }),
    [setSeed],
  )

  useControls('Graine', { générer: button(regenerate) }, [regenerate])

  const params = useMemo(
    () => ({
      seed, wool, shape, limbs, face, thread, hair, scarf, chain,
      pins, shell, spring, motion,
      // leva type les listes d'options en `string`.
      board: board as DollParams['board'],
    }),
    [seed, wool, shape, limbs, face, thread, hair, scarf, chain, pins, shell, spring, motion, board],
  )

  return { params, regenerate }
}
