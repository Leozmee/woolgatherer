// Empreinte des géométries de chaque coupe sur une série de graines :
// détecte toute modification involontaire d'une coupe qu'on croit ne pas toucher.
import { writeFileSync, readFileSync, existsSync } from 'fs'
import { dolls } from './scene'
import { buildHairParts, type HairStyle } from '../src/doll/hairstyles'

const styles = (process.argv[2] ?? 'boucles,meches,chignon,houppette,epars,couettes,queue,nattes,frange').split(',') as HairStyle[]
const file = process.argv[3] ?? '/tmp/hairsim/hash.json'
const mode = process.argv[4] ?? 'check'
const out: Record<string, string> = {}
for (const style of styles) {
  for (const seed of [11, 4413, 777, 2024, 9001, 123, 5555]) {
    for (const p of dolls(seed, 6)) {
      const { out: parts } = buildHairParts(p, style)
      let h = 0
      let n = 0
      for (const list of [parts.yarn, parts.braid, parts.ribbon]) {
        for (const g of list) {
          for (const name of ['position', 'aMover', 'aFree', 'aFling', 'aPhase']) {
            const a = g.attributes[name]
            if (!a) continue
            const arr = a.array as Float32Array
            for (let i = 0; i < arr.length; i++) h = (h * 31 + Math.round(arr[i] * 1e5)) | 0
            n += arr.length
          }
        }
      }
      const mv = parts.movers.map((m) => [m.pivot.x, m.pivot.y, m.dir.x, m.dir.y, m.length, m.cfg.stiffness, m.maxAngle].map((x) => x.toFixed(5)).join(',')).join(';')
      for (let i = 0; i < mv.length; i++) h = (h * 31 + mv.charCodeAt(i)) | 0
      out[`${style}#${p.seed}`] = `${h}:${n}`
    }
  }
}
if (mode === 'save' || !existsSync(file)) {
  writeFileSync(file, JSON.stringify(out))
  console.log('saved', Object.keys(out).length)
} else {
  const ref = JSON.parse(readFileSync(file, 'utf8')) as Record<string, string>
  const diff: Record<string, number> = {}
  for (const k of Object.keys(out)) if (ref[k] !== out[k]) diff[k.split('#')[0]] = (diff[k.split('#')[0]] ?? 0) + 1
  console.log('changed', JSON.stringify(diff), 'of', Object.keys(out).length)
}
