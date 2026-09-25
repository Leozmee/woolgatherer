// Rastériseur logiciel minimal : z-buffer, normales interpolées, paliers de
// lumière et trait sur la dérivée seconde de la profondeur. Sert à juger la
// géométrie des coupes sans navigateur.
import * as THREE from 'three'
import { deflateSync } from 'zlib'
import { writeFileSync } from 'fs'

export type Mesh = { geo: THREE.BufferGeometry; color: [number, number, number]; flat?: boolean }
export type View = { yaw: number; pitch: number; cx: number; cy: number; cz: number; half: number }

export class Canvas {
  rgb: Uint8Array
  constructor(public W: number, public H: number, bg: [number, number, number] = [240, 236, 228]) {
    this.rgb = new Uint8Array(W * H * 3)
    for (let i = 0; i < W * H; i++) this.rgb.set(bg, i * 3)
  }
  save(path: string) {
    const { W, H } = this
    const raw = Buffer.alloc((W * 3 + 1) * H)
    for (let y = 0; y < H; y++) {
      raw[y * (W * 3 + 1)] = 0
      Buffer.from(this.rgb.buffer, y * W * 3, W * 3).copy(raw, y * (W * 3 + 1) + 1)
    }
    const chunk = (type: string, data: Buffer) => {
      const len = Buffer.alloc(4)
      len.writeUInt32BE(data.length)
      const td = Buffer.concat([Buffer.from(type), data])
      const crc = Buffer.alloc(4)
      crc.writeUInt32BE(crc32(td) >>> 0)
      return Buffer.concat([len, td, crc])
    }
    const ihdr = Buffer.alloc(13)
    ihdr.writeUInt32BE(W, 0)
    ihdr.writeUInt32BE(H, 4)
    ihdr[8] = 8
    ihdr[9] = 2
    writeFileSync(
      path,
      Buffer.concat([
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        chunk('IHDR', ihdr),
        chunk('IDAT', deflateSync(raw)),
        chunk('IEND', Buffer.alloc(0)),
      ]),
    )
  }
  /** Texte minuscule : un rectangle par caractère serait illisible, on marque seulement. */
  mark(x: number, y: number, w: number, h: number, c: [number, number, number]) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (i >= 0 && j >= 0 && i < this.W && j < this.H) this.rgb.set(c, (j * this.W + i) * 3)
  }
}

let CRC: Int32Array | null = null
function crc32(b: Buffer) {
  if (!CRC) {
    CRC = new Int32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      CRC[n] = c
    }
  }
  let c = -1
  for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8)
  return c ^ -1
}

const L = new THREE.Vector3(-0.35, 0.6, 0.72).normalize()

/** Rend des maillages dans un rectangle du canevas. */
export function render(cv: Canvas | null, meshes: Mesh[], v: View, ox: number, oy: number, w: number, h: number) {
  const z = new Float32Array(w * h).fill(-Infinity)
  const nb = new Float32Array(w * h * 3)
  const cb = new Uint8Array(w * h * 3)
  const id = new Int32Array(w * h).fill(-1)
  const rot = new THREE.Matrix4().makeRotationX(v.pitch).multiply(new THREE.Matrix4().makeRotationY(v.yaw))
  const nrot = new THREE.Matrix3().setFromMatrix4(rot)
  const s = h / 2 / v.half
  const P = new THREE.Vector3()
  const N = new THREE.Vector3()
  meshes.forEach((m, mi) => {
    const pos = m.geo.attributes.position as THREE.BufferAttribute
    if (!m.geo.attributes.normal) m.geo.computeVertexNormals()
    const nor = m.geo.attributes.normal as THREE.BufferAttribute
    const n = pos.count
    const sx = new Float32Array(n)
    const sy = new Float32Array(n)
    const sz = new Float32Array(n)
    const vn = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      P.fromBufferAttribute(pos, i)
      P.x -= v.cx
      P.y -= v.cy
      P.z -= v.cz
      P.applyMatrix4(rot)
      sx[i] = w / 2 + P.x * s
      sy[i] = h / 2 - P.y * s
      sz[i] = P.z
      N.fromBufferAttribute(nor, i).applyMatrix3(nrot).normalize()
      vn[i * 3] = N.x
      vn[i * 3 + 1] = N.y
      vn[i * 3 + 2] = N.z
    }
    const idx = m.geo.index
    const T = idx ? idx.count / 3 : n / 3
    for (let t = 0; t < T; t++) {
      const a = idx ? idx.getX(t * 3) : t * 3
      const b = idx ? idx.getX(t * 3 + 1) : t * 3 + 1
      const c = idx ? idx.getX(t * 3 + 2) : t * 3 + 2
      const x0 = Math.max(0, Math.floor(Math.min(sx[a], sx[b], sx[c])))
      const x1 = Math.min(w - 1, Math.ceil(Math.max(sx[a], sx[b], sx[c])))
      const y0 = Math.max(0, Math.floor(Math.min(sy[a], sy[b], sy[c])))
      const y1 = Math.min(h - 1, Math.ceil(Math.max(sy[a], sy[b], sy[c])))
      if (x0 > x1 || y0 > y1) continue
      const area = (sx[b] - sx[a]) * (sy[c] - sy[a]) - (sx[c] - sx[a]) * (sy[b] - sy[a])
      if (Math.abs(area) < 1e-9) continue
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const px = x + 0.5
          const py = y + 0.5
          let w0 = ((sx[b] - px) * (sy[c] - py) - (sx[c] - px) * (sy[b] - py)) / area
          let w1 = ((sx[c] - px) * (sy[a] - py) - (sx[a] - px) * (sy[c] - py)) / area
          let w2 = 1 - w0 - w1
          if (w0 < 0 || w1 < 0 || w2 < 0) continue
          const zz = w0 * sz[a] + w1 * sz[b] + w2 * sz[c]
          const k = y * w + x
          if (zz <= z[k]) continue
          z[k] = zz
          id[k] = mi
          let nx = w0 * vn[a * 3] + w1 * vn[b * 3] + w2 * vn[c * 3]
          let ny = w0 * vn[a * 3 + 1] + w1 * vn[b * 3 + 1] + w2 * vn[c * 3 + 1]
          let nz = w0 * vn[a * 3 + 2] + w1 * vn[b * 3 + 2] + w2 * vn[c * 3 + 2]
          const l = Math.hypot(nx, ny, nz) || 1
          nb[k * 3] = nx / l
          nb[k * 3 + 1] = ny / l
          nb[k * 3 + 2] = nz / l
          cb.set(m.color, k * 3)
          void w2
        }
      }
    }
  })
  const pix = 1 / s
  if (!cv) return id
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const k = y * w + x
      if (z[k] === -Infinity) continue
      const nx = nb[k * 3]
      const ny = nb[k * 3 + 1]
      const nz = nb[k * 3 + 2]
      const d = Math.max(0, nx * L.x + ny * L.y + nz * L.z)
      const lvl = d > 0.5 ? 1 : d > 0.18 ? 0.78 : 0.58
      const rim = 1 - 0.35 * Math.pow(1 - Math.max(0, nz), 3)
      const f = lvl * rim
      // Trait : bord du sujet, ou dérivée seconde de la profondeur.
      let ink = false
      const zl = x > 0 ? z[k - 1] : -Infinity
      const zr = x < w - 1 ? z[k + 1] : -Infinity
      const zu = y > 0 ? z[k - w] : -Infinity
      const zd = y < h - 1 ? z[k + w] : -Infinity
      if (zl === -Infinity || zr === -Infinity || zu === -Infinity || zd === -Infinity) ink = true
      else if (Math.abs(zl + zr - 2 * z[k]) > pix * 3 || Math.abs(zu + zd - 2 * z[k]) > pix * 3) ink = true
      const o = ((oy + y) * cv.W + ox + x) * 3
      if (ink) {
        cv.rgb[o] = cb[k * 3] * 0.3
        cv.rgb[o + 1] = cb[k * 3 + 1] * 0.25
        cv.rgb[o + 2] = cb[k * 3 + 2] * 0.25
      } else {
        cv.rgb[o] = Math.min(255, cb[k * 3] * f)
        cv.rgb[o + 1] = Math.min(255, cb[k * 3 + 1] * f)
        cv.rgb[o + 2] = Math.min(255, cb[k * 3 + 2] * f)
      }
    }
  }
  return id
}
