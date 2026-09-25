/** PRNG déterministe : une même graine redonne toujours la même poupée. */
export function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const hash = (n: number) => {
  const s = Math.sin(n) * 43758.5453123
  return s - Math.floor(s)
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/** Bruit de valeur 3D, interpolation smoothstep. Sert aux bosses du rembourrage. */
export function noise3(x: number, y: number, z: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z)
  const fx = x - ix, fy = y - iy, fz = z - iz
  const ux = fx * fx * (3 - 2 * fx)
  const uy = fy * fy * (3 - 2 * fy)
  const uz = fz * fz * (3 - 2 * fz)
  const n = ix + iy * 57 + iz * 113
  return lerp(
    lerp(lerp(hash(n), hash(n + 1), ux), lerp(hash(n + 57), hash(n + 58), ux), uy),
    lerp(lerp(hash(n + 113), hash(n + 114), ux), lerp(hash(n + 170), hash(n + 171), ux), uy),
    uz,
  )
}

/** Bruit fractal : plusieurs octaves, pour des bosses de tailles variées. */
export function fbm3(x: number, y: number, z: number, octaves = 3): number {
  let v = 0, amp = 0.5, freq = 1, norm = 0
  for (let i = 0; i < octaves; i++) {
    v += noise3(x * freq, y * freq, z * freq) * amp
    norm += amp
    amp *= 0.5
    freq *= 2.1
  }
  return v / norm
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
