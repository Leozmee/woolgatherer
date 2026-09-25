import * as THREE from 'three'
import { fbm3 } from '../core/rand'

export type WoodMaps = {
  map: THREE.CanvasTexture
  roughnessMap: THREE.CanvasTexture
  dispose: () => void
}

/**
 * Veinage de bois pour les boutons.
 *
 * Produit en **niveaux de gris** : la teinte vient du `color` du matériau, ce
 * qui permet à un seul veinage de servir le hêtre clair et le noyer sombre sans
 * régénérer quoi que ce soit.
 *
 * Des veines parallèles ondulées plutôt que des cernes concentriques : un
 * bouton est découpé dans une planche, pas dans une rondelle de branche — et à
 * cette taille les cernes lisent comme une cible, pas comme du bois.
 */
export function makeWoodTexture(size: number, seed: number): WoodMaps {
  const grain = document.createElement('canvas')
  grain.width = grain.height = size
  const gctx = grain.getContext('2d')!
  const gImg = gctx.createImageData(size, size)

  const rough = document.createElement('canvas')
  rough.width = rough.height = size
  const rctx = rough.getContext('2d')!
  const rImg = rctx.createImageData(size, size)

  const o = seed * 0.137

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / size) * 100
      const v = (y / size) * 100

      // Ondulation lente de la veine : sans elle les bandes sont trop régulières
      // et le bouton lit comme du tissu rayé.
      const warp = fbm3(u * 0.06 + o, v * 0.02, 0.5, 3)
      const bands = Math.sin(v * 0.55 + warp * 11) * 0.5 + 0.5
      // Grain fin dans le sens de la veine
      const fine = fbm3(u * 0.9 + o, v * 0.22, 3.3, 2)

      const t = Math.min(1, Math.max(0, bands * 0.62 + fine * 0.38))
      const shade = 0.58 + Math.pow(t, 1.35) * 0.42

      const i = (y * size + x) * 4
      const g = Math.round(shade * 255)
      gImg.data[i] = gImg.data[i + 1] = gImg.data[i + 2] = g
      gImg.data[i + 3] = 255

      // Les veines sombres sont plus tendres, donc plus mates.
      const r = Math.round((0.72 - t * 0.24) * 255)
      rImg.data[i] = rImg.data[i + 1] = rImg.data[i + 2] = r
      rImg.data[i + 3] = 255
    }
  }
  gctx.putImageData(gImg, 0, 0)
  rctx.putImageData(rImg, 0, 0)

  const map = new THREE.CanvasTexture(grain)
  map.colorSpace = THREE.SRGBColorSpace
  const roughnessMap = new THREE.CanvasTexture(rough)

  for (const t of [map, roughnessMap]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.anisotropy = 8
  }

  return { map, roughnessMap, dispose: () => { map.dispose(); roughnessMap.dispose() } }
}
