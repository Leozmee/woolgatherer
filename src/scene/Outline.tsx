import * as THREE from 'three'
import { useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'

/**
 * Contour d'encre, façon anime, en une passe plein écran.
 *
 * La scène est rendue dans une cible hors écran avec sa profondeur ; une passe
 * plein écran y cherche les **ruptures de profondeur** et les encre. Le coût
 * est celui d'une image, quel que soit le nombre de pièces : six poupées,
 * leurs mèches, leurs épingles, l'écharpe simulée — tout est cerné, y compris
 * ce qui bouge au vertex shader, ce qu'une coque inversée par maillage ne
 * suivrait pas et paierait un appel de rendu par pièce.
 *
 * Le critère est la **dérivée seconde** de la profondeur, pas la première : sur
 * une surface vue en biais la profondeur varie vite mais régulièrement — la
 * dérivée première l'encrait en aplat sombre près des silhouettes ; la seconde
 * s'y annule et ne répond qu'aux vraies marches. Relative à la profondeur,
 * elle garde la même finesse de près comme de loin.
 *
 * Le duvet n'écrit pas dans la profondeur (`depthWrite: false` sur les coques) :
 * sans ça chaque fibre aurait son contour et la poupée serait hérissée d'encre.
 *
 * La cible est en demi-flottant linéaire : ni tone mapping ni conversion sRGB
 * ne s'y appliquent. C'est la passe finale, `toneMapped`, qui les fait — sinon
 * l'image serait tonemappée deux fois, ou pas du tout. La scène y est rendue
 * **sans fond** : la passe finale la pose sur la couleur de fond selon sa
 * couverture, seule façon de traiter juste les pixels de bord.
 */
export function Outline({
  color = '#2a1f18',
  width = 1,
  threshold = 0.012,
  tint = 0.8,
  complement = false,
}: {
  /** Trait en couleur complémentaire de ce qu'il cerne. */
  complement?: boolean
  /** Part de la couleur locale dans le trait : 0 encre unie, 1 trait coloré. */
  tint?: number
  color?: string
  /** Épaisseur, en pixels CSS. */
  width?: number
  /** Marche de profondeur relative à partir de laquelle on encre. */
  threshold?: number
}) {
  const { gl, size, scene, camera } = useThree()
  const dpr = gl.getPixelRatio()

  const target = useMemo(() => {
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 })
    rt.depthTexture = new THREE.DepthTexture(1, 1)
    rt.depthTexture.type = THREE.UnsignedIntType
    return rt
  }, [])
  useEffect(() => {
    target.setSize(Math.round(size.width * dpr), Math.round(size.height * dpr))
  }, [target, size, dpr])
  useEffect(() => () => target.dispose(), [target])

  const pass = useMemo(() => {
    const material = new THREE.ShaderMaterial({
      uniforms: {
        tColor: { value: null },
        tDepth: { value: null },
        uTexel: { value: new THREE.Vector2() },
        uNear: { value: 0.1 },
        uFar: { value: 80 },
        uInk: { value: new THREE.Color() },
        uWidth: { value: 1 },
        uThreshold: { value: 0.012 },
        uBg: { value: new THREE.Color() },
        uTint: { value: 0.8 },
        uComplement: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        #include <packing>
        uniform sampler2D tColor;
        uniform sampler2D tDepth;
        uniform vec2 uTexel;
        uniform float uNear;
        uniform float uFar;
        uniform vec3 uInk;
        uniform float uWidth;
        uniform float uThreshold;
        uniform vec3 uBg;
        uniform float uTint;
        uniform float uComplement;
        varying vec2 vUv;

        float viewZ(vec2 uv) {
          return -perspectiveDepthToViewZ(texture2D(tDepth, uv).x, uNear, uFar);
        }

        void main() {
          // Image rendue sans fond, sur transparent : l'alpha est la
          // couverture des poupées, bords anticrénelés compris, et la couleur
          // y est prémultipliée.
          vec4 base = texture2D(tColor, vUv);
          vec3 col = base.a > 0.0001 ? base.rgb / base.a : vec3(0.0);
          vec2 o = uTexel * uWidth;
          float z = viewZ(vUv);
          float zl = viewZ(vUv - vec2(o.x, 0.0));
          float zr = viewZ(vUv + vec2(o.x, 0.0));
          float zd = viewZ(vUv - vec2(0.0, o.y));
          float zu = viewZ(vUv + vec2(0.0, o.y));
          // Plus proche des quatre voisins : la marche se mesure depuis
          // l'avant-plan, sinon le fond, infiniment loin, écrase le rapport.
          float near = min(z, min(min(zl, zr), min(zd, zu)));
          float step2 = max(abs(zl + zr - 2.0 * z), abs(zd + zu - 2.0 * z)) / near;
          float ink = smoothstep(uThreshold, uThreshold * 2.5, step2);
          // Trait **coloré** : la couleur de ce qu'il cerne, assombrie et un
          // peu saturée — cheveux roses cernés de bordeaux, laine beige de
          // brun, écharpe bleue de bleu nuit. Mêlée à l'encre du rendu selon
          // uTint : 0, encre unie ; 1, trait entièrement coloré.
          float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
          vec3 hue = col;
          // Complémentaire : on retourne la teinte autour de la couleur de
          // même clarté — max + min − c garde la clarté, inverse la teinte.
          if (uComplement > 0.5) {
            float hi = max(col.r, max(col.g, col.b));
            float lo = min(col.r, min(col.g, col.b));
            hue = vec3(hi + lo) - col;
          }
          vec3 tinted = max(mix(vec3(luma), hue, 1.8), 0.0) * 0.32;
          col = mix(col, mix(uInk, tinted, uTint), ink * 0.92);
          #if defined( TONE_MAPPING )
            col = toneMapping(col);
          #endif
          // Le fond, lui, n'est pas tonemappé — comme dans le rendu direct de
          // three, où c'est la couleur d'effacement. Le mélange se fait sur la
          // couverture : décider « fond ou pas » à la profondeur laissait les
          // pixels de bord, mêlés d'objet mais de profondeur « fond », hors du
          // tone mapping — ils saturaient en blanc le long de chaque mèche.
          float cover = max(base.a, ink * 0.92);
          gl_FragColor = vec4(mix(uBg, col, cover), 1.0);
          #include <colorspace_fragment>
        }
      `,
      depthTest: false,
      depthWrite: false,
      toneMapped: true,
    })
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material)
    quad.frustumCulled = false
    const overlay = new THREE.Scene()
    overlay.add(quad)
    return { material, overlay, cam: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), quad }
  }, [])
  useEffect(
    () => () => {
      pass.material.dispose()
      pass.quad.geometry.dispose()
    },
    [pass],
  )

  const clear = useMemo(() => new THREE.Color(), [])

  // Priorité 1 : R3F cesse de rendre de lui-même, c'est cette passe qui dessine.
  useFrame(() => {
    const u = pass.material.uniforms
    const cam = camera as THREE.PerspectiveCamera
    // Rendu **sans fond**, sur transparent : la passe finale pose les poupées
    // sur la couleur de fond selon leur couverture (voir le shader).
    const bg = scene.background
    gl.getClearColor(clear)
    const clearAlpha = gl.getClearAlpha()
    scene.background = null
    gl.setClearColor(0x000000, 0)
    gl.setRenderTarget(target)
    gl.render(scene, camera)
    gl.setRenderTarget(null)
    scene.background = bg
    gl.setClearColor(clear, clearAlpha)
    if (bg instanceof THREE.Color) u.uBg.value.copy(bg)
    u.tColor.value = target.texture
    u.tDepth.value = target.depthTexture
    u.uTexel.value.set(1 / target.width, 1 / target.height)
    u.uNear.value = cam.near
    u.uFar.value = cam.far
    u.uInk.value.set(color)
    u.uWidth.value = width * dpr
    u.uThreshold.value = threshold
    u.uTint.value = tint
    u.uComplement.value = complement ? 1 : 0
    gl.render(pass.overlay, pass.cam)
  }, 1)

  return null
}
