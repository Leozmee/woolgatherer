import * as THREE from 'three'
import { fbm3 } from '../core/rand'

/**
 * Bosselle une géométrie le long de ses normales.
 * C'est ce qui distingue une sphère lisse d'un volume rembourré à la main.
 */
export function stuff(geo: THREE.BufferGeometry, amount: number, scale: number, seed: number) {
  if (amount <= 0) return geo
  const pos = geo.attributes.position as THREE.BufferAttribute
  const nor = geo.attributes.normal as THREE.BufferAttribute
  const v = new THREE.Vector3()
  const n = new THREE.Vector3()
  const o = seed * 13.37

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    n.fromBufferAttribute(nor, i)
    const d = fbm3(v.x * scale + o, v.y * scale + o, v.z * scale + o, 3) - 0.5
    v.addScaledVector(n, d * amount)
    pos.setXYZ(i, v.x, v.y, v.z)
  }
  pos.needsUpdate = true
  geo.computeVertexNormals()
  return geo
}

/**
 * Crâne bouffi : ovale (plus large en bas) **plus** un renflement de bajoues.
 *
 * Le renflement est une gaussienne — c'est ce qui distingue une tête gonflée
 * d'une simple sphère élargie : l'ovale pousse le menton, la gaussienne pousse
 * les joues.
 *
 * Sa position et sa largeur décident de tout. Haute et large, elle aplatit le
 * crâne en soucoupe ; basse et resserrée, elle creuse des bajoues de hamster
 * sous une calotte restée ronde.
 */
export function headGeometry(
  radius: number,
  egg: number,
  squash: number,
  puff: number,
  cheekY: number,
  cheekSpread: number,
  lumps: number,
  lumpScale: number,
  seed: number,
) {
  const geo = new THREE.SphereGeometry(1, 64, 44)
  const pos = geo.attributes.position as THREE.BufferAttribute
  const v = new THREE.Vector3()

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    const t = (v.y + 1) * 0.5 // 0 en bas, 1 en haut
    const oval = 1 + egg * (1 - t) - egg * 0.45 * t
    // Pondération latérale : plein sur les côtés, atténué devant et derrière.
    // Un renflement purement radial fabrique un anneau — donc une jupe évasée,
    // pas des bajoues. Le hamster a deux lobes, pas une collerette.
    const lat = (v.x * v.x) / (v.x * v.x + v.z * v.z + 1e-6)
    const cheek = 1 + puff * (0.4 + 0.6 * lat) * Math.exp(-Math.pow((v.y - cheekY) / cheekSpread, 2))
    const w = oval * cheek
    pos.setXYZ(i, v.x * w * radius, v.y * squash * radius, v.z * w * radius * 0.96)
  }
  pos.needsUpdate = true
  geo.computeVertexNormals()
  return stuff(geo, lumps * radius, lumpScale / radius, seed)
}

/** Torse en poire : épaules resserrées, base élargie. */
export function torsoGeometry(radius: number, height: number, taper: number, lumps: number, lumpScale: number, seed: number) {
  const geo = new THREE.SphereGeometry(1, 48, 36)
  const pos = geo.attributes.position as THREE.BufferAttribute
  const v = new THREE.Vector3()

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    const t = (v.y + 1) * 0.5
    const w = 1 + (taper - 1) * t
    pos.setXYZ(i, v.x * w * radius, v.y * height * 0.5, v.z * w * radius * 0.86)
  }
  pos.needsUpdate = true

  // Position sur l'ellipsoïde **idéale**, avant bosselage. C'est le repère de
  // `onTorso`, donc celui où sont placées les pièces cousues ; le duvet s'en
  // sert pour se percer sous elles. Lu sur la surface bosselée, le trou
  // dériverait de la pièce de toute l'amplitude des bosses.
  geo.setAttribute('aSmooth', new THREE.Float32BufferAttribute(Float32Array.from(pos.array), 3))

  geo.computeVertexNormals()
  return stuff(geo, lumps * radius, lumpScale / radius, seed + 7)
}

/**
 * Membre pendant depuis son pivot : la calotte haute dépasse au-dessus de y=0
 * pour que l'articulation reste enfouie dans le torse.
 *
 * ⚠️ `CapsuleGeometry` (three r171) ne pose aucun segment intermédiaire le long
 * du fût : son profil de révolution n'a de points que sur les deux calottes, si
 * bien que toute la longueur du membre est couverte par un seul pas de `v` et
 * que la texture s'y étire en traînées verticales. On réattribue donc `v` à
 * partir de la hauteur réelle du sommet — l'interpolation redevient linéaire et
 * la maille garde sa taille sur toute la longueur.
 */
export function limbGeometry(radius: number, length: number, lumps: number, lumpScale: number, seed: number) {
  const geo = new THREE.CapsuleGeometry(radius, length, 10, 24)
  geo.translate(0, -length * 0.5, 0)
  remapVerticalUV(geo)
  return stuff(geo, lumps * radius * 0.8, lumpScale / Math.max(radius, 0.05), seed + 19)
}

/** Redistribue la coordonnée `v` proportionnellement à la hauteur du sommet. */
function remapVerticalUV(geo: THREE.BufferGeometry) {
  const pos = geo.attributes.position as THREE.BufferAttribute
  const uv = geo.attributes.uv as THREE.BufferAttribute
  let min = Infinity
  let max = -Infinity
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i)
    if (y < min) min = y
    if (y > max) max = y
  }
  const span = max - min || 1
  for (let i = 0; i < pos.count; i++) uv.setY(i, (pos.getY(i) - min) / span)
  uv.needsUpdate = true
}

/** Main ou pied : une boule un peu plus grosse que le membre, façon moufle. */
export function tipGeometry(radius: number, lumps: number, lumpScale: number, seed: number) {
  const geo = new THREE.SphereGeometry(radius, 24, 18)
  return stuff(geo, lumps * radius, lumpScale / Math.max(radius, 0.05), seed + 31)
}

/** Une mèche de laine : tube le long d'une courbe qui part du crâne et retombe. */
export function strandGeometry(
  origin: THREE.Vector3,
  dir: THREE.Vector3,
  length: number,
  radius: number,
  droop: number,
) {
  const p0 = origin.clone()
  const p1 = origin.clone().addScaledVector(dir, length * 0.45)
  const p2 = origin.clone().addScaledVector(dir, length * 0.8)
  p2.y -= length * droop * 0.5
  const p3 = origin.clone().addScaledVector(dir, length)
  p3.y -= length * droop

  const curve = new THREE.CatmullRomCurve3([p0, p1, p2, p3])
  return new THREE.TubeGeometry(curve, 12, radius, 6, false)
}
