import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { useMemo, useRef, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import { SpringBone, type Collider, type SpringConfig } from '../core/springBone'
import { useDisposableList } from '../core/useDisposable'
import type { CordMaps } from '../core/cord'
import { mulberry32 } from '../core/rand'

const DOWN = new THREE.Vector3(0, -1, 0)

export type LockAnchor = {
  position: THREE.Vector3
  /** Oriente le -Y local du lock vers sa direction de repos. */
  quaternion: THREE.Quaternion
  /** Variation de longueur d'un lock à l'autre. */
  scale: number
}

/**
 * Locks en ficelle, articulés.
 *
 * Chaque lock est une **chaîne** de segments imbriqués, un spring bone par
 * segment. L'imbrication suffit à propager le mouvement : quand un segment
 * pivote, la pose de repos de son enfant se déplace dans le monde et le ressort
 * de l'enfant réagit avec retard. D'où le fouetté en bout de mèche, qu'un os
 * unique ne peut pas produire.
 */
export function Locks({
  anchors,
  length,
  radius,
  segments,
  color,
  tipColor,
  tipped,
  cord,
  spring,
  skullRadius,
}: {
  anchors: LockAnchor[]
  length: number
  radius: number
  segments: number
  color: string
  /** Teinte du bout des mèches décolorées. */
  tipColor?: string
  /** Indices des mèches dont le bout s'éclaircit — voir `hairLook`. */
  tipped?: number[]
  cord: CordMaps
  spring: SpringConfig
  /** Rayon de la sphère de collision du crâne, en unités locales. */
  skullRadius: number
}) {
  const segLen = length / segments

  // Une géométrie par rang de segment : le lock s'affine vers la pointe.
  //
  // Chaque segment porte sa propre rotule, fusionnée dans la géométrie plutôt
  // que rendue à part : sans elle, chaque flexion ouvre un angle net entre deux
  // cylindres et la mèche paraît cassée en deux. La fusion évite de doubler le
  // nombre d'appels de rendu — on est déjà à des centaines avec les coques.
  const geos = useDisposableList(() => {
    return Array.from({ length: segments }, (_, i) => {
      const top = radius * (1 - (i / segments) * 0.55)
      const bottom = radius * (1 - ((i + 1) / segments) * 0.55)

      // Légèrement plus long que le pas : les segments s'interpénètrent, aucun
      // liseré de fond ne peut apparaître au joint.
      const body = new THREE.CylinderGeometry(top, bottom, segLen * 1.05, 12, 1)
      body.translate(0, -segLen * 0.525, 0)
      const joint = new THREE.SphereGeometry(top * 1.02, 12, 8)

      const merged = mergeGeometries([body, joint])
      body.dispose()
      joint.dispose()
      return merged ?? new THREE.CylinderGeometry(top, bottom, segLen, 12, 1)
    })
  }, [radius, segLen, segments])

  const tipGeo = useDisposableList(
    () => [new THREE.SphereGeometry(radius * 0.45 * 1.05, 10, 8)],
    [radius],
  )
  const rootGeo = useDisposableList(
    () => [new THREE.SphereGeometry(radius * 1.15, 12, 10)],
    [radius],
  )

  const bones = useRef<THREE.Group[][]>([])
  const springs = useRef<SpringBone[][] | null>(null)
  const key = `${anchors.length}|${segments}|${segLen}`
  const lastKey = useRef('')

  // Repère posé à l'origine du groupe parent — c'est-à-dire au centre du crâne,
  // puisque les locks sont rendus dans le groupe de la tête. Il donne la
  // position monde du collider sans avoir à remonter la hiérarchie.
  const skull = useRef<THREE.Object3D>(null!)
  // Réutilisé à chaque segment : pas d'allocation dans la boucle de rendu.
  const cfg = useRef<SpringConfig>({ stiffness: 0, drag: 0, gravity: 0 }).current
  const collider = useRef<Collider>({ center: new THREE.Vector3(), radius: skullRadius })

  useFrame((_, dt) => {
    if (!springs.current || lastKey.current !== key) {
      springs.current = bones.current.map((chain) =>
        chain.filter(Boolean).map((b) => new SpringBone(b, segLen, DOWN)),
      )
      lastKey.current = key
    }

    skull.current.getWorldPosition(collider.current.center)
    collider.current.radius = skullRadius

    // Parent avant enfant : sinon l'enfant lit une pose de repos d'une frame
    // en retard et la chaîne se met à onduler toute seule.
    for (const chain of springs.current) {
      const n = chain.length
      for (let i = 0; i < n; i++) {
        // Raideur dégressive, poids croissant le long de la mèche.
        //
        // Une raideur uniforme donne une antenne : la chaîne entière tient la
        // direction d'émergence. En raidissant la racine et en alourdissant la
        // pointe, le lock sort franchement du crâne puis retombe — le
        // comportement d'une vraie dreadlock.
        const t = n === 1 ? 0 : i / (n - 1)
        // Rampe volontairement **plate**.
        //
        // Une rampe marquée oppose un segment raide à un segment mou : toute la
        // flexion se concentre sur ce joint et la mèche casse en coude. Et la
        // raideur elle-même est ce qui donne l'effet ressort — un ressort tendu
        // vers une pose de repos droite oscille. Un tissu qui tombe n'a pas de
        // pose de repos : il pend. On garde donc juste ce qu'il faut de rappel
        // pour que la racine tienne sa direction d'implantation, et la gravité
        // fait le reste, amortie par un `drag` élevé.
        const e = t * t * (3 - 2 * t)
        cfg.stiffness = spring.stiffness * (1 - e * 0.4)
        cfg.drag = spring.drag
        cfg.gravity = spring.gravity * (0.7 + e * 0.7)
        chain[i].update(dt, cfg, collider.current)
      }
    }
  })

  /**
   * Teinte d'un segment.
   *
   * Le lock est déjà une chaîne de meshes, un par segment : le dégradé se pose
   * donc segment par segment, sans texture ni couleurs de sommet. Il ne part
   * pas de la racine mais du **tiers** de la mèche — une décoloration qui
   * commence au cuir chevelu lit comme une autre laine, pas comme un bout
   * éclairci.
   */
  const dipped = useMemo(() => new Set(tipped ?? []), [tipped])
  const tint = useMemo(() => {
    const root = new THREE.Color(color)
    const tip = new THREE.Color(tipColor ?? color)
    return Array.from({ length: segments + 1 }, (_, si) => {
      const u = THREE.MathUtils.clamp((si / Math.max(1, segments - 1) - 0.34) / 0.66, 0, 1)
      return `#${root.clone().lerp(tip, u * u * (3 - 2 * u)).getHexString()}`
    })
  }, [color, tipColor, segments])

  const chain = (li: number, si: number): ReactNode => {
    if (si >= segments) return null
    const c = dipped.has(li) ? tint[si] : color
    return (
      <group
        ref={(el) => {
          if (!el) return
          ;(bones.current[li] ??= [])[si] = el
        }}
      >
        <mesh geometry={geos[si]} castShadow>
          <meshPhysicalMaterial
            map={cord.map}
            normalMap={cord.normalMap}
            roughnessMap={cord.roughnessMap}
            color={c}
            roughness={1}
            metalness={0}
            sheen={0.8}
            sheenColor="#fff2dd"
            sheenRoughness={0.75}
          />
        </mesh>
        {si === segments - 1 && (
          <mesh geometry={tipGeo[0]} position={[0, -segLen, 0]} castShadow>
            <meshPhysicalMaterial
              map={cord.map}
              color={dipped.has(li) ? tint[segments] : color}
              roughness={0.95}
              metalness={0}
            />
          </mesh>
        )}
        <group position={[0, -segLen, 0]}>{chain(li, si + 1)}</group>
      </group>
    )
  }

  return (
    <>
      <object3D ref={skull} />
      {anchors.map((a, li) => (
        <group key={li} position={a.position} quaternion={a.quaternion} scale={a.scale}>
          {/* Nœud de racine : ferme le joint entre le cuir chevelu et le
              premier segment, quelle que soit l'orientation du ressort. */}
          <mesh geometry={rootGeo[0]} castShadow>
            <meshPhysicalMaterial map={cord.map} color={color} roughness={0.95} metalness={0} />
          </mesh>
          {chain(li, 0)}
        </group>
      ))}
    </>
  )
}

/**
 * Points d'implantation sur l'ellipsoïde du crâne.
 *
 * `widthAt` est fourni par l'appelant plutôt que recalculé ici : c'est le même
 * profil que la géométrie de la tête, bajoues comprises. Le dupliquer ferait
 * flotter les locks au-dessus des joues dès que les proportions changent.
 */
export function useLockAnchors(
  count: number,
  seed: number,
  headRadius: number,
  squash: number,
  widthAt: (sy: number, lateral: number) => number,
  droop: number,
  /**
   * Enfouissement de la racine sous le cuir chevelu.
   *
   * C'est ce qui fait qu'un lock **sort** du crâne au lieu d'être posé dessus :
   * son premier segment part de l'intérieur et traverse la surface. Posée sur
   * le scalp, la racine lit toujours comme une perruque, quelle que soit
   * l'orientation.
   */
  sink: number,
  /** Dégagement de la sphère de collision au-dessus de la surface. */
  clearance: number,
  /** Hauteur normalisée du bas de la zone d'implantation (1 = sommet). */
  crown: number,
) {
  return useMemo(() => {
    const random = mulberry32(seed + 101)
    const out: LockAnchor[] = []
    let minSurface = Infinity
    // Répartition en spirale d'or plutôt qu'aléatoire.
    //
    // Tirer l'azimut au hasard laisse des paquets et des trous — inévitable à
    // 14 tirages. L'angle d'or ne repasse jamais au même endroit, et comme une
    // bande sphérique a une aire proportionnelle à sa hauteur, avancer d'un pas
    // constant en `sy` couvre la calotte uniformément. Un léger bruit suffit
    // ensuite à casser la régularité mécanique.
    const GOLDEN = Math.PI * (3 - Math.sqrt(5))
    const span = Math.max(0.02, 0.985 - crown)

    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count
      const az = i * GOLDEN + random() * 0.25
      const sy = crown + (t + (random() - 0.5) * 0.7 / count) * span
      const ring = Math.sqrt(Math.max(0, 1 - sy * sy))
      const dx = Math.sin(az) * ring
      const dz = Math.cos(az) * ring
      const lateral = (dx * dx) / (dx * dx + dz * dz + 1e-6)

      const w = widthAt(sy, lateral)
      const rx = w * headRadius
      const ry = squash * headRadius
      const rz = w * headRadius * 0.96

      const position = new THREE.Vector3(dx * rx, sy * ry, dz * rz)
      const normal = new THREE.Vector3(
        position.x / (rx * rx),
        position.y / (ry * ry),
        position.z / (rz * rz),
      ).normalize()

      // Direction de repos : la **ligne de plus grande pente de la surface**,
      // pas la verticale.
      //
      // Deux impasses avant d'y arriver. Viser le bas fait pointer dans le
      // crâne dès qu'on est au sommet : le ressort tire dedans, le collider
      // rejette, le lock se fige en épi. Viser la normale le fait sortir
      // perpendiculairement comme une corne, et la racine paraît décollée même
      // si elle est bien attachée. La tangente descendante — la verticale
      // projetée sur le plan tangent — part couchée sur le cuir chevelu puis
      // suit naturellement la courbure.
      const tangent = DOWN.clone().addScaledVector(normal, -DOWN.dot(normal))
      if (tangent.lengthSq() < 1e-4) {
        // Au pôle exact la projection s'annule : on repart dans l'azimut du lock.
        tangent.set(dx, 0, dz)
      }
      tangent.normalize()

      const dir = normal
        .clone()
        .multiplyScalar(1 - droop)
        .addScaledVector(tangent, droop)
        .normalize()

      // Le collider se cale sur la **surface**, mesurée avant enfouissement.
      minSurface = Math.min(minSurface, position.length())
      position.addScaledVector(normal, -sink)

      out.push({
        position,
        quaternion: new THREE.Quaternion().setFromUnitVectors(DOWN, dir),
        // Écart de longueur d'une mèche à l'autre. Resserré : à 0,75–1,30 il
        // valait un facteur 1,73, davantage que la marge d'une poupée à
        // l'autre — le bruit interne couvrait le signal, et les six têtes
        // paraissaient de la même longueur malgré des coupes différentes.
        scale: 0.85 + random() * 0.35,
      })
    }

    // Rayon de collision : la surface du crâne, plus un léger dégagement.
    //
    // Il doit être **supérieur** à la racine enfouie, c'est ce qui force le
    // premier segment à ressortir. L'écart (enfouissement + dégagement) doit
    // rester petit devant la longueur d'un segment : au-delà, la contrainte
    // n'a plus de solution oblique et tous les locks se dressent en épis.
    // L'appelant borne `sink` en conséquence.
    const surface = Number.isFinite(minSurface) ? minSurface : headRadius
    const skullRadius = surface + clearance

    if (import.meta.env.DEV) {
      const d = out.map((a) => a.position.length())
      console.info(
        `[locks] ${out.length} racines à ${Math.min(...d).toFixed(3)}–${Math.max(...d).toFixed(3)}, surface ${surface.toFixed(3)}, collider ${skullRadius.toFixed(3)}`,
      )
    }

    return { anchors: out, skullRadius }
  }, [count, seed, headRadius, squash, widthAt, droop, sink, clearance, crown])
}
