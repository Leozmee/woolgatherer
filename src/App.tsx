import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { Leva } from 'leva'
import { Doll } from './doll/Doll'
import { useDollParams, type DollParams } from './doll/params'
import { dollLayout } from './doll/layout'
import { TRAITS, boardHair, boardTones } from './doll/traits'
import { applyMorph, boardMorphs, dollMorph } from './doll/morph'
import { boardFaces } from './doll/face'
import { boardHairStyles, HAIR_STYLE_NAMES, type HairStyle } from './doll/hairstyles'
import { Lights } from './scene/Lights'
import { Rig } from './scene/Rig'
import { BlobShadow } from './scene/BlobShadow'
import { bindTurntable, turntable } from './core/turntable'
import { Outline } from './scene/Outline'
import { KeepPrograms } from './scene/KeepPrograms'
import { RENDER_LOOK, setRenderLook } from './scene/toon'
import { ARENA, Fighter, type Press } from './doll/fighter'
import { ArenaFloor, Dust, Ghosts, Sigil, WeaponTrail } from './scene/Arena'

/**
 * Gestes de l'arène : touche clavier, boutons de manette (disposition
 * standard) et libellé. Manette : X attaque, A saut, B esquive, gâchettes
 * hautes parade, gâchettes basses (ou stick cliqué) sprint, stick gauche
 * déplacement.
 */
const MOVES: { press: Press; keys: string[]; pad: number[] }[] = [
  { press: 'attack', keys: ['j'], pad: [2] },
  { press: 'jump', keys: [' '], pad: [0] },
  { press: 'dodge', keys: ['l'], pad: [1] },
  { press: 'parry', keys: ['k'], pad: [4, 5] },
  { press: 'hit', keys: ['h'], pad: [3] },
  { press: 'ko', keys: ['x'], pad: [8] },
]
/** Sprint : touche tenue, ou gâchettes basses / stick cliqué. */
const SPRINT_KEY = 'shift'
const SPRINT_PAD = [6, 7, 10]
const JUMP_PAD = 0
/** Esquive tenue → glissade. */
const DODGE_KEY = 'l'
const DODGE_PAD = 1
/** Directions tenues : ZQSD (AZERTY), WASD, flèches. */
const DIRS: Record<string, [number, number]> = {
  z: [0, 1], w: [0, 1], arrowup: [0, 1],
  s: [0, -1], arrowdown: [0, -1],
  q: [-1, 0], a: [-1, 0], arrowleft: [-1, 0],
  d: [1, 0], arrowright: [1, 0],
}
/** Touches de direction tenues. */
const held = new Set<string>()
/** Autres touches tenues : sprint, saut (sa hauteur dépend de l'appui). */
const mods = new Set<string>()

/**
 * Interface de combat : nom et barre de vie de la poupée, en feutre cousu.
 * Mise à jour hors React, à chaque image : la vie change pendant un combat,
 * pas à chaque rendu.
 */
function Hud({ fighter, name, sub }: { fighter: Fighter; name: string; sub: string }) {
  const fill = useRef<HTMLDivElement>(null)
  const ghost = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let id = 0
    // La traîne claire rattrape la vie avec retard : on voit ce qu'on a perdu.
    let trail = fighter.hp
    const tick = () => {
      trail += (fighter.hp - trail) * (fighter.hp < trail ? 0.04 : 1)
      if (fill.current) fill.current.style.width = `${fighter.hp * 100}%`
      if (ghost.current) ghost.current.style.width = `${trail * 100}%`
      id = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(id)
  }, [fighter])
  return (
    <div id="hud">
      <div className="who">
        <span className="name">{name}</span>
        {sub && <span className="sub">{sub}</span>}
      </div>
      <div className="life">
        <div className="ghost" ref={ghost} />
        <div className="fill" ref={fill} />
      </div>
    </div>
  )
}

/**
 * Entrées de l'arène, lues à chaque image : clavier tenu et manette réunis.
 * L'API Gamepad ne pousse aucun événement : on relit les boutons, front
 * montant seulement — sinon un bouton tenu relancerait le geste à chaque image.
 * Priorité −3 : avant la caméra (−2) et la poupée (−1).
 */
function Controls({ fighter }: { fighter: Fighter }) {
  const was = useRef<boolean[]>([])
  useFrame(() => {
    let x = 0
    let y = 0
    for (const k of held) {
      x += DIRS[k][0]
      y += DIRS[k][1]
    }
    let sprint = mods.has(SPRINT_KEY)
    let jump = mods.has(' ')
    let dodge = mods.has(DODGE_KEY)
    const pad = navigator.getGamepads?.().find((g) => g)
    if (pad) {
      const down = pad.buttons.map((b) => b.pressed)
      for (const m of MOVES) if (m.pad.some((i) => down[i] && !was.current[i])) fighter.press(m.press)
      was.current = down
      sprint ||= SPRINT_PAD.some((i) => down[i])
      jump ||= !!down[JUMP_PAD]
      dodge ||= !!down[DODGE_PAD]
      const ax = pad.axes[0] ?? 0
      const ay = pad.axes[1] ?? 0
      // Zone morte, puis l'amplitude du stick passe telle quelle : on peut
      // marcher doucement.
      if (Math.hypot(ax, ay) > 0.18) {
        x += ax
        y -= ay
      }
    }
    fighter.input.x = x
    fighter.input.y = y
    fighter.sprint = sprint
    if (fighter.jumpHeld && !jump) fighter.release('jump')
    else fighter.jumpHeld = jump
    if (fighter.dodgeHeld && !dodge) fighter.release('dodge')
    else fighter.dodgeHeld = dodge
  }, -3)
  return null
}

const COLS = 3
const SPACING_X = 2.6
const ROW_GAP = 2.9

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
    /**
     * Tricot en 512 : six poupées d'environ 200 pixels de haut n'en montrent
     * pas plus. En 1024, dix-huit cartes à peindre au canvas puis à envoyer
     * au GPU figeaient l'écran près d'une seconde à chaque génération.
     */
    wool: { ...p.wool, mapSize: 512 },
  }
}

/**
 * Les six poupées d'une génération, avec tout ce qui les distingue.
 *
 * Fonction pure de la graine et des réglages : l'arène la rappelle avec les
 * réglages **pleins** et reprend la poupée choisie par son rang. La qualité
 * n'entre dans aucun tirage — coques et segments de locks ne sont lus par
 * aucune sélection — donc c'est la même poupée, rendue sans rabot.
 */
function buildBoard(base: DollParams, offsetX: number) {
  // Les laines sont choisies **pour la planche**, pas poupée par poupée : tirées
  // indépendamment, deux d'une même génération tombaient sur la même teinte ou
  // sur deux voisines, et la planche perdait sa lecture de nuancier.
  const tones = boardTones(base.seed, TRAITS.length)
  // Même règle pour les locks, les silhouettes, les visages et les coiffures :
  // une répétition dans une génération se lit tout de suite.
  const hairs = boardHair(base.seed, TRAITS.length)
  const morphs = boardMorphs(base, TRAITS.length)
  const faces = boardFaces(base.seed, TRAITS.length)
  const hairStyles = boardHairStyles(base.seed, TRAITS.length)
  // Les pieds d'une rangée restent sur une même ligne de sol : chaque poupée
  // est recentrée sur sa propre hauteur, donc sans ce décalage une poupée
  // trapue flotterait au-dessus de ses voisines.
  const floor = dollLayout(base).floorY

  return TRAITS.map((trait, i) => {
    // Graine décalée par poupée : ce qui est tiré au sort — pièces
    // rapportées, motifs de tissu, membre recousu, couleur d'épingle —
    // diffère d'une variante à l'autre. Sans ça les six seraient jumelles.
    const params = applyMorph({ ...base, seed: base.seed + i * 137 }, morphs[i].morph)
    const layout = dollLayout(params)
    return {
      trait,
      tone: tones[i] as { base: string; stitch: string } | undefined,
      hair: hairs[i] as string | undefined,
      face: faces[i] as (typeof faces)[number] | undefined,
      hairStyle: hairStyles[i] as HairStyle | undefined,
      // À 0, la variation morpho rend le patron nu : pas d'archétype à nommer.
      subtitle: [base.board.morph > 0 ? morphs[i].archetype.name : null, HAIR_STYLE_NAMES[hairStyles[i]]]
        .filter(Boolean)
        .join(' · '),
      params,
      layout,
      x: ((i % COLS) - (COLS - 1) / 2) * SPACING_X + offsetX,
      y: (i < COLS ? 0.5 : -0.5) * ROW_GAP + floor - layout.floorY,
    }
  })
}

type Entry = ReturnType<typeof buildBoard>[number]

/** Cadrage de départ, commun à la planche et à l'arène. */
function resetView() {
  turntable.yaw = 0
  turntable.pitch = 0.05
  turntable.vYaw = 0
  turntable.vPitch = 0
  turntable.distance = 4.4
  turntable.panX = 0
  turntable.panY = 0
}

export default function App() {
  const { params: p, regenerate } = useDollParams()
  const stage = useRef<HTMLDivElement>(null)
  /** Rang de la poupée choisie ; `null` sur l'écran de sélection. */
  const [picked, setPicked] = useState<number | null>(null)
  /**
   * Trois écrans : la planche, la **présentation** de la poupée choisie (seule,
   * sur la platine, avec son arme) et l'**arène**, où on la contrôle. Le bouton
   * *Jouer* fait passer de l'une à l'autre : choisir n'est pas encore jouer.
   */
  const [playing, setPlaying] = useState(false)
  const playingRef = useRef(false)
  playingRef.current = playing
  /**
   * Panneau de réglages : masqué par défaut, la page de sélection doit rester
   * épurée. La touche P le fait apparaître — c'est un outil d'atelier, pas une
   * partie de l'écran.
   */
  const [panel, setPanel] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input, textarea, select')) return
      if (e.key === 'p' || e.key === 'P') setPanel((v) => !v)
      if (e.key === 'Escape') {
        // Arène → présentation → planche.
        resetView()
        if (playingRef.current) setPlaying(false)
        else setPicked(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const { gallery, light, single } = p.board
  // Rendu figé (voir `toon.ts`) : posé avant le montage du Canvas, le chunk
  // d'éclairage étant lu à la compilation.
  const look = RENDER_LOOK
  useMemo(() => setRenderLook(look), [look])
  // Le panneau mange le bord droit : on décale la planche seulement quand il
  // est affiché.
  const offsetX = panel ? -1 : 0

  const board = useMemo(
    () => (gallery ? buildBoard(light ? lightened(p) : p, offsetX) : []),
    [p, gallery, light, offsetX],
  )

  /**
   * Une nouvelle planche se pose **une poupée par image**, de gauche à droite,
   * chacune à la place de l'ancienne. Toutes d'un coup, textures, géométries et
   * coiffures des six se fabriquaient dans la même image : l'écran figeait
   * près d'une seconde. Étalé, le même travail se lit comme une cascade.
   */
  const [reveal, setReveal] = useState({ board, count: board.length })
  const previous = useRef(board)
  const revealed = reveal.board === board ? reveal.count : 0
  if (reveal.board !== board) setReveal({ board, count: 0 })
  useEffect(() => {
    if (revealed >= board.length) {
      previous.current = board
      return
    }
    const id = requestAnimationFrame(() => setReveal((r) => (r.board === board ? { board, count: r.count + 1 } : r)))
    return () => cancelAnimationFrame(id)
  }, [revealed, board])
  const staged = board.map((d, i) => (i < revealed ? d : (previous.current[i] ?? d)))

  // Lecteur d'animation de la poupée choisie : un par passage dans l'arène.
  // Le combattant de la poupée choisie : un par passage dans l'arène.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fighter = useMemo(() => new Fighter({ drive: true }), [picked, playing])
  if (import.meta.env.DEV) (window as unknown as { __fighter: Fighter }).__fighter = fighter

  // Arène : la poupée choisie, en qualité pleine.
  const chosen = useMemo<Entry | null>(
    () => (gallery && picked !== null ? { ...buildBoard(p, 0)[picked], x: 0, y: 0 } : null),
    [p, gallery, picked],
  )

  // Mode atelier (panneau « 6 variantes » décoché) : une poupée seule, réglée
  // entièrement au panneau.
  const bench = useMemo<Entry | null>(() => {
    if (gallery) return null
    const trait = TRAITS.find((t) => t.id === single) ?? TRAITS[0]
    const params = applyMorph(p, dollMorph(p).morph)
    return {
      trait,
      tone: undefined,
      hair: undefined,
      face: undefined,
      hairStyle: p.board.hairStyle === 'auto' ? undefined : (p.board.hairStyle as HairStyle),
      subtitle: '',
      params,
      layout: dollLayout(params),
      x: 0,
      y: 0,
    }
  }, [p, gallery, single])

  const solo = chosen ?? bench
  const selecting = gallery && picked === null
  /** Arène : la poupée choisie, sous contrôle. */
  const arena = playing && chosen !== null
  const shown: Entry[] = solo ? [solo] : staged
  const floorY = shown[0].layout.floorY

  // Nouvelle génération : on revient à la sélection, l'ancienne poupée choisie
  // n'existe plus.
  const generate = () => {
    setPlaying(false)
    setPicked(null)
    regenerate()
  }

  const choose = (i: number) => {
    resetView()
    setPlaying(false)
    setPicked(i)
  }

  const back = () => {
    resetView()
    if (playing) setPlaying(false)
    else setPicked(null)
  }

  const play = () => {
    resetView()
    setPlaying(true)
  }

  useEffect(() => {
    if (!stage.current) return
    return bindTurntable(stage.current)
  }, [])

  // Clavier de l'arène.
  const inArena = playing && picked !== null
  useEffect(() => {
    if (!inArena) return
    const down = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.('input, textarea, select')) return
      const k = e.key.toLowerCase()
      if (k in DIRS) {
        held.add(k)
        e.preventDefault()
        return
      }
      if (k === SPRINT_KEY || k === ' ' || k === DODGE_KEY) {
        mods.add(k)
        e.preventDefault()
      }
      if (e.repeat) return
      const m = MOVES.find((m) => m.keys.includes(k))
      if (m) {
        fighter.press(m.press)
        e.preventDefault()
      }
    }
    const up = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase()
      held.delete(k)
      mods.delete(k)
    }
    const blur = () => {
      held.clear()
      mods.clear()
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
      held.clear()
      mods.clear()
    }
  }, [inArena, fighter])

  /**
   * Clic dans l'arène : une attaque. Un glissé, lui, tourne la caméra — on les
   * distingue à la distance parcourue entre l'appui et le relâchement.
   */
  useEffect(() => {
    const el = stage.current
    if (!inArena || !el) return
    let from: { x: number; y: number } | null = null
    const down = (e: PointerEvent) => {
      if (e.button === 0) from = { x: e.clientX, y: e.clientY }
    }
    const up = (e: PointerEvent) => {
      if (from && Math.hypot(e.clientX - from.x, e.clientY - from.y) < 6) fighter.press('attack')
      from = null
    }
    el.addEventListener('pointerdown', down)
    el.addEventListener('pointerup', up)
    return () => {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointerup', up)
    }
  }, [inArena, fighter])

  return (
    <>
      <Leva titleBar={{ title: 'DummyFaces' }} hidden={!panel} />

      {selecting ? (
        <button id="generate" type="button" onClick={generate}>
          Générer 6 nouvelles peluches
        </button>
      ) : (
        chosen &&
        !playing && (
          <div id="arena-bar">
            <button type="button" className="pill" onClick={back}>
              ← Sélection
            </button>
            <div className="arena-title">
              <div className="name">{chosen.trait.name}</div>
              {chosen.subtitle && <div className="sub">{chosen.subtitle}</div>}
            </div>
          </div>
        )
      )}

      <div id="stage" ref={stage}>
        <Canvas
          shadows
          dpr={[1, 2]}
          camera={{ fov: 34, position: [0, 0.18, 4.4], near: 0.1, far: 80 }}
          // L'écru virait au blanc : on corrige à la source plutôt qu'en
          // rabotant chaque lumière une à une.
          gl={{ antialias: true, toneMappingExposure: 0.9 }}
          // Atelier : le renderer exposé pour mesurer le coût d'une image.
          onCreated={({ gl, scene, advance, camera }) => {
            // `__advance` : faire avancer le jeu image par image pour les audits,
            // même panneau masqué (où le navigateur ne donne plus d'images).
            if (import.meta.env.DEV) Object.assign(window, { __gl: gl, __scene: scene, __advance: advance, __turntable: turntable, __camera: camera })
          }}
        >
          {/* Arène : un espace blanc vierge. */}
          <color attach="background" args={[arena ? '#ffffff' : '#efeae2']} />
          <KeepPrograms />
          {arena && <Controls fighter={fighter} />}
          {arena && <WeaponTrail fighter={fighter} />}
          {arena && <Dust fighter={fighter} />}
          {arena && <Ghosts fighter={fighter} />}
          {arena && <Sigil fighter={fighter} />}
          {arena && <ArenaFloor y={floorY} radius={ARENA} />}
          {/* monté avant les poupées : son useFrame doit passer en premier */}
          <Rig spin={selecting ? p.motion.spin : 0} distanceScale={selecting ? 2.6 : arena ? 1.6 : 1} follow={arena ? fighter : null} />
          {/* En planche les ombres de contact laissent la place aux blobs :
              une passe hors écran par poupée serait payée pour rien. */}
          <Lights floorY={floorY} contact={!selecting} lighting={look.lighting} follow={arena ? fighter : null} />
          {look.ink && (
            <Outline color={look.ink.color} width={look.ink.width} threshold={look.ink.threshold} tint={look.ink.tint}
              complement={look.ink.mode === 'complement'}
            />
          )}

          {shown.map((d, i) => (
            <group key={solo ? `solo-${d.trait.id}` : d.trait.id} position={[d.x, d.y, 0]}>
              <Doll
                p={d.params}
                trait={d.trait.id}
                tone={d.tone}
                hairColor={d.hair}
                face={d.face}
                hairStyle={d.hairStyle}
                fighter={arena ? fighter : undefined}
                weapon={!!chosen}
              />
              {selecting && <BlobShadow y={d.layout.floorY} radius={1.1} />}
              {selecting && (
                <Html position={[0, d.layout.floorY - 0.32, 0]} center className="label">
                  <div className="name">{d.trait.name}</div>
                  {d.subtitle && <div className="sub">{d.subtitle}</div>}
                  <button
                    type="button"
                    className="pill choose"
                    // La platine capture le pointeur dès l'appui : sans ça le
                    // relâchement ne revient jamais au bouton et le clic est perdu.
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => choose(i)}
                  >
                    Choisir
                  </button>
                </Html>
              )}
            </group>
          ))}
        </Canvas>
      </div>
      {chosen && !playing && (
        <button id="play" type="button" className="pill" onClick={play}>
          Jouer
        </button>
      )}
      {arena && chosen && (
        <>
          <Hud fighter={fighter} name={chosen.trait.name} sub={chosen.subtitle} />
          <div id="legend">
            <div><b>ZQSD</b> · stick — se déplacer</div>
            <div><b>Maj</b> · gâchette — courir</div>
            <div><b>espace</b> · A — sauter (tenir : plus haut · ×2 : double saut)</div>
            <div><b>J</b> · clic · X — attaquer (×3, en l'air : plongeon)</div>
            <div><b>L</b> · B — esquive · en courant, tenir : glissade</div>
            <div><b>K</b> · RB — parer</div>
            <div><b>glisser</b> — caméra · <b>échap</b> — quitter</div>
          </div>
        </>
      )}
      {!arena && (
        <div id="hint">{selecting ? 'glisser · tourner — pincer · zoom' : 'glisser · tourner — échap · retour'}</div>
      )}
    </>
  )
}
