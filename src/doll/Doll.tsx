import * as THREE from 'three'
import { useCallback, useEffect, useMemo, useRef, type MutableRefObject, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import { makeKnitMaps, tiled, type KnitMaps } from '../core/knit'
import { SpringBone } from '../core/springBone'
import { turntable } from '../core/turntable'
import { mulberry32 } from '../core/rand'
import { useDisposable } from '../core/useDisposable'
import { Batched } from '../core/batch'
import { headGeometry, torsoGeometry, limbGeometry, tipGeometry } from './geometry'
import { Pin, jitterColor, pinColor } from './parts'
import { EYE_SCALE, Face, faceLook, type FaceLook } from './face'
import { makeWoodTexture } from './wood'
import { crownPins, hairLook, useTraitSlots, woolTone, type LimbSlot, type TraitId } from './traits'
import { makeCordTexture, makeYarnTexture } from '../core/cord'
import { Hairdo, hairStyleFor, type HairStyle } from './hairstyles'
import { Locks, useLockAnchors } from './hair'
import {
  holeShader,
  makeFiberTexture,
  makeHoleUniforms,
  makeShellUniforms,
  shellInstances,
  shellShader,
} from './fuzz'
import { dollLayout } from './layout'
import { Zip, zipFuzzShader, zipHole } from './zip'
import type { PatchHoles } from './patch'
import { headWidth, onHeadPolar, onTorso } from './surface'
import type { DollParams } from './params'
import { RigContext, rigMetrics, type RigBones } from './rig'
import { Dyn, Fighter } from './fighter'
import { JOINT, Stepper, jointShader, makeJoint, solveLeg, updateJoint, type Joint } from './limbs'

const UP = new THREE.Vector3(0, 1, 0)
const DOWN = new THREE.Vector3(0, -1, 0)
/** Avant du corps, et axe de l'écartement des membres. */
const FWD = new THREE.Vector3(0, 0, 1)

// ---------------------------------------------------------------- matière

type WoolMaps = readonly [THREE.Texture, THREE.Texture, THREE.Texture, THREE.Texture]

/**
 * Répétition des fibres, relative à celle de la maille.
 *
 * Contre-intuitif : monter ce facteur ne donne pas « plus de duvet » mais moins.
 * À 5, chaque fibre tombait sous le pixel à l'écran et le duvet se lissait en
 * velours. Il faut que la fibre reste résolue pour qu'elle se lise comme telle.
 */
const FIBER_SCALE = 1.2

function useTiled(knit: KnitMaps, fiber: THREE.Texture, rx: number, ry = rx): WoolMaps {
  const maps = useMemo(
    () =>
      [
        tiled(knit.map, rx, ry),
        tiled(knit.normalMap, rx, ry),
        tiled(knit.roughnessMap, rx, ry),
        tiled(fiber, rx * FIBER_SCALE, ry * FIBER_SCALE),
      ] as const,
    [knit, fiber, rx, ry],
  )
  useEffect(() => () => maps.forEach((m) => m.dispose()), [maps])
  return maps
}

/**
 * Coques de duvet posées sur un maillage.
 *
 * Chacune est le même volume repoussé un peu plus loin, percé d'un masque de
 * fibres de plus en plus sélectif. C'est ce qui donne au contour son irrégularité
 * — une normal map, elle, laisse la silhouette parfaitement lisse, et c'est
 * précisément ce bord net qui trahit le rendu 3D.
 */
function Fuzz({
  geometry,
  maps,
  p,
  holes,
  joint,
  zip,
}: {
  geometry: THREE.BufferGeometry
  maps: WoolMaps
  p: DollParams
  /** Pli du membre porteur (genou, coude) : le duvet le suit. */
  joint?: Joint
  /** Bande du crâne sans duvet, sous la fermeture éclair (`zipHole`). */
  zip?: ReturnType<typeof zipHole>
  /** Pièces cousues sous lesquelles retirer la laine — le torse seul en a. */
  holes?: PatchHoles
}) {
  const count = p.shell.count
  // Toutes les coques en un dessin (voir `shellInstances`).
  const shells = useDisposable(
    () => shellInstances(geometry, Math.max(1, count), p.shell.height),
    [geometry, count, p.shell.height],
  )

  // Uniformes stables, valeurs réécrites : la poupée change, le programme non.
  // Remplacer l'objet à chaque génération recompilerait le shader six fois par
  // clic sur « générer ».
  const uni = useMemo(makeHoleUniforms, [])
  const shellUni = useMemo(makeShellUniforms, [])
  shellUni.uShellCount.value = count
  shellUni.uShellHeight.value = p.shell.height
  const compile = useMemo(() => {
    const hole = holes ? holeShader(uni) : null
    const shell = shellShader(shellUni)
    const bend = joint ? jointShader(joint) : null
    const zipCut = zip ? zipFuzzShader(zip) : null
    return (sh: THREE.WebGLProgramParametersWithUniforms) => {
      hole?.(sh)
      shell(sh)
      bend?.(sh)
      zipCut?.(sh)
    }
  }, [uni, shellUni, holes, joint, zip])
  useMemo(() => {
    uni.uHoleMask.value = holes?.mask ?? null
    uni.uHoleCount.value = holes?.count ?? 0
    holes?.rects.forEach((r, i) => uni.uHole.value[i].copy(r))
  }, [uni, holes])

  if (count <= 0) return null
  return (
    <mesh geometry={shells} renderOrder={1}>
      <meshPhysicalMaterial
        onBeforeCompile={compile}
        customProgramCacheKey={() =>
          `fuzz${holes ? '-holes' : ''}${joint ? '-joint' : ''}${zip ? `-zip${zip.half.toFixed(4)}${zip.top.toFixed(4)}${zip.bottom.toFixed(4)}` : ''}`
        }
        map={maps[0]}
        alphaMap={maps[3]}
        // Hors de la profondeur : le contour d'encre la lit, et chaque
        // fibre y aurait sinon son trait (voir `Outline`).
        depthWrite={false}
        roughness={1}
        metalness={0}
        sheen={p.wool.sheen}
        sheenColor={p.wool.sheenColor}
        sheenRoughness={0.92}
      />
    </mesh>
  )
}

function Wool({ maps, p, color, joint }: { maps: WoolMaps; p: DollParams; color?: string; joint?: Joint }) {
  // Réglable : c'est le premier levier contre le scintillement, avant même de
  // toucher à la texture.
  const normalScale = useMemo(
    () => new THREE.Vector2(p.wool.normalStrength, p.wool.normalStrength),
    [p.wool.normalStrength],
  )
  // Membre qui plie (voir `limbs.ts`).
  const compile = useMemo(() => (joint ? jointShader(joint) : undefined), [joint])
  return (
    <meshPhysicalMaterial
      {...(compile ? { onBeforeCompile: compile, customProgramCacheKey: () => 'wool-joint' } : {})}
      map={maps[0]}
      normalMap={maps[1]}
      // La carte de rugosité est ce qui casse le vernis uniforme : sans elle,
      // toute la surface renvoie la lumière de la même façon et lit plastique.
      roughnessMap={maps[2]}
      normalScale={normalScale}
      color={color ?? '#ffffff'}
      roughness={p.wool.roughness}
      metalness={0}
      sheen={p.wool.sheen}
      sheenColor={p.wool.sheenColor}
      sheenRoughness={p.wool.sheenRoughness}
    />
  )
}

// ---------------------------------------------------------------- poupée

export function Doll({
  p,
  position,
  trait = 'nu',
  tone: forced,
  hairColor,
  face: forcedFace,
  hairStyle: forcedStyle,
  fighter: forcedFighter,
  weapon = false,
  crown = false,
}: {
  /** Couronne d'épingles : un accessoire tiré par la planche (`boardCrowns`). */
  crown?: boolean
  p: DollParams
  /**
   * Lecteur d'animation piloté de l'extérieur (arène, jeu). Sans lui la
   * poupée joue son attente, décalée d'une poupée à l'autre.
   */
  fighter?: Fighter
  /** Épingle de vaudou géante en main (main droite de la poupée). */
  weapon?: boolean
  /** Coiffure imposée par la planche, pour que les six soient différentes. */
  hairStyle?: HairStyle
  /** Visage imposé par la planche, pour que les six expressions soient distinctes. */
  face?: FaceLook
  position?: [number, number, number]
  /** Laine imposée par la planche, pour que les six teintes soient distinctes. */
  tone?: { base: string; stitch: string }
  /** Laine de locks imposée par la planche, même raison. */
  hairColor?: string
  /** Signe distinctif greffé sur les emplacements nommés de la poupée. */
  trait?: TraitId
}) {
  const root = useRef<THREE.Group>(null!)
  /** Os de pose : ce que l'animation oriente. Les ressorts sont en dessous. */
  const hips = useRef<THREE.Group>(null!)
  const neck = useRef<THREE.Group>(null!)
  const poseArmL = useRef<THREE.Group>(null!)
  const poseArmR = useRef<THREE.Group>(null!)
  const poseLegL = useRef<THREE.Group>(null!)
  const poseLegR = useRef<THREE.Group>(null!)
  const body = useRef<THREE.Group>(null!)
  /** Étirement / écrasement du corps entier, pivot aux pieds. */
  const squash = useRef<THREE.Group>(null!)
  /**
   * Moitié basse des membres (voir `limbs.ts`) : `lowerPose` porte l'angle du
   * coude ou du genou, `lowerSpring` son ressort — l'avant-bras arrive après
   * le bras. Le pied se replace quand la jambe s'étire.
   */
  const lowerPose = useRef<Record<string, THREE.Group | null>>({})
  const lowerSpring = useRef<Record<string, THREE.Group | null>>({})
  const legFoot = useRef<Record<number, THREE.Group | null>>({})
  /** Arme, orientée chaque image depuis la main. */
  const weaponRef = useRef<THREE.Group>(null)
  const headBone = useRef<THREE.Group>(null!)
  const armL = useRef<THREE.Group>(null!)
  const armR = useRef<THREE.Group>(null!)
  const legL = useRef<THREE.Group>(null!)
  const legR = useRef<THREE.Group>(null!)

  const L = useMemo(() => dollLayout(p), [p])
  const s = p.shape
  const lb = p.limbs

  // --- laine ---
  // La laine varie d'une poupée à l'autre autour de la couleur du panneau.
  const tone = useMemo(() => forced ?? woolTone(p), [forced, p])

  const knit = useDisposable(
    () => makeKnitMaps({
      cols: 12,
      rows: 15,
      base: tone.base,
      stitch: tone.stitch,
      relief: p.wool.relief,
      fuzz: p.wool.fuzz,
      seed: p.seed,
      size: p.wool.mapSize,
    }),
    [tone, p.wool.relief, p.wool.fuzz, p.seed, p.wool.mapSize],
  )

  // Chaque partie a ses propres répétitions pour que la maille garde la même
  // taille physique partout : les UV vont de 0 à 1 quelle que soit la surface.
  // On prend donc la tête comme étalon et on met les autres à l'échelle de leur
  // périmètre réel (u) et de leur méridienne (v) — des facteurs approximatifs
  // donnaient des membres à densité presque double, d'où l'aspect étiré.
  const wood = useDisposable(() => makeWoodTexture(256, p.seed + 555), [p.seed])

  const fiber = useDisposable(
    () => makeFiberTexture(512, p.shell.density, p.seed + 4242),
    [p.shell.density, p.seed],
  )

  const k = p.wool.knitScale
  const headCirc = 2 * Math.PI * s.headRadius * 1.08
  const headMeridian = Math.PI * s.headRadius * s.headSquash

  const headMaps = useTiled(knit, fiber, k)
  const torsoMaps = useTiled(
    knit,
    fiber,
    (k * (2 * Math.PI * s.torsoRadius * 0.9)) / headCirc,
    (k * (Math.PI * s.torsoHeight * 0.5)) / headMeridian,
  )
  const armMaps = useTiled(
    knit,
    fiber,
    (k * (2 * Math.PI * lb.armRadius)) / headCirc,
    (k * (lb.armLength + lb.armRadius * 2)) / headMeridian,
  )
  // Les jambes sont plus épaisses et plus courtes : leur propre échelle, sinon
  // la maille y est décalée par rapport aux bras.
  const legMaps = useTiled(
    knit,
    fiber,
    (k * (2 * Math.PI * lb.legRadius)) / headCirc,
    (k * (lb.legLength + lb.legRadius * 2)) / headMeridian,
  )

  // Après les cartes : les ornements en tissu portent la même maille que le
  // corps.
  // Cartes **brutes** : les ornements en tissu calculent leurs propres UV en
  // unités monde, une répétition déjà appliquée les déformerait.
  const slots = useTraitSlots(trait, { p, wood })

  // --- volumes ---
  const headGeo = useDisposable(
    () =>
      headGeometry(
        s.headRadius, s.headEgg, s.headSquash,
        s.headPuff, s.headCheekY, s.headCheekSpread,
        s.lumps, s.lumpScale, p.seed,
      ),
    [
      s.headRadius, s.headEgg, s.headSquash,
      s.headPuff, s.headCheekY, s.headCheekSpread,
      s.lumps, s.lumpScale, p.seed,
    ],
  )
  const torsoGeo = useDisposable(
    () => torsoGeometry(s.torsoRadius, s.torsoHeight, s.torsoTaper, s.lumps, s.lumpScale, p.seed),
    [s.torsoRadius, s.torsoHeight, s.torsoTaper, s.lumps, s.lumpScale, p.seed],
  )
  const armGeo = useDisposable(
    () => limbGeometry(lb.armRadius, lb.armLength, s.lumps, s.lumpScale, p.seed),
    [lb.armRadius, lb.armLength, s.lumps, s.lumpScale, p.seed],
  )
  const legGeo = useDisposable(
    () => limbGeometry(lb.legRadius, lb.legLength, s.lumps, s.lumpScale, p.seed + 3),
    [lb.legRadius, lb.legLength, s.lumps, s.lumpScale, p.seed],
  )
  const handGeo = useDisposable(
    () => tipGeometry(lb.armRadius * 1.35, s.lumps, s.lumpScale, p.seed),
    [lb.armRadius, s.lumps, s.lumpScale, p.seed],
  )
  const footGeo = useDisposable(
    () => tipGeometry(lb.legRadius * 1.3, s.lumps, s.lumpScale, p.seed + 5),
    [lb.legRadius, s.lumps, s.lumpScale, p.seed],
  )

  // --- locks en ficelle ---
  //
  // Densité, longueur, épaisseur et laine sont tirées de la graine autour des
  // valeurs du panneau : deux poupées d'une même planche n'ont pas la même
  // tignasse. Tout passe par cet objet, jamais par `p.hair` directement — les
  // cotes dérivées (enfouissement, dégagement du collider, longueur de segment)
  // s'en déduisent, et une seule lecture oubliée les désaccorderait.
  const hair = useMemo(() => hairLook(p, hairColor), [p, hairColor])

  const cord = useDisposable(
    () => makeCordTexture(256, p.hair.strands, p.hair.turns, p.seed + 808),
    [p.hair.strands, p.hair.turns, p.seed],
  )
  // Coiffure : locks, ou l'une des coupes en laine de `hairstyles.tsx`. Celles-ci
  // portent un fil retors — deux à quatre brins, tirés de la graine — et non la
  // tresse des locks : ce sont deux matières.
  const style = forcedStyle ?? hairStyleFor(p.seed)
  const yarn = useDisposable(
    () => makeYarnTexture(256, 2 + Math.floor(mulberry32(p.seed + 809)() * 3), p.seed + 809),
    [p.seed],
  )
  const headWidthAt = useCallback(
    (sy: number, lateral: number) => headWidth(p, sy, lateral),
    [p],
  )
  // Enfouissement borné à une fraction du segment : si l'écart entre la racine
  // enfouie et la sphère de collision dépasse la longueur d'un segment, la
  // contrainte n'a plus de solution oblique et tous les locks se dressent.
  const segLen = hair.length / hair.segments
  const sink = Math.min(hair.thickness * hair.rooting, segLen * 0.42)
  /**
   * Dégagement du collider, borné par ce qui **reste** du budget.
   *
   * Le premier segment part de la racine enfouie et doit ressortir du collider :
   * il lui faut franchir `sink + clearance` avec une seule longueur de segment.
   * Au-delà, la sphère qu'il peut atteindre est tout entière dans le collider,
   * la contrainte n'a plus de solution oblique et toutes les racines se dressent
   * en épis — le piège documenté.
   *
   * Or c'est la **somme** qui compte, et seul `sink` était borné. Le dégagement
   * se déduit de l'épaisseur, donc à mèche courte et fil gros il débordait tout
   * seul : mesuré, le rapport passait à 1,18 dans ce coin. Le plafond ne mord
   * que là — aux réglages courants la valeur est inchangée.
   */
  const clearance = Math.min(hair.thickness * 0.45, Math.max(0, segLen * 0.92 - sink))

  const locks = useLockAnchors(
    // Pas de racines à calculer pour une coiffure qui n'est pas en locks.
    style === 'locks' ? hair.count : 0,
    p.seed,
    s.headRadius,
    s.headSquash,
    headWidthAt,
    hair.droop,
    sink,
    clearance,
    hair.crown,
  )

  // Fermeture éclair : bande de duvet retirée sous son ruban.
  const zipBand = useMemo(() => zipHole(p), [p])

  // --- visage ---
  const lift = s.lumps * s.headRadius * 0.7 + 0.004
  /**
   * Hauteur et plongeon de la bouche.
   *
   * La bouche se coud **plus bas que les yeux** : un bouton est un objet posé
   * sur la laine, une passe de fil y est enfoncée. Elle ne prend donc que le
   * dégagement des bosses, sans la marge qui met les boutons en avant — avec
   * elle, le sommet du fil passait au-dessus de la pointe des fibres et la
   * bouche restait décollée quoi qu'on fasse aux bouts.
   *
   * Et les bouts plongent sous la peau : le duvet est un halo troué, il ne
   * cache pas une passe qui s'arrête en l'air, et c'est ce plongeon qui coud.
   */
  const mouthLift = s.lumps * s.headRadius * 0.7
  const stitchDip = mouthLift + s.lumps * s.headRadius * 0.55

  // Boutons : taille, écartement et teinte varient autour des valeurs du
  // panneau, dans une fourchette serrée. Assez pour que deux poupées ne se
  // ressemblent pas, pas assez pour qu'un visage sorte du gabarit.
  const eyes = useMemo(() => {
    const rnd = mulberry32(p.seed + 2024)
    return {
      spacing: p.face.eyeSpacing * (0.88 + rnd() * 0.24),
      leftSize: p.face.leftSize * (0.86 + rnd() * 0.28) * EYE_SCALE,
      rightSize: p.face.rightSize * (0.86 + rnd() * 0.28) * EYE_SCALE,
      leftColor: jitterColor(p.face.leftColor, rnd),
      rightColor: jitterColor(p.face.rightColor, rnd),
    }
  }, [p])

  // Visage imposé par la planche — humeurs et détails tous différents —, tiré
  // de la graine sinon.
  const look = useMemo(() => forcedFace ?? faceLook(p.seed), [forcedFace, p.seed])

  // --- épingles plantées dans le crâne ---
  const headPins = useMemo(() => {
    const rnd = mulberry32(p.seed + 4711)
    const length = s.headRadius * 0.85
    // Une poupée couronnée d'épingles n'en porte pas une isolée en plus.
    if (crown) return crownPins(p)
    const count = p.pins.head

    return Array.from({ length: count }, () => {
      // Sur le côté du crâne, à hauteur de tempe : de face on voit la tige
      // entrer dans la laine, ce qui est tout l'effet recherché. Côté tiré au
      // sort, pas alterné.
      const side = rnd() < 0.5 ? 1 : -1
      const az = side * (Math.PI / 2 + (rnd() - 0.5) * 0.45)
      const sy = 0.05 + rnd() * 0.35

      // Enfoncée aux trois quarts : seules la fin de la tige et la tête
      // colorée dépassent, comme une épingle réellement plantée.
      const surf = onHeadPolar(p, az, sy, -length * 0.72)
      const quat = new THREE.Quaternion().setFromUnitVectors(UP, surf.normal)

      return { pos: surf.pos, quat, length, color: pinColor(rnd) }
    })
  }, [p, s.headRadius, crown])

  // --- épingles plantées dans le torse ---
  const pins = useMemo(() => {
    const rnd = mulberry32(p.seed + 211)
    const colors = ['#a8342f', '#2f4f7a', '#c9a227', '#3f7a4a']
    return Array.from({ length: p.pins.count }, (_, i) => {
      const az = (rnd() - 0.5) * 1.5
      const y = (rnd() - 0.35) * p.shape.torsoHeight * 0.5
      const surf = onTorso(p, az, y, -p.shape.torsoRadius * 0.12)
      // L'épingle sort le long de la normale : son axe local Y doit s'y aligner.
      const q = new THREE.Quaternion().setFromUnitVectors(UP, surf.normal)
      const tilt = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(1, 0, 0),
        (rnd() - 0.5) * 0.7,
      )
      return { pos: surf.pos, quat: q.multiply(tilt), color: colors[i % colors.length] }
    })
  }, [p])

  /**
   * Les locks sont marqués « cheveux » pour le cel shading **depuis ici** : leur
   * code (`hair.tsx`) et leur coupe restent intacts, c'est la seule coiffure à
   * ne pas toucher. On pose la marque sur les matériaux une fois montés.
   */
  const locksGroup = useRef<THREE.Group>(null)
  useEffect(() => {
    locksGroup.current?.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined
      if (!m || (m.defines && 'TOON_HAIR' in m.defines)) return
      m.defines = { ...(m.defines ?? {}), TOON_HAIR: '' }
      m.needsUpdate = true
    })
  }, [style, locks, hair])

  /**
   * **Ombres portées réservées aux volumes.** Chaque objet qui porte ombre est
   * redessiné dans la carte d'ombre : 583 sur la planche, dont une majorité de
   * points de couture, de têtes d'épingle et de perles, dont l'ombre tient dans
   * un pixel. On la retire à tout ce qui est plus petit qu'un septième du
   * crâne. Les locks gardent la leur : leur coupe ne se touche pas.
   */
  useEffect(() => {
    const min = s.headRadius * 0.15
    root.current.traverse((o) => {
      if (o === locksGroup.current) return
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh || !mesh.castShadow) return
      if (locksGroup.current && isInside(mesh, locksGroup.current)) return
      const g = mesh.geometry
      if (!g.boundingSphere) g.computeBoundingSphere()
      if (g.boundingSphere!.radius < min) mesh.castShadow = false
    })
  })

  // Tout ce qui change le contenu des pièces fusionnées : la fusion est refaite.
  const batchDeps = [p, trait, tone, look, eyes, style, weapon, crown]

  // --- ressorts ---
  const springs = useRef<Record<string, SpringBone> | null>(null)
  const springKey = `${s.headRadius}|${lb.armLength}|${lb.legLength}`
  const lastKey = useRef('')

  // Combattant : celui de l'arène, piloté ; sinon une attente propre,
  // déphasée par la graine pour que la planche ne respire pas à l'unisson.
  const ownFighter = useMemo(() => new Fighter({ phase: mulberry32(p.seed + 77)() * 3 }), [p.seed])
  const fighter = forcedFighter ?? ownFighter
  const metrics = useMemo(() => rigMetrics(p), [p])
  /** Longueur de l'arme : presque la taille de la poupée — trop grande pour elle. */
  const weaponLength = metrics.height * 0.92
  /** Pointe de l'arme en repère monde, avec son inertie : elle est lourde. */
  const weaponTip = useMemo(() => ({ dyn: new Dyn(3, 4.2, 0.55, 0.2), ready: false }), [])
  /** Pli de chaque membre (voir `limbs.ts`). */
  const joints = useMemo(
    () => ({
      arm: { [-1]: makeJoint(lb.armLength), 1: makeJoint(lb.armLength) } as Record<number, Joint>,
      leg: { [-1]: makeJoint(lb.legLength), 1: makeJoint(lb.legLength) } as Record<number, Joint>,
    }),
    [lb.armLength, lb.legLength],
  )
  const stepper = useMemo(() => new Stepper(), [])
  const hipW = useMemo(() => ({ [-1]: new THREE.Vector3(), 1: new THREE.Vector3() }) as Record<-1 | 1, THREE.Vector3>, [])
  /** Pied au repos, repère de la racine : hanche, puis l'axe écarté de la jambe. */
  const footRest = useMemo(() => {
    const reach = lb.legLength + lb.legRadius * 0.3
    const out = {} as Record<-1 | 1, THREE.Vector3>
    for (const side of [-1, 1] as const)
      out[side] = new THREE.Vector3(
        side * (L.hipX + Math.sin(lb.legSpread) * reach),
        -L.centerY + L.hipY - Math.cos(lb.legSpread) * reach,
        0,
      )
    return out
  }, [L, lb.legLength, lb.legRadius, lb.legSpread])
  const bones = useMemo<RigBones>(
    () => ({
      arm: { [-1]: null, 1: null },
      leg: { [-1]: null, 1: null },
      forearm: { [-1]: null, 1: null },
      shin: { [-1]: null, 1: null },
      floorY: 0,
    }),
    [],
  )

  /**
   * Priorité −1 : avant l'écharpe et le collier, qui relisent la position des
   * membres pour y poser leurs obstacles. Sans elle ils s'abonnent avant la
   * poupée (effets des enfants d'abord) et suivent les bras avec une image de
   * retard. `Rig` est à −2 : la platine avance encore avant.
   */
  useFrame((_, dt) => {
    // La platine et la caméra sont pilotées par <Rig>, en amont : ici on ne
    // fait que lire son état, sinon trois poupées le feraient avancer trois
    // fois par frame.
    fighter.update(dt, metrics)
    if (fighter.drive) {
      // Arène : la poupée se déplace et fait face à sa course ; la platine
      // tourne la caméra (voir `Rig`).
      root.current.position.set(fighter.pos.x, fighter.pos.y, fighter.pos.z)
      root.current.rotation.set(0, fighter.facing, 0)
    } else {
      root.current.rotation.set(turntable.pitch, turntable.yaw, 0)
    }
    const pose = fighter.pose
    // Volume constant : ce que le corps perd en hauteur, il le gagne en
    // largeur. Et il ploie (cisaillement, pieds fixes) : voir `fighter.shear`.
    const sq = fighter.squash
    const w = 1 / Math.sqrt(sq)
    const sqm = squash.current
    sqm.matrixAutoUpdate = false
    sqm.matrix.set(w, fighter.shear.x, 0, 0, 0, sq, 0, 0, 0, fighter.shear.z, w, 0, 0, 0, 0, 1)
    sqm.matrixWorldNeedsUpdate = true
    hips.current.position.fromArray(pose.hipsPos)
    hips.current.rotation.fromArray(pose.hips)
    neck.current.rotation.fromArray(pose.neck)
    poseArmL.current.rotation.fromArray(pose['arm-1'])
    poseArmR.current.rotation.fromArray(pose.arm1)
    poseLegL.current.rotation.fromArray(pose['leg-1'])
    poseLegR.current.rotation.fromArray(pose.leg1)
    // Plis : coude et genou du geste. Au sol, l'IK reprend les genoux.
    for (const side of [-1, 1] as const) {
      lowerPose.current[`arm${side}`]?.rotation.set(pose[side === -1 ? 'elbow-1' : 'elbow1'][0], 0, 0)
      lowerPose.current[`leg${side}`]?.rotation.set(pose[side === -1 ? 'knee-1' : 'knee1'][0], 0, 0)
      joints.leg[side].uStretch.value = 1
      bones.forearm[side] = lowerSpring.current[`arm${side}`]
      bones.shin[side] = lowerSpring.current[`leg${side}`]
    }
    root.current.getWorldPosition(_rootW)
    // Sol sous la poupée : sous la racine, pas sous le bassin (qui saute).
    bones.floorY = (fighter.drive ? _rootW.y - fighter.pos.y : _rootW.y) + L.floorY
    bones.arm[-1] = armL.current
    bones.arm[1] = armR.current
    bones.leg[-1] = legL.current
    bones.leg[1] = legR.current

    // --- pieds au sol (arène) : la jambe vise son pied planté
    // Temps du combattant : les pieds gèlent avec lui à l'impact.
    const ik = fighter.drive ? plantFeet(fighter.dt) : 0

    if (!springs.current || lastKey.current !== springKey) {
      const low = (k: string, len: number) => new SpringBone(lowerSpring.current[k]!, len, DOWN)
      springs.current = {
        head: new SpringBone(headBone.current, s.headRadius * 0.9, UP),
        armL: new SpringBone(armL.current, lb.armLength, DOWN),
        armR: new SpringBone(armR.current, lb.armLength, DOWN),
        legL: new SpringBone(legL.current, lb.legLength, DOWN),
        legR: new SpringBone(legR.current, lb.legLength, DOWN),
        foreL: low('arm-1', lb.armLength * (1 - JOINT)),
        foreR: low('arm1', lb.armLength * (1 - JOINT)),
        shinL: low('leg-1', lb.legLength * (1 - JOINT)),
        shinR: low('leg1', lb.legLength * (1 - JOINT)),
      }
      lastKey.current = springKey
    }

    // Pendant un geste les membres se raidissent : trop mous, ils traînaient
    // si loin derrière la pose qu'une attaque ne se lisait plus. Assez pour
    // que le coup porte, pas assez pour perdre le ballottement.
    const firm = fighter.firm
    // Dans l'arène, ressorts des membres et de la tête bien amortis : ils
    // suivent en retard mais ne rebondissent pas (le rebond faisait gelée).
    const settle = fighter.drive ? 0.5 : 0
    const limbCfg = {
      ...p.spring,
      drag: Math.max(p.spring.drag, settle),
      stiffness: p.spring.stiffness + (0.72 - p.spring.stiffness) * firm,
      gravity: p.spring.gravity * (1 - 0.7 * firm),
    }
    // La tête est rappelée plus fort : elle acquiesce, elle ne pendouille pas.
    const headCfg = {
      stiffness: p.spring.headStiffness,
      drag: Math.max(p.spring.drag, settle),
      gravity: p.spring.gravity * 0.15,
    }
    springs.current.head.update(dt, headCfg)
    springs.current.armL.update(dt, limbCfg)
    springs.current.armR.update(dt, limbCfg)
    springs.current.legL.update(dt, limbCfg)
    springs.current.legR.update(dt, limbCfg)
    // Avant-bras et tibias : plus mous que le haut du membre. C'est eux qui
    // arrivent en dernier — le fouet d'un coup, le ballant d'un bras.
    const lowCfg = { ...limbCfg, stiffness: limbCfg.stiffness * 0.7 }
    // Les mains ne rentrent ni dans le ventre ni dans la tête : en parade ou
    // au revers, le bras s'enroule autour du corps au lieu de le traverser.
    updateBodyColliders()
    const hands = bodyColliders.hands
    springs.current.foreL.update(dt, lowCfg, hands)
    springs.current.foreR.update(dt, lowCfg, hands)
    springs.current.shinL.update(dt, lowCfg)
    springs.current.shinR.update(dt, lowCfg)
    // Pied planté : les ressorts de la jambe s'effacent, sinon ils
    // décolleraient le pied que l'ancrage vient de poser.
    if (ik > 0) {
      legL.current.quaternion.slerp(_qId, ik)
      legR.current.quaternion.slerp(_qId, ik)
      lowerSpring.current['leg-1']!.quaternion.slerp(_qId, ik)
      lowerSpring.current.leg1!.quaternion.slerp(_qId, ik)
    }
    for (const side of [-1, 1] as const) {
      for (const kind of ['arm', 'leg'] as const) {
        const j = joints[kind][side]
        const lp = lowerPose.current[`${kind}${side}`]
        const ls = lowerSpring.current[`${kind}${side}`]
        if (!lp || !ls) continue
        if (kind === 'leg') {
          // Jambe étirée (au-delà de sa portée) : genou et pied descendent.
          const st = j.uStretch.value
          lp.position.y = -lb.legLength * JOINT * st
          const foot = legFoot.current[side]
          if (foot) foot.position.y = -lb.legLength * (1 - JOINT) * st - lb.legRadius * 0.3
        }
        updateJoint(j, lp, ls)
      }
    }

    if (weaponRef.current) aimWeapon(weaponRef.current)
    if (fighter.ghostRequest) writeSilhouette()
    // Atelier : de quoi mesurer le ressenti (voir les audits de CLAUDE.md).
    if (import.meta.env.DEV && fighter.drive)
      Object.assign(window, { __doll: { head: headBone.current, hips: hips.current, joints, squash: squash.current } })
  }, -1)

  /**
   * Ancrage au sol : pas procéduraux (`Stepper`), puis chaque jambe rejoint
   * son pied par IK à deux segments (`solveLeg`), **dans le repère de la
   * hanche** — écrasement compris : le pied tombe pile sur sa place même quand
   * le corps se tasse. Le genou part devant ; au-delà de la portée, le tissu
   * s'étire un peu. Renvoie la part d'ancrage.
   */
  const plantFeet = (dt: number) => {
    root.current.getWorldPosition(_rootW)
    for (const side of [-1, 1] as const) {
      const pose = side === -1 ? poseLegL.current : poseLegR.current
      pose.parent!.updateWorldMatrix(true, false)
      pose.getWorldPosition(hipW[side])
    }
    stepper.update(dt, {
      root: _rootW,
      facing: fighter.facing,
      vel: fighter.vel,
      rest: footRest,
      hips: hipW,
      splay: Math.sin(lb.legSpread) * (lb.legLength + lb.legRadius * 0.3),
      grounded: fighter.grounded,
      legLength: lb.legLength,
      onLand: (side, speed, dur) => fighter.land(speed, side, dur, stepper.feet[side].pos),
      cycle: fighter.cycle,
      glide: fighter.gliding,
    })
    const w = stepper.weight
    if (import.meta.env.DEV) Object.assign(window, { __stepper: stepper, __legK: _legK })
    if (w < 1e-3) return 0
    const foot = lb.legRadius * 0.3
    for (const side of [-1, 1] as const) {
      const pose = side === -1 ? poseLegL.current : poseLegR.current
      const knee = lowerPose.current[`leg${side}`]
      if (!knee) continue
      const parent = pose.parent!
      _dir.copy(stepper.feet[side].pos)
      parent.worldToLocal(_dir)
      const D = _dir.length()
      // Étirement : seulement au-delà de la portée tendue, et borné.
      const st = THREE.MathUtils.clamp((D - foot) / lb.legLength, 1, 1.15)
      const a = lb.legLength * JOINT * st
      const b = lb.legLength * (1 - JOINT) * st + foot
      const bendK = solveLeg(_dir, a, b, FWD, _qb)
      if (import.meta.env.DEV) _legK[side] = +(D / (lb.legLength + foot)).toFixed(2)
      // Fémur voulu, moins l'écartement porté par le groupe du dessous.
      _qa.setFromAxisAngle(FWD, side * lb.legSpread).invert()
      _qb.multiply(_qa)
      pose.quaternion.slerp(_qb, w)
      knee.rotation.x += (bendK - knee.rotation.x) * w
      joints.leg[side].uStretch.value = 1 + (st - 1) * w
    }
    return w
  }

  /**
   * Silhouette pour les images rémanentes (`Ghosts`) : quatorze ellipsoïdes
   * en repère monde — tête, torse, et pour chaque membre ses deux segments et
   * son bout. Écrite seulement quand le combattant la demande (dash,
   * glissade) : c'est la poupée entière en quatorze matrices, lisible en
   * ombre, pour le prix d'un seul dessin instancié.
   */
  const writeSilhouette = () => {
    const out = fighter.silhouette
    let k = 0
    const put = (obj: THREE.Object3D, y: number, sx: number, sy: number, sz: number) => {
      _sm.makeTranslation(0, y, 0)
      _ss.makeScale(sx, sy, sz)
      _sm.multiply(_ss).premultiply(obj.matrixWorld)
      _sm.toArray(out, k * 16)
      k++
    }
    headBone.current.updateWorldMatrix(true, false)
    put(headBone.current, L.headY, s.headRadius * 1.05, s.headRadius * s.headSquash, s.headRadius)
    put(body.current, 0, s.torsoRadius, s.torsoHeight * 0.5, s.torsoRadius * 0.86)
    for (const side of [-1, 1] as const) {
      for (const kind of ['arm', 'leg'] as const) {
        const upper = kind === 'arm' ? (side === -1 ? armL.current : armR.current) : side === -1 ? legL.current : legR.current
        const lowerObj = lowerSpring.current[`${kind}${side}`]
        if (!lowerObj) continue
        const len = kind === 'arm' ? lb.armLength : lb.legLength
        const r = kind === 'arm' ? lb.armRadius : lb.legRadius
        const st = kind === 'leg' ? joints.leg[side].uStretch.value : 1
        const a = len * JOINT * st
        const b = len * (1 - JOINT) * st
        lowerObj.updateWorldMatrix(true, false)
        put(upper, -a * 0.5, r, a * 0.5 + r * 0.5, r)
        put(lowerObj, -b * 0.5, r, b * 0.5 + r * 0.5, r)
        const tip = kind === 'arm' ? r * 1.35 : r * 1.3
        put(lowerObj, -b - (kind === 'arm' ? r * 0.35 : r * 0.3), tip, tip, tip)
      }
    }
  }

  /**
   * Volumes du corps en repère monde, relus chaque image : tête, haut et bas
   * du torse. `list` pour la lame (rayons nus), `hands` pour les mains (rayon
   * de la main ajouté : c'est le centre de la main qui est contraint).
   */
  const bodyColliders = useMemo(() => {
    const mk = () => ({ center: new THREE.Vector3(), radius: 0 })
    return { list: [mk(), mk(), mk()], hands: [mk(), mk(), mk()] }
  }, [])
  const updateBodyColliders = () => {
    const [head, chest, belly] = bodyColliders.list
    headBone.current.updateWorldMatrix(true, false)
    head.center.set(0, L.headY, 0).applyMatrix4(headBone.current.matrixWorld)
    head.radius = s.headRadius * 1.02
    body.current.updateWorldMatrix(true, false)
    // Le torse est un ellipsoïde effilé vers le haut et aplati d'avant en
    // arrière (0,86) : rayon pris à la hauteur de chaque sphère, un peu rentré.
    const at = (y: number) => s.torsoRadius * (1 + (s.torsoTaper - 1) * (y + 0.5)) * 0.88
    chest.center.set(0, s.torsoHeight * 0.12, 0).applyMatrix4(body.current.matrixWorld)
    chest.radius = at(0.12)
    belly.center.set(0, -s.torsoHeight * 0.18, 0).applyMatrix4(body.current.matrixWorld)
    belly.radius = at(-0.18)
    bodyColliders.list.forEach((c, i) => {
      bodyColliders.hands[i].center.copy(c.center)
      bodyColliders.hands[i].radius = c.radius + lb.armRadius * 1.1
    })
  }

  /**
   * L'arme est **lourde** : sa pointe suit sa position visée avec inertie, en
   * repère monde — elle traîne quand la poupée court, fouette quand elle
   * frappe, et ne descend jamais sous le sol, où elle frotte. La poignée, elle,
   * reste dans la main.
   */
  const aimWeapon = (w: THREE.Group) => {
    const socket = w.parent!
    socket.updateWorldMatrix(true, false)
    socket.getWorldPosition(_hand)
    hips.current.getWorldQuaternion(_qa)
    _dir.copy(fighter.weaponDir).applyQuaternion(_qa)
    _tip.copy(_hand).addScaledVector(_dir, weaponLength)
    const tip = weaponTip.dyn
    if (!weaponTip.ready) {
      for (let i = 0; i < 3; i++) tip.snap(i, _tip.getComponent(i))
      weaponTip.ready = true
    }
    tip.update(fighter.dt, _tip.toArray(_arr3))
    root.current.getWorldPosition(_rootW)
    fighter.floorY = _rootW.y + L.floorY
    const floor = fighter.floorY + s.headRadius * 0.03
    tip.floor(1, floor)
    _tip.set(tip.y[0], tip.y[1], tip.y[2])
    _dir.subVectors(_tip, _hand)
    if (_dir.lengthSq() < 1e-8) return
    _dir.normalize()
    /*
     * Le sol s'applique à la pointe **dessinée**, pas seulement à la visée :
     * quand l'arme est en retard sur sa cible, la pointe amortie est plus
     * près de la main que la longueur de l'arme, et la lame dessinée
     * dépassait sous le sol (mesuré : 200 images sur 600 d'appuis au hasard).
     * On relève alors la lame juste assez, sans changer son cap.
     */
    // Le corps d'abord, le sol ensuite : c'est le sol qui a le dernier mot.
    for (const c of bodyColliders.list.slice(0, 3)) avoidSphere(_hand, _dir, weaponLength, c.center, c.radius + s.headRadius * 0.04)
    const minY = (floor - _hand.y) / weaponLength
    if (_dir.y < minY) {
      const dy = Math.max(-1, Math.min(1, minY))
      const h = Math.hypot(_dir.x, _dir.z)
      const hk = h > 1e-6 ? Math.sqrt(Math.max(0, 1 - dy * dy)) / h : 0
      _dir.set(_dir.x * hk, dy, _dir.z * hk)
      if (h <= 1e-6) _dir.set(0, dy, Math.sqrt(Math.max(0, 1 - dy * dy)))
    }
    _qb.setFromUnitVectors(UP, _dir)
    socket.getWorldQuaternion(_qa).invert()
    w.quaternion.copy(_qa.multiply(_qb))
    fighter.tipWorld.copy(_hand).addScaledVector(_dir, weaponLength)
    // Traînée sur le dernier tiers de la lame : de la poignée à la pointe, elle
    // faisait une grande nappe grise derrière la poupée.
    fighter.midWorld.copy(_hand).addScaledVector(_dir, weaponLength * 0.68)
  }

  /**
   * Moitié basse d'un membre, accrochée au pli : l'os du geste (coude,
   * genou), puis son ressort. Les ornements du bas (bracelet, bandage au
   * bout) y sont posés dans le repère du membre entier, d'où le décalage.
   */
  const lower = (kind: 'arm' | 'leg', side: -1 | 1, length: number, children: ReactNode) => (
    <group ref={(el) => void (lowerPose.current[`${kind}${side}`] = el)} position={[0, -length * JOINT, 0]}>
      <group ref={(el) => void (lowerSpring.current[`${kind}${side}`] = el)}>{children}</group>
    </group>
  )

  const arm = (side: -1 | 1, ref: MutableRefObject<THREE.Group>) => {
    const key: LimbSlot = side === -1 ? 'leftArm' : 'rightArm'
    return (
    // Os de pose **avant** l'écartement : un geste se donne dans le repère du
    // corps. Après, « en avant » tournait autour d'un axe incliné de l'angle
    // d'écartement, et un bras levé passait en travers de la poitrine.
    <group position={[side * L.shoulderX, L.shoulderY, 0]}>
      <group ref={side === -1 ? poseArmL : poseArmR}>
      <group rotation={[0, 0, side * lb.armSpread]}>
      <group ref={ref}>
        <mesh geometry={armGeo} castShadow receiveShadow>
          <Wool maps={armMaps} p={p} color={slots.tints?.[key]} joint={joints.arm[side]} />
        </mesh>
        <Fuzz geometry={armGeo} maps={armMaps} p={p} joint={joints.arm[side]} />
        <Batched deps={batchDeps}>{slots.limbs?.[key]}</Batched>
        {lower('arm', side, lb.armLength, (
          <>
            <group position={[0, -lb.armLength * (1 - JOINT) - lb.armRadius * 0.35, 0]}>
              <mesh geometry={handGeo} castShadow>
                <Wool maps={armMaps} p={p} color={slots.tints?.[key]} />
              </mesh>
              <Fuzz geometry={handGeo} maps={armMaps} p={p} />
              {weapon && side === -1 && (
                <group ref={weaponRef}>
                  <Weapon length={weaponLength} size={s.headRadius} />
                </group>
              )}
            </group>
            <group position={[0, lb.armLength * JOINT, 0]}>
              <Batched deps={batchDeps}>{slots.limbEnds?.[key]}</Batched>
            </group>
          </>
        ))}
      </group>
      </group>
      </group>
    </group>
    )
  }

  const leg = (side: -1 | 1, ref: MutableRefObject<THREE.Group>) => {
    const key: LimbSlot = side === -1 ? 'leftLeg' : 'rightLeg'
    return (
    <group position={[side * L.hipX, L.hipY, 0]}>
      <group ref={side === -1 ? poseLegL : poseLegR}>
      <group rotation={[0, 0, side * lb.legSpread]}>
      <group ref={ref}>
        <mesh geometry={legGeo} castShadow receiveShadow>
          <Wool maps={legMaps} p={p} color={slots.tints?.[key]} joint={joints.leg[side]} />
        </mesh>
        <Fuzz geometry={legGeo} maps={legMaps} p={p} joint={joints.leg[side]} />
        <Batched deps={batchDeps}>{slots.limbs?.[key]}</Batched>
        {lower('leg', side, lb.legLength, (
          <>
            <group
              ref={(el) => void (legFoot.current[side] = el)}
              position={[0, -lb.legLength * (1 - JOINT) - lb.legRadius * 0.3, 0]}
            >
              <mesh geometry={footGeo} castShadow>
                <Wool maps={legMaps} p={p} color={slots.tints?.[key]} />
              </mesh>
              <Fuzz geometry={footGeo} maps={legMaps} p={p} />
            </group>
            <group position={[0, lb.legLength * JOINT, 0]}>
              <Batched deps={batchDeps}>{slots.limbEnds?.[key]}</Batched>
            </group>
          </>
        ))}
      </group>
      </group>
      </group>
    </group>
    )
  }

  return (
    <group ref={root} position={position}>
      <RigContext.Provider value={bones}>
      {/* Bassin : tout le corps, déplacé et penché par l'animation. */}
      <group ref={hips}>
      {/* Écrasement pivoté aux pieds : ils restent au sol quand le corps se tasse. */}
      <group position={[0, L.floorY, 0]}>
      <group ref={squash}>
      <group position={[0, -L.floorY, 0]}>
      <group ref={body} position={[0, -L.centerY, 0]}>
        {/* torse */}
        <mesh geometry={torsoGeo} castShadow receiveShadow>
          <Wool maps={torsoMaps} p={p} />
        </mesh>
        <Fuzz geometry={torsoGeo} maps={torsoMaps} p={p} holes={slots.holes} />
        {/* Pièces fixes du torse fusionnées par matière (voir `Batched`). */}
        <Batched deps={batchDeps}>
          {slots.torso}
          {pins.map((pin, i) => (
            <Pin
              key={i}
              length={s.torsoRadius * 0.85}
              color={pin.color}
              position={[pin.pos.x, pin.pos.y, pin.pos.z]}
              quaternion={pin.quat}
            />
          ))}
        </Batched>

        {arm(-1, armL)}
        {arm(1, armR)}
        {leg(-1, legL)}
        {leg(1, legR)}

        {/* cou → tête */}
        <group position={[0, L.neckY, 0]}>
          {slots.neck}
          <group ref={neck}>
          <group ref={headBone}>
            <group position={[0, L.headY, 0]}>
              <mesh geometry={headGeo} castShadow receiveShadow>
                <Wool maps={headMaps} p={p} />
              </mesh>
              <Fuzz geometry={headGeo} maps={headMaps} p={p} zip={zipBand} />
              {/* Fermeture éclair à l'arrière du crâne : ruban, dents et
                  curseur fusionnés, languette sur ressort (voir `zip.tsx`). */}
              <Batched deps={batchDeps}>
                <Zip p={p} />
              </Batched>
              <Batched deps={batchDeps}>{slots.head}</Batched>

              {style === 'locks' ? (
                <group ref={locksGroup}>
                <Locks
                  anchors={locks.anchors}
                  length={hair.length}
                  radius={hair.thickness}
                  segments={hair.segments}
                  color={hair.color}
                  tipColor={hair.tipColor}
                  tipped={hair.tipped}
                  cord={cord}
                  skullRadius={locks.skullRadius}
                  spring={{
                    stiffness: p.hair.stiffness,
                    drag: p.hair.drag,
                    gravity: p.hair.gravity,
                  }}
                />
                </group>
              ) : null}
              {style !== 'locks' && (
                <Hairdo p={p} style={style} color={hair.color} yarn={yarn} braid={cord} />
              )}

              <Batched deps={batchDeps}>
                <Face
                  p={p}
                  look={look}
                  eyes={eyes}
                  wood={wood}
                  lift={lift}
                  mouthLift={mouthLift}
                  stitchDip={stitchDip}
                  fighter={fighter}
                  felt={tone.base}
                />

                {headPins.map((pin, i) => (
                  <Pin
                    key={i}
                    length={pin.length}
                    color={pin.color}
                    position={[pin.pos.x, pin.pos.y, pin.pos.z]}
                    quaternion={pin.quat}
                  />
                ))}
              </Batched>

            </group>
          </group>
          </group>
        </group>
      </group>
      </group>
      </group>
      </group>
      </group>
      </RigContext.Provider>
    </group>
  )
}

function isInside(o: THREE.Object3D, parent: THREE.Object3D) {
  for (let p = o.parent; p; p = p.parent) if (p === parent) return true
  return false
}

const _v = new THREE.Vector3()
const _n = new THREE.Vector3()
const _sm = new THREE.Matrix4()
const _ss = new THREE.Matrix4()

/**
 * Écarte une lame (de `from`, direction unitaire `dir`, longueur `len`) d'une
 * sphère, en la faisant pivoter autour de la main : le point le plus proche
 * du centre est ramené sur la surface. Rien si la main est déjà dedans (une
 * parade devant le visage) — on ne sait pas de quel côté sortir.
 */
function avoidSphere(from: THREE.Vector3, dir: THREE.Vector3, len: number, center: THREE.Vector3, radius: number) {
  _v.subVectors(center, from)
  if (_v.lengthSq() <= radius * radius) return
  const t = Math.max(0, Math.min(len, _v.dot(dir)))
  _n.copy(from).addScaledVector(dir, t).sub(center)
  const d = _n.length()
  if (d >= radius || t < 1e-4) return
  if (d < 1e-5) _n.set(0, 1, 0).addScaledVector(dir, -dir.y)
  _n.normalize()
  // Nouveau point à la surface, la lame repasse par lui.
  dir.copy(center).addScaledVector(_n, radius).sub(from).normalize()
}

const _hand = new THREE.Vector3()
const _dir = new THREE.Vector3()
const _tip = new THREE.Vector3()
const _rootW = new THREE.Vector3()
const _qId = new THREE.Quaternion()
const _legK: Record<number, number> = {}
const _qa = new THREE.Quaternion()
const _qb = new THREE.Quaternion()
const _arr3: number[] = [0, 0, 0]

/**
 * Arme : une épingle de vaudou géante, presque aussi grande que la poupée.
 *
 * La même épingle que celles plantées dans les peluches, à l'échelle d'une
 * arme qu'elle peine à porter : c'est l'objet du monde qui dit « vaudou », et
 * sa disproportion dit le reste. Tige d'acier épaisse et effilée, tête de verre
 * rouge en pommeau, poignée de fil enroulé, perle de bois en garde. Le long
 * de +y depuis la main ; `Doll` l'oriente.
 */
function Weapon({ length, size }: { length: number; size: number }) {
  const shaft = length - size * 0.42
  const steel = <meshStandardMaterial color="#b3aea5" metalness={1} roughness={0.32} />
  const thread = <meshStandardMaterial color="#3a2a22" roughness={0.95} />
  return (
    <group>
      {/* pommeau : la tête de l'épingle, derrière le poing */}
      <mesh position={[0, -size * 0.1, 0]} castShadow>
        <sphereGeometry args={[size * 0.2, 24, 16]} />
        <meshPhysicalMaterial color="#b3261e" roughness={0.18} clearcoat={1} clearcoatRoughness={0.08} />
      </mesh>
      {/* poignée : la tige, gainée de fil */}
      <mesh position={[0, size * 0.2, 0]} castShadow>
        <cylinderGeometry args={[size * 0.055, size * 0.055, size * 0.38, 12]} />
        {thread}
      </mesh>
      {[0.06, 0.16, 0.26, 0.34].map((y) => (
        <mesh key={y} position={[0, size * y, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[size * 0.058, size * 0.014, 6, 16]} />
          {thread}
        </mesh>
      ))}
      {/* garde : une perle de bois */}
      <mesh position={[0, size * 0.42, 0]} castShadow>
        <sphereGeometry args={[size * 0.1, 16, 12]} />
        <meshStandardMaterial color="#8a5a34" roughness={0.6} />
      </mesh>
      {/* tige d'acier, épaisse et effilée jusqu'à la pointe */}
      <mesh position={[0, size * 0.42 + shaft / 2, 0]} castShadow>
        <cylinderGeometry args={[size * 0.008, size * 0.062, shaft, 14]} />
        {steel}
      </mesh>
    </group>
  )
}
