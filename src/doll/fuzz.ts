import * as THREE from 'three'
import { mulberry32 } from '../core/rand'

/**
 * Duvet volumétrique par « shell texturing ».
 *
 * Une normal map ne peut pas faire de la laine : elle ne touche ni au contour
 * ni à la silhouette, or c'est précisément le bord pelucheux qui distingue un
 * tricot d'une sphère texturée. On empile donc des copies du maillage, chacune
 * repoussée un peu plus loin le long des normales, et on perce chacune d'un
 * masque de fibres de plus en plus sélectif : ce qui subsiste sur la coque
 * externe, ce sont les fibres les plus longues — un vrai halo, avec épaisseur.
 */

/**
 * Texture de fibres : la luminance code la **longueur** de la fibre à ce texel.
 * Servie en `alphaMap` (three lit le canal vert), elle est ensuite tranchée par
 * un `alphaTest` croissant, une valeur par coque.
 */
export function makeFiberTexture(size: number, count: number, seed: number): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, size, size)

  // `lighten` : quand deux fibres se croisent, la plus longue l'emporte au lieu
  // de s'additionner en un pâté opaque.
  ctx.globalCompositeOperation = 'lighten'
  ctx.lineCap = 'round'

  const rnd = mulberry32(seed)
  for (let i = 0; i < count; i++) {
    const x = rnd() * size
    const y = rnd() * size
    // Distribution biaisée vers le court : quelques fibres seulement dépassent.
    const len = Math.pow(rnd(), 1.7)
    const v = Math.round(40 + len * 215)
    const r = size * (0.002 + rnd() * 0.005)
    ctx.strokeStyle = `rgb(${v},${v},${v})`
    ctx.lineWidth = r * 2

    const a = rnd() * Math.PI * 2
    const l = size * (0.006 + rnd() * 0.022)
    ctx.beginPath()
    ctx.moveTo(x, y)
    // On répète le tracé aux quatre bords pour que la tuile se raccorde.
    ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l)
    ctx.stroke()
  }

  const tex = new THREE.CanvasTexture(c)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.anisotropy = 8
  return tex
}

/**
 * Copies du maillage repoussées le long des normales.
 *
 * On les pré-calcule plutôt que de décaler les sommets dans un shader : ça
 * évite d'injecter du GLSL dans MeshPhysicalMaterial — donc de se battre avec
 * son éclairage — pour un coût mémoire négligeable à cette densité.
 */
export function shellGeometries(
  source: THREE.BufferGeometry,
  count: number,
  height: number,
): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = []
  for (let i = 0; i < count; i++) {
    const geo = source.clone()
    const pos = geo.attributes.position as THREE.BufferAttribute
    const nor = geo.attributes.normal as THREE.BufferAttribute
    // Progression non linéaire : les coques se resserrent vers l'extérieur, ce
    // qui densifie la base du duvet et affine son extrémité.
    const t = Math.pow((i + 1) / count, 0.75) * height
    const v = new THREE.Vector3()
    const n = new THREE.Vector3()
    for (let k = 0; k < pos.count; k++) {
      v.fromBufferAttribute(pos, k)
      n.fromBufferAttribute(nor, k)
      v.addScaledVector(n, t)
      pos.setXYZ(k, v.x, v.y, v.z)
    }
    pos.needsUpdate = true
    out.push(geo)
  }
  return out
}

/** Seuil de découpe de la coque `i` : plus on s'éloigne, moins de fibres restent. */
export const shellAlphaTest = (i: number, count: number) => 0.06 + ((i + 1) / (count + 1)) * 0.82

/** Assombrissement de la coque `i` : le fond du duvet est dans l'ombre du reste. */
export const shellShade = (i: number, count: number) => 0.62 + ((i + 1) / count) * 0.38

/**
 * Trous du duvet, sous les pièces cousues.
 *
 * Une pièce ne peut pas être relevée assez pour dominer le duvet sans paraître
 * décollée, ni assez peu pour y être cousue sans que les fibres la traversent :
 * le duvet est de la géométrie, et il monte plus haut que ce qu'on pose dessus.
 * La seule sortie est de **retirer la laine sous la pièce**, ce que fait un
 * morceau de tissu cousu à plat sur une peluche.
 *
 * Le découpage se fait au fragment et non au triangle : le torse n'a que six
 * mailles en travers d'une pièce, un trou taillé dans la topologie serait un
 * polygone grossier là où le contour est déchiqueté.
 */

/** Emplacements de pièces qu'un masque peut porter — une tuile chacun. */
export const HOLE_SLOTS = 4
/** Tuiles par ligne dans le masque. */
export const HOLE_COLS = 2
/** Demi-étendue d'une tuile, en rayons de contour : au-delà, plus rien à percer. */
export const HOLE_SPAN = 1.5

export type HoleUniforms = {
  uHoleMask: { value: THREE.Texture | null }
  uHole: { value: THREE.Vector4[] }
  uHoleCount: { value: number }
}

/** Uniformes stables : leurs valeurs changent d'une poupée à l'autre, pas le programme. */
export function makeHoleUniforms(): HoleUniforms {
  return {
    uHoleMask: { value: null },
    uHole: { value: Array.from({ length: HOLE_SLOTS }, () => new THREE.Vector4()) },
    uHoleCount: { value: 0 },
  }
}

/**
 * Injection GLSL dans le matériau des coques.
 *
 * `aSmooth` porte la position sur l'ellipsoïde idéale : c'est le seul repère
 * dans lequel le contour d'une pièce est exact. On y relit l'azimut et la
 * hauteur, on les ramène dans le carré local de la pièce, et le masque dit si
 * ce fragment est sous du tissu.
 */
export function holeShader(uni: HoleUniforms) {
  return (shader: THREE.WebGLProgramParametersWithUniforms) => {
    shader.uniforms.uHoleMask = uni.uHoleMask
    shader.uniforms.uHole = uni.uHole
    shader.uniforms.uHoleCount = uni.uHoleCount

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aSmooth;\nvarying vec3 vSmooth;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvSmooth = aSmooth;')

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vSmooth;
uniform sampler2D uHoleMask;
uniform vec4 uHole[${HOLE_SLOTS}];
uniform int uHoleCount;`,
      )
      .replace(
        '#include <alphatest_fragment>',
        `{
  float az = atan(vSmooth.x, vSmooth.z);
  for (int i = 0; i < ${HOLE_SLOTS}; i++) {
    if (i >= uHoleCount) break;
    vec4 h = uHole[i];
    // Écart d'azimut ramené dans [-π, π] : sans ça une pièce à l'arrière
    // percerait aussi le devant.
    float du = az - h.x;
    du -= floor(du / 6.2831853 + 0.5) * 6.2831853;
    vec2 q = vec2(du / h.z, (vSmooth.y - h.y) / h.w);
    if (abs(q.x) < ${HOLE_SPAN.toFixed(1)} && abs(q.y) < ${HOLE_SPAN.toFixed(1)}) {
      vec2 cell = vec2(mod(float(i), ${HOLE_COLS}.0), floor(float(i) / ${HOLE_COLS}.0));
      vec2 uvh = (vec2(q.x + ${HOLE_SPAN.toFixed(1)}, ${HOLE_SPAN.toFixed(1)} - q.y) / ${(2 * HOLE_SPAN).toFixed(1)} + cell) / ${HOLE_COLS}.0;
      if (texture2D(uHoleMask, uvh).r > 0.5) discard;
    }
  }
}
#include <alphatest_fragment>`,
      )
  }
}
