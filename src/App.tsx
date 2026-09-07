import { useEffect, useMemo, useRef } from 'react'
import { Canvas } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { Leva } from 'leva'
import { Doll } from './doll/Doll'
import { useDollParams, type DollParams } from './doll/params'
import { dollLayout } from './doll/layout'
import { TRAITS, boardHair, boardTones } from './doll/traits'
import { Lights } from './scene/Lights'
import { Rig } from './scene/Rig'
import { BlobShadow } from './scene/BlobShadow'
import { bindTurntable } from './core/turntable'

const COLS = 3
const SPACING_X = 2.6
const ROW_GAP = 2.9
// Le panneau leva mange le bord droit : on décale la planche vers la gauche.
const GALLERY_OFFSET_X = -1

/**
 * Version allégée pour la planche : six poupées au réglage plein tiennent
 * ~1700 appels de rendu (coques de duvet + segments de locks). On rabote les
 * deux postes les plus coûteux, sans toucher à ce qui distingue les variantes.
 */
function lightened(p: DollParams): DollParams {
  return {
    ...p,
    shell: { ...p.shell, count: Math.min(p.shell.count, 5) },
    hair: { ...p.hair, segments: Math.min(p.hair.segments, 6) },
  }
}

export default function App() {
  const { params: p, regenerate } = useDollParams()
  const stage = useRef<HTMLDivElement>(null)

  const { gallery, light, single } = p.board

  const shown = useMemo(() => {
    const base = gallery && light ? lightened(p) : p
    const layout = dollLayout(base)
    if (!gallery) {
      const trait = TRAITS.find((t) => t.id === single) ?? TRAITS[0]
      return [{ trait, params: base, layout, x: 0, y: 0, label: false, tone: undefined, hair: undefined }]
    }

    // Les laines sont choisies **pour la planche**, pas poupée par poupée : tirées
    // indépendamment, deux d'une même génération tombaient sur la même teinte ou
    // sur deux voisines, et la planche perdait sa lecture de nuancier.
    const tones = boardTones(base.seed, TRAITS.length)
    // Même règle pour les locks : deux tignasses de la même teinte dans une
    // génération se lisent comme une répétition, exactement comme deux corps de
    // la même laine.
    const hairs = boardHair(base.seed, TRAITS.length)

    return TRAITS.map((trait, i) => ({
      trait,
      tone: tones[i],
      hair: hairs[i],
      // Graine décalée par poupée : ce qui est tiré au sort — pièces
      // rapportées, motifs de tissu, membre recousu, couleur d'épingle —
      // diffère d'une variante à l'autre. Sans ça les six seraient jumelles.
      params: { ...base, seed: base.seed + i * 137 },
      layout,
      x: ((i % COLS) - (COLS - 1) / 2) * SPACING_X + GALLERY_OFFSET_X,
      y: (i < COLS ? 0.5 : -0.5) * ROW_GAP,
      label: true,
    }))
  }, [p, gallery, light, single])

  const floorY = shown[0].layout.floorY

  useEffect(() => {
    if (!stage.current) return
    return bindTurntable(stage.current)
  }, [])

  return (
    <>
      <Leva titleBar={{ title: 'DummyFaces' }} />
      <button id="generate" type="button" onClick={regenerate}>
        Générer 6 nouvelles peluches
      </button>
      <div id="stage" ref={stage}>
        <Canvas
          shadows
          dpr={[1, 2]}
          camera={{ fov: 34, position: [0, 0.18, 4.4], near: 0.1, far: 80 }}
          // L'écru virait au blanc : on corrige à la source plutôt qu'en
          // rabotant chaque lumière une à une.
          gl={{ antialias: true, toneMappingExposure: 0.8 }}
        >
          <color attach="background" args={['#efeae2']} />
          {/* monté avant les poupées : son useFrame doit passer en premier */}
          <Rig spin={p.motion.spin} distanceScale={gallery ? 2.45 : 1} />
          {/* En planche les ombres de contact laissent la place aux blobs :
              une passe hors écran par poupée serait payée pour rien. */}
          <Lights floorY={floorY} contact={!gallery} />

          {shown.map((d) => (
            <group key={d.trait.id} position={[d.x, d.y, 0]}>
              <Doll p={d.params} trait={d.trait.id} tone={d.tone} hairColor={d.hair} />
              {gallery && <BlobShadow y={d.layout.floorY} radius={1.1} />}
              {d.label && (
                <Html position={[0, d.layout.floorY - 0.3, 0]} center className="label">
                  <div className="name">{d.trait.name}</div>
                  <div className="note">{d.trait.note}</div>
                </Html>
              )}
            </group>
          ))}
        </Canvas>
      </div>
      <div id="hint">glisser · tourner — deux doigts · déplacer — pincer · zoom</div>
    </>
  )
}
