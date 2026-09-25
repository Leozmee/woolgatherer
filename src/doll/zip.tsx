import * as THREE from 'three'
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { SpringBone, type Collider } from '../core/springBone'
import { mulberry32 } from '../core/rand'
import { onHeadPolar } from './surface'
import type { DollParams } from './params'

/**
 * **Fermeture éclair à l'arrière du crâne.** Toutes les poupées la portent :
 * une peluche se remplit par là. Du sommet à la nuque, sur le méridien
 * arrière — ruban de toile sombre cousu sur la laine, dents de métal
 * alternées qui s'engrènent, curseur, et une **languette qui pend et bouge**.
 *
 * Tout se pose par `onHeadPolar` (source unique du profil du crâne) : ruban,
 * dents et curseur suivent la tête quelle que soit sa forme. Ce qui est fixe
 * (ruban, points, dents, curseur) se rend dans le `<Batched>` de la tête et
 * fusionne avec les autres pièces de même matière ; seule la languette reste
 * un maillage à part, portée par un `SpringBone` : elle retombe sous son
 * poids, se couche sur la laine (collider du crâne), balance quand la poupée
 * tourne, court ou frappe.
 */

/** Étendue sur le méridien arrière, en hauteur normalisée du crâne (`sy`). */
const TOP = 0.93
const BOTTOM = -0.72
/** Sections du ruban : assez pour suivre la courbure sans facettes. */
const SAMPLES = 48
/** Position du curseur, fraction de la longueur depuis le haut. */
const SLIDER_AT = 0.3

type Frame = { p: THREE.Vector3; n: THREE.Vector3; t: THREE.Vector3; a: THREE.Vector3; s: number }

/**
 * Tracé du méridien arrière, relevé au-dessus des bosses du rembourrage.
 * `t` descend le long du tracé, `n` sort du crâne, `a = t × n` est la largeur.
 */
function meridian(p: DollParams, lift: number): Frame[] {
  const out: Frame[] = []
  let s = 0
  for (let i = 0; i < SAMPLES; i++) {
    const sy = TOP + (BOTTOM - TOP) * (i / (SAMPLES - 1))
    const sp = onHeadPolar(p, Math.PI, sy, lift)
    const prev = out[i - 1]
    if (prev) s += prev.p.distanceTo(sp.pos)
    out.push({ p: sp.pos, n: sp.normal, t: new THREE.Vector3(), a: new THREE.Vector3(), s })
  }
  for (let i = 0; i < SAMPLES; i++) {
    const a = out[Math.max(0, i - 1)].p
    const b = out[Math.min(SAMPLES - 1, i + 1)].p
    out[i].t.subVectors(b, a).normalize()
    out[i].a.crossVectors(out[i].t, out[i].n).normalize()
  }
  return out
}

/** Repère interpolé à l'abscisse curviligne `s`. */
function at(frames: Frame[], s: number, out: Frame) {
  let i = 0
  while (i < frames.length - 2 && frames[i + 1].s < s) i++
  const f0 = frames[i]
  const f1 = frames[i + 1]
  const u = Math.max(0, Math.min(1, (s - f0.s) / Math.max(1e-6, f1.s - f0.s)))
  out.p.lerpVectors(f0.p, f1.p, u)
  out.n.lerpVectors(f0.n, f1.n, u).normalize()
  out.t.lerpVectors(f0.t, f1.t, u).normalize()
  out.a.crossVectors(out.t, out.n).normalize()
  out.s = s
  return out
}

const _m = new THREE.Matrix4()
const _q = new THREE.Quaternion()
const _v = new THREE.Vector3()
const _one = new THREE.Vector3(1, 1, 1)

/** Place une géométrie de boîte dans le repère (a, −t, n) d'un point du tracé. */
function boxAt(f: Frame, sx: number, sy: number, sz: number, offA: number, offN: number) {
  const g = new THREE.BoxGeometry(sx, sy, sz)
  _m.makeBasis(f.a, _v.copy(f.t).negate(), f.n)
  _q.setFromRotationMatrix(_m)
  _m.compose(_v.copy(f.p).addScaledVector(f.a, offA).addScaledVector(f.n, offN), _q, _one)
  g.applyMatrix4(_m)
  return g
}

export function zipMetrics(p: DollParams) {
  const R = p.shape.headRadius
  // Relevé des bosses du rembourrage, comme la bouche : c'est une pièce
  // cousue à plat, le duvet est retiré dessous (`zipHole`).
  const lift = p.shape.lumps * R * 0.7 + R * 0.004
  const width = R * 0.17
  return { R, lift, width, thick: R * 0.012, pitch: width * 0.2 }
}

/**
 * Bande du crâne où le duvet est retiré sous le ruban, dans le repère de la
 * tête : demi-largeur en x, et bornes de hauteur — derrière seulement.
 */
export function zipHole(p: DollParams) {
  const m = zipMetrics(p)
  const ry = p.shape.headSquash * p.shape.headRadius
  return { half: m.width * 0.5, top: TOP * ry, bottom: BOTTOM * ry }
}

/**
 * Retire le duvet du crâne sous le ruban : sans ça les fibres le traversent,
 * et aucun relèvement ne les domine sans décoller la pièce (voir CLAUDE.md,
 * « il faut retirer la laine dessous »). Lu sur la position **de base** du
 * sommet, avant que la coque ne soit repoussée : la bande reste celle du
 * crâne, quelle que soit la hauteur de la coque.
 */
export function zipFuzzShader(hole: ReturnType<typeof zipHole>) {
  return (sh: THREE.WebGLProgramParametersWithUniforms) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vZipBase;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvZipBase = position;')
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vZipBase;')
      .replace(
        '#include <alphatest_fragment>',
        `if (vZipBase.z < 0.0 && abs(vZipBase.x) < ${hole.half.toFixed(5)} && vZipBase.y < ${hole.top.toFixed(5)} && vZipBase.y > ${hole.bottom.toFixed(5)}) discard;
#include <alphatest_fragment>`,
      )
  }
}

export function Zip({ p, tape = '#2d2926', metal = '#dcd8cf' }: { p: DollParams; tape?: string; metal?: string }) {
  const m = zipMetrics(p)

  const built = useMemo(() => {
    const frames = meridian(p, m.lift)
    const len = frames[frames.length - 1].s
    const f = { p: new THREE.Vector3(), n: new THREE.Vector3(), t: new THREE.Vector3(), a: new THREE.Vector3(), s: 0 }

    // --- ruban : une bande épaisse le long du tracé (4 coins par section)
    const tapeGeo = new THREE.BufferGeometry()
    const pos: number[] = []
    const idx: number[] = []
    const w = m.width * 0.5
    for (const fr of frames) {
      for (const [ka, kn] of [[1, 1], [-1, 1], [-1, -0.2], [1, -0.2]] as const) {
        _v.copy(fr.p).addScaledVector(fr.a, ka * w).addScaledVector(fr.n, kn * m.thick)
        pos.push(_v.x, _v.y, _v.z)
      }
    }
    for (let i = 0; i < frames.length - 1; i++) {
      for (let k = 0; k < 4; k++) {
        const a = i * 4 + k
        const b = i * 4 + ((k + 1) % 4)
        idx.push(a, a + 4, b, b, a + 4, b + 4)
      }
    }
    tapeGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    tapeGeo.setIndex(idx)
    tapeGeo.computeVertexNormals()

    // --- dents : alternées de part et d'autre, qui se chevauchent au milieu
    const teeth: THREE.BufferGeometry[] = []
    const top = m.pitch * 1.5
    const n = Math.floor((len - top * 2) / m.pitch)
    for (let k = 0; k < n; k++) {
      at(frames, top + k * m.pitch, f)
      const side = k % 2 ? 1 : -1
      // Deux rangées qui se chevauchent au milieu : c'est l'engrènement qui dit
      // « fermeture éclair », pas la bande.
      teeth.push(boxAt(f, m.width * 0.36, m.pitch * 0.66, m.thick * 2.6, side * m.width * 0.1, m.thick * 1.7))
    }
    // Arrêts en haut et en bas.
    for (const s of [top * 0.5, len - top * 0.5]) {
      at(frames, s, f)
      teeth.push(boxAt(f, m.width * 0.34, m.pitch * 0.9, m.thick * 2.6, 0, m.thick * 1.8))
    }
    const teethGeo = mergeGeometries(teeth)!
    teeth.forEach((g) => g.dispose())

    // --- points de couture le long des deux bords
    const stitches: THREE.BufferGeometry[] = []
    for (let s = top; s < len - top; s += m.pitch * 2.4) {
      at(frames, s, f)
      for (const side of [-1, 1]) stitches.push(boxAt(f, m.thick * 1.4, m.pitch * 1.3, m.thick * 1.2, side * w * 0.8, m.thick * 1.1))
    }
    const stitchGeo = mergeGeometries(stitches)!
    stitches.forEach((g) => g.dispose())

    // --- curseur : corps bombé, pont, et l'attache de la languette
    const sAt = len * SLIDER_AT
    at(frames, sAt, f)
    const body = boxAt(f, m.width * 0.62, m.pitch * 5.2, m.thick * 3.4, 0, m.thick * 3)
    at(frames, sAt + m.pitch * 1.6, f)
    const bridge = boxAt(f, m.width * 0.26, m.pitch * 2.2, m.thick * 2, 0, m.thick * 5.2)
    const sliderGeo = mergeGeometries([body, bridge])!
    body.dispose()
    bridge.dispose()

    // --- charnière de la languette : bas du pont, décollée du curseur
    at(frames, sAt + m.pitch * 2.4, f)
    const hinge = new THREE.Object3D()
    // Repère : y remonte le tracé (la languette pend le long de −y), z sort.
    _m.makeBasis(f.a, _v.copy(f.t).negate(), f.n)
    hinge.quaternion.setFromRotationMatrix(_m)
    hinge.position.copy(f.p).addScaledVector(f.n, m.thick * 5.6)

    // --- languette : plaque arrondie percée, pendue sous la charnière
    const tabW = m.width * 0.46
    const tabL = m.width * 1.25
    const shape = new THREE.Shape()
    const r = tabW * 0.3
    shape.moveTo(-tabW / 2 + r, 0)
    shape.lineTo(tabW / 2 - r, 0)
    shape.quadraticCurveTo(tabW / 2, 0, tabW / 2, -r)
    shape.lineTo(tabW / 2 * 0.8, -tabL + r)
    shape.quadraticCurveTo(tabW / 2 * 0.8, -tabL, tabW / 2 * 0.8 - r, -tabL)
    shape.lineTo(-tabW / 2 * 0.8 + r, -tabL)
    shape.quadraticCurveTo(-tabW / 2 * 0.8, -tabL, -tabW / 2 * 0.8, -tabL + r)
    shape.lineTo(-tabW / 2, -r)
    shape.quadraticCurveTo(-tabW / 2, 0, -tabW / 2 + r, 0)
    const hole = new THREE.Path()
    const hw = tabW * 0.18
    hole.moveTo(-hw, -tabL * 0.62)
    hole.lineTo(hw, -tabL * 0.62)
    hole.lineTo(hw, -tabL * 0.84)
    hole.lineTo(-hw, -tabL * 0.84)
    hole.lineTo(-hw, -tabL * 0.62)
    shape.holes.push(hole)
    const tabGeo = new THREE.ExtrudeGeometry(shape, {
      depth: m.thick * 1.6,
      bevelEnabled: true,
      bevelThickness: m.thick * 0.5,
      bevelSize: m.thick * 0.5,
      bevelSegments: 2,
      curveSegments: 6,
    })
    tabGeo.translate(0, -m.thick * 0.6, -m.thick * 0.8)

    // Collider du crâne : la sphère qui passe au ras de la languette au repos.
    // Elle la couche sur la laine quand la gravité la plaque, sans la repousser
    // tant qu'elle pend librement.
    at(frames, sAt + m.pitch * 2.4 + tabL, f)
    const rest = f.p.length() + m.thick * 2
    return { tapeGeo, teethGeo, stitchGeo, sliderGeo, tabGeo, hinge, tabL, rest }
  }, [p, m.lift, m.width, m.thick, m.pitch])

  useEffect(
    () => () => {
      for (const g of [built.tapeGeo, built.teethGeo, built.stitchGeo, built.sliderGeo, built.tabGeo]) g.dispose()
    },
    [built],
  )

  const hinge = useRef<THREE.Group>(null!)
  const tab = useRef<THREE.Group>(null!)
  const spring = useRef<SpringBone | null>(null)
  const collider = useMemo<Collider>(() => ({ center: new THREE.Vector3(), radius: 0 }), [])
  // Légère, peu amortie : elle balance. Un peu de rappel pour qu'elle revienne
  // pendre dans l'axe du tracé.
  const cfg = useMemo(() => {
    const rnd = mulberry32(p.seed + 3319)
    return { stiffness: 0.03 + rnd() * 0.02, drag: 0.1 + rnd() * 0.05, gravity: 2.6 }
  }, [p.seed])

  useEffect(() => {
    spring.current = new SpringBone(tab.current, built.tabL, new THREE.Vector3(0, -1, 0))
  }, [built])

  useFrame((_, dt) => {
    if (!spring.current) return
    const head = hinge.current.parent!
    head.updateWorldMatrix(true, false)
    collider.center.setFromMatrixPosition(head.matrixWorld)
    _v.setFromMatrixScale(head.matrixWorld)
    collider.radius = built.rest * Math.min(_v.x, _v.y, _v.z)
    spring.current.update(dt, cfg, collider)
  })

  return (
    <>
      <mesh geometry={built.tapeGeo} castShadow={false} receiveShadow>
        <meshStandardMaterial color={tape} roughness={0.92} />
      </mesh>
      <mesh geometry={built.stitchGeo}>
        <meshStandardMaterial color="#5c554d" roughness={0.95} />
      </mesh>
      {/* Métal à 0,65 : pur, le rendu en aplats le noircissait (il ne
          reflète que l'environnement, que les paliers écrasent). */}
      <mesh geometry={built.teethGeo}>
        <meshStandardMaterial color={metal} metalness={0.65} roughness={0.3} />
      </mesh>
      <mesh geometry={built.sliderGeo} castShadow>
        <meshStandardMaterial color={metal} metalness={0.65} roughness={0.3} />
      </mesh>
      <group ref={hinge} position={built.hinge.position} quaternion={built.hinge.quaternion}>
        <group ref={tab}>
          <mesh geometry={built.tabGeo} castShadow userData={{ noBatch: true }}>
            <meshStandardMaterial color={metal} metalness={0.65} roughness={0.26} />
          </mesh>
        </group>
      </group>
    </>
  )
}
