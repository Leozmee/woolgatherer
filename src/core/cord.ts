import * as THREE from 'three'
import { heightToNormal, makeCanvas } from './knit'
import { fbm3 } from './rand'

export type CordMaps = {
  map: THREE.CanvasTexture
  normalMap: THREE.CanvasTexture
  roughnessMap: THREE.CanvasTexture
  dispose: () => void
}

/**
 * Tresse pour les locks.
 *
 * Trois brins qui s'entrelacent, pas une simple torsade : chaque brin oscille
 * en travers du lock et, à chaque croisement, celui qui est en phase avant
 * passe **par-dessus**. C'est cette alternance dessus/dessous qui fait lire une
 * tresse plutôt qu'une corde.
 *
 * Texture volontairement différente de la laine du corps : le contraste est ce
 * qui fait des cheveux une matière à part, et non du corps qui dépasse.
 *
 * Le maillage est un cylindre : `u` fait le tour du lock, `v` court le long.
 */
export function makeCordTexture(
  size: number,
  strands: number,
  turns: number,
  seed: number,
): CordMaps {
  const height = makeCanvas(size)
  const hctx = height.getContext('2d')!
  const hImg = hctx.createImageData(size, size)
  const o = seed * 0.311

  // Amplitude proche d'un intervalle complet : les brins doivent réellement se
  // croiser, sinon on n'obtient qu'une ondulation parallèle.
  const amp = 0.9 / strands
  const halfWidth = 0.58 / strands

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size
      const v = y / size

      let best = 0
      for (let k = 0; k < strands; k++) {
        const phase = v * turns * Math.PI * 2 + (k * Math.PI * 2) / strands
        const uk = k / strands + amp * Math.sin(phase)

        let du = u - uk
        du -= Math.floor(du + 0.5) // distance cyclique dans [-0.5, 0.5)
        const d = Math.abs(du)
        if (d >= halfWidth) continue

        const dome = Math.cos((d / halfWidth) * (Math.PI / 2))
        // cos(phase) > 0 : le brin est du côté visible du croisement.
        const front = Math.cos(phase) * 0.5 + 0.5
        const h = dome * (0.52 + 0.48 * front)
        if (h > best) best = h
      }

      // Fibres échappées, dans le sens de la tresse.
      const fiber = fbm3(u * 80 + o, v * 26, 1.7, 2)
      const hv = Math.min(1, Math.max(0, best * 0.86 + fiber * 0.2))

      const i = (y * size + x) * 4
      const g = Math.round(hv * 255)
      hImg.data[i] = hImg.data[i + 1] = hImg.data[i + 2] = g
      hImg.data[i + 3] = 255
    }
  }
  hctx.putImageData(hImg, 0, 0)

  // Couleur et rugosité dérivées du relief, comme pour la laine : les cartes ne
  // peuvent alors pas diverger.
  const color = makeCanvas(size)
  const cctx = color.getContext('2d')!
  const rough = makeCanvas(size)
  const rctx = rough.getContext('2d')!
  const cImg = cctx.createImageData(size, size)
  const rImg = rctx.createImageData(size, size)

  for (let i = 0; i < cImg.data.length; i += 4) {
    const h = hImg.data[i] / 255
    const shade = Math.round(Math.min(255, (0.4 + h * 0.85) * 255))
    cImg.data[i] = cImg.data[i + 1] = cImg.data[i + 2] = shade
    cImg.data[i + 3] = 255
    const r = Math.round((0.98 - h * 0.2) * 255)
    rImg.data[i] = rImg.data[i + 1] = rImg.data[i + 2] = r
    rImg.data[i + 3] = 255
  }
  cctx.putImageData(cImg, 0, 0)
  rctx.putImageData(rImg, 0, 0)

  const map = new THREE.CanvasTexture(color)
  map.colorSpace = THREE.SRGBColorSpace
  const normalMap = new THREE.CanvasTexture(heightToNormal(height, 2.4))
  const roughnessMap = new THREE.CanvasTexture(rough)

  for (const t of [map, normalMap, roughnessMap]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.anisotropy = 8
  }

  return {
    map,
    normalMap,
    roughnessMap,
    dispose: () => { map.dispose(); normalMap.dispose(); roughnessMap.dispose() },
  }
}

/**
 * Fil retors, pour tout ce qui n'est pas un lock : mèches, boucles, pelotes.
 *
 * Deux à quatre brins qui s'enroulent en hélice. La tresse des locks, elle,
 * fait **croiser** ses brins dessus-dessous : c'est ce qui en fait une tresse.
 * Un fil à tricoter ne croise pas, il vrille — ses brins restent côte à côte
 * et dessinent des diagonales régulières. Deux textures, parce que ce sont
 * deux matières, et c'est leur différence qui distingue une coiffure en
 * dreadlocks d'une coiffure en laine.
 *
 * Maillage attendu : un tube, `u` **le long** du fil (une tuile = un pas de
 * torsion), `v` autour.
 */
export function makeYarnTexture(size: number, plies: number, seed: number): CordMaps {
  const height = makeCanvas(size)
  const hctx = height.getContext('2d')!
  const hImg = hctx.createImageData(size, size)
  const o = seed * 0.173
  const half = 0.5 / plies

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size
      const v = y / size
      // Hélice : le centre du brin k glisse d'un tour complet sur un pas.
      let dv = v - u - Math.floor((v - u) * plies) / plies - half
      dv = Math.abs(dv)
      const dome = Math.cos(Math.min(1, dv / half) * (Math.PI / 2))
      // Fibres dans le sens du brin, donc en diagonale.
      const fiber = fbm3((u + v) * 60 + o, (v - u) * 18, 2.3, 2)
      const hv = Math.min(1, Math.max(0, Math.sqrt(dome) * 0.85 + fiber * 0.25))
      const i = (y * size + x) * 4
      const g = Math.round(hv * 255)
      hImg.data[i] = hImg.data[i + 1] = hImg.data[i + 2] = g
      hImg.data[i + 3] = 255
    }
  }
  hctx.putImageData(hImg, 0, 0)

  const color = makeCanvas(size)
  const cctx = color.getContext('2d')!
  const rough = makeCanvas(size)
  const rctx = rough.getContext('2d')!
  const cImg = cctx.createImageData(size, size)
  const rImg = rctx.createImageData(size, size)
  for (let i = 0; i < cImg.data.length; i += 4) {
    const h = hImg.data[i] / 255
    // Même étage que la tresse (0,45 → 1) : la teinte de la planche est un
    // multiplicateur calibré pour cette plage.
    const shade = Math.round(Math.min(255, (0.45 + h * 0.6) * 255))
    cImg.data[i] = cImg.data[i + 1] = cImg.data[i + 2] = shade
    cImg.data[i + 3] = 255
    const r = Math.round((0.98 - h * 0.18) * 255)
    rImg.data[i] = rImg.data[i + 1] = rImg.data[i + 2] = r
    rImg.data[i + 3] = 255
  }
  cctx.putImageData(cImg, 0, 0)
  rctx.putImageData(rImg, 0, 0)

  const map = new THREE.CanvasTexture(color)
  map.colorSpace = THREE.SRGBColorSpace
  const normalMap = new THREE.CanvasTexture(heightToNormal(height, 2))
  const roughnessMap = new THREE.CanvasTexture(rough)
  for (const t of [map, normalMap, roughnessMap]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.anisotropy = 8
  }
  return {
    map,
    normalMap,
    roughnessMap,
    dispose: () => { map.dispose(); normalMap.dispose(); roughnessMap.dispose() },
  }
}
