import * as THREE from 'three'
const fakeCtx = () => new Proxy({} as any, { get: (t, k) => (k in t ? t[k] : () => ({ addColorStop() {} })), set: (t, k, v) => ((t[k] = v), true) })
;(globalThis as any).document = { createElement: () => ({ width: 1, height: 1, style: {}, getContext: () => fakeCtx() }) }
import { useDollParams } from '/home/user/woolgatherer/src/doll/params'
import { Scarf } from '/home/user/woolgatherer/src/doll/scarf'
const G = globalThis as any
const { params: p } = useDollParams()
G.__refs = []; G.__frames = []; G.__effects = []; G.__ctx = null
const el: any = Scarf({ p, tint: '#9ab0c8' })
const kids = el.props.children
const sheet = kids[0].props.geometry, shellGeo = kids[1][0].props.geometry
for (const r of G.__refs) if (r.current === null) { r.current = new THREE.Group() }
console.log('avant image', Object.keys(sheet.attributes), Object.keys(shellGeo.attributes))
G.__frames[0]({}, 1 / 60)
console.log('après image', Object.keys(sheet.attributes), Object.keys(shellGeo.attributes), 'rendu: sheet tris', sheet.index.count / 3, 'coques', shellGeo.instanceCount)
