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

/**
 * Toutes les coques d'un volume en **un seul dessin**.
 *
 * Une coque par maillage coûtait un appel de rendu par coque et par volume :
 * 304 appels pour la planche, le premier poste de la scène. Ici la géométrie
 * source est dessinée `count` fois par instanciation, et c'est le vertex shader
 * qui repousse chaque instance le long des normales ; seuil de découpe et
 * teinte se lisent sur son rang. Les attributs sont **partagés** avec la
 * source, pas copiés : une nappe réécrite à chaque image (l'écharpe) entraîne
 * ses coques sans rien faire.
 *
 * Les instances se dessinent dans l'ordre de leur rang, comme le faisait
 * `renderOrder` : du fond du duvet vers sa pointe.
 */
export function shellInstances(source: THREE.BufferGeometry, count: number, height: number) {
  const g = new THREE.InstancedBufferGeometry()
  g.index = source.index
  for (const [name, attr] of Object.entries(source.attributes)) g.setAttribute(name, attr)
  g.setAttribute(
    'aShell',
    new THREE.InstancedBufferAttribute(Float32Array.from({ length: count }, (_, i) => i), 1),
  )
  g.instanceCount = count
  if (!source.boundingSphere) source.computeBoundingSphere()
  g.boundingSphere = source.boundingSphere!.clone()
  g.boundingSphere.radius += height
  return g
}

export type ShellUniforms = {
  uShellCount: { value: number }
  uShellHeight: { value: number }
  /** Seuil ajouté à celui de `shellAlphaTest`, plafonné à 0,95. */
  uShellBias: { value: number }
  /** Facteur sur la teinte de `shellShade`. */
  uShellShade: { value: number }
}

export function makeShellUniforms(): ShellUniforms {
  return {
    uShellCount: { value: 1 },
    uShellHeight: { value: 0 },
    uShellBias: { value: 0 },
    uShellShade: { value: 1 },
  }
}

/**
 * Coques au shader, relues sur le rang d'instance. À composer **après** un
 * autre `onBeforeCompile` (les trous), qui laisse l'inclusion du test alpha en
 * place.
 *
 * - **Décalage** : progression non linéaire, les coques se resserrent vers
 *   l'extérieur — base du duvet dense, extrémité fine.
 * - **Seuil** : plus on s'éloigne, moins de fibres restent.
 * - **Teinte** : le fond du duvet est dans l'ombre du reste.
 */
export function shellShader(uni: ShellUniforms) {
  return (sh: THREE.WebGLProgramParametersWithUniforms) => {
    Object.assign(sh.uniforms, uni)
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute float aShell;
uniform float uShellCount;
uniform float uShellHeight;
varying float vShell;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vShell = aShell;
transformed += normalize(objectNormal) * pow((aShell + 1.0) / uShellCount, 0.75) * uShellHeight;`,
      )
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uShellCount;
uniform float uShellBias;
uniform float uShellShade;
varying float vShell;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
diffuseColor.rgb *= (0.62 + ((vShell + 1.0) / uShellCount) * 0.38) * uShellShade;`,
      )
      .replace(
        '#include <alphatest_fragment>',
        `if (diffuseColor.a < min(0.95, 0.06 + ((vShell + 1.0) / (uShellCount + 1.0)) * 0.82 + uShellBias)) discard;`,
      )
  }
}
