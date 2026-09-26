import * as THREE from 'three'
import { torsoPoint } from './surface'
import type { DollParams } from './params'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { clamp, fbm3 } from '../core/rand'

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

/**
 * Torse : profil partagé avec `onTorso` (voir `torsoPoint`) — effilement,
 * superellipse et sculpture (poitrine, taille, ventre, hanches, dos).
 */
export function torsoGeometry(s: DollParams['shape'], seed: number) {
  const geo = new THREE.SphereGeometry(1, 48, 36)
  const pos = geo.attributes.position as THREE.BufferAttribute
  const v = new THREE.Vector3()

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    // Azimut de la sphère : 0 devant (+z), comme `onTorso`.
    torsoPoint(s, v.y, Math.atan2(v.x, v.z), v)
    pos.setXYZ(i, v.x, v.y, v.z)
  }
  pos.needsUpdate = true

  // Position sur l'ellipsoïde **idéale**, avant bosselage. C'est le repère de
  // `onTorso`, donc celui où sont placées les pièces cousues ; le duvet s'en
  // sert pour se percer sous elles. Lu sur la surface bosselée, le trou
  // dériverait de la pièce de toute l'amplitude des bosses.
  geo.setAttribute('aSmooth', new THREE.Float32BufferAttribute(Float32Array.from(pos.array), 3))

  geo.computeVertexNormals()
  return stuff(geo, s.lumps * s.torsoRadius, s.lumpScale / s.torsoRadius, seed + 7)
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
export function limbGeometry(
  radius: number,
  length: number,
  lumps: number,
  lumpScale: number,
  seed: number,
  taper = 0,
  upper = 0,
  lower = 0,
) {
  const geo = new THREE.CapsuleGeometry(radius, length, 10, 24)
  geo.translate(0, -length * 0.5, 0)
  // Galbe : l'épaisseur varie le long du membre, de l'attache (y = 0) au bout
  // (y = −length). > 0 une massue — le bras d'un gorille —, < 0 un fuseau.
  // Moyenne conservée : le membre ne grossit ni ne maigrit, il change de forme.
  //
  // Galbe musculaire : un renflement sur chaque segment — biceps et avant-bras,
  // cuisse et mollet —, centré de part et d'autre du pli (`JOINT`, 0,5). Il
  // laisse l'articulation plus mince que ses voisins : c'est ce creux qui dit
  // « coude » ou « genou » sur un boudin de laine, bien plus que le pli seul.
  if (taper !== 0 || upper !== 0 || lower !== 0) {
    const p = geo.attributes.position as THREE.BufferAttribute
    const g = (u: number, c: number) => Math.exp(-(((u - c) / 0.16) ** 2))
    for (let i = 0; i < p.count; i++) {
      const u = clamp(-p.getY(i) / length, 0, 1)
      const k = Math.max(0.4, (1 + taper * (u - 0.5)) * (1 + upper * g(u, 0.25) + lower * g(u, 0.74)))
      p.setX(i, p.getX(i) * k)
      p.setZ(i, p.getZ(i) * k)
    }
    p.needsUpdate = true
    geo.computeVertexNormals()
  }
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

/**
 * Coussin déformable : superellipsoïde d'exposant `n` (2 = ellipsoïde, 3 =
 * boîte aux arêtes rondes) mise aux rayons, puis `warp` sur chaque sommet.
 */
function blob(
  rx: number, ry: number, rz: number,
  at: [number, number, number],
  warp?: (v: THREE.Vector3) => void,
  tilt = 0,
  n = 2,
) {
  const geo = new THREE.SphereGeometry(1, 28, 20)
  const pos = geo.attributes.position as THREE.BufferAttribute
  const v = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    const k = Math.pow(Math.abs(v.x) ** n + Math.abs(v.y) ** n + Math.abs(v.z) ** n, -1 / n)
    v.set(v.x * k * rx, v.y * k * ry, v.z * k * rz)
    warp?.(v)
    pos.setXYZ(i, v.x, v.y, v.z)
  }
  if (tilt) geo.rotateX(tilt)
  geo.translate(...at)
  return geo
}

/**
 * Main en **moufle** : une paume aplatie qui pend dans l'axe de l'avant-bras,
 * plus un pouce devant, écarté vers le bas. Une boule ne disait ni « main » ni
 * « tient quelque chose » ; la moufle a un sens (paume côté corps, pouce
 * devant) et le creux entre pouce et paume est l'endroit où se referme une
 * arme. Le pouce est dans le plan médian : la même moufle sert aux deux mains.
 * `r` : rayon de l'ancienne boule, pour garder l'échelle et la mise en page.
 */
export function mittenGeometry(r: number, lumps: number, lumpScale: number, seed: number) {
  // Paume : un coussin plat (aux arêtes rondes, pas un œuf), plus large au
  // bout des doigts qu'au poignet.
  const palm = blob(r * 0.5, r * 1.1, r * 0.8, [0, -r * 0.4, 0], (v) => {
    const t = clamp(-v.y / (r * 1.1), -1, 1)
    v.z *= 1 + 0.1 * t
  }, 0, 3)
  // Pouce attaché haut sur la paume, bien détaché, pointe en bas et vers
  // l'avant : la main pend dans l'axe du bras.
  const thumb = blob(r * 0.3, r * 0.55, r * 0.3, [0, -r * 0.2, r * 0.86], undefined, -0.8)
  const geo = mergeGeometries([palm, thumb])!
  palm.dispose()
  thumb.dispose()
  geo.computeVertexNormals()
  return stuff(geo, lumps * r, lumpScale / Math.max(r, 0.05), seed + 31)
}

/**
 * Pied de peluche : semelle plate, talon sous la cheville, pointe arrondie et
 * un peu plus large devant. Même bas que l'ancienne boule (`−r`) : la mise en
 * page du sol ne change pas.
 */
export function footGeometry(r: number, lumps: number, lumpScale: number, seed: number) {
  const h = r * 0.62
  const geo = blob(r * 0.8, h, r * 1.4, [0, -r + h * 0.5, r * 0.45], (v) => {
    // Semelle : la moitié basse écrasée, presque à plat.
    if (v.y < 0) v.y *= 0.5
    // Avant-pied plus large que le talon, cou-de-pied qui descend vers la pointe.
    const f = v.z / (r * 1.4)
    v.x *= 1 + 0.16 * f
    if (v.y > 0) v.y *= 1 - 0.3 * Math.max(0, f)
  }, 0, 2.6)
  geo.computeVertexNormals()
  return stuff(geo, lumps * r * 0.7, lumpScale / Math.max(r, 0.05), seed + 37)
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
