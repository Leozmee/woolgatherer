// Stub de leva pour Node : rend les valeurs par défaut du schéma.
type Any = any
export const folder = (schema: Any) => ({ __folder: schema })
export const button = (fn: Any) => ({ __button: fn })
function flatten(schema: Any, out: Any = {}) {
  for (const [k, v] of Object.entries(schema as Record<string, Any>)) {
    if (v && typeof v === 'object' && '__folder' in v) flatten(v.__folder, out)
    else if (v && typeof v === 'object' && '__button' in v) continue
    else if (v && typeof v === 'object' && 'value' in v) out[k] = v.value
    else out[k] = v
  }
  return out
}
export function useControls(_name: Any, schema: Any) {
  if (typeof schema === 'function') return [flatten(schema()), () => {}]
  return flatten(schema)
}
