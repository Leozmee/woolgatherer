// Audit des visages : plongeon des points, sourcils hors des boutons, croix
// du K.O. sous la peau, bouche ouverte sous le nez. Bundlé par esbuild.
import * as THREE from 'three'
import { boardFaces, eyeSpots, faceLive, EYE_SCALE, type Placed } from '/home/user/woolgatherer/.claude/worktrees/agent-a657050d2e7f6ea8c/src/doll/face'
import { EXPRESSIONS } from '/home/user/woolgatherer/.claude/worktrees/agent-a657050d2e7f6ea8c/src/doll/expression'
import { onHead } from '/home/user/woolgatherer/.claude/worktrees/agent-a657050d2e7f6ea8c/src/doll/surface'
import { applyMorph, boardMorphs } from '/home/user/woolgatherer/.claude/worktrees/agent-a657050d2e7f6ea8c/src/doll/morph'
import { mulberry32 } from '/home/user/woolgatherer/.claude/worktrees/agent-a657050d2e7f6ea8c/src/core/rand'
import { jitterColor } from '/home/user/woolgatherer/.claude/worktrees/agent-a657050d2e7f6ea8c/src/doll/parts'
import type { DollParams } from '/home/user/woolgatherer/.claude/worktrees/agent-a657050d2e7f6ea8c/src/doll/params'

const base = {
  seed: 4413,
  shape: { headRadius: 0.43, headEgg: 0, headPuff: 0.09, headCheekY: -0.6, headCheekSpread: 0.66, headSquash: 1.04, torsoHeight: 0.78, torsoRadius: 0.26, torsoTaper: 0.64, lumps: 0.03, lumpScale: 2 },
  limbs: { armLength: 0.33, armRadius: 0.1, armSpread: 0.95, legLength: 0.38, legRadius: 0.12, legSpread: 0.14 },
  face: { eyeSpacing: 0.29, eyeHeight: 0.04, leftSize: 0.1, rightSize: 0.09, leftColor: '#a3947b', rightColor: '#865936', mouthWidth: 0.24, mouthHeight: -0.16, mouthStitches: 5 },
  thread: { color: '#e5d1c1', mouthColor: '#e5d1c1', radius: 0.01 },
  shell: { count: 14, height: 0.02, density: 2200 },
  board: { gallery: true, light: true, single: 'couture', morph: 1, hairStyle: 'auto' },
} as unknown as DollParams

const stats = {
  dolls: 0,
  poses: 0,
  worstEnd: -Infinity,
  worstEndWhere: '',
  nan: 0,
  browButton: Infinity,
  browButtonWhere: '',
  browTop: -Infinity,
  browGap: Infinity,
  crossEnd: -Infinity,
  noseClear: Infinity,
  noseWhere: '',
}

const height = (p: DollParams, v: THREE.Vector3) => {
  const s = onHead(p, v.x, v.y, 0)
  return v.clone().sub(s.pos).dot(s.normal)
}

function ends(pl: Placed) {
  const dir = new THREE.Vector3(-Math.sin(pl.angle), Math.cos(pl.angle), 0).applyQuaternion(pl.quat)
  const nrm = new THREE.Vector3(0, 0, 1).applyQuaternion(pl.quat)
  return [1, -1].map((k) => pl.pos.clone().addScaledVector(dir, (k * pl.length) / 2).addScaledVector(nrm, -pl.seg.dip))
}

const BOARDS = +(process.argv[2] ?? 150)
for (let b = 0; b < BOARDS; b++) {
  const seed = (b * 7919 + 13) % 10000
  const bp = { ...base, seed } as DollParams
  const morphs = boardMorphs(bp, 6)
  const faces = boardFaces(seed, 6)
  for (let i = 0; i < 6; i++) {
    const p = applyMorph({ ...bp, seed: seed + i * 137 }, morphs[i].morph)
    const s = p.shape
    const rnd = mulberry32(p.seed + 2024)
    const eyes = {
      spacing: p.face.eyeSpacing * (0.88 + rnd() * 0.24),
      leftSize: p.face.leftSize * (0.86 + rnd() * 0.28) * EYE_SCALE,
      rightSize: p.face.rightSize * (0.86 + rnd() * 0.28) * EYE_SCALE,
      leftColor: jitterColor(p.face.leftColor, rnd),
      rightColor: jitterColor(p.face.rightColor, rnd),
    }
    const lift = s.lumps * s.headRadius * 0.7 + 0.004
    const mouthLift = s.lumps * s.headRadius * 0.7
    const stitchDip = mouthLift + s.lumps * s.headRadius * 0.55
    const look = faces[i]
    const spots = eyeSpots(p, eyes, lift)
    const live = faceLive(p, look, eyes, spots, mouthLift, stitchDip)
    stats.dolls++
    const size = (eyes.leftSize + eyes.rightSize) / 2
    const maxSize = Math.max(p.face.leftSize, p.face.rightSize) * EYE_SCALE * 1.14
    live.flat.forEach((flat, k) => {
      stats.poses++
      const name = k === 0 ? look.mood : EXPRESSIONS[k - 1]
      const browL: [number, number][] = []
      const browR: [number, number][] = []
      for (const pl of flat) {
        if (!pl.seg.flush) {
          for (const e of ends(pl)) {
            const h = height(p, e)
            if (h > stats.worstEnd) {
              stats.worstEnd = h
              stats.worstEndWhere = `${seed}/${i} ${name} ${look.stitch} r=${pl.seg.radius.toFixed(4)} L=${pl.length.toFixed(3)}`
            }
          }
        }
        if (pl.seg.color === live.ink) {
          for (const q of [pl.seg.a, pl.seg.b]) {
            const side = q[0] < 0 ? -1 : 1
            ;(side < 0 ? browL : browR).push(q)
            const own = side < 0 ? eyes.leftSize : eyes.rightSize
            const d = Math.hypot(q[0] - side * eyes.spacing * 0.5, q[1] - p.face.eyeHeight) / own
            if (d < stats.browButton) {
              stats.browButton = d
              stats.browButtonWhere = `${seed}/${i} ${name}`
            }
            stats.browTop = Math.max(stats.browTop, (q[1] - p.face.eyeHeight) / maxSize)
          }
        }
      }
      for (const a of browL) for (const c of browR) stats.browGap = Math.min(stats.browGap, Math.hypot(a[0] - c[0], a[1] - c[1]) / size)
      // Bouche vs bouton-nez
      if (look.accent === 'nez') {
        const gap = p.face.eyeHeight - p.face.mouthHeight
        const r = Math.min(size * 0.42, gap * 0.2)
        const noseBottom = p.face.mouthHeight + gap * 0.55 - r
        let top = -Infinity
        for (const pl of flat) if (pl.seg.color === p.thread.mouthColor) top = Math.max(top, pl.seg.a[1], pl.seg.b[1])
        const c = (noseBottom - top) / size
        if (c < stats.noseClear) {
          stats.noseClear = c
          stats.noseWhere = `${seed}/${i} ${name}`
        }
      }
    })
    // NaN et croix du K.O.
    live.threads.targets.forEach((t, k) =>
      t.forEach((slot, j) => {
        for (const v of slot.pts) if (!Number.isFinite(v.x + v.y + v.z)) stats.nan++
        const isCross = j >= t.length - 4
        if (isCross && slot.radius > 0) {
          for (const v of [slot.pts[0], slot.pts[slot.pts.length - 1]]) stats.crossEnd = Math.max(stats.crossEnd, height(p, v))
        }
      }),
    )
  }
}
console.log(JSON.stringify(stats, null, 1))
