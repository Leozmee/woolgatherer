const fakeCtx = () => new Proxy({} as any, { get: (t, k) => (k in t ? t[k] : () => ({ addColorStop() {} })), set: (t, k, v) => ((t[k] = v), true) })
;(globalThis as any).document = { createElement: () => ({ width: 1, height: 1, style: {}, getContext: () => fakeCtx() }) }
import { useDollParams } from '/home/user/woolgatherer/src/doll/params'
import { applyMorph, boardMorphs } from '/home/user/woolgatherer/src/doll/morph'
import { buildHair, boardHairStyles } from '/home/user/woolgatherer/src/doll/hairstyles'
const { params: base } = useDollParams()
const morphs = boardMorphs(base, 6)
const styles = boardHairStyles(base.seed, 6)
for (let i = 0; i < 6; i++) {
  const p = applyMorph({ ...base, seed: base.seed + i * 137 }, morphs[i].morph)
  if (styles[i] === 'locks') { console.log(i, 'locks'); continue }
  buildHair(p, styles[i])
  const t0 = performance.now(); for (let k = 0; k < 3; k++) buildHair(p, styles[i]); const ms = (performance.now() - t0) / 3
  console.log(i, styles[i], ms.toFixed(0), 'ms')
}
