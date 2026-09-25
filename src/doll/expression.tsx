import * as THREE from 'three'
import { useLayoutEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { useDisposable } from '../core/useDisposable'
import { mulberry32 } from '../core/rand'
import type { Fighter } from './fighter'

/**
 * Expressions réactives : la partie **animée** du visage.
 *
 * Tout le reste du visage est fusionné en géométrie statique au montage
 * (`<Batched>`) : ce qui bouge ne peut pas y être. On sépare donc ce qui
 * exprime — bouche, sourcils, croix du K.O., paupières — et on l'anime sans
 * jamais reconstruire de géométrie par image, en deux appels de rendu par
 * poupée :
 *
 * - les **fils** (bouche, remplissage de la bouche ouverte, sourcils, croix)
 *   sont un seul maillage à **cibles de morphing** : une cible par expression,
 *   toutes de même topologie, calculées une fois par `surface.ts` comme les
 *   points cousus statiques. Une image ne change que les poids ;
 * - les **paupières de feutre** sont un dôme posé sur chaque bouton, taillé au
 *   fragment par deux bords (paupière haute, paupière basse) que pilotent des
 *   uniformes. Un clignement ne coûte que quatre flottants.
 *
 * Les boutons, eux, ne clignent pas : ce sont les paupières qui passent devant.
 */

// ---------------------------------------------------------------- catalogue

/**
 * Expressions du combat, dans l'ordre des cibles de morphing. Le repos (humeur
 * propre de la poupée) est la géométrie de base, pas une cible.
 *
 * Nombre **fixe** pour toutes les poupées : il entre dans le programme
 * (`MORPHTARGETS_COUNT`), et six poupées à des nombres différents
 * compileraient six programmes.
 */
export const EXPRESSIONS = ['focus', 'effort', 'ouch', 'surprise', 'ko', 'dazed', 'weary'] as const
export type Expression = (typeof EXPRESSIONS)[number]
const N_EXPR = EXPRESSIONS.length
const IDX = Object.fromEntries(EXPRESSIONS.map((e, i) => [e, i])) as Record<Expression, number>

/**
 * Ce que chaque état du combattant demande au visage : paires (expression,
 * part). Un état absent (attente, marche) laisse revenir le repos — et la
 * fatigue quand la vie baisse.
 *
 * - frappe, parade : **détermination** — sourcils froncés, paupières basses et
 *   inclinées vers le nez, bouche serrée ;
 * - troisième coup, plongeon, impact : **cri** — la bouche s'ouvre ;
 * - coup reçu : **grimace** — yeux plissés, bouche tordue ;
 * - saut, vol : **surprise** ; esquive : surprise mêlée de détermination ;
 * - K.O. : **croix cousues** sur les boutons ; relevée : **sonnée**.
 */
const WANTS: Record<string, readonly number[]> = {
  attack1: [IDX.focus, 1],
  attack2: [IDX.focus, 1],
  parry: [IDX.focus, 0.85],
  sprint: [IDX.focus, 0.55],
  attack3: [IDX.effort, 1],
  plunge: [IDX.effort, 1],
  slam: [IDX.effort, 1],
  hit: [IDX.ouch, 1],
  ko: [IDX.ko, 1],
  rise: [IDX.dazed, 1],
  jump: [IDX.surprise, 0.8],
  air: [IDX.surprise, 1],
  flip: [IDX.surprise, 1],
  dodge: [IDX.surprise, 0.55, IDX.focus, 0.35],
}

/**
 * Vitesses de poursuite (1/s), à l'arrivée puis au départ.
 *
 * La grimace arrive en trois centièmes de seconde : plus lente, elle suit le
 * coup au lieu de le recevoir. La surprise et la détermination viennent en
 * un dixième, et tout repart plus doucement qu'il n'est venu — un visage qui
 * retombe d'un coup au neutre lit comme un masque qu'on change. L'hébétude
 * traîne près d'une seconde après la relevée, la fatigue s'installe en
 * quelques secondes.
 */
const RATE_IN = [14, 16, 32, 12, 22, 6, 1.5]
const RATE_OUT = [6, 5, 5, 5, 8, 1.1, 1.5]

/** Fatigue voulue selon la vie : rien au-dessus de la moitié, presque pleine au plus bas. */
function weariness(hp: number) {
  const t = Math.min(1, Math.max(0, (0.5 - hp) / 0.4))
  return 0.85 * t * t * (3 - 2 * t)
}

// ---------------------------------------------------------------- fils

/** Tronçons le long d'un brin et côtés de sa section. */
export const TUBE_T = 8
const TUBE_R = 5

/**
 * Un brin prêt à tuber, en repère du visage : `TUBE_T + 1` points, la
 * normale de la peau sous lui (repère des sections) et son rayon. Un rayon
 * nul le **replie** sur son premier point, sous la peau : c'est l'état d'un
 * point qu'une expression n'utilise pas. Dégénéré, il ne dessine rien ; en
 * transition, il pousse depuis ce point.
 */
export type LiveSlot = { pts: THREE.Vector3[]; up: THREE.Vector3; radius: number }

/**
 * Tous les fils animés d'une poupée : `targets[0]` est le repos, les suivants
 * suivent `EXPRESSIONS`. Même nombre d'emplacements partout, même couleur par
 * emplacement (la couleur ne se morphe pas).
 */
export type LiveThreads = { targets: LiveSlot[][]; colors: string[] }

const _t = new THREE.Vector3()
const _u = new THREE.Vector3()
const _v = new THREE.Vector3()
const _d = new THREE.Vector3()

/**
 * Écrit un tube le long d'un brin. Même section que `Thread` à peu de chose
 * près (cinq côtés au lieu de six : sous le trait, la différence ne se voit
 * pas, et il y a jusqu'à quatre-vingts brins par visage et huit poses).
 */
function writeTube(s: LiveSlot, pos: Float32Array, nrm: Float32Array, at: number) {
  let o = at * 3
  for (let i = 0; i <= TUBE_T; i++) {
    const c = s.pts[i]
    _t.subVectors(s.pts[Math.min(TUBE_T, i + 1)], s.pts[Math.max(0, i - 1)])
    const degenerate = s.radius <= 0 || _t.lengthSq() < 1e-14
    if (!degenerate) {
      _t.normalize()
      _u.crossVectors(_t, s.up)
      if (_u.lengthSq() < 1e-10) _u.set(1, 0, 0).cross(_t)
      _u.normalize()
      _v.crossVectors(_t, _u)
    }
    for (let j = 0; j < TUBE_R; j++) {
      if (degenerate) {
        pos[o] = c.x
        pos[o + 1] = c.y
        pos[o + 2] = c.z
        nrm[o] = s.up.x
        nrm[o + 1] = s.up.y
        nrm[o + 2] = s.up.z
      } else {
        const a = (j / TUBE_R) * Math.PI * 2
        _d.copy(_u).multiplyScalar(Math.cos(a)).addScaledVector(_v, Math.sin(a))
        pos[o] = c.x + _d.x * s.radius
        pos[o + 1] = c.y + _d.y * s.radius
        pos[o + 2] = c.z + _d.z * s.radius
        nrm[o] = _d.x
        nrm[o + 1] = _d.y
        nrm[o + 2] = _d.z
      }
      o += 3
    }
  }
}

/** Géométrie des fils animés : la pose de repos plus une cible par expression. */
export function threadMorph(th: LiveThreads): THREE.BufferGeometry {
  const slots = th.targets[0].length
  const perSlot = (TUBE_T + 1) * TUBE_R
  const nv = slots * perSlot
  const pose = (target: LiveSlot[]) => {
    const pos = new Float32Array(nv * 3)
    const nrm = new Float32Array(nv * 3)
    target.forEach((s, k) => writeTube(s, pos, nrm, k * perSlot))
    return { pos, nrm }
  }

  const index: number[] = []
  const col = new Float32Array(nv * 3)
  const c = new THREE.Color()
  for (let k = 0; k < slots; k++) {
    const base = k * perSlot
    for (let i = 0; i < TUBE_T; i++) {
      for (let j = 0; j < TUBE_R; j++) {
        const a = base + i * TUBE_R + j
        const b = base + i * TUBE_R + ((j + 1) % TUBE_R)
        const d = base + (i + 1) * TUBE_R + ((j + 1) % TUBE_R)
        const e = base + (i + 1) * TUBE_R + j
        index.push(a, b, e, b, d, e)
      }
    }
    // Couleurs en linéaire, comme la `color` d'un matériau.
    c.set(th.colors[k])
    for (let v = 0; v < perSlot; v++) c.toArray(col, (base + v) * 3)
  }

  const rest = pose(th.targets[0])
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(rest.pos, 3))
  g.setAttribute('normal', new THREE.BufferAttribute(rest.nrm, 3))
  g.setAttribute('color', new THREE.BufferAttribute(col, 3))
  g.setIndex(index)
  const targets = th.targets.slice(1).map(pose)
  g.morphAttributes.position = targets.map((t) => new THREE.BufferAttribute(t.pos, 3))
  g.morphAttributes.normal = targets.map((t) => new THREE.BufferAttribute(t.nrm, 3))
  // Les cibles comptent dans le volume : la croix du K.O. déborde des boutons.
  g.computeBoundingSphere()
  return g
}

// ---------------------------------------------------------------- paupières

/** Pose d'une paupière, en rayons de bouton : `upper` 0 ouverte → 1 fermée. */
export type LidPose = {
  upper: number
  /** Bascule : > 0 le coin intérieur descend (colère), < 0 il monte (tristesse). */
  tilt: number
  /** Paupière basse, 0 → 1 : le plissement du sourire, de la grimace. */
  lower: number
}

/** Un bouton qui porte une paupière : sa pose sur le crâne, en repère du visage. */
export type LidSpot = { side: -1 | 1; pos: THREE.Vector3; quat: THREE.Quaternion; radius: number; top: number }

/**
 * Dôme de feutre posé sur un bouton.
 *
 * Un disque plat au niveau de la face du bouton lirait comme une pastille
 * collée ; le feutre d'une vraie paupière **recouvre** le bouton et se rabat
 * sur son bord. Plateau juste au-dessus du fil qui traverse les trous (`top`),
 * puis un quart d'ellipse qui descend au-delà du bord du bouton — jamais en
 * dedans : il passerait à travers le biseau. Mesuré sur le bouton de
 * `ButtonEye` : au droit du biseau (0,93 r) le feutre passe 0,01 r au-dessus,
 * au droit du bord (r) 0,04 r.
 *
 * `aLid` porte les coordonnées dans le plan du bouton, en rayons, et le côté :
 * c'est là que le fragment taille les bords.
 */
export function lidGeometry(spots: LidSpot[]): THREE.BufferGeometry {
  const RINGS_FLAT = [0, 0.3, 0.55, 0.72, 0.85]
  const SKIRT = 5
  const SEG = 40
  const pos: number[] = []
  const nrm: number[] = []
  const lid: number[] = []
  const index: number[] = []
  const p = new THREE.Vector3()
  const n = new THREE.Vector3()
  for (const s of spots) {
    const r = s.radius
    const rim = -0.02 * r
    const a = 0.22 * r
    const b = s.top - rim
    // Profil (ρ, z, normale radiale, normale z) du centre au bord.
    const prof: [number, number, number, number][] = RINGS_FLAT.map((k) => [k * r, s.top, 0, 1])
    for (let i = 1; i <= SKIRT; i++) {
      const ph = (i / SKIRT) * Math.PI * 0.5
      const nr = b * Math.sin(ph)
      const nz = a * Math.cos(ph)
      const l = Math.hypot(nr, nz) || 1
      prof.push([0.85 * r + a * Math.sin(ph), rim + b * Math.cos(ph), nr / l, nz / l])
    }
    const start = pos.length / 3
    prof.forEach(([rho, z, nr, nz], ri) => {
      const count = ri === 0 ? 1 : SEG
      for (let j = 0; j < count; j++) {
        const th = (j / SEG) * Math.PI * 2
        const x = Math.cos(th)
        const y = Math.sin(th)
        p.set(x * rho, y * rho, z).applyQuaternion(s.quat).add(s.pos)
        n.set(x * nr, y * nr, nz).applyQuaternion(s.quat)
        pos.push(p.x, p.y, p.z)
        nrm.push(n.x, n.y, n.z)
        lid.push((x * rho) / r, (y * rho) / r, s.side)
      }
    })
    // Éventail au centre, puis bandes d'anneau à anneau.
    for (let j = 0; j < SEG; j++) index.push(start, start + 1 + j, start + 1 + ((j + 1) % SEG))
    for (let ri = 1; ri < prof.length - 1; ri++) {
      const r0 = start + 1 + (ri - 1) * SEG
      const r1 = r0 + SEG
      for (let j = 0; j < SEG; j++) {
        const j1 = (j + 1) % SEG
        index.push(r0 + j, r1 + j, r1 + j1, r0 + j, r1 + j1, r0 + j1)
      }
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3))
  g.setAttribute('aLid', new THREE.Float32BufferAttribute(lid, 3))
  g.setIndex(index)
  g.computeBoundingSphere()
  return g
}

/**
 * Taille des paupières, au fragment.
 *
 * Bord haut : descend avec `upper`, bascule vers le nez avec `tilt`, et se
 * creuse un peu en son milieu — une paupière tombe en arc, pas en règle. Bord
 * bas : remonte en arc, c'est l'œil qui sourit ou qui plisse. Les deux se
 * rejoignent un peu **sous** le centre du bouton (−0,1 r) : un œil fermé se
 * ferme bas, fermé au milieu il lisait comme un œil coupé en deux.
 *
 * Lisière : un point avant sombre le long du bord (le trait qui dessine l'œil
 * de loin), puis une ombre d'épaisseur sur le feutre. Grain de feutre en
 * bruit de valeur : sans lui la paupière lisait comme du plastique mat.
 */
const LID_PARS = /* glsl */ `
varying vec3 vLid;
uniform vec4 uLidL;
uniform vec4 uLidR;
uniform vec3 uInk;
float feltHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float feltNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(feltHash(i), feltHash(i + vec2(1.0, 0.0)), f.x),
             mix(feltHash(i + vec2(0.0, 1.0)), feltHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
`
const LID_CLIP = /* glsl */ `
{
  vec4 L = vLid.z < 0.0 ? uLidL : uLidR;
  vec2 q = vLid.xy;
  // Vers le nez : +x pour l'œil gauche (côté −1), −x pour le droit.
  float xin = -sign(vLid.z) * q.x;
  float bow = 1.0 - q.x * q.x;
  float yU = mix(1.2, -0.1, L.x) - 0.5 * L.y * xin - 0.16 * bow * min(L.x * 3.0, 1.0);
  float yL = mix(-1.2, -0.1, L.z) + 0.34 * bow * min(L.z * 3.0, 1.0);
  float d = max(q.y - yU, yL - q.y);
  if (d < 0.0) discard;
  float st = fract(q.x * 4.5 + 0.25);
  float dash = smoothstep(0.06, 0.14, st) * (1.0 - smoothstep(0.84, 0.92, st));
  float hem = (1.0 - smoothstep(0.1, 0.14, d)) * mix(0.45, 1.0, dash);
  diffuseColor.rgb *= mix(0.78, 1.0, smoothstep(0.1, 0.34, d));
  diffuseColor.rgb *= 0.92 + 0.12 * feltNoise(q * 15.0);
  diffuseColor.rgb = mix(diffuseColor.rgb, uInk, hem);
}
`

function lidMaterial(felt: string, ink: string) {
  const uniforms = {
    uLidL: { value: new THREE.Vector4() },
    uLidR: { value: new THREE.Vector4() },
    uInk: { value: new THREE.Color(ink) },
  }
  // Feutre : plus sombre que la laine qu'il prolonge. À sa clarté (puis à
  // 0,86), il ressortait jaune et plus clair que le crâne, dont la maille est
  // creusée d'ombres et voilée par le duvet.
  const c = new THREE.Color(felt)
  const hsl = { h: 0, s: 0, l: 0 }
  c.getHSL(hsl)
  c.setHSL(hsl.h, hsl.s * 0.9, hsl.l * 0.78)
  const m = new THREE.MeshPhysicalMaterial({
    color: c,
    roughness: 1,
    metalness: 0,
    sheen: 0.6,
    sheenRoughness: 0.8,
    sheenColor: new THREE.Color('#ffffff'),
  })
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms)
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aLid;\nvarying vec3 vLid;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLid = aLid;')
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${LID_PARS}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${LID_CLIP}`)
  }
  // Un seul programme pour toutes les paupières : la couleur et les bords sont
  // des uniformes.
  m.customProgramCacheKey = () => 'felt-lid'
  return { material: m, uniforms }
}

// ---------------------------------------------------------------- pilotage

/**
 * Poses des paupières : `[repos, ...EXPRESSIONS]`, deux paupières chacune
 * (gauche, droite).
 */
export type LidPoses = [LidPose, LidPose][]

/**
 * Clignement : paupière qui tombe en 70 ms et remonte en 110 — plus vite
 * fermée que rouverte, comme un vrai. Un toutes les deux à six secondes, un
 * double de temps en temps. Tirage propre à la poupée : six clignements
 * synchrones sur une planche lisent comme une animation, pas comme six
 * personnages.
 */
const BLINK_CLOSE = 0.07
const BLINK_OPEN = 0.11

export function LiveFace({
  threads,
  lids,
  lidPoses,
  felt,
  ink,
  fighter,
  seed,
}: {
  threads: LiveThreads
  lids: LidSpot[]
  lidPoses: LidPoses
  /** Laine du corps : le feutre des paupières la prolonge. */
  felt: string
  /** Fil sombre des sourcils, repris en lisière de paupière. */
  ink: string
  /** Combattant piloté (arène). Sans lui : le repos, et le clignement. */
  fighter?: Fighter
  seed: number
}) {
  const geo = useDisposable(() => threadMorph(threads), [threads])
  const threadMat = useDisposable(
    () => new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.7, sheen: 0.6, sheenRoughness: 0.5 }),
    [],
  )
  const threadMesh = useMemo(() => {
    const m = new THREE.Mesh(geo, threadMat)
    // Hors de la fusion (`Batched`) : elle figerait la pose du montage.
    m.userData.noBatch = true
    m.updateMorphTargets()
    return m
  }, [geo, threadMat])

  const lidGeo = useDisposable(() => lidGeometry(lids), [lids])
  const lid = useMemo(() => lidMaterial(felt, ink), [felt, ink])
  useLayoutEffect(() => () => lid.material.dispose(), [lid])
  const lidMesh = useMemo(() => {
    const m = new THREE.Mesh(lidGeo, lid.material)
    m.userData.noBatch = true
    return m
  }, [lidGeo, lid])

  /** État du visage entre deux images : aucune allocation dans la boucle. */
  const state = useMemo(() => {
    const rnd = mulberry32(seed + 919)
    return {
      rnd,
      w: new Float32Array(N_EXPR),
      want: new Float32Array(N_EXPR),
      blink: { t: -1, wait: 0.6 + rnd() * 3, again: false },
      lid: new Float32Array(6),
    }
  }, [seed])

  useFrame((_, realDt) => {
    // Temps du combattant dans l'arène : le gel d'impact et le ralenti
    // figent aussi le visage, sinon il grimacerait sur une image arrêtée.
    const dt = fighter ? fighter.dt : Math.min(realDt, 0.1)
    const { w, want, blink, lid: lp, rnd } = state

    // --- envies de l'état courant
    want.fill(0)
    if (fighter) {
      const list = WANTS[fighter.current]
      if (list) for (let i = 0; i < list.length; i += 2) want[list[i]] = list[i + 1]
      else want[IDX.weary] = weariness(fighter.hp)
    }

    // --- poursuite, puis normalisation : la somme des parts ne dépasse pas 1,
    // le repos garde le reste (`morphTargetBaseInfluence`).
    let sum = 0
    for (let i = 0; i < N_EXPR; i++) {
      const rate = want[i] > w[i] ? RATE_IN[i] : RATE_OUT[i]
      w[i] += (want[i] - w[i]) * (1 - Math.exp(-rate * dt))
      sum += w[i]
    }
    const k = sum > 1 ? 1 / sum : 1
    const infl = threadMesh.morphTargetInfluences!
    for (let i = 0; i < N_EXPR; i++) infl[i] = w[i] * k

    // --- paupières : mêmes parts que les fils
    const restK = 1 - Math.min(1, sum)
    for (let s = 0; s < 2; s++) {
      const r = lidPoses[0][s]
      let up = r.upper * restK
      let tilt = r.tilt * restK
      let low = r.lower * restK
      for (let i = 0; i < N_EXPR; i++) {
        const e = lidPoses[i + 1][s]
        const f = w[i] * k
        up += e.upper * f
        tilt += e.tilt * f
        low += e.lower * f
      }
      lp[s * 3] = up
      lp[s * 3 + 1] = tilt
      lp[s * 3 + 2] = low
    }

    // --- clignement, suspendu quand les yeux sont déjà clos ou barrés
    const shut = w[IDX.ko] + w[IDX.ouch]
    let b = 0
    if (blink.t >= 0) {
      blink.t += dt
      const t = blink.t
      b = t < BLINK_CLOSE ? t / BLINK_CLOSE : 1 - (t - BLINK_CLOSE) / BLINK_OPEN
      if (t >= BLINK_CLOSE + BLINK_OPEN) {
        blink.t = -1
        b = 0
        blink.wait = blink.again ? 0.12 : 1.8 + rnd() * 4.2
        blink.again = !blink.again && rnd() < 0.18
      }
    } else if ((blink.wait -= dt) <= 0 && shut < 0.3) {
      blink.t = 0
    }
    b = b * b * (3 - 2 * b)
    for (let s = 0; s < 2; s++) {
      lp[s * 3] += (1 - lp[s * 3]) * b
      lp[s * 3 + 2] += (0.35 - lp[s * 3 + 2]) * b * (lp[s * 3 + 2] < 0.35 ? 1 : 0)
    }
    lid.uniforms.uLidL.value.set(lp[0], lp[1], lp[2], 0)
    lid.uniforms.uLidR.value.set(lp[3], lp[4], lp[5], 0)
  })

  return (
    <>
      <primitive object={threadMesh} />
      {lids.length > 0 && <primitive object={lidMesh} />}
    </>
  )
}
