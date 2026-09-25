import * as THREE from 'three'
import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Fighter } from '../doll/fighter'

/** Échantillons de la traînée ; trois par image, interpolés. */
const N = 36
const SUB = 3

/**
 * Traînée de l'arme : le ruban balayé par la lame pendant un coup.
 *
 * C'est elle qui fait lire la frappe comme **un arc**, pas comme une pose qui
 * saute à la suivante : à cette vitesse l'œil ne voit que deux images de la
 * lame. Bord extérieur opaque, bord intérieur transparent, et tout s'efface en
 * un dixième de seconde. Elle s'allume selon `fighter.trail`, que chaque phase
 * de geste règle.
 */
export function WeaponTrail({ fighter }: { fighter: Fighter }) {
  const trail = useMemo(() => {
    const pos = new Float32Array(N * 2 * 3)
    const alpha = new Float32Array(N * 2)
    const index: number[] = []
    for (let i = 0; i < N - 1; i++) {
      const a = i * 2
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1))
    geo.setIndex(index)
    const mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color('#6f7c96') } },
      vertexShader: /* glsl */ `
        attribute float aAlpha;
        varying float vAlpha;
        void main() {
          vAlpha = aAlpha;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        varying float vAlpha;
        void main() {
          gl_FragColor = vec4(uColor, vAlpha);
        }`,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    })
    return {
      geo,
      mat,
      tip: Array.from({ length: N }, () => new THREE.Vector3()),
      mid: Array.from({ length: N }, () => new THREE.Vector3()),
      a: new Float32Array(N),
      lastTip: new THREE.Vector3(),
      lastMid: new THREE.Vector3(),
      started: false,
    }
  }, [])
  useEffect(
    () => () => {
      trail.geo.dispose()
      trail.mat.dispose()
    },
    [trail],
  )

  useFrame((_, dt) => {
    const t = trail
    if (!t.started) {
      t.lastTip.copy(fighter.tipWorld)
      t.lastMid.copy(fighter.midWorld)
      t.started = true
    }
    // Décalage de l'historique, puis SUB échantillons interpolés depuis
    // l'image précédente : à 60 i/s une frappe ne dure que sept images.
    for (let i = N - 1; i >= SUB; i--) {
      t.tip[i].copy(t.tip[i - SUB])
      t.mid[i].copy(t.mid[i - SUB])
      t.a[i] = t.a[i - SUB]
    }
    for (let k = 0; k < SUB; k++) {
      const u = 1 - k / SUB
      t.tip[k].lerpVectors(t.lastTip, fighter.tipWorld, u)
      t.mid[k].lerpVectors(t.lastMid, fighter.midWorld, u)
      t.a[k] = fighter.trail
    }
    t.lastTip.copy(fighter.tipWorld)
    t.lastMid.copy(fighter.midWorld)
    const fade = Math.exp(-dt * 20)
    for (let i = SUB; i < N; i++) t.a[i] *= fade

    const pos = t.geo.attributes.position as THREE.BufferAttribute
    const alpha = t.geo.attributes.aAlpha as THREE.BufferAttribute
    for (let i = 0; i < N; i++) {
      pos.setXYZ(i * 2, t.tip[i].x, t.tip[i].y, t.tip[i].z)
      pos.setXYZ(i * 2 + 1, t.mid[i].x, t.mid[i].y, t.mid[i].z)
      const edge = t.a[i] * (1 - i / N) ** 1.5 * 0.6
      alpha.setX(i * 2, edge)
      alpha.setX(i * 2 + 1, 0)
    }
    pos.needsUpdate = true
    alpha.needsUpdate = true
  })

  return <mesh geometry={trail.geo} material={trail.mat} frustumCulled={false} renderOrder={10} />
}

// ---------------------------------------------------------------- poussière

/** Boules par bouffée, et bouffées vivantes au plus. */
const PER_PUFF = 5
const MAX_BALLS = 120
const LIFE = 0.5

type Ball = { x: number; y: number; z: number; vx: number; vy: number; vz: number; size: number; age: number }

/**
 * Bouffées de laine soulevées au sol : sous chaque pas de sprint, à la
 * réception d'un saut, dans une glissade, à l'impact de l'arme. De petites
 * boules de duvet qui gonflent vite puis fondent — opaques, pour que le trait
 * d'encre les cerne comme le reste. Sur un fond blanc sans repère, ce sont
 * elles qui disent la vitesse.
 */
export function Dust({ fighter }: { fighter: Fighter }) {
  const mesh = useMemo(() => {
    const geo = new THREE.IcosahedronGeometry(1, 1)
    const mat = new THREE.MeshStandardMaterial({ color: '#f1ebe1', roughness: 1 })
    const m = new THREE.InstancedMesh(geo, mat, MAX_BALLS)
    m.frustumCulled = false
    m.count = 0
    return m
  }, [])
  useEffect(
    () => () => {
      mesh.geometry.dispose()
      ;(mesh.material as THREE.Material).dispose()
    },
    [mesh],
  )
  const balls = useMemo<Ball[]>(() => [], [])

  useFrame((_, realDt) => {
    const dt = Math.min(realDt, 1 / 20)
    for (const p of fighter.puffs.splice(0)) {
      for (let i = 0; i < PER_PUFF; i++) {
        if (balls.length >= MAX_BALLS) balls.shift()
        const a = Math.random() * Math.PI * 2
        const r = p.size * (0.1 + Math.random() * 0.25)
        balls.push({
          x: p.x + Math.cos(a) * r,
          y: p.y + p.size * 0.05,
          z: p.z + Math.sin(a) * r,
          vx: Math.cos(a) * p.size * 1.6,
          vy: p.size * (0.6 + Math.random() * 0.8),
          vz: Math.sin(a) * p.size * 1.6,
          // Petites : grosses, elles lisaient comme des boules de neige.
          size: p.size * (0.055 + Math.random() * 0.06),
          age: 0,
        })
      }
    }
    let n = 0
    for (let i = balls.length - 1; i >= 0; i--) {
      const b = balls[i]
      b.age += dt
      if (b.age >= LIFE) {
        balls.splice(i, 1)
        continue
      }
      // Freinée par l'air : la laine ne vole pas loin.
      const drag = Math.exp(-dt * 6)
      b.vx *= drag
      b.vy *= drag
      b.vz *= drag
      b.x += b.vx * dt
      b.y += b.vy * dt
      b.z += b.vz * dt
      const u = b.age / LIFE
      // Gonfle en un cinquième de sa vie, puis fond.
      const k = u < 0.2 ? u / 0.2 : 1 - (u - 0.2) / 0.8
      _o.position.set(b.x, b.y, b.z)
      _o.scale.setScalar(Math.max(1e-4, b.size * (0.6 + 0.4 * k) * Math.sqrt(k)))
      _o.updateMatrix()
      mesh.setMatrixAt(n++, _o.matrix)
    }
    mesh.count = n
    mesh.instanceMatrix.needsUpdate = true
  })

  return <primitive object={mesh} />
}

const _o = new THREE.Object3D()

// ---------------------------------------------------------------- tapis

/**
 * Le tapis de l'arène : une couture en points avant qui en marque le bord, et
 * quelques croix de fil semées dessus. Sans eux, sur le blanc, rien ne bouge
 * autour de la poupée quand la caméra la suit — on ne voit pas qu'elle court.
 */
export function ArenaFloor({ y, radius }: { y: number; radius: number }) {
  const { ring, crosses } = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({ color: '#d8cdbb', roughness: 1 })
    const matX = new THREE.MeshStandardMaterial({ color: '#e7dfd2', roughness: 1 })
    const R = radius + 0.25
    const n = Math.round((2 * Math.PI * R) / 0.34)
    const ring = new THREE.InstancedMesh(new THREE.BoxGeometry(0.17, 0.01, 0.035), mat, n)
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2
      _o.position.set(Math.cos(a) * R, 0, Math.sin(a) * R)
      _o.rotation.set(0, -a + Math.PI / 2, 0)
      _o.scale.setScalar(1)
      _o.updateMatrix()
      ring.setMatrixAt(i, _o.matrix)
    }
    // Croix : deux points croisés, semés au hasard (graine fixe) sur le disque.
    let seed = 7
    const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
    // Même densité quel que soit le rayon : 90 croix pour un tapis de 6.
    const count = Math.round(90 * (radius / 6) ** 2)
    const crosses = new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 0.008, 0.022), matX, count * 2)
    for (let i = 0; i < count; i++) {
      const r = Math.sqrt(rnd()) * radius
      const a = rnd() * Math.PI * 2
      const turn = rnd() * Math.PI
      for (let k = 0; k < 2; k++) {
        _o.position.set(Math.cos(a) * r, 0, Math.sin(a) * r)
        _o.rotation.set(0, turn + (k ? Math.PI / 4 : -Math.PI / 4), 0)
        _o.updateMatrix()
        crosses.setMatrixAt(i * 2 + k, _o.matrix)
      }
    }
    ring.receiveShadow = true
    crosses.receiveShadow = true
    return { ring, crosses }
  }, [radius])
  useEffect(
    () => () => {
      for (const m of [ring, crosses]) {
        m.geometry.dispose()
        ;(m.material as THREE.Material).dispose()
      }
    },
    [ring, crosses],
  )
  return (
    <group position={[0, y + 0.004, 0]}>
      <primitive object={ring} />
      <primitive object={crosses} />
    </group>
  )
}

// ---------------------------------------------------------------- images rémanentes

/** Images rémanentes gardées au plus, volumes par image, durée de vie. */
const GHOSTS = 10
const PARTS = 14
const GHOST_LIFE = 0.28

/**
 * Images rémanentes du dash et de la glissade : la silhouette de la poupée
 * (`Fighter.silhouette`, quatorze ellipsoïdes) figée à intervalles, qui
 * s'efface en un quart de seconde. C'est ce qui fait lire un dash comme une
 * esquive — l'œil voit d'où elle est partie — et pas comme un pas.
 *
 * Tout en **un seul dessin** instancié ; translucide, hors de la profondeur
 * (le trait d'encre ne les cerne pas, elles ne masquent rien), plus dense
 * sur les bords qu'au centre : un contour de lumière plutôt qu'une nappe.
 */
export function Ghosts({ fighter }: { fighter: Fighter }) {
  const g = useMemo(() => {
    const geo = new THREE.IcosahedronGeometry(1, 2)
    const alpha = new THREE.InstancedBufferAttribute(new Float32Array(GHOSTS * PARTS), 1)
    geo.setAttribute('aAlpha', alpha)
    const mat = new THREE.ShaderMaterial({
      // Bleu ardoise soutenu : un bleu pâle disparaissait sur l'arène blanche.
      uniforms: { uColor: { value: new THREE.Color('#4f6299') } },
      vertexShader: /* glsl */ `
        attribute float aAlpha;
        varying float vAlpha;
        varying float vRim;
        void main() {
          vAlpha = aAlpha;
          vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
          vec3 n = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
          vec3 toCam = normalize(cameraPosition - world.xyz);
          vRim = 1.0 - abs(dot(n, toCam));
          gl_Position = projectionMatrix * viewMatrix * world;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        varying float vAlpha;
        varying float vRim;
        void main() {
          gl_FragColor = vec4(uColor, vAlpha * (0.3 + 0.7 * vRim * vRim));
        }`,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    })
    const mesh = new THREE.InstancedMesh(geo, mat, GHOSTS * PARTS)
    mesh.frustumCulled = false
    mesh.renderOrder = 9
    mesh.count = 0
    return { mesh, alpha, age: new Float32Array(GHOSTS).fill(GHOST_LIFE), next: 0 }
  }, [])
  useEffect(
    () => () => {
      g.mesh.geometry.dispose()
      ;(g.mesh.material as THREE.Material).dispose()
    },
    [g],
  )

  useFrame((_, realDt) => {
    const dt = Math.min(realDt, 1 / 20)
    if (fighter.ghostRequest) {
      fighter.ghostRequest = false
      const slot = g.next
      g.next = (g.next + 1) % GHOSTS
      g.age[slot] = 0
      for (let p = 0; p < PARTS; p++) {
        _gm.fromArray(fighter.silhouette, p * 16)
        g.mesh.setMatrixAt(slot * PARTS + p, _gm)
      }
      g.mesh.instanceMatrix.needsUpdate = true
    }
    let live = 0
    for (let i = 0; i < GHOSTS; i++) {
      g.age[i] += dt
      const u = Math.min(1, g.age[i] / GHOST_LIFE)
      const a = u >= 1 ? 0 : 0.75 * (1 - u) ** 1.3
      if (a > 0) live = i + 1
      for (let p = 0; p < PARTS; p++) g.alpha.setX(i * PARTS + p, a)
    }
    g.alpha.needsUpdate = true
    // On ne dessine que jusqu'au dernier emplacement vivant.
    g.mesh.count = live * PARTS
  })

  return <primitive object={g.mesh} />
}

const _gm = new THREE.Matrix4()

// ---------------------------------------------------------------- cercle rituel

/** Durée d'un cercle, s. */
const SIGIL_LIFE = 0.75

/**
 * Dessin du cercle, au canvas, une fois : deux anneaux, une étoile à cinq
 * branches pointe en bas, des glyphes inventés entre les anneaux — à la
 * manière d'un vévé vaudou, tracés d'un trait qui se reprend — et un
 * pointillé de couture. Blanc sur transparent, avec un halo (`shadowBlur`) :
 * c'est le shader qui le colore.
 */
function sigilTexture(size = 512) {
  const cv = document.createElement('canvas')
  cv.width = cv.height = size
  const g = cv.getContext('2d')!
  const c = size / 2
  const R = size * 0.46
  g.strokeStyle = '#fff'
  g.fillStyle = '#fff'
  g.lineCap = 'round'
  g.lineJoin = 'round'
  g.shadowColor = '#fff'
  g.shadowBlur = size * 0.02
  const ring = (r: number, w: number) => {
    g.lineWidth = w
    g.beginPath()
    g.arc(c, c, r, 0, Math.PI * 2)
    g.stroke()
  }
  ring(R, size * 0.018)
  ring(R * 0.8, size * 0.012)
  ring(R * 0.23, size * 0.008)
  // Pointillé de couture, juste à l'intérieur de l'anneau extérieur.
  g.lineWidth = size * 0.006
  for (let k = 0; k < 72; k++) {
    const a = (k / 72) * Math.PI * 2
    const r0 = R * 0.9
    const r1 = R * 0.93
    g.beginPath()
    g.moveTo(c + Math.cos(a) * r0, c + Math.sin(a) * r0)
    g.lineTo(c + Math.cos(a + 0.03) * r1, c + Math.sin(a + 0.03) * r1)
    g.stroke()
  }
  // Étoile, pointe en bas (vers +y du canvas), inscrite dans l'anneau intérieur.
  g.lineWidth = size * 0.012
  g.beginPath()
  for (let k = 0; k <= 5; k++) {
    const a = Math.PI / 2 + (k * 2 * (Math.PI * 2)) / 5
    const x = c + Math.cos(a) * R * 0.8
    const y = c + Math.sin(a) * R * 0.8
    if (k === 0) g.moveTo(x, y)
    else g.lineTo(x, y)
  }
  g.stroke()
  // Glyphes entre les anneaux, en face des branches : chacun un petit vévé.
  const glyph = (k: number) => {
    const a = Math.PI / 2 + (k * Math.PI * 2) / 5 + Math.PI / 5
    const r = R * 0.9
    g.save()
    g.translate(c + Math.cos(a) * r * 0.945, c + Math.sin(a) * r * 0.945)
    g.rotate(a + Math.PI / 2)
    const u = size * 0.028
    g.lineWidth = size * 0.007
    g.beginPath()
    switch (k) {
      case 0: // croix de carrefour
        g.moveTo(-u, 0); g.lineTo(u, 0); g.moveTo(0, -u); g.lineTo(0, u)
        g.moveTo(-u * 0.6, -u * 0.6); g.lineTo(-u * 0.6, -u * 0.3)
        break
      case 1: // cœur percé
        g.moveTo(0, u * 0.8); g.bezierCurveTo(-u * 1.2, -u * 0.1, -u * 0.5, -u, 0, -u * 0.35)
        g.bezierCurveTo(u * 0.5, -u, u * 1.2, -u * 0.1, 0, u * 0.8)
        g.moveTo(-u, u); g.lineTo(u, -u)
        break
      case 2: // serpent
        g.moveTo(-u, u * 0.3)
        g.bezierCurveTo(-u * 0.5, -u, 0, u, u * 0.4, -u * 0.2)
        g.lineTo(u, -u * 0.5)
        break
      case 3: // cercueil et croix
        g.moveTo(-u * 0.4, -u); g.lineTo(u * 0.4, -u); g.lineTo(u * 0.6, -u * 0.3)
        g.lineTo(u * 0.3, u); g.lineTo(-u * 0.3, u); g.lineTo(-u * 0.6, -u * 0.3); g.closePath()
        g.moveTo(0, -u * 0.6); g.lineTo(0, u * 0.5); g.moveTo(-u * 0.3, -u * 0.2); g.lineTo(u * 0.3, -u * 0.2)
        break
      default: // étoile d'épingle
        for (let i = 0; i < 4; i++) {
          const b = (i * Math.PI) / 4
          g.moveTo(Math.cos(b) * u, Math.sin(b) * u)
          g.lineTo(-Math.cos(b) * u, -Math.sin(b) * u)
        }
    }
    g.stroke()
    g.beginPath()
    g.arc(0, 0, u * 0.18, 0, Math.PI * 2)
    g.fill()
    g.restore()
  }
  for (let k = 0; k < 5; k++) glyph(k)
  // Au centre : une croix, et la tête d'épingle.
  g.lineWidth = size * 0.01
  g.beginPath()
  g.moveTo(c, c - R * 0.17); g.lineTo(c, c + R * 0.17)
  g.moveTo(c - R * 0.11, c - R * 0.04); g.lineTo(c + R * 0.11, c - R * 0.04)
  g.stroke()
  const tex = new THREE.CanvasTexture(cv)
  tex.anisotropy = 4
  return tex
}

/**
 * Cercle rituel du double saut, comme un hologramme : il s'ouvre sous les
 * pieds là où la poupée reprend appui en l'air, tourne, scintille de lignes
 * de balayage, et s'efface en trois quarts de seconde. Couleur braise en
 * fondu **normal** : additif, il disparaîtrait sur l'arène blanche. Hors de
 * la profondeur, le trait d'encre ne le cerne pas.
 */
export function Sigil({ fighter }: { fighter: Fighter }) {
  const s = useMemo(() => {
    const map = sigilTexture()
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        map: { value: map },
        uColor: { value: new THREE.Color('#e2461e') },
        uCore: { value: new THREE.Color('#ffb36b') },
        uAlpha: { value: 0 },
        uTime: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D map;
        uniform vec3 uColor;
        uniform vec3 uCore;
        uniform float uAlpha;
        uniform float uTime;
        varying vec2 vUv;
        void main() {
          vec4 t = texture2D(map, vUv);
          // Balayage et scintillement d'hologramme.
          float scan = 0.72 + 0.28 * sin(vUv.y * 180.0 - uTime * 26.0);
          float flick = 0.86 + 0.14 * sin(uTime * 53.0) * sin(uTime * 17.0);
          vec3 col = mix(uColor, uCore, smoothstep(0.55, 1.0, t.a));
          gl_FragColor = vec4(col, t.a * uAlpha * scan * flick);
        }`,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    })
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat)
    mesh.rotation.x = -Math.PI / 2
    mesh.renderOrder = 8
    mesh.visible = false
    mesh.frustumCulled = false
    return { mesh, mat, map, age: SIGIL_LIFE, spin: 0 }
  }, [])
  useEffect(
    () => () => {
      s.mesh.geometry.dispose()
      s.mat.dispose()
      s.map.dispose()
    },
    [s],
  )

  useFrame((state, realDt) => {
    const dt = Math.min(realDt, 1 / 20)
    if (fighter.sigilRequest) {
      fighter.sigilRequest = false
      s.age = 0
      s.spin = Math.random() * Math.PI * 2
      s.mesh.position.copy(fighter.sigilAt)
      s.mesh.position.y -= 0.02
      s.mesh.visible = true
    }
    if (!s.mesh.visible) return
    s.age += dt
    const u = s.age / SIGIL_LIFE
    if (u >= 1) {
      s.mesh.visible = false
      return
    }
    // S'ouvre vite (ease-out), tient, puis s'éteint en grandissant un peu.
    const open = 1 - (1 - Math.min(1, u / 0.18)) ** 3
    const size = 1.5 * (0.45 + 0.55 * open + 0.15 * u)
    s.mesh.scale.set(size, size, 1)
    s.spin += dt * 1.4
    s.mesh.rotation.z = s.spin
    s.mat.uniforms.uAlpha.value = open * (1 - Math.max(0, (u - 0.45) / 0.55)) ** 1.5 * 0.95
    s.mat.uniforms.uTime.value = state.clock.elapsedTime
  })

  return <primitive object={s.mesh} />
}
