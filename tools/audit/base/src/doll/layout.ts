import type { DollParams } from './params'

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
  const shoulderX = p.shape.torsoRadius * p.shape.torsoTaper * 0.88
  const hipY = -torsoH * 0.36
  const hipX = p.shape.torsoRadius * 0.44

  const top = neckY + headY + headH
  const bottom = hipY - p.limbs.legLength - p.limbs.legRadius * 2.2
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
