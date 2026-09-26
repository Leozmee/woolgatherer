import type { DollParams } from './params'
import { hipX as hipAt, shoulderX as shoulderAt } from './surface'

/**
 * Taille d'une main ou d'un pied, relative au patron : galbe du membre (le
 * bout d'une massue est plus gros) × échelle propre. Plafonnée : les deux se
 * cumulaient chez le gorille jusqu'à des poings de la taille du tronc.
 */
export function tipScale(taper: number | undefined, scale: number | undefined) {
  return Math.min(1.45, Math.max(0.6, 1 + (taper ?? 0) * 0.5) * (scale ?? 1))
}

/**
 * Hauteur verticale d'une jambe au repos. Genou fléchi de θ : la cuisse avance
 * de θ/2 et le tibia recule d'autant, le pied reste sous la hanche et la
 * jambe perd `1 − cos(θ/2)` de sa hauteur.
 */
export function legDrop(lb: DollParams['limbs']) {
  return lb.legLength * Math.cos((lb.kneeRest ?? 0) * 0.5)
}

/**
 * Positions d'ancrage de la poupée, dérivées des paramètres.
 *
 * Partagé entre le modèle et la scène : l'ombre de contact doit rester sous les
 * pieds même quand on change les proportions au curseur.
 */
export type Layout = ReturnType<typeof dollLayout>

export function dollLayout(p: DollParams) {
  const R = p.shape.headRadius
  const headH = R * p.shape.headSquash
  const torsoH = p.shape.torsoHeight

  const neckY = torsoH * 0.44
  const headY = headH * 0.78
  const shoulderY = torsoH * 0.28
  const shoulderX = shoulderAt(p.shape)
  const hipY = -torsoH * 0.36
  const hipX = hipAt(p.shape)

  const top = neckY + headY + headH
  // Pied : centre 0,3 rayon sous le bout de la jambe, rayon 1,3 × galbe ×
  // échelle ; plus la marge du duvet. 2,2 rayons pour le pied du patron.
  const footK = tipScale(p.limbs.legTaper, p.limbs.footScale)
  const bottom = hipY - legDrop(p.limbs) - p.limbs.legRadius * (0.9 + 1.3 * footK)
  const centerY = (top + bottom) * 0.5

  return {
    headH,
    neckY,
    headY,
    shoulderY,
    shoulderX,
    hipY,
    hipX,
    centerY,
    /** Y du sol dans l'espace monde, une fois la poupée recentrée. */
    floorY: bottom - centerY,
    height: top - bottom,
  }
}
