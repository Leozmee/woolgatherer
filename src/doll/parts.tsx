import * as THREE from 'three'
import { useMemo } from 'react'
import type { WoodMaps } from './wood'

type ThreadProps = {
  length: number
  radius: number
  color: string
  position?: [number, number, number]
  rotation?: [number, number, number]
  /**
   * Enfoncement des deux bouts sous le plan du groupe, le long de −Z.
   *
   * Un brin droit posé à altitude constante ne coud rien : ses deux bouts
   * s'arrêtent en l'air au-dessus de la laine, et le duvet est trop troué pour
   * les cacher. C'est le **plongeon** qui dit « cousu », pas la passe. Le
   * sommet de l'arc reste exactement là où était l'axe du cylindre : on
   * enfonce les bouts, on ne relève rien.
   */
  dip?: number
}

/** Un brin de fil, orienté le long de son axe Y local. */
export function Thread({ length, radius, color, position, rotation, dip = 0 }: ThreadProps) {
  // Bézier quadratique : avec les bouts à −dip et le point de contrôle à +dip,
  // le milieu retombe pile sur zéro. Une seule expression, pas de réglage.
  const curve = useMemo(
    () =>
      dip > 0
        ? new THREE.QuadraticBezierCurve3(
            new THREE.Vector3(0, -length * 0.5, -dip),
            new THREE.Vector3(0, 0, dip),
            new THREE.Vector3(0, length * 0.5, -dip),
          )
        : null,
    [length, dip],
  )

  return (
    <mesh position={position} rotation={rotation} castShadow>
      {curve ? (
        <tubeGeometry args={[curve, 8, radius, 6, false]} />
      ) : (
        <cylinderGeometry args={[radius, radius, length, 6]} />
      )}
      <meshPhysicalMaterial color={color} roughness={0.7} sheen={0.6} sheenRoughness={0.5} />
    </mesh>
  )
}

/** Point de croix : deux brins qui se croisent. Le motif de suture de la poupée. */
export function CrossStitch({
  size,
  radius,
  color,
  position,
  rotation,
  dip,
}: {
  size: number
  radius: number
  color: string
  position?: [number, number, number]
  rotation?: [number, number, number]
  /** Enfoncement des quatre bouts sous la peau — voir `Thread`. */
  dip?: number
}) {
  return (
    <group position={position} rotation={rotation}>
      <Thread length={size} radius={radius} color={color} dip={dip} rotation={[0, 0, Math.PI * 0.28]} />
      <Thread length={size} radius={radius} color={color} dip={dip} rotation={[0, 0, -Math.PI * 0.28]} />
    </group>
  )
}

/**
 * Œil-bouton. Le groupe regarde vers +Z ; c'est au parent de l'orienter.
 * Les trous sont des disques sombres posés juste devant la face : à cette
 * échelle ça lit comme un perçage, sans payer une opération booléenne.
 */
export function ButtonEye({
  radius,
  color,
  threadColor,
  threadRadius,
  wood,
}: {
  radius: number
  color: string
  threadColor: string
  threadRadius: number
  /** Veinage en niveaux de gris ; la teinte vient de `color`. */
  wood: WoodMaps
}) {
  const thickness = radius * 0.24
  const holeOffset = radius * 0.32
  const holeR = radius * 0.13
  const front = thickness * 0.5
  const holes: [number, number][] = [
    [-holeOffset, holeOffset],
    [holeOffset, holeOffset],
    [-holeOffset, -holeOffset],
    [holeOffset, -holeOffset],
  ]

  return (
    <group>
      {/* corps du bouton — bois verni, pas plastique : vernis léger
          (clearcoat 0.25) et rugosité pilotée par le veinage, sinon le bouton
          brille uniformément et redevient de la résine. */}
      <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[radius, radius * 0.97, thickness, 40]} />
        <meshPhysicalMaterial
          map={wood.map}
          roughnessMap={wood.roughnessMap}
          color={color}
          roughness={1}
          metalness={0}
          clearcoat={0.25}
          clearcoatRoughness={0.4}
          sheen={0}
        />
      </mesh>

      {/* biseau du bord */}
      <mesh position={[0, 0, front * 0.55]}>
        <torusGeometry args={[radius * 0.9, thickness * 0.28, 8, 40]} />
        <meshPhysicalMaterial
          map={wood.map}
          roughnessMap={wood.roughnessMap}
          color={color}
          roughness={1}
          clearcoat={0.25}
          clearcoatRoughness={0.4}
        />
      </mesh>

      {/* trous */}
      {holes.map(([x, y], i) => (
        <mesh key={i} position={[x, y, front + 0.0008]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[holeR, holeR, 0.001, 12]} />
          <meshBasicMaterial color="#140f0b" />
        </mesh>
      ))}

      {/* fil croisé entre les trous opposés */}
      <group position={[0, 0, front + threadRadius * 0.9]}>
        <Thread
          length={holeOffset * 2.55}
          radius={threadRadius}
          color={threadColor}
          rotation={[0, 0, Math.PI * 0.25]}
        />
        <Thread
          length={holeOffset * 2.55}
          radius={threadRadius}
          color={threadColor}
          rotation={[0, 0, -Math.PI * 0.25]}
        />
      </group>
    </group>
  )
}

/**
 * Teinte de tête d'épingle, tirée dans la roue plutôt que piochée dans une
 * liste : deux épingles voisines n'ont jamais la même couleur.
 */
export function pinColor(rnd: () => number): string {
  const c = new THREE.Color().setHSL(rnd(), 0.52 + rnd() * 0.3, 0.34 + rnd() * 0.16)
  return `#${c.getHexString()}`
}

/**
 * Décale une teinte autour de sa valeur d'origine.
 *
 * On part de la couleur du panneau plutôt que d'une palette figée : le réglage
 * garde son sens — il fixe la famille — et la graine ne fait que varier à
 * l'intérieur.
 */
export function jitterColor(hex: string, rnd: () => number, amount = 1): string {
  const c = new THREE.Color(hex)
  const hsl = { h: 0, s: 0, l: 0 }
  c.getHSL(hsl)
  c.setHSL(
    (hsl.h + (rnd() - 0.5) * 0.14 * amount + 1) % 1,
    THREE.MathUtils.clamp(hsl.s + (rnd() - 0.5) * 0.4 * amount, 0.03, 0.85),
    // La clarté doit suivre `amount` comme les deux autres canaux. Laissée
    // libre, elle variait de 0.55 à 1.5x même pour un décalage censé être
    // discret, et la laine du corps virait au jaune délavé.
    THREE.MathUtils.clamp(hsl.l * (1 + (rnd() - 0.5) * 0.9 * amount), 0.08, 0.86),
  )
  return `#${c.getHexString()}`
}

/**
 * Épingle plantée : tige métal + tête colorée, le long de son axe Y local.
 * L'orientation arrive en quaternion, car elle est dérivée d'une normale de
 * surface — pas d'angles d'Euler à reconstruire.
 */
export function Pin({
  length,
  color,
  position,
  quaternion,
}: {
  length: number
  color: string
  position: [number, number, number]
  quaternion: THREE.Quaternion
}) {
  return (
    <group position={position} quaternion={quaternion}>
      <mesh position={[0, length * 0.5, 0]} castShadow>
        <cylinderGeometry args={[length * 0.022, length * 0.012, length, 8]} />
        <meshStandardMaterial color="#b9b4ab" metalness={1} roughness={0.28} />
      </mesh>
      <mesh position={[0, length * 1.02, 0]} castShadow>
        <sphereGeometry args={[length * 0.11, 16, 12]} />
        <meshPhysicalMaterial color={color} roughness={0.25} clearcoat={1} clearcoatRoughness={0.1} />
      </mesh>
    </group>
  )
}
