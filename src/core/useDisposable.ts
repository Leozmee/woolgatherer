import { useEffect, useMemo } from 'react'

type Disposable = { dispose: () => void }

/**
 * Mémoïse une ressource GPU et la libère quand les dépendances changent.
 *
 * Indispensable ici : les curseurs leva redéclenchent le rendu à chaque pixel
 * de glissement. Sans libération, faire varier « bosses » fabriquerait une
 * géométrie de 64x44 par frame et saturerait la mémoire en quelques secondes.
 */
export function useDisposable<T extends Disposable>(factory: () => T, deps: unknown[]): T {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const value = useMemo(factory, deps)
  useEffect(() => () => value.dispose(), [value])
  return value
}

export function useDisposableList<T extends Disposable>(factory: () => T[], deps: unknown[]): T[] {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const value = useMemo(factory, deps)
  useEffect(() => () => value.forEach((v) => v.dispose()), [value])
  return value
}
