const fakeCtx = () => new Proxy({} as any, { get: (t, k) => (k in t ? t[k] : () => ({ addColorStop() {} })), set: (t, k, v) => ((t[k] = v), true) })
;(globalThis as any).document = { createElement: () => ({ width: 1, height: 1, style: {}, getContext: () => fakeCtx() }) }
import { useDollParams } from '/home/user/woolgatherer/src/doll/params'
import { applyMorph, boardMorphs } from '/home/user/woolgatherer/src/doll/morph'
import { TRAITS, boardHair, boardTones } from '/home/user/woolgatherer/src/doll/traits'
import { boardFaces } from '/home/user/woolgatherer/src/doll/face'
import { boardHairStyles } from '/home/user/woolgatherer/src/doll/hairstyles'
const { params: base } = useDollParams()
const t = (name: string, f: () => unknown) => { f(); const t0 = performance.now(); for (let i = 0; i < 5; i++) f(); console.log(name, ((performance.now() - t0) / 5).toFixed(2), 'ms') }
t('boardTones', () => boardTones(base.seed, 6))
t('boardHair', () => boardHair(base.seed, 6))
t('boardMorphs', () => boardMorphs(base, 6))
t('boardFaces', () => boardFaces(base.seed, 6))
t('boardHairStyles', () => boardHairStyles(base.seed, 6))
