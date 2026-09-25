import * as THREE from 'three'
import type { Collider } from '../core/springBone'

/**
 * Franges : les mèches de laine qui pendent au bout d'une écharpe.
 *
 * C'est ce qui manquait pour que le bout d'un pan lise comme une écharpe. Une
 * nappe s'arrête forcément sur une arête franche — un ruban coupé aux ciseaux,
 * pas un vêtement. Une écharpe tricotée se termine par les fils de montage,
 * noués en mèches ; l'œil les cherche, et leur absence est ce qui trahissait la
 * bande de tissu.
 *
 * Les mèches ne sont pas simulées : elles sont **dérivées** du bout de la nappe
 * à chaque frame — racine sur le dernier rang, direction qui s'infléchit du sens
 * du tissu vers le poids. Elles suivent donc le pan sans coûter de particules.
 */

/** Quatre coins par section : une mèche est un brin, pas un ruban plat. */
const CORNERS: [number, number][] = [
  [1, 1],
  [-1, 1],
  [-1, -1],
  [1, -1],
]

const _p = new THREE.Vector3()
const _dir = new THREE.Vector3()
const _side = new THREE.Vector3()
const _up = new THREE.Vector3()
const _corner = new THREE.Vector3()
const _out = new THREE.Vector3()

export type FringeEnd = {
  /** Racines, une par mèche, sur le dernier rang de la nappe. */
  roots: THREE.Vector3[]
  /** Sens dans lequel le tissu arrivait au bout. */
  flow: THREE.Vector3
  /** Axe de largeur de la nappe à cet endroit. */
  across: THREE.Vector3
}

export function fringeGeometry(strands: number, segs: number): THREE.BufferGeometry {
  const per = segs + 1
  const idx: number[] = []

  for (let s = 0; s < strands; s++) {
    const base = s * per * 4
    for (let i = 0; i < segs; i++) {
      const a = base + i * 4
      const b = base + (i + 1) * 4
      for (let f = 0; f < 4; f++) {
        const g = (f + 1) % 4
        idx.push(a + f, b + f, b + g, a + f, b + g, a + g)
      }
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3)
    const last = base + segs * 4
    idx.push(last + 2, last + 1, last, last + 3, last + 2, last)
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(strands * per * 4 * 3), 3))
  geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(strands * per * 4 * 2), 2))
  geo.setIndex(idx)
  return geo
}

/**
 * Réécrit toutes les mèches des deux bouts.
 *
 * `spread` et `lengths` viennent de la graine : des mèches de longueur et
 * d'écart identiques lisent comme un peigne, pas comme de la laine nouée.
 */
export function writeFringe(
  geo: THREE.BufferGeometry,
  ends: readonly FringeEnd[],
  segs: number,
  width: number,
  lengths: readonly number[],
  spread: readonly number[],
  gravity: THREE.Vector3,
  /** Le corps : une mèche libre traverse la jambe sans ça. */
  colliders: readonly Collider[],
  texelUnit: number,
  withUv: boolean,
  /** Sol (`n·p ≥ d`) : la traîne de l'écharpe est couchée, ses mèches aussi. */
  floor?: { n: THREE.Vector3; d: number } | null,
) {
  const pos = geo.attributes.position as THREE.BufferAttribute
  const uv = geo.attributes.uv as THREE.BufferAttribute
  const total = pos.count
  let strand = 0
  let vert = 0

  for (const end of ends) {
    for (let r = 0; r < end.roots.length; r++) {
      const total = lengths[strand % lengths.length]
      const step = total / segs
      _p.copy(end.roots[r])
      _dir.copy(end.flow).normalize()
      _dir.addScaledVector(end.across, spread[strand % spread.length]).normalize()

      for (let i = 0; i <= segs; i++) {
        const t = i / segs

        // Les mèches ne sont pas simulées, mais elles doivent quand même sortir
        // du corps : un pan tombe le long d'une jambe, et les brins de son bout
        // la traversaient de part en part.
        for (const c of colliders) {
          _out.subVectors(_p, c.center)
          const d = _out.length()
          if (d > 1e-6 && d < c.radius) _p.copy(c.center).addScaledVector(_out, c.radius / d)
        }
        // Au sol, la mèche se couche au lieu de s'y enfoncer : tirée par le
        // poids, elle le traversait jusqu'à sa pointe.
        if (floor) {
          const under = floor.d + width - floor.n.dot(_p)
          if (under > 0) _p.addScaledVector(floor.n, under)
        }
        // Le brin s'amincit vers le bout : une mèche d'épaisseur constante lit
        // comme un tube.
        const hw = width * (1 - 0.32 * t) * 0.5

        _side.copy(end.across).normalize()
        _up.crossVectors(_dir, _side)
        if (_up.lengthSq() < 1e-8) _up.set(0, 0, 1)
        _up.normalize()

        for (let k = 0; k < 4; k++) {
          const [a, b] = CORNERS[k]
          _corner.copy(_p).addScaledVector(_side, a * hw).addScaledVector(_up, b * hw)
          pos.setXYZ(vert, _corner.x, _corner.y, _corner.z)
          // Longueur du brin sur `v`, circonférence sur `u` — la même loi que
          // la nappe. Dans l'autre sens le brin traverse trois périodes de côte
          // dans sa longueur : il sort zébré en travers, comme une chenille, au
          // lieu de montrer les rangs empilés d'un fil retors. Le décalage par
          // mèche évite que toutes prélèvent le même liseré de la tuile.
          if (withUv) {
            uv.setXY(
              vert,
              (k === 0 || k === 3 ? (hw * 2) / texelUnit : 0) + ((strand * 0.37) % 1),
              (t * total) / texelUnit + ((strand * 0.61) % 1),
            )
          }
          vert++
        }

        // La mèche quitte le tissu dans son sens puis tombe : c'est cette
        // inflexion progressive qui lui donne l'air pendante et non plantée.
        // La dérive latérale est **réappliquée** à chaque pas : appliquée une
        // seule fois au départ, elle est aussitôt absorbée par le rappel vers le
        // poids et toutes les mèches redeviennent parallèles.
        const sp = spread[strand % spread.length]
        _dir.lerp(gravity, 0.5)
        _dir.addScaledVector(end.across, sp * 0.18)
        // Ondulation propre à chaque mèche : un brin parfaitement droit lit
        // comme un fil de fer, pas comme de la laine.
        // Ondulation hélicoïdale : une vague dans le plan du brin **et** une en
        // travers. Une seule composante donne un brin plié comme une tôle ; les
        // deux ensemble donnent la torsade d'un fil de laine.
        _dir.addScaledVector(_up, Math.sin(t * 9 + sp * 9) * 0.15)
        _dir.addScaledVector(_side, Math.cos(t * 9 + sp * 7) * 0.09)
        _dir.normalize()
        _p.addScaledVector(_dir, step)
      }
      strand++
    }
  }

  // Le maillage est taillé pour le **maximum** de mèches réglable : il ne peut
  // pas changer de taille quand on bouge le curseur. Celles qui restent sont
  // repliées sur un point — dégénérées, donc invisibles — plutôt que laissées à
  // zéro, où elles dessineraient des triangles jusqu'à l'origine.
  const last = Math.max(0, vert - 1)
  const cx = pos.getX(last)
  const cy = pos.getY(last)
  const cz = pos.getZ(last)
  for (let i = vert; i < total; i++) pos.setXYZ(i, cx, cy, cz)

  pos.needsUpdate = true
  if (withUv) uv.needsUpdate = true
  geo.computeVertexNormals()
  geo.computeBoundingSphere()
}
