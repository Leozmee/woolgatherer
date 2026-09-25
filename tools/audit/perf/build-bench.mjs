// Bundle le banc Node en bouchonnant leva / react / R3F / canvas, sans toucher au dépôt.
import * as esbuild from '/home/user/woolgatherer/node_modules/esbuild/lib/main.js'
import fs from 'node:fs'

const SRC = '/home/user/woolgatherer/src/'
const HERE = '/tmp/claude-0/-home-user-woolgatherer/f4102224-be96-5acf-8a3b-e16b299294c9/scratchpad/perf/'
const REACT = '/home/user/woolgatherer/node_modules/react/index.js'

const mocks = {
  leva: `
    const val = (schema) => {
      const out = {}
      for (const [k, v] of Object.entries(schema)) {
        if (v && typeof v === 'object' && v.__folder) Object.assign(out, val(v.__folder))
        else if (v && typeof v === 'object' && 'value' in v) out[k] = v.value
        else if (v && typeof v === 'object' && v.__button) {}
        else out[k] = v
      }
      return out
    }
    export const folder = (s) => ({ __folder: s })
    export const button = () => ({ __button: true })
    export const useControls = (name, s) => typeof s === 'function' ? [val(s()), () => {}] : val(s)
    export const Leva = () => null
  `,
  react: `
    import R from '${REACT}'
    export default R
    export const useMemo = (f) => f()
    export const useCallback = (f) => f
    export const useRef = (init) => { const r = { current: init }; (globalThis.__refs ??= []).push(r); return r }
    export const useEffect = (f) => { (globalThis.__effects ??= []).push(f) }
    export const useLayoutEffect = (f) => { (globalThis.__effects ??= []).push(f) }
    export const useContext = () => globalThis.__ctx ?? null
    export const useState = (i) => [typeof i === 'function' ? i() : i, () => {}]
    export const createContext = R.createContext
    export const Component = R.Component
  `,
  r3f: `
    export const useFrame = (cb, prio) => { (globalThis.__frames ??= []).push(cb) }
    export const useThree = () => ({})
  `,
  knit: `
    import * as THREE from 'three'
    export function makeKnitMaps() { return { map: new THREE.Texture(), normalMap: new THREE.Texture(), roughnessMap: new THREE.Texture(), dispose() {} } }
    export function tiled(t) { return t }
    export function makeCanvas() { return globalThis.document.createElement('canvas') }
    export function heightToNormal() {}
  `,
}

const plugin = {
  name: 'mocks',
  setup(b) {
    b.onResolve({ filter: /^leva$/ }, () => ({ path: 'leva', namespace: 'mock' }))
    b.onResolve({ filter: /^react$/ }, (a) => (a.importer.startsWith(SRC) || a.importer.startsWith(HERE) ? { path: 'react', namespace: 'mock' } : undefined))
    b.onResolve({ filter: /^@react-three\/fiber$/ }, (a) => (a.importer.startsWith(SRC) ? { path: 'r3f', namespace: 'mock' } : undefined))
    b.onResolve({ filter: /core\/knit$/ }, () => ({ path: 'knit', namespace: 'mock' }))
    b.onLoad({ filter: /.*/, namespace: 'mock' }, (a) => ({ contents: mocks[a.path], loader: 'js', resolveDir: '/home/user/woolgatherer' }))
    // Exports supplémentaires, en mémoire seulement.
    b.onLoad({ filter: /doll\/scarf\.tsx$/ }, (a) => ({
      contents: fs.readFileSync(a.path, 'utf8') + '\nexport { restGrid as __restGrid, bodyColliders as __scarfColliders, ROWS as __ROWS, COLS as __COLS, RCOLS as __RCOLS }\n',
      loader: 'tsx',
    }))
    b.onLoad({ filter: /doll\/traits\.tsx$/ }, (a) => ({
      contents: fs.readFileSync(a.path, 'utf8') + '\nexport { Necklace as __Necklace }\n',
      loader: 'tsx',
    }))
  },
}

await esbuild.build({
  entryPoints: [HERE + (process.argv[2] ?? 'bench') + '.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: HERE + (process.argv[2] ?? 'bench') + '.mjs',
  jsx: 'automatic',
  nodePaths: ['/home/user/woolgatherer/node_modules'],
  define: { 'import.meta.env.DEV': 'false', 'process.env.NODE_ENV': '"production"' },
  plugins: [plugin],
  logLevel: 'warning',
})
console.log('built')
