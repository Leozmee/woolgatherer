import * as THREE from 'three'
import { limbGirth, torsoPoint } from './surface'
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
    for (let i = 0; i < p.count; i++) {
      const k = limbGirth(taper, upper, lower, clamp(-p.getY(i) / length, 0, 1))
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
 * Main en **moufle**, taillée pour la main **droite** : la paume regarde −x
 * (vers le corps), le pouce part devant (+z). La main gauche est son miroir
 * (échelle −1 en x dans `Doll.tsx`) : une moufle symétrique ne peut ni
 * refermer ses doigts ni poser son pouce **côté paume**, et c'est ce creux
 * entre pouce et doigts repliés qui dira plus tard « elle tient son arme ».
 *
 * Trois pièces, comme une vraie moufle cousue : le revers du poignet, plus
 * large que l'avant-bras qu'il coiffe ; la poche des doigts, coussin plat qui
 * s'élargit et se referme vers la paume au bout ; le pouce, côté paume, pointe
 * en bas et vers l'avant, un peu rentré lui aussi.
 * `r` : rayon de l'ancienne boule (échelle et mise en page), `arm` : rayon de
 * l'avant-bras, que le revers doit couvrir quelle que soit la taille de main.
 */
export function mittenGeometry(r: number, arm: number, lumps: number, lumpScale: number, seed: number) {
  const cuffR = Math.max(r * 0.9, arm * 1.2)
  const cuff = blob(cuffR, r * 0.2, cuffR, [0, r * 0.22, 0], undefined, 0, 2.4)
  const palm = blob(r * 0.48, r * 1.05, r * 0.8, [0, -r * 0.48, 0], (v) => {
    // −1 au poignet, +1 au bout des doigts.
    const t = clamp(-v.y / (r * 1.05), -1, 1)
    v.z *= 1 + 0.12 * t
    // Doigts refermés vers la paume : la courbure croît vers le bout.
    const c = Math.max(0, t)
    v.x -= r * 0.34 * c * c
  }, 0, 3)
  const thumb = blob(r * 0.27, r * 0.52, r * 0.3, [-r * 0.12, -r * 0.24, r * 0.8], (v) => {
    // Bout du pouce rentré vers la paume, lui aussi.
    const c = Math.max(0, -v.y / (r * 0.52))
    v.x -= r * 0.1 * c * c
  }, -0.8)
  const geo = mergeGeometries([cuff, palm, thumb])!
  cuff.dispose()
  palm.dispose()
  thumb.dispose()
  geo.computeVertexNormals()
  return stuff(geo, lumps * r, lumpScale / Math.max(r, 0.05), seed + 31)
}

/**
 * Pied de peluche : semelle plate, talon rond et plus étroit sous la cheville,
 * cou-de-pied qui descend vers une pointe large et **relevée** — un bout
 * retroussé lit « pied » et pas « savon », même de loin. Même bas que
 * l'ancienne boule (`−r`) : la mise en page du sol ne change pas. Tourné un peu
 * vers l'extérieur au montage (`Doll.tsx`).
 */
export function footGeometry(r: number, lumps: number, lumpScale: number, seed: number) {
  const h = r * 0.6
  const geo = blob(r * 0.78, h, r * 1.45, [0, -r + h * 0.45, r * 0.42], (v) => {
    // −1 au talon, +1 à la pointe.
    const f = v.z / (r * 1.45)
    // Semelle : la moitié basse écrasée, presque à plat.
    if (v.y < 0) v.y *= 0.45
    // Talon plus étroit, avant-pied plus large.
    v.x *= 1 + 0.18 * f - 0.08 * Math.max(0, -f)
    // Cou-de-pied : le dessus descend de la cheville vers la pointe.
    if (v.y > 0) v.y *= 1 - 0.42 * Math.max(0, f)
    // Pointe relevée, dessous compris.
    const toe = Math.max(0, f - 0.45) / 0.55
    v.y += r * 0.14 * toe * toe
  }, 0, 2.6)
  geo.computeVertexNormals()
  return stuff(geo, lumps * r * 0.7, lumpScale / Math.max(r, 0.05), seed + 37)
}

// ---------------------------------------------------------------- semelle, coutures

/** Contour du pied à sa plus grande largeur (repère du pied), même formule que `footGeometry`. */
function footOutline(r: number, k: number, n: number) {
  const out: THREE.Vector2[] = []
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    const s = Math.sin(a)
    const c = Math.cos(a)
    const rho = Math.pow(Math.abs(s / 0.78) ** 2.6 + Math.abs(c / 1.45) ** 2.6, -1 / 2.6)
    const f = c * rho / 1.45
    out.push(new THREE.Vector2(s * rho * r * k * (1 + 0.18 * f - 0.08 * Math.max(0, -f)), c * rho * r * k + r * 0.42))
  }
  return out
}

/** Pointe relevée du pied, en hauteur, pour `z` dans le repère du pied (voir `footGeometry`). */
function toeLift(r: number, z: number) {
  const toe = Math.max(0, (z - r * 0.42) / (r * 1.45) - 0.45) / 0.55
  return r * 0.14 * toe * toe
}

/** Semelle : contour (fraction du pied), épaisseur et arrondi, en rayons de pied. */
const SOLE_K = 1
const SOLE_DEPTH = 0.1
const SOLE_BEVEL = 0.04

/**
 * Semelle de feutre : une plaque au contour du pied, un peu en retrait, aux
 * bords arrondis, cambrée avec la pointe. Posée sous la laine, dont le duvet
 * est retiré dessous (`soleCut`) — sans quoi les fibres la traversent, comme
 * sous les pièces cousues.
 */
export function soleGeometry(r: number) {
  const pts = footOutline(r, SOLE_K, 48)
  // Forme dans le plan (x, −z) : après rotation, elle s'étend en z vers l'avant.
  const shape = new THREE.Shape(pts.map((v) => new THREE.Vector2(v.x, -v.y)))
  const bevel = SOLE_BEVEL * r
  const depth = SOLE_DEPTH * r
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 1,
  })
  geo.rotateX(-Math.PI / 2)
  // Bas de la semelle un poil sous celui de la laine (−r) : elle porte la poupée.
  geo.translate(0, -r - r * 0.015 + bevel, 0)
  const pos = geo.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < pos.count; i++) pos.setY(i, pos.getY(i) + toeLift(r, pos.getZ(i)))
  pos.needsUpdate = true
  geo.computeVertexNormals()
  return geo
}

/** Brins de fil fusionnés : chaque point est une Bézier quadratique (bouts, sommet). */
function threads(stitches: [THREE.Vector3, THREE.Vector3, THREE.Vector3][], radius: number) {
  const parts = stitches.map(([a, c, b]) => new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, c, b), 4, radius, 4, false))
  const geo = mergeGeometries(parts)!
  parts.forEach((g) => g.dispose())
  return geo
}

/**
 * Points avant qui cousent la semelle au pied, juste au-dessus du rebord :
 * chaque point entre dans la laine à ses deux bouts (voir CLAUDE.md, « un
 * point de couture se définit par le fait d'entrer dans le tissu »).
 */
export function soleSeamGeometry(r: number, thread: number) {
  const n = 30
  // Sur la tranche du feutre, à mi-hauteur : c'est là qu'on voit une semelle
  // cousue. Sur la laine, le duvet mangeait les points.
  const bottom = -r - r * 0.015
  const y = bottom + (SOLE_DEPTH + SOLE_BEVEL * 2) * r * 0.5
  const ring = footOutline(r, SOLE_K, n * 2)
  const c = new THREE.Vector3(0, 0, r * 0.42)
  const at = (v: THREE.Vector2, lift: number) => {
    const p = new THREE.Vector3(v.x, 0, v.y)
    const d = p.clone().sub(c)
    const len = d.length()
    p.copy(c).addScaledVector(d, (len + SOLE_BEVEL * r + lift) / len)
    p.y = y + toeLift(r, p.z)
    return p
  }
  const out: [THREE.Vector3, THREE.Vector3, THREE.Vector3][] = []
  for (let i = 0; i < n; i++) {
    const a = ring[i * 2]
    const b = ring[(i * 2 + 1) % ring.length]
    const m = new THREE.Vector2().addVectors(a, b).multiplyScalar(0.5)
    out.push([at(a, -thread * 2), at(m, thread * 2), at(b, -thread * 2)])
  }
  return threads(out, thread)
}

/**
 * Surjet du revers de moufle : des points obliques qui passent par-dessus le
 * bord bas du revers, tous penchés du même côté — c'est l'inclinaison
 * régulière qui fait lire « surjet » et non « pointillés ».
 */
export function cuffSeamGeometry(r: number, arm: number, thread: number) {
  const cuffR = Math.max(r * 0.9, arm * 1.2)
  const n = 16
  // Point du revers (superellipsoïde d'exposant 2,4, centre 0,22 r, demi-hauteur
  // 0,2 r) à l'azimut `a` et à la hauteur `y`, décollé de `lift`.
  const ringAt = (a: number, lift: number, y: number) => {
    const s = Math.sin(a)
    const c = Math.cos(a)
    const dy = Math.min(1, Math.abs(y - r * 0.22) / (r * 0.2))
    const rho = cuffR * Math.pow(1 - dy ** 2.4, 1 / 2.4) * Math.pow(Math.abs(s) ** 2.4 + Math.abs(c) ** 2.4, -1 / 2.4)
    return new THREE.Vector3(s * (rho + lift), y, c * (rho + lift))
  }
  const out: [THREE.Vector3, THREE.Vector3, THREE.Vector3][] = []
  const da = ((Math.PI * 2) / n) * 0.45
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    out.push([
      ringAt(a, -thread * 2, r * 0.3),
      ringAt(a + da * 0.5, thread * 3, r * 0.2),
      ringAt(a + da, -thread * 2, r * 0.1),
    ])
  }
  return threads(out, thread)
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
