import { useFrame, useThree } from '@react-three/fiber'

/** Programmes déjà retenus : une marque par programme, pas un compteur par image. */
const pinned = new WeakSet<object>()

/**
 * Garde en vie tous les shaders compilés.
 *
 * three libère un programme dès que plus aucune matière ne s'en sert. Or une
 * planche n'a pas toujours les mêmes variantes : sans poupée à locks, le
 * programme des locks est libéré, et la planche suivante qui en montre une le
 * recompile — mesuré, une image figée d'une seconde à chaque retour d'une
 * variante. Il n'y en a qu'une vingtaine en tout : on les garde toutes, en
 * comptant un utilisateur de plus pour chacune, une fois pour toutes.
 */
export function KeepPrograms() {
  const gl = useThree((s) => s.gl)
  useFrame(() => {
    for (const program of gl.info.programs ?? []) {
      if (pinned.has(program)) continue
      pinned.add(program)
      ;(program as unknown as { usedTimes: number }).usedTimes++
    }
  })
  return null
}
