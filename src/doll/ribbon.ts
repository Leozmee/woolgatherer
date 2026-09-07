import * as THREE from 'three'

/**
 * Bandes de tissu balayées le long d'un tracé.
 *
 * Un tube ne peut pas faire une écharpe : quelle que soit la façon dont on
 * l'aplatit, il garde une section constante et lit comme un boudin. Une bande a
 * une **largeur** et une **épaisseur** distinctes, et sa largeur doit s'orienter
 * toute seule — à plat contre le corps quand elle fait le tour du cou, et de
 * face quand elle retombe.
 *
 * L'axe de largeur est donc calculé en chaque point comme `tangente × radiale`,
 * la radiale étant la direction qui s'éloigne de l'axe vertical du corps. Cette
 * règle unique couvre les deux cas sans transition à écrire.
 */

const _tangent = new THREE.Vector3()
const _radial = new THREE.Vector3()
const _across = new THREE.Vector3()
const _corner = new THREE.Vector3()

/** Quatre coins par section : la bande est un volume, pas un ruban sans épaisseur. */
const CORNERS: [number, number][] = [
  [1, 1],
  [-1, 1],
  [-1, -1],
  [1, -1],
]

/**
 * Alloue une bande de `samples` sections, remplie ensuite par `writeBand`.
 *
 * Séparer l'allocation de l'écriture permet de déformer la bande à chaque frame
 * sans rien réallouer — c'est ce qui rend possible un pan d'écharpe animé qui
 * reste un ruban continu, et non une file de blocs articulés.
 */
export function bandGeometry(samples: number): THREE.BufferGeometry {
  const indices: number[] = []
  for (let i = 0; i < samples - 1; i++) {
    const a = i * 4
    const b = (i + 1) * 4
    for (let f = 0; f < 4; f++) {
      const g = (f + 1) % 4
      indices.push(a + f, b + f, b + g, a + f, b + g, a + g)
    }
  }
  // Bouchons aux deux extrémités : sans eux on voit l'intérieur de la bande.
  indices.push(0, 1, 2, 0, 2, 3)
  const last = (samples - 1) * 4
  indices.push(last + 2, last + 1, last, last + 3, last + 2, last)

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(samples * 4 * 3), 3))
  geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(samples * 4 * 2), 2))
  geo.setIndex(indices)
  return geo
}

/**
 * Écrit les sections de la bande le long de `path`.
 *
 * `texelUnit` est le nombre d'unités monde couvertes par une tuile de texture :
 * les UV se calculent depuis la **longueur d'arc réelle**, seule façon d'obtenir
 * la même taille de maille que sur le corps. Une répétition arbitraire donne un
 * tissu dont les mailles n'ont plus rien à voir avec celles de la peluche.
 */
export function writeBand(
  geo: THREE.BufferGeometry,
  path: THREE.Vector3[],
  width: number,
  thickness: number,
  texelUnit: number,
  /** À false, les UV du premier appel sont conservées — évite qu'elles glissent
   *  d'une frame à l'autre sur une bande animée. */
  withUv = true,
) {
  const n = path.length
  const pos = geo.attributes.position as THREE.BufferAttribute
  const uv = geo.attributes.uv as THREE.BufferAttribute
  const hw = width * 0.5
  const ht = thickness * 0.5
  const vAcross = width / texelUnit

  let arc = 0
  for (let i = 0; i < n; i++) {
    const p = path[i]
    if (i > 0) arc += p.distanceTo(path[i - 1])

    _tangent.subVectors(path[Math.min(n - 1, i + 1)], path[Math.max(0, i - 1)])
    if (_tangent.lengthSq() < 1e-12) _tangent.set(0, -1, 0)
    _tangent.normalize()

    _radial.set(p.x, 0, p.z)
    if (_radial.lengthSq() < 1e-8) _radial.set(0, 0, 1)
    _radial.normalize()

    _across.crossVectors(_tangent, _radial)
    if (_across.lengthSq() < 1e-8) _across.set(1, 0, 0)
    _across.normalize()

    const u = arc / texelUnit
    for (let k = 0; k < 4; k++) {
      const [w, t] = CORNERS[k]
      _corner.copy(p).addScaledVector(_across, w * hw).addScaledVector(_radial, t * ht)
      const idx = i * 4 + k
      pos.setXYZ(idx, _corner.x, _corner.y, _corner.z)
      if (withUv) uv.setXY(idx, u, k === 0 || k === 3 ? vAcross : 0)
    }
  }

  pos.needsUpdate = true
  if (withUv) uv.needsUpdate = true
  geo.computeVertexNormals()
  geo.computeBoundingSphere()
}

/** Bande figée, allouée et remplie en une fois. */
export function sweptBand(
  path: THREE.Vector3[],
  width: number,
  thickness: number,
  texelUnit: number,
): THREE.BufferGeometry {
  const geo = bandGeometry(path.length)
  writeBand(geo, path, width, thickness, texelUnit)
  return geo
}

/** Rééchantillonne une ligne brisée en une courbe lisse de `samples` points. */
export function smoothPath(points: THREE.Vector3[], samples: number): THREE.Vector3[] {
  if (points.length < 2) return points
  return new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.5).getPoints(samples - 1)
}
