import * as THREE from 'three'
import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/**
 * Fusionne les petites pièces **fixes** d'un sous-arbre, par matière.
 *
 * Une poupée porte des centaines de pièces immobiles les unes par rapport aux
 * autres — points de couture, surjets des pièces, boutons, épingles, perles.
 * Écrites une par une, elles sont lisibles et chacune a son composant ; mais
 * dessinées une par une, elles coûtaient un appel de rendu chacune, plus sur
 * la planche que tout le reste réuni. Ici on les laisse s'écrire comme avant,
 * puis, une fois montées, on regroupe celles qui partagent la même matière en
 * une seule géométrie, dans le repère du groupe. Les originaux sont masqués,
 * pas détruits : React les possède toujours.
 *
 * **Seulement pour ce qui ne bouge pas à l'intérieur du groupe** : le groupe
 * peut bouger tout entier (tête, torse, membre), mais une pièce animée à
 * l'intérieur resterait figée dans sa pose du moment. Une matière modifiée au
 * shader (`onBeforeCompile`) est laissée telle quelle : on ne sait pas ce
 * qu'elle attend de sa géométrie.
 *
 * `deps` : ce qui change le contenu. La fusion est refaite quand elles
 * changent, et défaite avant.
 */
export function Batched({ deps, children }: { deps: unknown[]; children: ReactNode }) {
  const group = useRef<THREE.Group>(null!)

  useLayoutEffect(() => {
    const root = group.current
    root.updateWorldMatrix(true, true)
    const inv = root.matrixWorld.clone().invert()

    const buckets = new Map<string, THREE.Mesh[]>()
    root.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh || !mesh.visible || (mesh as THREE.InstancedMesh).isInstancedMesh) return
      if ((mesh.geometry as THREE.InstancedBufferGeometry).isInstancedBufferGeometry || mesh.userData.noBatch) return
      const mat = mesh.material
      if (Array.isArray(mat) || mat.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile) return
      const key = materialKey(mat)
      let list = buckets.get(key)
      if (!list) buckets.set(key, (list = []))
      list.push(mesh)
    })

    const made: THREE.Mesh[] = []
    const hidden: THREE.Mesh[] = []
    const m = new THREE.Matrix4()
    for (const list of buckets.values()) {
      if (list.length < 2) continue
      const geos: THREE.BufferGeometry[] = []
      for (const mesh of list) {
        const g = normalized(mesh.geometry)
        if (!g) continue
        m.multiplyMatrices(inv, mesh.matrixWorld)
        g.applyMatrix4(m)
        geos.push(g)
      }
      if (geos.length < 2) {
        geos.forEach((g) => g.dispose())
        continue
      }
      const merged = mergeGeometries(geos, false)
      geos.forEach((g) => g.dispose())
      if (!merged) continue
      const out = new THREE.Mesh(merged, list[0].material)
      out.castShadow = list.some((l) => l.castShadow)
      out.receiveShadow = list.some((l) => l.receiveShadow)
      out.renderOrder = list[0].renderOrder
      root.add(out)
      made.push(out)
      for (const mesh of list) {
        mesh.visible = false
        hidden.push(mesh)
      }
    }

    return () => {
      for (const out of made) {
        root.remove(out)
        out.geometry.dispose()
      }
      for (const mesh of hidden) mesh.visible = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return <group ref={group}>{children}</group>
}

/** Même clé = même programme et mêmes uniformes : fusionnables sans rien changer au rendu. */
function materialKey(mat: THREE.Material): string {
  const m = mat as THREE.MeshPhysicalMaterial
  const tex = (t: THREE.Texture | null | undefined) => (t ? t.uuid : '-')
  return [
    m.type,
    m.color?.getHexString(),
    m.emissive?.getHexString(),
    m.roughness,
    m.metalness,
    m.sheen,
    m.sheenColor?.getHexString(),
    m.sheenRoughness,
    m.clearcoat,
    m.clearcoatRoughness,
    tex(m.map),
    tex(m.normalMap),
    tex(m.roughnessMap),
    tex(m.alphaMap),
    m.normalScale?.x,
    m.side,
    m.transparent,
    m.opacity,
    m.alphaTest,
    m.depthWrite,
    m.depthTest,
    m.polygonOffset,
    m.polygonOffsetFactor,
    m.flatShading,
    m.vertexColors,
    JSON.stringify(m.defines ?? {}),
    m.customProgramCacheKey(),
  ].join('|')
}

/**
 * Copie ramenée aux attributs communs — position, normale, UV —, indexée :
 * `mergeGeometries` exige le même jeu partout.
 */
function normalized(src: THREE.BufferGeometry): THREE.BufferGeometry | null {
  const pos = src.attributes.position
  if (!pos) return null
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', pos.clone())
  if (src.index) g.setIndex(src.index.clone())
  else g.setIndex(Array.from({ length: pos.count }, (_, i) => i))
  if (src.attributes.normal) g.setAttribute('normal', src.attributes.normal.clone())
  else g.computeVertexNormals()
  const uv = src.attributes.uv
  g.setAttribute('uv', uv ? uv.clone() : new THREE.Float32BufferAttribute(new Float32Array(pos.count * 2), 2))
  return g
}
