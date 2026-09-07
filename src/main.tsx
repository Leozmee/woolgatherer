import { Component, type ReactNode } from 'react'

// Capteur posé au niveau module, donc avant tout rendu : les erreurs levées
// dans l'arbre R3F ne remontent pas jusqu'à la frontière React côté DOM, et
// sans ça elles n'apparaissent nulle part d'exploitable.
if (import.meta.env.DEV) {
  const record = (key: string, value: unknown) => {
    ;(window as unknown as Record<string, unknown>)[key] = value
  }
  window.addEventListener('error', (e) => record('__cap', e.error?.stack ?? String(e.message)))
  window.addEventListener('unhandledrejection', (e) =>
    record('__capRejet', (e.reason as Error)?.stack ?? String(e.reason)),
  )
}
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

/**
 * Sans frontière, une erreur de rendu démonte la racine R3F en silence : la
 * dernière image reste affichée, la boucle est morte, et rien ne le dit. On a
 * perdu plusieurs itérations à régler une physique qui ne tournait plus.
 */
class Boundary extends Component<{ children: ReactNode }, { error: Error | null; stack: string }> {
  state = { error: null as Error | null, stack: '' }

  static getDerivedStateFromError(error: Error) {
    return { error, stack: '' }
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    this.setState({ error, stack: info.componentStack ?? '' })
    ;(window as unknown as Record<string, unknown>).__err = {
      message: error.message,
      stack: info.componentStack,
    }
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <pre id="crash">
        {this.state.error.message}
        {'\n'}
        {this.state.stack}
      </pre>
    )
  }
}

// Pas de StrictMode : son double montage en dev libère les géométries et
// textures que R3F est encore en train d'utiliser.
createRoot(document.getElementById('root')!).render(
  <Boundary>
    <App />
  </Boundary>,
)
