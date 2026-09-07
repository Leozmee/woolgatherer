import * as THREE from 'three'

/**
 * Maillage d'une nappe de tissu simulée (voir `ClothSheet`).
 *
 * Deux couches — endroit et envers — décalées de part et d'autre de la nappe le
 * long de sa normale, plus une tranche qui fait le tour. C'est ce qui distingue
 * un tissu d'un plan : on voit son épaisseur sur la tranche des pans, et les
 * deux faces s'éclairent séparément quand le tissu se vrille.
 *
 * L'épaisseur est **dérivée** de la nappe, jamais simulée : simuler deux nappes
 * couplées coûterait le double pour un gain nul à cette échelle.
 */

const _du = new THREE.Vector3()
const _dv = new THREE.Vector3()
const _n = new THREE.Vector3()
const _mid = new THREE.Vector3()
const _a = new THREE.Vector3()
const _b = new THREE.Vector3()

/** Alloue la nappe. Le maillage ne change plus ensuite : seules les positions
 *  sont réécrites à chaque frame. */
export function sheetGeometry(rows: number, cols: number): THREE.BufferGeometry {
  const n = rows * cols
  const idx: number[] = []
  const at = (i: number, j: number) => i * cols + j

  for (let i = 0; i < rows - 1; i++) {
    for (let j = 0; j < cols - 1; j++) {
      const a = at(i, j)
      const b = at(i, j + 1)
      const c = at(i + 1, j + 1)
      const d = at(i + 1, j)
      idx.push(a, c, b, a, d, c)
      idx.push(n + a, n + b, n + c, n + a, n + c, n + d)
    }
  }

  // Tranche : les quatre bords, cousus de l'endroit à l'envers.
  for (let i = 0; i < rows - 1; i++) {
    const a = at(i, 0)
    const b = at(i + 1, 0)
    idx.push(b, a, n + a, b, n + a, n + b)
    const c = at(i, cols - 1)
    const d = at(i + 1, cols - 1)
    idx.push(c, d, n + d, c, n + d, n + c)
  }
  for (let j = 0; j < cols - 1; j++) {
    const a = at(0, j)
    const b = at(0, j + 1)
    idx.push(a, b, n + b, a, n + b, n + a)
    const c = at(rows - 1, j)
    const d = at(rows - 1, j + 1)
    idx.push(d, c, n + c, d, n + c, n + d)
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 2 * 3), 3))
  geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2 * 2), 2))
  geo.setIndex(idx)
  return geo
}

/**
 * Écrit les UV une bonne fois pour toutes, depuis la pose de repos.
 *
 * `acrossU` et `alongV` sont des **longueurs monde** divisées par la taille
 * d'une tuile : c'est la seule façon d'obtenir des mailles de la même taille
 * partout. `alongV` en particulier suit la longueur d'arc réelle.
 *
 * L'orientation compte autant que l'échelle : la **largeur** de l'écharpe va sur
 * u et sa **longueur** sur v, pour que les rangs de mailles s'empilent le long
 * du tissu comme sur une vraie écharpe tricotée bout à bout. L'inverse couche
 * les mailles sur le flanc et la nappe lit comme de la toile de jute.
 *
 * Figées au repos, elles suivent ensuite le tissu — la maille se tend et se plie
 * avec lui au lieu de glisser dessus.
 */
export function writeSheetUv(
  geo: THREE.BufferGeometry,
  rows: number,
  cols: number,
  acrossU: number[],
  alongV: number[],
  /**
   * Épaisseur du tissu en tuiles, appliquée à la couche du dessous.
   *
   * Les deux couches portant les mêmes UV, chaque quad de la tranche était
   * **dégénéré en UV** : toute l'épaisseur échantillonnait une seule ligne de
   * texels, étirée, et le bord lisait comme un aplat. Le décalage va sur `v` et
   * non sur `u` : en `u` il désaccorderait les côtes peintes de la face arrière
   * des côtes géométriques ; en `v` il ne vaut qu'une fraction de rang.
   */
  backV = 0,
) {
  const n = rows * cols
  const uv = geo.attributes.uv as THREE.BufferAttribute
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const k = i * cols + j
      uv.setXY(k, acrossU[j], alongV[i])
      uv.setXY(n + k, acrossU[j], alongV[i] + backV)
    }
  }
  uv.needsUpdate = true
}

/**
 * Interpole une rangée simulée sur les colonnes de rendu (Catmull-Rom).
 *
 * La grille simulée est volontairement grossière — chaque colonne coûte des
 * particules et des contraintes — mais dix colonnes facettent visiblement le
 * roulé des bords, et surtout elles ne peuvent pas porter les côtes : six côtes
 * échantillonnées sur dix points, c'est du repliement, pas des nervures. La
 * subdivision se fait donc au **rendu**, où elle ne coûte que des sommets.
 */
function rowAt(
  points: readonly THREE.Vector3[],
  base: number,
  simCols: number,
  x: number,
  out: THREE.Vector3,
) {
  const i = Math.min(simCols - 1, Math.max(0, Math.floor(x)))
  const t = x - i
  const at = (k: number) => points[base + Math.min(simCols - 1, Math.max(0, k))]
  const p0 = at(i - 1)
  const p1 = at(i)
  const p2 = at(i + 1)
  const p3 = at(i + 2)
  const t2 = t * t
  const t3 = t2 * t
  out.set(0, 0, 0)
    .addScaledVector(p0, 0.5 * (-t + 2 * t2 - t3))
    .addScaledVector(p1, 0.5 * (2 - 5 * t2 + 3 * t3))
    .addScaledVector(p2, 0.5 * (t + 4 * t2 - 3 * t3))
    .addScaledVector(p3, 0.5 * (-t2 + t3))
}

/**
 * Reporte les positions simulées sur les deux couches.
 *
 * `rib` module la demi-épaisseur colonne par colonne : les nervures sont alors
 * de vrais bourrelets, qui s'ombrent entre eux et découpent le bord du bout en
 * festons. Une normal map seule ne fait ni l'un ni l'autre — elle n'a pas de
 * silhouette.
 */
export function writeSheet(
  geo: THREE.BufferGeometry,
  points: readonly THREE.Vector3[],
  rows: number,
  simCols: number,
  cols: number,
  /** Tampon de travail, `rows * cols * 3` : la nappe interpolée. */
  mid: Float32Array,
  thickness: number,
  rib: Float32Array,
  ribBump: number,
) {
  const n = rows * cols
  const pos = geo.attributes.position as THREE.BufferAttribute
  const ht = thickness * 0.5
  const span = (simCols - 1) / (cols - 1)

  for (let i = 0; i < rows; i++) {
    const base = i * simCols
    for (let j = 0; j < cols; j++) {
      rowAt(points, base, simCols, j * span, _mid)
      const k = (i * cols + j) * 3
      mid[k] = _mid.x
      mid[k + 1] = _mid.y
      mid[k + 2] = _mid.z
    }
  }

  const get = (i: number, j: number, out: THREE.Vector3) => {
    const k = (i * cols + j) * 3
    return out.set(mid[k], mid[k + 1], mid[k + 2])
  }

  for (let i = 0; i < rows; i++) {
    const im = Math.max(0, i - 1)
    const ip = Math.min(rows - 1, i + 1)
    for (let j = 0; j < cols; j++) {
      const jm = Math.max(0, j - 1)
      const jp = Math.min(cols - 1, j + 1)
      get(i, j, _mid)
      _du.subVectors(get(ip, j, _a), get(im, j, _b))
      _dv.subVectors(get(i, jp, _a), get(i, jm, _b))
      _n.crossVectors(_du, _dv)
      if (_n.lengthSq() < 1e-14) _n.set(0, 0, 1)
      else _n.normalize()

      const h = ht * (1 + ribBump * rib[j])
      const k = i * cols + j
      pos.setXYZ(k, _mid.x + _n.x * h, _mid.y + _n.y * h, _mid.z + _n.z * h)
      pos.setXYZ(n + k, _mid.x - _n.x * h, _mid.y - _n.y * h, _mid.z - _n.z * h)
    }
  }

  pos.needsUpdate = true
  geo.computeVertexNormals()
  geo.computeBoundingSphere()
}
