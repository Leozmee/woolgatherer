import * as THREE from 'three'
import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import { Inertia, followLimbs, useRigBones } from './rig'
import { CrossStitch, Thread, Pin, jitterColor, pinColor } from './parts'
import { armClearance, armSpheres, bodyRadius, bodySpheres, onTorso, onHeadPolar } from './surface'
import { ClothSheet } from '../core/cloth'
import { Scarf, scarfMetrics } from './scarf'
import { useDisposable } from '../core/useDisposable'
import {
  buildPatches,
  patchHoles,
  type Patch,
  type PatchHoles,
  type PatchZone,
  type Placement,
} from './patch'
import { mulberry32 } from '../core/rand'
import type { DollParams } from './params'
import type { WoodMaps } from './wood'

/**
 * Signes distinctifs.
 *
 * Chaque trait ne touche qu'à des **emplacements nommés** de la poupée plutôt
 * que de reconstruire un modèle : la silhouette, la laine et le visage restent
 * ceux du panneau, et la comparaison porte uniquement sur le signe ajouté.
 *
 * Le bracelet, le bandage, les membres dépareillés et les pièces rapportées
 * forment le fond commun aux six.
 */
export type TraitId =
  | 'nu'
  | 'couture'
  | 'collier'
  | 'echarpe'
  | 'ceinture'
  | 'couronne'
  | 'noeudPap'

export type TraitDef = { id: TraitId; name: string; note: string }

export const TRAITS: TraitDef[] = [
  { id: 'couture', name: 'COUTURE INTÉGRALE', note: 'suture faisant le tour du corps' },
  { id: 'echarpe', name: 'ÉCHARPE', note: 'laine enroulée au cou, deux pans' },
  { id: 'couronne', name: 'COURONNE D’ÉPINGLES', note: 'épingles plantées en cercle' },
  { id: 'collier', name: 'COLLIER', note: 'chaîne de petits anneaux entrelacés' },
  { id: 'ceinture', name: 'CEINTURE', note: 'cordon noué à la taille, boucle de bois' },
  { id: 'noeudPap', name: 'NŒUD PAPILLON', note: 'nœud de tissu au col' },
]

/**
 * Collier : une chaîne de petits anneaux entrelacés.
 *
 * Ce qui fait lire une chaîne, ce n'est pas la boucle mais **l'entrelacement** :
 * chaque anneau contient le suivant, et son plan est perpendiculaire à celui de
 * son voisin. Tous les plans contiennent la tangente du tracé — sinon les
 * anneaux ne peuvent pas s'enfiler — et un anneau sur deux bascule d'un quart de
 * tour autour d'elle. Une file d'anneaux tous dans le même plan lit comme une
 * série de rondelles posées côte à côte.
 *
 * Le pas est plus court que le diamètre : deux anneaux voisins doivent se
 * chevaucher pour se traverser. Au-delà la chaîne se disloque en perles.
 */
function Necklace({ p, seed }: { p: DollParams; seed: number }) {
  const rnd = mulberry32(seed + 4903)
  // Rayon en travers de la chaîne, allongement du maillon le long d'elle, et
  // grosseur du fil.
  const across = p.shape.torsoRadius * (0.1 + rnd() * 0.022) * p.chain.size
  const elong = (1.4 + rnd() * 0.3) * p.chain.elong
  const tube = across * p.chain.wire
  const half = across * elong

  // Métal tiré dans la palette, avec un micro-décalage : deux colliers du même
  // métal ne sont jamais exactement du même ton.
  const [metalBase, roughness] = CHAIN_METALS[Math.floor(rnd() * CHAIN_METALS.length)]
  const metal = jitterColor(metalBase, rnd, 0.07)

  const geo = useDisposable(
    () =>
      Object.assign(new THREE.TorusGeometry(across, tube, 8, 26), {
        dispose() {},
      }) as never,
    [across, tube],
  ) as unknown as THREE.TorusGeometry

  const setup = useMemo(() => {
    // La chaîne passe **par-dessus la boule d'épaule**, pas au-dessus d'elle.
    //
    // La peluche n'a pratiquement pas de cou : entre le bas du crâne et le
    // sommet des bras il y a une encoche, et c'est du vide. Une chaîne qui monte
    // pour éviter les bras traverse cette encoche — rien ne la porte, et elle a
    // l'air de flotter. Il faut au contraire qu'elle vienne s'appuyer sur la
    // face supérieure de la boule d'épaule : c'est là qu'un collier repose, et
    // c'est ce contact qui se lit.
    //
    // Le rayon prend donc le maximum entre le corps de révolution et le
    // dégagement des bras. Sur les flancs les bras l'emportent largement — la
    // chaîne s'y écarte —, devant et derrière ils ne comptent plus et elle
    // revient contre la poitrine. Une boucle en amande, comme un vrai collier
    // sur des épaules larges.
    const arms = armSpheres(p, tube * 0.4)
    const yRest = -p.shape.torsoHeight * 0.16 + p.limbs.armRadius * p.chain.drop
    const dip = across * p.chain.dip
    const at = (a: number) => {
      // `|cos a|` vaut 1 sur les flancs, 0 devant comme derrière.
      const side = Math.abs(Math.cos(a))
      const y = yRest - dip * (1 - side)
      const r = Math.max(bodyRadius(p, y), armClearance(arms, a, y)) + tube * 1.6
      return new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r)
    }

    // Compte déduit du périmètre réel : posé à la main, il laisse un trou ou un
    // recouvrement à la fermeture dès qu'une proportion change.
    //
    // Le pas fait 1,2 demi-maillon. Deux voisins doivent se **chevaucher** pour
    // se traverser — au-delà de deux, la chaîne se disloque en perles ; en
    // dessous de un, chaque maillon a son trou bouché par ses voisins et il ne
    // reste qu'un boudin.
    let perimeter = 0
    const STEPS = 240
    for (let k = 1; k <= STEPS; k++) {
      perimeter += at((k / STEPS) * Math.PI * 2).distanceTo(at(((k - 1) / STEPS) * Math.PI * 2))
    }
    const count = Math.max(10, Math.round(perimeter / (half * 1.2)))

    // Une chaîne n'est pas réglée. Chaque maillon a son propre écart au ±45°
    // théorique et sa propre inclinaison — c'est ce désordre qui la distingue
    // d'une frise répétée. Tiré de la graine, donc reproductible, et assez
    // retenu pour que l'entrelacement tienne : au-delà d'une vingtaine de degrés
    // les plans voisins ne sont plus assez perpendiculaires et les maillons se
    // traversent.
    const jit = mulberry32(seed + 5501)
    const rest: THREE.Vector3[] = []
    const pin: number[] = []
    const roll: number[] = []
    const tilt: number[] = []

    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2
      rest.push(at(a))
      // Retenu **sur les épaules seulement** : c'est ce qui le porte. Devant et
      // derrière il pend librement, sinon la chaîne reste un anneau rigide et la
      // physique ne se voit pas.
      // Retenue plus douce, et concentrée là où l'épaule porte vraiment.
      const carry = Math.abs(Math.cos(a)) ** 2.6
      pin.push(p.chain.grip * carry)
      roll.push((i % 2 ? 1 : -1) * Math.PI * 0.25 + (jit() - 0.5) * 0.42 * p.chain.scatter)
      tilt.push((jit() - 0.5) * 0.22 * p.chain.scatter)
    }

    return { rest, pin, roll, tilt, count }
  }, [p, seed, across, tube, half])

  const chain = useMemo(
    () =>
      new ClothSheet(
        setup.rest,
        setup.pin,
        setup.count,
        1,
        { shear: 0, bend: 0.05, slack: 0 },
        seed,
        true,
      ),
    [setup, seed],
  )

  const colliders = useMemo(
    () => [
      ...bodySpheres(p, p.shape.headRadius * 0.2, -p.shape.torsoHeight * 0.6, tube * 0.6),
      ...armSpheres(p, tube * 0.6),
    ],
    [p, tube],
  )

  const group = useRef<THREE.Group>(null!)
  const links = useRef<(THREE.Object3D | null)[]>([])
  const scratch = useRef({
    quat: new THREE.Quaternion(),
    gravity: new THREE.Vector3(),
    tan: new THREE.Vector3(),
    radial: new THREE.Vector3(),
    x: new THREE.Vector3(),
    y: new THREE.Vector3(),
    z: new THREE.Vector3(),
    m: new THREE.Matrix4(),
  }).current

  const rig = useRigBones()
  const inertia = useMemo(() => new Inertia(), [])
  useFrame((_, dt) => {
    const { quat, gravity, tan, radial, x, y, z, m } = scratch
    // Obstacles des bras sur la pose animée (en fin de liste).
    if (rig) followLimbs(rig, group.current, colliders, colliders.length - 8, 'arm', p.limbs.armLength)
    group.current.getWorldQuaternion(quat)
    gravity.set(0, -1, 0).applyQuaternion(quat.invert())
    // Chaîne légère : elle doit pendre, pas rebondir.
    chain.step(
      dt,
      { gravity: p.chain.weight, damping: p.chain.drape, iterations: 10 },
      colliders,
      gravity,
      inertia.update(group.current, dt),
    )

    const pts = chain.points
    const n = setup.count
    for (let i = 0; i < n; i++) {
      const o = links.current[i]
      if (!o) continue
      o.position.copy(pts[i])

      // La tangente vient des **voisins simulés**, pas du tracé de repos : c'est
      // elle qui fait suivre l'orientation des maillons quand la chaîne bouge.
      tan.subVectors(pts[(i + 1) % n], pts[(i + n - 1) % n])
      if (tan.lengthSq() < 1e-12) tan.set(1, 0, 0)
      tan.normalize()
      radial.set(pts[i].x, 0, pts[i].z)
      if (radial.lengthSq() < 1e-10) radial.set(0, 0, 1)
      radial.normalize()

      // Le tore a son axe en +Z ; la tangente va en X, et Z sur la normale du
      // plan du maillon. Tous les plans contiennent la tangente — sans quoi les
      // maillons ne s'enfilent pas — et deux voisins sont à quatre-vingt-dix
      // degrés l'un de l'autre, ce qui fait l'entrelacement. L'alternance est
      // posée à ±45° de la radiale : à 0/90 un maillon sur deux se retrouve à
      // plat dans le plan horizontal, sur la tranche vu de face, et il disparaît.
      z.copy(radial).applyAxisAngle(tan, setup.roll[i])
      x.copy(tan).applyAxisAngle(z, setup.tilt[i])
      y.crossVectors(z, x)
      m.makeBasis(x, y, z)
      o.quaternion.setFromRotationMatrix(m)
    }
  })

  return (
    <group ref={group}>
      {setup.rest.map((_, i) => (
        <mesh
          key={i}
          ref={(el) => {
            links.current[i] = el
          }}
          geometry={geo}
          scale={[elong, 1, 1]}
          castShadow
        >
          <meshStandardMaterial color={metal} metalness={0.9} roughness={roughness} />
        </mesh>
      ))}
    </group>
  )
}

/** Les quatre membres, adressables individuellement. */
export type LimbSlot = 'leftArm' | 'rightArm' | 'leftLeg' | 'rightLeg'

export const LIMBS: LimbSlot[] = ['leftArm', 'rightArm', 'leftLeg', 'rightLeg']
/** Membres qui peuvent porter un bracelet : un bracelet n'est pas un bracelet de cheville. */
const WRISTS: LimbSlot[] = ['leftArm', 'rightArm']

export type TraitSlots = {
  torso?: ReactNode
  head?: ReactNode
  neck?: ReactNode
  /** Ornements greffés sur un membre précis. */
  limbs?: Partial<Record<LimbSlot, ReactNode>>
  /** Teintes des membres recousus : ils viennent visiblement d'ailleurs. */
  tints?: Partial<Record<LimbSlot, string>>
  /** Contours à retirer du duvet du torse — la laine sous les pièces cousues. */
  holes?: PatchHoles
}

const isLeg = (slot: LimbSlot) => slot.endsWith('Leg')

export type TraitCtx = { p: DollParams; wood: WoodMaps }

const BEAD_SETS: string[][] = [
  ['#7a5233', '#a3763f', '#5c4029'],
  ['#6d6f5c', '#8f9179', '#4e5040'],
  ['#8a4a42', '#b06b5c', '#63332d'],
  ['#4f5a68', '#77839a', '#39414c'],
  ['#a08a5e', '#c2a97a', '#7a6742'],
]
const CORDS = ['#e5d1c1', '#4b3109', '#7d7f6a', '#8a4a42']

/**
 * Dimensions et position du nœud papillon.
 *
 * Partagées entre son rendu et la zone qu'il interdit aux pièces : recalculer
 * ces valeurs des deux côtés finirait immanquablement par les faire diverger.
 */
export function bowMetrics(p: DollParams) {
  const r = p.shape.torsoRadius * p.shape.torsoTaper
  // Taille variable, mais bornée : au-delà le nœud mange le buste.
  const wing = r * (0.56 + mulberry32(p.seed + 515)() * 0.26)
  const half = wing * 0.58
  // Sous le menton, à partir du bas réel du crâne (layout : headY = headH×0.78).
  const localY = -p.shape.headRadius * p.shape.headSquash * 0.22 - half * 0.95 - r * 0.05
  const torsoY = p.shape.torsoHeight * 0.44 + localY

  /**
   * Avancée du nœud, prise sur le **profil réel** et non sur une cote nominale.
   *
   * Le duvet est de la géométrie : posé à une fraction du rayon nominal, le
   * nœud se retrouve à quelques millièmes de la peau là où le torse se resserre,
   * et les fibres ressortent au travers du tissu. On dégage donc toute la
   * hauteur de fibre plus l'amplitude des bosses, depuis la surface elle-même.
   */
  const lift = p.shell.height + p.shape.lumps * p.shape.torsoRadius * 0.65
  const z = onTorso(p, 0, torsoY, lift).pos.z

  /**
   * Repli des ailes vers l'arrière, pour qu'elles épousent le buste.
   *
   * Une aile plane posée au ras du torse ne le touche qu'en son milieu : le
   * buste fuit vers l'arrière sur les côtés, et les pointes restaient en l'air
   * devant lui — d'autant plus que la poupée est dodue ou le nœud large. Vu de
   * trois quarts, le nœud paraissait décollé. On mesure donc sur le profil réel
   * de combien la surface recule sous la pointe, et on replie chaque aile
   * d'autant.
   */
  const rxLift = onTorso(p, Math.PI / 2, torsoY, lift).pos.x
  const tipX = wing * 0.85
  const tipZ = onTorso(p, Math.asin(Math.min(0.98, tipX / rxLift)), torsoY, lift).pos.z
  const fold = Math.atan2(Math.max(0, z - tipZ), tipX)

  return { r, wing, half, localY, torsoY, z, fold }
}

/**
 * Hauteur et emprise de la ceinture.
 *
 * Source unique, comme `bowMetrics` : le rendu de la ceinture **et** la zone
 * qu'elle interdit aux pièces cousues en dépendent. Deux copies de la même cote
 * finissent par diverger, et on se retrouve avec une pièce sous la boucle.
 *
 * Hauteur fixe : laissée libre, la ceinture descendait parfois sur les hanches.
 * Elle se porte à la taille, donc au-dessus du plus large du bassin.
 *
 * L'emprise n'est pas un simple anneau : la boucle est trois fois plus haute
 * que le cordon, mais seulement devant. Une emprise uniforme prise sur la
 * boucle interdirait la moitié du torse pour une gêne qui n'existe qu'à un
 * azimut.
 */
export function beltMetrics(p: DollParams) {
  return {
    y: -p.shape.torsoHeight * 0.14,
    /** Demi-hauteur du cordon, sur tout le tour. */
    cord: p.thread.radius * 2.2,
    /** Demi-hauteur de la boucle, et sa demi-largeur en azimut. */
    buckle: p.thread.radius * 5,
    buckleAz: (p.thread.radius * 5) / p.shape.torsoRadius,
  }
}

/**
 * Palette de laines : fond et brin, par paires cohérentes.
 *
 * Une palette curée plutôt qu'un décalage de teinte autour d'une couleur. Un
 * décalage libre traverse forcément la zone jaune-vert, quelle que soit sa
 * retenue — et la brider assez pour l'éviter supprime toute variété. Ici on
 * choisit entre des laines qui existent.
 */
const WOOLS: [string, string][] = [
  ['#cdbfa4', '#e0d4bb'], // écru
  ['#b9b9b1', '#d3d3ca'], // gris perle
  ['#c9b391', '#ddcaa9'], // avoine
  ['#a89a8c', '#c4b6a6'], // taupe
  ['#d8d2c4', '#ebe6d9'], // craie
  ['#bb9a84', '#d3b39c'], // rouille pâle
  ['#a8adb6', '#c3c7ce'], // gris bleuté
  ['#c6b79b', '#dccbae'], // sable
  ['#9c9186', '#b5aca1'], // gris chaud
  ['#c3a9a2', '#d9c3bb'], // vieux rose
  ['#a3b09a', '#bcc7b4'], // vert sauge
  ['#8f9cab', '#aab5c1'], // bleu ardoise
  ['#b98d78', '#d0a793'], // terracotta
  ['#a294a4', '#bcafbd'], // prune poudré
  ['#93a89f', '#aec1b8'], // vert de gris
]

/**
 * Bout de mèche décoloré.
 *
 * Un simple facteur sur la clarté ne suffit pas : sur une laine déjà claire il
 * bute contre le plafond et le dégradé disparaît — or l'effet doit pouvoir
 * apparaître sur **n'importe quelle** laine de la palette, pas seulement sur
 * les sombres. On garantit donc un écart **absolu** minimal en plus du facteur.
 * La saturation baisse : un fil décoloré se délave, il ne devient pas plus vif.
 */
function bleached(hex: string) {
  const c = new THREE.Color(hex)
  const hsl = { h: 0, s: 0, l: 0 }
  c.getHSL(hsl)
  c.setHSL(hsl.h, hsl.s * 0.72, Math.min(0.92, Math.max(hsl.l * 1.9, hsl.l + 0.24)))
  return `#${c.getHexString()}`
}

/** Comptes de mèches décolorées possibles ; -1 vaut « toutes ». */
const DIP_COUNTS = [0, 1, 2, 4, 5, -1]

/**
 * Laines des locks, en **multiplicateurs**.
 *
 * Le matériau d'un lock multiplie sa `color` par la carte de tresse, qui va de
 * 0,40 à 1,00 : la teinte n'est donc pas ce qu'on voit, elle est ce par quoi on
 * multiplie. Une palette déjà sombre y perd encore un tiers de sa clarté, sa
 * moitié foncée s'effondre vers le noir et il ne reste que six têtes sombres —
 * exactement le piège déjà payé sur les teintes de membre.
 *
 * D'où des valeurs **franches et saturées**, plus claires que le rendu voulu.
 * La saturation n'est pas décorative : `toneGap` pondère l'écart de teinte par
 * la saturation minimale des deux laines, donc sur une palette grisâtre la
 * sélection de planche cesse de séparer les teintes et ne trie plus que la
 * clarté — ce qui produit six nuances du même brun.
 *
 * Toute la roue est couverte, comme pour les laines du corps.
 */
const HAIR_WOOLS = [
  '#3d3b46', // noir bleuté
  '#5a4a42', // brun cendré
  '#8a5a2e', // cuivre
  '#b5603a', // roux
  '#c08a3e', // blond doré
  '#d9b877', // paille
  '#6b5a3a', // kaki
  '#8f8f7a', // cendre olive
  '#4f7a5e', // mousse
  '#2f7a74', // canard
  '#3f6a8a', // ardoise
  '#7a7f96', // gris bleu
  '#6f4a8a', // prune
  '#a8434a', // bordeaux
  '#c2726f', // rose fané
]

/**
 * Écart perçu entre deux laines, sur la couleur de fond.
 *
 * Pas une distance RVB : deux beiges séparés d'un ton de luminosité se
 * ressemblent moins que deux gris de même clarté aux teintes opposées. La
 * teinte compte donc, mais **pondérée par la saturation** — entre deux laines
 * quasi grises elle ne veut plus rien dire, et une différence de teinte y serait
 * du bruit.
 */
function toneGap(a: string, b: string) {
  const ca = new THREE.Color(a).getHSL({ h: 0, s: 0, l: 0 })
  const cb = new THREE.Color(b).getHSL({ h: 0, s: 0, l: 0 })
  const dh = Math.abs(ca.h - cb.h)
  const hue = Math.min(dh, 1 - dh) * 2 * Math.min(ca.s, cb.s) * 6
  return hue + Math.abs(ca.l - cb.l) * 2.2 + Math.abs(ca.s - cb.s) * 1.6
}

/**
 * Laines d'une planche : `count` teintes **franchement distinctes**.
 *
 * Tirées indépendamment, deux poupées d'une même génération tombaient sur la
 * même laine ou sur deux voisines de la palette — et la planche perdait sa
 * lecture de nuancier. Ici la première est tirée au sort, puis chaque suivante
 * est celle qui maximise l'écart minimal avec toutes les précédentes. Le tirage
 * reste dérivé de la graine, donc reproductible.
 */
/**
 * Fraction de l'écart du meilleur candidat en deçà de laquelle on tire encore.
 *
 * À 1, le glouton prend systématiquement le meilleur : toute la planche est
 * alors **entièrement déterminée par le premier tirage**. Mesuré sur les deux
 * palettes de quinze : onze assortiments de cheveux possibles et dix de laine,
 * sur 5005 combinaisons — l'œil finit par reconnaître les mêmes planches, et
 * c'est ce qui se lisait comme « pas assez varié » malgré une palette large.
 *
 * À 0,80 : environ 400 assortiments, pour un écart minimal moyen qui ne perd
 * qu'un dixième. Deux ordres de grandeur de variété contre un pouième
 * d'étalement — le compromis n'est même pas discutable.
 */
const SPREAD_KEEP = 0.8

function spreadPicks(rnd: () => number, count: number, size: number, key: (i: number) => string) {
  const pool = Array.from({ length: size }, (_, i) => i)
  const picked = [pool.splice(Math.floor(rnd() * pool.length), 1)[0]]

  while (picked.length < count && pool.length) {
    const gaps = pool.map((c) => Math.min(...picked.map((j) => toneGap(key(c), key(j)))))
    const best = Math.max(...gaps)
    // Tirage au sort parmi les candidats assez bons, et non le meilleur.
    const ok: number[] = []
    for (let k = 0; k < gaps.length; k++) if (gaps[k] >= best * SPREAD_KEEP) ok.push(k)
    picked.push(pool.splice(ok[Math.floor(rnd() * ok.length)], 1)[0])
  }
  return picked
}

export function boardTones(seed: number, count: number) {
  const rnd = mulberry32(seed + 7331)
  return spreadPicks(rnd, count, WOOLS.length, (i) => WOOLS[i][0]).map((i) => {
    const [base, stitch] = WOOLS[i]
    // Micro-décalage seulement : il ne doit pas rapprocher deux laines que
    // l'échantillonnage vient d'écarter.
    return { base: jitterColor(base, rnd, 0.07), stitch: jitterColor(stitch, rnd, 0.06) }
  })
}

/**
 * Laines de locks d'une planche : `count` teintes sans répétition.
 *
 * Même problème et même remède que pour la laine du corps — tirées
 * indépendamment, deux poupées d'une même génération tombent sur la même
 * tignasse. La palette compte douze fils pour six poupées, la sélection ne peut
 * donc pas s'épuiser.
 */
export function boardHair(seed: number, count: number) {
  const rnd = mulberry32(seed + 6151)
  return spreadPicks(rnd, count, HAIR_WOOLS.length, (i) => HAIR_WOOLS[i]).map((i) =>
    jitterColor(HAIR_WOOLS[i], rnd, 0.07),
  )
}

/**
 * Teintes de membre dépareillé, en **multiplicateurs**.
 *
 * Toutes sombres et désaturées : multipliées par la carte de laine, elles
 * donnent un membre plus sombre que le corps, sans jamais virer au bleu-vert
 * comme le faisait un tirage libre sur la roue.
 */
const LIMB_TINTS = [
  '#8a7a66', // brun
  '#7d7a74', // gris chaud
  '#6b5f52', // tabac
  '#8a6f5e', // terre cuite
  '#6f7268', // olive grisé
  '#7a6a70', // prune grisé
  '#5e5a52', // charbon
  '#94836b', // sable foncé
  '#6d7a7a', // ardoise
  '#8d7360', // châtaigne
]

/**
 * Laine effective de la poupée. Exportée parce que la texture de tricot en
 * dépend, comme le reste des ornements.
 */

/**
 * Coupe des locks : densité, longueur, épaisseur et laine, tirées de la graine.
 *
 * Les trois cotes sont des **multiplicateurs** du panneau, pas des valeurs
 * absolues : le panneau garde la main sur la coupe et la graine ne fait que
 * l'écarter d'une marge. En absolu, bouger un curseur n'aurait plus d'effet
 * visible d'une poupée à l'autre.
 *
 * Les marges sont serrées exprès. Au-delà, les six poupées d'une planche
 * cessent d'avoir l'air d'être de la même série — et la densité paie en appels
 * de rendu, poste déjà le plus lourd de la poupée.
 */
export function hairLook(p: DollParams, forced?: string) {
  const h = p.hair
  const rnd = mulberry32(p.seed + 6151)
  const wool = HAIR_WOOLS[Math.floor(rnd() * HAIR_WOOLS.length)]

  /**
   * Grosseur du fil : **une seule** quantité, dont l'épaisseur monte et la
   * densité descend.
   *
   * Tirées indépendamment elles produisent les deux combinaisons qui ne
   * ressemblent à rien : le maximum des deux donne des mèches épaisses qui se
   * chevauchent au cuir chevelu, le minimum des mèches fines qui le laissent nu.
   * Appairées, c'est le choix d'un fil, et les deux bornes restent des coupes :
   * du fin et fourni d'un côté, du gros et clairsemé de l'autre. Même raison
   * que pour les paires teinte/rugosité des métaux du collier.
   *
   * L'amplitude est large **exprès**. À plus ou moins quinze pour cent, la
   * densité ne se lisait pas : six têtes également fournies. Ce qui se voit à
   * la taille d'une planche, c'est le rapport entre le cuir chevelu couvert et
   * le cuir chevelu nu, et il faut aller du simple au triple pour qu'il change
   * de nature.
   */
  const gauge = rnd()
  // Le décalage est calculé même quand la planche impose la teinte : court-circuité
  // par le `??`, il déplacerait la suite de la graine entre le mode planche et le
  // mode variante seule, et la même poupée n'aurait plus la même coiffure.
  const drawn = jitterColor(wool, rnd, 0.1)
  const color = forced ?? drawn

  const count = h.count === 0 ? 0 : Math.max(4, Math.round(h.count * (1.85 - gauge * 1.3)))

  /**
   * Bouts éclaircis, façon mèche décolorée : aucune, une, deux, quatre, cinq,
   * ou toutes. Une **liste** et non un intervalle — trois n'en fait pas partie.
   *
   * Le compte est tiré à part de la teinte : ce n'est pas une propriété de la
   * laine mais de la coiffure. Les mèches concernées sont tirées au sort et non
   * prises en tête de liste — les ancrages sont ordonnés, les premières se
   * suivent sur le crâne, et deux mèches voisines éclaircies lisent comme une
   * tache, pas comme deux mèches.
   */
  const dipPick = DIP_COUNTS[Math.floor(rnd() * DIP_COUNTS.length)]
  // Borné par la densité : une coupe clairsemée n'a pas cinq mèches à décolorer.
  const dipCount = dipPick < 0 ? count : Math.min(dipPick, count)
  const pool = Array.from({ length: count }, (_, i) => i)
  const tipped: number[] = []
  for (let k = 0; k < dipCount && pool.length; k++) {
    tipped.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0])
  }

  return {
    ...h,
    // Chauve reste chauve : le panneau décide de la présence, la graine du reste.
    count,
    length: h.length * (0.68 + rnd() * 0.62),
    thickness: h.thickness * (0.8 + gauge * 0.55),
    // Micro-décalage seulement : la palette fait déjà le travail, et un
    // décalage large rapprocherait deux fils que la planche vient d'écarter.
    color,
    tipped,
    tipColor: bleached(color),
  }
}


export function woolTone(p: DollParams) {
  const rnd = mulberry32(p.seed + 7331)
  const [base, stitch] = WOOLS[Math.floor(rnd() * WOOLS.length)]
  // Micro-décalage seulement : la palette fait déjà le travail.
  return {
    base: jitterColor(base, rnd, 0.12),
    stitch: jitterColor(stitch, rnd, 0.1),
  }
}

/**
 * Bandage enroulé sur un membre.
 *
 * Vit dans le fond commun, pas dans les signes distinctifs : n'importe quelle
 * poupée peut en porter un. Ce n'est pas une bande d'anneaux — un manchon
 * continu, sa ligne de recouvrement en spirale et son nœud de serrage.
 */
function bandage(p: DollParams, limb: LimbSlot, atEnd: boolean): ReactNode {
  const lb = p.limbs
  const th = p.thread
  const onLeg = isLeg(limb)
  const r = onLeg ? lb.legRadius : lb.armRadius
  const limbLen = onLeg ? lb.legLength : lb.armLength
  const top = -limbLen * (atEnd ? 0.58 : 0.24)
  const len = limbLen * 0.34
  const sleeve = r * 1.07
  const linen = '#e8ddc9'

  const pts: THREE.Vector3[] = []
  for (let i = 0; i <= 64; i++) {
    const t = i / 64
    const a = t * 3 * Math.PI * 2
    pts.push(
      new THREE.Vector3(Math.cos(a) * sleeve * 1.01, top - t * len, Math.sin(a) * sleeve * 1.01),
    )
  }
  const spiral = new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3(pts),
    128,
    th.radius * 0.7,
    5,
    false,
  )

  return (
    <group>
      <mesh position={[0, top - len * 0.5, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[sleeve, sleeve * 0.94, len, 24, 1]} />
        <meshPhysicalMaterial
          color={linen}
          roughness={0.95}
          metalness={0}
          sheen={0.6}
          sheenColor={p.wool.sheenColor}
          sheenRoughness={0.8}
        />
      </mesh>
      {[top, top - len].map((y, i) => (
        <mesh key={i} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <torusGeometry args={[sleeve * 0.97, r * 0.06, 6, 24]} />
          <meshPhysicalMaterial color={linen} roughness={0.95} sheen={0.6} />
        </mesh>
      ))}
      <mesh geometry={spiral}>
        <meshPhysicalMaterial color="#c9bda4" roughness={0.95} sheen={0.5} />
      </mesh>
      <group position={[0, top - len * 0.92, sleeve * 0.92]}>
        <mesh castShadow>
          <sphereGeometry args={[r * 0.16, 12, 10]} />
          <meshPhysicalMaterial color={linen} roughness={0.95} sheen={0.6} />
        </mesh>
        {[-1, 1].map((sd) => (
          <mesh
            key={sd}
            position={[sd * r * 0.19, -r * 0.15, 0]}
            rotation={[0, 0, sd * 0.7]}
            castShadow
          >
            <coneGeometry args={[r * 0.09, r * 0.36, 6]} />
            <meshPhysicalMaterial color={linen} roughness={0.95} sheen={0.6} />
          </mesh>
        ))}
      </group>
    </group>
  )
}

/** Tissus de nœud papillon : teintes fanées, jamais saturées. */
const BOW_CLOTHS = ['#7d3f3a', '#4e5763', '#5d5f4c', '#3a3733', '#8a6a3f', '#5d4258']

/**
 * Éclaircit ou assombrit une teinte sans la déplacer.
 *
 * Le nœud central est le **même tissu** que les ailes, pris dans son ombre :
 * ce qui le distingue est sa valeur, pas sa couleur. Un second tirage libre
 * autour de la même base tombe une fois sur deux plus clair que les ailes, et
 * le centre disparaît au lieu de se détacher.
 */
function shade(hex: string, k: number) {
  const c = new THREE.Color(hex)
  const hsl = { h: 0, s: 0, l: 0 }
  c.getHSL(hsl)
  // La saturation ne suit pas la clarté dans le même sens : une étoffe dans
  // l'ombre se sature, un fil éclairci se délave. Le contraire donne un centre
  // de nœud terne et un bout de mèche fluo.
  c.setHSL(
    hsl.h,
    THREE.MathUtils.clamp(hsl.s * (k > 1 ? 0.82 : 1.1), 0.03, 0.85),
    THREE.MathUtils.clamp(hsl.l * k, 0.04, 0.9),
  )
  return `#${c.getHexString()}`
}

/**
 * Laines d'écharpe, en **multiplicateurs**.
 *
 * Nettement plus claires que les tissus de nœud papillon : la teinte multiplie
 * la carte de laine, et une valeur sombre écrase la maille jusqu'à rendre la
 * bande unie. Ce qui distingue une écharpe, c'est sa couleur, pas son obscurité.
 */
/**
 * Laines pastel de l'écharpe.
 *
 * Palette curée, comme `WOOLS` : un décalage de teinte libre autour d'une
 * couleur traverse la zone jaune-vert, et le brider assez pour l'éviter
 * supprime la variété.
 *
 * Clair mais pas délavé — la carte de tricot est teintée **à la génération**,
 * donc le fil de maille se déduit du fond par un cran de luminosité. Un fond
 * trop proche du blanc n'a plus de place au-dessus et la maille s'efface.
 * Saturation retenue, luminosité haute sans être extrême.
 */
const SCARF_TINTS = [
  '#e8b8bd', // rose poudré
  '#a9c4dd', // bleu ciel
  '#b3d0bf', // vert d'eau
  '#e8d5a3', // jaune paille
  '#c4b6dc', // lavande
  '#f0c3a5', // pêche
  '#b9dcd2', // menthe
  '#d9bcd6', // lilas
  '#eee0b0', // beurre frais
  '#c3d6e4', // bleu glacier
]

/**
 * Métaux du collier : couleur et rugosité vont ensemble.
 *
 * Un laiton poli et une fonte brute ne se distinguent pas par leur seule teinte
 * — c'est le contraste entre reflet net et reflet diffus qui les sépare. Les
 * appairer dans la palette évite les combinaisons qui ne ressemblent à rien,
 * comme un fer noirci brillant comme un miroir.
 */
const CHAIN_METALS: [string, number][] = [
  ['#c6c9c6', 0.24], // argent poli
  ['#a2a5a3', 0.38], // argent oxydé
  ['#b0b6ba', 0.3], // acier clair
  ['#9ba09c', 0.42], // étain
  ['#c9a54e', 0.24], // or
  ['#c99b83', 0.28], // or rose
  ['#bd9950', 0.3], // laiton
  ['#a37f4a', 0.36], // bronze
  ['#b07a5a', 0.34], // cuivre
  ['#8f9490', 0.46], // vieil argent
]

const UP = new THREE.Vector3(0, 1, 0)

/** Formes de boucle de ceinture. */
type BuckleKind = 'cercle' | 'carre' | 'triangle' | 'losange' | 'etoile'
const BUCKLES: BuckleKind[] = ['cercle', 'carre', 'triangle', 'losange', 'etoile']

/** Trace un contour de boucle dans un `Shape` ou un `Path`. */
function buckleRing(path: THREE.Shape | THREE.Path, kind: BuckleKind, r: number) {
  const poly = (n: number, rot: number) => {
    for (let i = 0; i <= n; i++) {
      const a = rot + (i / n) * Math.PI * 2
      const x = Math.cos(a) * r
      const y = Math.sin(a) * r
      if (i === 0) path.moveTo(x, y)
      else path.lineTo(x, y)
    }
  }

  switch (kind) {
    case 'carre':
      poly(4, Math.PI / 4)
      break
    case 'losange':
      poly(4, 0)
      break
    case 'triangle':
      poly(3, Math.PI / 2)
      break
    case 'etoile':
      for (let i = 0; i <= 10; i++) {
        const a = Math.PI / 2 + (i / 10) * Math.PI * 2
        const rad = i % 2 === 0 ? r : r * 0.45
        const x = Math.cos(a) * rad
        const y = Math.sin(a) * rad
        if (i === 0) path.moveTo(x, y)
        else path.lineTo(x, y)
      }
      break
    default:
      path.absarc(0, 0, r, 0, Math.PI * 2, false)
      break
  }
}

/**
 * Cadre de boucle : un contour et son évidement.
 *
 * Un `Shape` percé d'un trou plutôt qu'un tore ou un empilement de primitives —
 * c'est la seule construction qui donne le même objet quelle que soit la forme,
 * du cercle à l'étoile.
 */
function buckleFrame(kind: BuckleKind, outer: number, inner: number) {
  const shape = new THREE.Shape()
  buckleRing(shape, kind, outer)
  const hole = new THREE.Path()
  buckleRing(hole, kind, inner)
  shape.holes.push(hole)
  return shape
}

/** Formes de perles disponibles. */
type BeadShape = 'ronde' | 'cube' | 'rondelle' | 'tonneau' | 'facettee'
const BEAD_SHAPES: BeadShape[] = ['ronde', 'cube', 'rondelle', 'tonneau', 'facettee']

/**
 * Géométrie d'une perle. L'axe local Y est celui du perçage : l'appelant
 * l'aligne sur la tangente du cordon, de sorte que rondelles et tonneaux sont
 * réellement enfilés et non posés en travers.
 */
function beadGeometry(shape: BeadShape, r: number) {
  switch (shape) {
    case 'cube':
      return <boxGeometry args={[r * 1.65, r * 1.65, r * 1.65]} />
    case 'rondelle':
      return <cylinderGeometry args={[r * 1.35, r * 1.35, r * 0.85, 16]} />
    case 'tonneau':
      return <cylinderGeometry args={[r * 0.95, r * 0.95, r * 2.3, 12]} />
    case 'facettee':
      return <octahedronGeometry args={[r * 1.35, 0]} />
    default:
      return <sphereGeometry args={[r, 12, 10]} />
  }
}

/** Fond commun : pièces rapportées, bracelet, bandage, membres dépareillés. */
function useBase(id: TraitId, ctx: TraitCtx, patches: Patch[], occupied: Placement[]): TraitSlots {
  const { p, wood } = ctx
  const th = p.thread
  const lb = p.limbs

  return useMemo<TraitSlots>(() => {
    // Tirage des emplacements.
    const rnd = mulberry32(p.seed + 555)

    // Membres dépareillés : de zéro à quatre, chacun dans sa propre laine.
    // Plus de couronne de points de croix à l'articulation — c'est la teinte
    // seule qui raconte le remplacement.
    const pool = [...LIMBS]
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1))
      ;[pool[i], pool[j]] = [pool[j], pool[i]]
    }
    const tints: Partial<Record<LimbSlot, string>> = {}
    const mismatched = Math.floor(rnd() * 5)
    for (let i = 0; i < mismatched; i++) {
      tints[pool[i]] = jitterColor(LIMB_TINTS[Math.floor(rnd() * LIMB_TINTS.length)], rnd, 0.25)
    }

    // Bandage : pas un signe distinctif, n'importe quelle poupée peut en
    // porter un. Tiré ici, dans le fond commun.
    const hasBandage = rnd() < 0.45
    const bandageOn = LIMBS[Math.floor(rnd() * 4)]
    // Le collier attire l'œil sur le haut du corps : un bandage à mi-membre y
    // ajoute une deuxième bande horizontale qui lui fait concurrence. Sur cette
    // variante il se porte donc toujours au bout. Le tirage est fait dans tous
    // les cas, pour que la suite de la graine ne dépende pas de la variante.
    const midRoll = rnd() < 0.5
    const bandageAtEnd = id === 'collier' ? true : midRoll

    // Un bracelet se porte au **poignet**, jamais à la cheville — et pas
    // toujours : droite, gauche, ou aucun. Le membre bandé est exclu, les deux
    // se traverseraient. Le tirage de présence est fait dans tous les cas, pour
    // que la suite de la graine ne dépende pas de l'issue.
    const free = WRISTS.filter((slot) => !(hasBandage && slot === bandageOn))
    const braceletOn = free[Math.floor(rnd() * free.length)]
    const hasBracelet = rnd() < 0.75

    const limbRadius = (slot: LimbSlot) => (isLeg(slot) ? lb.legRadius : lb.armRadius)
    const limbLength = (slot: LimbSlot) => (isLeg(slot) ? lb.legLength : lb.armLength)

    // --- bracelet : forme, nombre et teintes tirés au sort, taille fixée
    const bR = limbRadius(braceletOn)
    const ring = bR * (1.12 + rnd() * 0.1)
    const beadCount = 5 + Math.floor(rnd() * 5)
    // Taille proportionnelle au membre, pas aléatoire : la faire varier donnait
    // des perles plus grosses que le poignet qui les porte.
    const beadSize = bR * 0.22
    const palette = BEAD_SETS[Math.floor(rnd() * BEAD_SETS.length)]
    const cordColor = CORDS[Math.floor(rnd() * CORDS.length)]
    const shape = BEAD_SHAPES[Math.floor(rnd() * BEAD_SHAPES.length)]

    const bracelet = (
      <group position={[0, -limbLength(braceletOn) * (0.74 + rnd() * 0.14), 0]}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[ring, th.radius * 0.9, 6, 24]} />
          <meshPhysicalMaterial color={cordColor} roughness={0.85} sheen={0.5} />
        </mesh>
        {Array.from({ length: beadCount }, (_, i) => {
          const a = (i / beadCount) * Math.PI * 2
          // Les perles non sphériques sont enfilées : leur axe suit la tangente
          // du cordon, sinon elles flottent en travers.
          const tangent = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a))
          const quat = new THREE.Quaternion().setFromUnitVectors(UP, tangent)
          return (
            <mesh
              key={i}
              position={[Math.cos(a) * ring, 0, Math.sin(a) * ring]}
              quaternion={quat}
              castShadow
            >
              {beadGeometry(shape, beadSize)}
              <meshPhysicalMaterial
                map={wood.map}
                roughnessMap={wood.roughnessMap}
                color={palette[i % palette.length]}
                roughness={1}
                clearcoat={0.25}
                clearcoatRoughness={0.4}
              />
            </mesh>
          )
        })}
      </group>
    )

    const limbs: Partial<Record<LimbSlot, ReactNode>> = {}
    const push = (slot: LimbSlot, node: ReactNode) => {
      limbs[slot] = limbs[slot] ? (
        <>
          {limbs[slot]}
          {node}
        </>
      ) : (
        node
      )
    }
    if (hasBracelet) push(braceletOn, bracelet)
    if (hasBandage) push(bandageOn, bandage(p, bandageOn, bandageAtEnd))

    return {
      limbs,
      tints,
      torso: (
        <group>
          {patches.map((patch, i) => (
            <group key={i}>
              <mesh geometry={patch.geometry} castShadow>
                <meshPhysicalMaterial
                  map={patch.fabric.map}
                  roughness={0.95}
                  metalness={0}
                  sheen={0.5}
                  sheenColor={p.wool.sheenColor}
                  sheenRoughness={0.85}
                  side={THREE.DoubleSide}
                />
              </mesh>
              {patch.stitches.map((st, k) => (
                <group key={k} position={st.pos} quaternion={st.quat}>
                  <Thread length={st.length} radius={th.radius * 0.55} color={th.color} />
                </group>
              ))}
            </group>
          ))}
        </group>
      ),

    }
  }, [id, p, wood, patches, occupied, th, lb])
}

/** Signe propre à chaque variante. */
function useExtra(
  id: TraitId,
  ctx: TraitCtx,
  pocket: Placement | null,
  seam: { phase: number; amp: number } | null,
): TraitSlots {
  const { p, wood } = ctx

  return useMemo<TraitSlots>(() => {
    const th = p.thread

    switch (id) {
      // ------------------------------------------------- couture intégrale
      case 'couture': {
        // Anneau incliné qui fait le **tour complet** du torse : haut devant,
        // bas dans le dos. La poupée lit comme deux moitiés coupées en biais
        // puis recousues, ce qu'une simple diagonale de face ne raconte pas.
        if (!seam) return {}
        const { phase, amp } = seam
        const n = 30
        const pts = Array.from({ length: n }, (_, i) => {
          const az = (i / n) * Math.PI * 2
          return onTorso(
            p,
            az,
            Math.cos(az - phase) * amp * p.shape.torsoHeight * 0.5,
            0.008,
          )
        })
        return {
          torso: (
            <group>
              {pts.map((s, i) => (
                <group key={i} position={s.pos} quaternion={s.quat}>
                  <CrossStitch
                    size={p.shape.torsoRadius * 0.2}
                    radius={th.radius * 1.1}
                    color={th.color}
                    dip={0.008 + p.shape.lumps * p.shape.torsoRadius * 0.8}
                  />
                </group>
              ))}
            </group>
          ),
        }
      }

      // ------------------------------------------------------------- poche
      // ------------------------------------------------------------ collier
      case 'collier':
        return { neck: <Necklace p={p} seed={p.seed} /> }


      // ---------------------------------------------- couronne d'épingles
      case 'couronne': {
        const length = p.shape.headRadius * 0.7
        const rnd = mulberry32(p.seed + 4242)
        const pins = Array.from({ length: 7 }, (_, i) => {
          const az = (i / 7) * Math.PI * 2
          const surf = onHeadPolar(p, az, 0.42, -length * 0.68)
          return {
            pos: surf.pos,
            quat: new THREE.Quaternion().setFromUnitVectors(
              new THREE.Vector3(0, 1, 0),
              surf.normal,
            ),
            color: pinColor(rnd),
          }
        })
        return {
          head: (
            <group>
              {pins.map((pin, i) => (
                <Pin
                  key={i}
                  length={length}
                  color={pin.color}
                  position={[pin.pos.x, pin.pos.y, pin.pos.z]}
                  quaternion={pin.quat}
                />
              ))}
            </group>
          ),
        }
      }

      // --------------------------------------------------------- ceinture
      case 'ceinture': {
        const rnd = mulberry32(p.seed + 404)
        const y = beltMetrics(p).y
        const kind = BUCKLES[Math.floor(rnd() * BUCKLES.length)]
        // Tracé échantillonné sur la surface plutôt qu'un tore mis à l'échelle :
        // le torse est une ellipsoïde effilée, un anneau circulaire y bâille
        // sur les flancs.
        const n = 48
        const pts = Array.from({ length: n }, (_, i) =>
          onTorso(p, (i / n) * Math.PI * 2, y, 0.006).pos,
        )
        const belt = new THREE.TubeGeometry(
          new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.4),
          n * 3,
          th.radius * 1.6,
          6,
          true,
        )
        const front = onTorso(p, 0, y, 0.012)

        return {
          torso: (
            <group>
              <mesh geometry={belt} castShadow>
                <meshPhysicalMaterial color={th.color} roughness={0.88} sheen={0.6} />
              </mesh>
              {/* boucle de bois — forme tirée au sort */}
              <group position={front.pos} quaternion={front.quat}>
                <mesh position={[0, 0, -th.radius * 0.6]} castShadow>
                  <extrudeGeometry
                    args={[
                      buckleFrame(kind, th.radius * 5, th.radius * 3.1),
                      {
                        depth: th.radius * 1.2,
                        bevelEnabled: true,
                        bevelThickness: th.radius * 0.3,
                        bevelSize: th.radius * 0.3,
                        bevelSegments: 2,
                        curveSegments: 16,
                      },
                    ]}
                  />
                  <meshPhysicalMaterial
                    map={wood.map}
                    roughnessMap={wood.roughnessMap}
                    color="#6d4a2e"
                    roughness={1}
                    clearcoat={0.3}
                    clearcoatRoughness={0.35}
                  />
                </mesh>
                {/* ardillon */}
                <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
                  <cylinderGeometry args={[th.radius * 0.6, th.radius * 0.6, th.radius * 8, 8]} />
                  <meshPhysicalMaterial
                    map={wood.map}
                    color="#6d4a2e"
                    roughness={1}
                    clearcoat={0.3}
                  />
                </mesh>
              </group>
            </group>
          ),
        }
      }

      // ---------------------------------------------------------- écharpe
      case 'echarpe': {
        const rnd = mulberry32(p.seed + 718)
        // Micro-décalage seulement : à 0,3 le tirage assombrit assez pour faire
        // sortir la teinte du pastel, et la palette perd sa cohérence.
        const tint = jitterColor(SCARF_TINTS[Math.floor(rnd() * SCARF_TINTS.length)], rnd, 0.14)
        return { neck: <Scarf p={p} tint={tint} /> }
      }

      // ---------------------------------------------------- nœud papillon
      case 'noeudPap': {
        const { wing, half, localY, z, fold } = bowMetrics(p)
        // Générateur distinct de celui des métriques : couleur et asymétrie ne
        // doivent pas dépendre de l'ordre de tirage de la taille.
        const bow = mulberry32(p.seed + 516)
        // Teinte tirée d'une palette de tissus fanés, puis décalée : deux nœuds
        // de la même famille ne sont jamais exactement du même ton.
        const base = BOW_CLOTHS[Math.floor(bow() * BOW_CLOTHS.length)]
        // Les deux ailes sont du même tissu, à un cheveu près — identiques elles
        // lisent comme une pièce moulée. Le nœud, lui, est franchement plus
        // sombre : c'est le seul contraste qui dit qu'on l'a serré.
        const wingA = jitterColor(base, bow, 0.5)
        const wingB = jitterColor(wingA, bow, 0.12)
        const knot = shade(wingA, 0.58)

        // Aile découpée dans un plan puis extrudée finement. Deux détails
        // décident de la lecture : l'encoche en V du bord extérieur doit être
        // **profonde** — à 74 % de la largeur elle était invisible à cette
        // taille — et le pincement au centre bien marqué.
        const shape = new THREE.Shape()
        shape.moveTo(0, -half * 0.22)
        shape.lineTo(wing, -half)
        shape.quadraticCurveTo(wing * 0.42, 0, wing, half)
        shape.lineTo(0, half * 0.22)
        shape.closePath()

        const extrude = {
          depth: wing * 0.1,
          bevelEnabled: true,
          bevelThickness: wing * 0.04,
          bevelSize: wing * 0.04,
          bevelSegments: 2,
          curveSegments: 10,
        }

        const fabric = (tint: string) => (
          <meshPhysicalMaterial
            color={tint}
            roughness={0.92}
            metalness={0}
            sheen={0.75}
            sheenColor={p.wool.sheenColor}
            sheenRoughness={0.6}
          />
        )

        // Asymétrie tirée de la graine. C'est elle qui donne le côté noué à la
        // main : deux ailes rigoureusement identiques lisent comme une pièce
        // moulée, quel que soit le soin mis à la silhouette.
        // Inclinaison d'ensemble : droit une fois sur trois, sinon un léger
        // penchant d'un côté ou de l'autre. Les tirages se font dans tous les
        // cas, pour que la suite de la graine ne dépende pas de l'issue.
        const upright = bow() < 0.34
        const side = bow() < 0.5 ? -1 : 1
        const lean = upright ? 0 : side * (0.015 + bow() * 0.03)

        // Repli vers l'arrière : autour de Y, un angle positif envoie +X vers
        // −Z, donc l'aile de droite prend `fold` et celle de gauche `π − fold`.
        const wings = [fold, Math.PI - fold].map((yaw, i) => ({
          yaw,
          /**
           * Bascule des ailes, **opposée** de l'une à l'autre : c'est elle qui
           * penche le nœud, bien plus que la rotation d'ensemble.
           *
           * Son signe était **fixe** — l'aile droite montait toujours, la gauche
           * descendait toujours. Le nœud ne pouvait donc pencher que d'un côté,
           * quelle que soit l'inclinaison d'ensemble, et une fois sur deux les
           * deux s'ajoutaient jusqu'à le faire paraître décroché. Elle suit
           * maintenant `lean`, et garde un écart propre à chaque aile pour que
           * deux ailes rigoureusement symétriques ne lisent pas comme une pièce
           * moulée.
           */
          roll: (i === 0 ? 1 : -1) * (lean * 0.8 + 0.01) + (bow() - 0.5) * 0.03,
          scale: 0.92 + bow() * 0.16,
          twist: (bow() - 0.5) * 0.3,
          tint: i === 0 ? wingA : wingB,
        }))

        // `z` dégage la surface ; on y ajoute la demi-épaisseur du nœud, car
        // c'est sa face arrière et non son centre qui doit l'affleurer. La
        // marge était de 0,15 aile pour une bandelette de 0,3 — mais les ailes,
        // elles, ne font que 0,18 d'épaisseur : leur dos flottait devant le
        // duvet. Bandelette et marge ramenées à l'épaisseur réelle.
        // La bandelette suit l'inclinaison, en plus discret : à angle fixe, un
        // nœud droit gardait un centre de travers.
        const knotTilt = lean * 0.6 + (bow() - 0.5) * 0.05

        return {
          neck: (
            <group position={[0, localY, z + wing * 0.1]} rotation={[0, 0, lean]}>
              {wings.map((w, i) => (
                // Miroir par rotation, pas par échelle négative : une échelle
                // -1 inverse les normales et l'aile se retrouve éclairée à
                // l'envers.
                <group key={i} rotation={[w.twist, w.yaw, w.roll]} scale={[1, w.scale, 1]}>
                  <mesh position={[0, 0, -extrude.depth * 0.5]} castShadow>
                    <extrudeGeometry args={[shape, extrude]} />
                    {fabric(w.tint)}
                  </mesh>
                </group>
              ))}
              {/* bandelette centrale qui serre les deux ailes, légèrement de
                  travers comme un vrai nœud */}
              <mesh rotation={[0, 0, knotTilt]} castShadow>
                <boxGeometry args={[wing * 0.17, half * 0.95, wing * 0.2]} />
                {fabric(knot)}
              </mesh>
            </group>
          ),
        }
      }

      default:
        return {}
    }
  }, [id, p, wood, ctx, pocket, seam])
}

const join = (a?: ReactNode, b?: ReactNode) =>
  a && b ? (
    <>
      {a}
      {b}
    </>
  ) : (
    a ?? b
  )

export function useTraitSlots(id: TraitId, ctx: TraitCtx): TraitSlots {
  // Construites ici et partagées : la poche doit connaître les emplacements
  // déjà pris pour ne pas se coudre par-dessus une pièce.
  // Trajet de la couture intégrale, calculé avant les pièces : elles doivent
  // laisser la voie libre. Orientation et inclinaison tirées de la graine, donc
  // le tracé change à chaque génération.
  const seam = useMemo(() => {
    if (id !== 'couture') return null
    const rnd = mulberry32(ctx.p.seed + 321)
    const amp = 0.24 + rnd() * 0.26

    // Le nombril est à l'azimut 0, à -0.4 de la demi-hauteur du torse. On
    // rejette les orientations qui y feraient passer la couture : elle
    // traverserait la croix. On garde toutes les autres, donc l'orientation
    // reste largement variable.
    const NAVEL = -0.4
    let phase = rnd() * Math.PI * 2
    for (let i = 0; i < 20 && Math.abs(Math.cos(phase) * amp - NAVEL) < 0.28; i++) {
      phase = rnd() * Math.PI * 2
    }
    return { phase, amp }
  }, [id, ctx.p.seed])

  // Emprise d'un accessoire de cou sur le haut du buste : aucune pièce dessous.
  const bowZone = useMemo(() => {
    if (id === 'noeudPap') {
      const m = bowMetrics(ctx.p)
      return { az: 0, y: m.torsoY, w: m.wing / ctx.p.shape.torsoRadius, h: m.half }
    }
    if (id === 'echarpe') {
      const m = scarfMetrics(ctx.p)
      // Le pan avant descend sur un côté de la poitrine : la zone le suit.
      return {
        az: m.side * 0.55,
        y: m.torsoY - m.front * 0.5,
        w: (m.band * 1.2) / ctx.p.shape.torsoRadius,
        h: m.band + m.front * 0.5,
      }
    }
    return null
  }, [id, ctx.p])

  // Emprise de la ceinture : rien ne se coud sur son trajet ni sous sa boucle.
  const beltZone = useMemo(
    () => (id === 'ceinture' ? beltMetrics(ctx.p) : null),
    [id, ctx.p],
  )

  const avoid = useMemo(() => {
    if (!seam && !bowZone && !beltZone) return undefined
    const ry = ctx.p.shape.torsoHeight * 0.5
    return (az: number, y: number, w: number, h: number) => {
      if (beltZone) {
        let du = az
        du -= Math.round(du / (Math.PI * 2)) * Math.PI * 2
        // Le cordon fait le tour ; la boucle ne barre que le devant.
        const reach = Math.abs(du) < w + beltZone.buckleAz ? beltZone.buckle : beltZone.cord
        if (Math.abs(y - beltZone.y) < h + reach) return true
      }
      if (bowZone) {
        let du = az - bowZone.az
        du -= Math.round(du / (Math.PI * 2)) * Math.PI * 2
        if (Math.abs(du) < w + bowZone.w && Math.abs(y - bowZone.y) < h + bowZone.h) return true
      }
      if (!seam) return false
      // On échantillonne la couture sur toute la largeur de la pièce : elle
      // ondule, un seul point au centre laisserait passer les recouvrements
      // par les bords.
      for (let k = -2; k <= 2; k++) {
        const ys = Math.cos(az + (k / 2) * w - seam.phase) * seam.amp * ry
        if (Math.abs(ys - y) < h + ry * 0.06) return true
      }
      return false
    }
  }, [seam, bowZone, beltZone, ctx.p.shape.torsoHeight])

  // La couronne d'épingles n'a rien d'autre sur le buste : sans pièce imposée,
  // une génération sur plusieurs la laisse entièrement nue de face, et la
  // variante n'a plus rien à montrer sous le visage.
  const firstZone: PatchZone | undefined =
    id === 'couronne' ? { az: [-0.75, 0.75], y: [-0.1, 0.3] } : undefined

  const patches = useMemo(
    () => buildPatches(ctx.p, ctx.p.seed + 900, avoid, firstZone),
    [ctx.p, avoid, firstZone],
  )
  useEffect(
    () => () =>
      patches.forEach((patch) => {
        patch.geometry.dispose()
        patch.fabric.dispose()
      }),
    [patches],
  )

  // Le duvet doit se percer sous les pièces : il monte plus haut qu'elles, et
  // sans ce retrait les fibres les traversent quelle que soit leur hauteur.
  const holes = useMemo(() => patchHoles(patches), [patches])
  useEffect(() => () => holes.dispose(), [holes])

  // Plus d'emplacement réservé : la poche a laissé la place au collier, qui ne
  // se coud pas sur le torse.
  const pocket = null

  const occupied = useMemo(
    () => [...patches.map((patch) => patch.place), ...(pocket ? [pocket] : [])],
    [patches, pocket],
  )

  const base = useBase(id, ctx, patches, occupied)
  const extra = useExtra(id, ctx, pocket, seam)

  return useMemo(
    () => {
      const limbs: Partial<Record<LimbSlot, ReactNode>> = {}
      for (const slot of LIMBS) {
        const node = join(base.limbs?.[slot], extra.limbs?.[slot])
        if (node) limbs[slot] = node
      }
      return {
        torso: join(base.torso, extra.torso),
        head: join(base.head, extra.head),
        neck: join(base.neck, extra.neck),
        limbs,
        tints: { ...base.tints, ...extra.tints },
        holes,
      }
    },
    [base, extra, holes],
  )
}

