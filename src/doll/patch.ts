import * as THREE from 'three'
import { mulberry32 } from '../core/rand'
import { HOLE_COLS, HOLE_SLOTS, HOLE_SPAN } from './fuzz'
import { onTorso } from './surface'
import type { DollParams } from './params'

/** Motifs de tissu disponibles pour les pièces rapportées. */
export type FabricKind =
  | 'uni'
  | 'rayures'
  | 'rayuresDiag'
  | 'carreaux'
  | 'ecossais'
  | 'pois'
  | 'chevrons'
  | 'losanges'
  | 'moucheté'
  | 'ondes'
  | 'croix'

const FABRICS: FabricKind[] = [
  'uni',
  'rayures',
  'rayuresDiag',
  'carreaux',
  'ecossais',
  'pois',
  'chevrons',
  'losanges',
  'moucheté',
  'ondes',
  'croix',
]

/** Palettes de tissus de récupération : ternes, délavées, jamais saturées. */
const CLOTH: [string, string][] = [
  ['#8d6f52', '#6b5138'],
  ['#7d7f6a', '#5d5f4c'],
  ['#96706b', '#6f4e4a'],
  ['#6d7684', '#4e5763'],
  ['#a08a5e', '#7a6742'],
]

export type PatchMaps = { map: THREE.CanvasTexture; dispose: () => void }

/**
 * Tissu de la pièce.
 *
 * Motifs tracés au canvas plutôt que teintes plates : deux pièces unies de
 * couleurs voisines se lisent comme une erreur de rendu, alors que des rayures
 * ou des carreaux disent tout de suite « morceau d'un autre vêtement ».
 */
export function makeFabricTexture(
  kind: FabricKind,
  colors: [string, string],
  seed: number,
  size = 128,
): PatchMaps {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')!
  const [light, dark] = colors
  const rnd = mulberry32(seed)

  ctx.fillStyle = light
  ctx.fillRect(0, 0, size, size)
  ctx.strokeStyle = dark
  ctx.fillStyle = dark

  const step = size / (4 + Math.floor(rnd() * 4))

  switch (kind) {
    case 'rayures':
      ctx.lineWidth = step * 0.45
      for (let x = -size; x < size * 2; x += step) {
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, size)
        ctx.stroke()
      }
      break

    case 'carreaux':
      ctx.globalAlpha = 0.55
      ctx.lineWidth = step * 0.4
      for (let x = 0; x < size; x += step) {
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, size)
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(0, x)
        ctx.lineTo(size, x)
        ctx.stroke()
      }
      ctx.globalAlpha = 1
      break

    case 'pois':
      for (let y = step * 0.5; y < size; y += step) {
        for (let x = step * 0.5; x < size; x += step) {
          const off = (Math.round(y / step) % 2) * step * 0.5
          ctx.beginPath()
          ctx.arc(x + off, y, step * 0.17, 0, Math.PI * 2)
          ctx.fill()
        }
      }
      break

    case 'chevrons':
      ctx.lineWidth = step * 0.22
      ctx.lineCap = 'square'
      for (let y = -step; y < size + step; y += step) {
        for (let x = -step; x < size + step; x += step) {
          ctx.beginPath()
          ctx.moveTo(x, y + step * 0.5)
          ctx.lineTo(x + step * 0.5, y)
          ctx.lineTo(x + step, y + step * 0.5)
          ctx.stroke()
        }
      }
      break

    case 'rayuresDiag':
      // Tracées au-delà des bords et en diagonale : la tuile se raccorde tant
      // que le pas divise la taille du canvas.
      ctx.lineWidth = step * 0.4
      for (let d = -size; d < size * 2; d += step) {
        ctx.beginPath()
        ctx.moveTo(d, 0)
        ctx.lineTo(d + size, size)
        ctx.stroke()
      }
      break

    case 'ecossais': {
      // Tartan : bandes larges translucides, puis fins liserés par-dessus.
      const wide = step * 1.6
      ctx.globalAlpha = 0.35
      ctx.lineWidth = wide * 0.55
      for (let x = 0; x < size; x += wide) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, size); ctx.stroke()
        ctx.beginPath(); ctx.moveTo(0, x); ctx.lineTo(size, x); ctx.stroke()
      }
      ctx.globalAlpha = 0.75
      ctx.lineWidth = Math.max(1, step * 0.1)
      for (let x = wide * 0.5; x < size; x += wide) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, size); ctx.stroke()
        ctx.beginPath(); ctx.moveTo(0, x); ctx.lineTo(size, x); ctx.stroke()
      }
      ctx.globalAlpha = 1
      break
    }

    case 'losanges': {
      // Argyle : losanges pleins en quinconce, plus les diagonales fines.
      ctx.globalAlpha = 0.5
      for (let y = 0; y <= size; y += step) {
        for (let x = 0; x <= size; x += step) {
          const off = (Math.round(y / step) % 2) * step * 0.5
          ctx.beginPath()
          ctx.moveTo(x + off, y - step * 0.5)
          ctx.lineTo(x + off + step * 0.45, y)
          ctx.lineTo(x + off, y + step * 0.5)
          ctx.lineTo(x + off - step * 0.45, y)
          ctx.closePath()
          ctx.fill()
        }
      }
      ctx.globalAlpha = 1
      break
    }

    case 'moucheté':
      // Tweed : semis dense, dans les deux couleurs.
      for (let i = 0; i < size * 12; i++) {
        ctx.fillStyle = rnd() < 0.5 ? dark : light
        ctx.globalAlpha = 0.25 + rnd() * 0.5
        const r = 0.5 + rnd() * 1.6
        ctx.fillRect(rnd() * size, rnd() * size, r, r)
      }
      ctx.globalAlpha = 1
      break

    case 'ondes':
      ctx.lineWidth = step * 0.18
      for (let y = 0; y < size + step; y += step * 0.7) {
        ctx.beginPath()
        for (let x = 0; x <= size; x += 4) {
          const yy = y + Math.sin((x / size) * Math.PI * 4) * step * 0.22
          if (x === 0) ctx.moveTo(x, yy)
          else ctx.lineTo(x, yy)
        }
        ctx.stroke()
      }
      break

    case 'croix':
      ctx.lineWidth = step * 0.14
      for (let y = step * 0.5; y < size; y += step) {
        for (let x = step * 0.5; x < size; x += step) {
          const off = (Math.round(y / step) % 2) * step * 0.5
          const c = step * 0.18
          ctx.beginPath()
          ctx.moveTo(x + off - c, y); ctx.lineTo(x + off + c, y)
          ctx.moveTo(x + off, y - c); ctx.lineTo(x + off, y + c)
          ctx.stroke()
        }
      }
      break

    default:
      break
  }

  // Usure : la pièce vient d'un vêtement déjà porté.
  ctx.globalAlpha = 0.12
  ctx.fillStyle = dark
  for (let i = 0; i < size * 3; i++) {
    ctx.fillRect(rnd() * size, rnd() * size, 1 + rnd() * 2, 1 + rnd() * 2)
  }
  ctx.globalAlpha = 1

  const map = new THREE.CanvasTexture(c)
  map.colorSpace = THREE.SRGBColorSpace
  map.wrapS = map.wrapT = THREE.RepeatWrapping
  map.anisotropy = 8
  return { map, dispose: () => map.dispose() }
}

/**
 * Contour de la pièce, en rayons autour de son centre.
 *
 * Quatre familles plutôt qu'un rectangle : un carré parfait lit comme un
 * autocollant, alors qu'un morceau déchiré ou un polygone irrégulier lit comme
 * un bout découpé dans un autre vêtement.
 */
function outline(rnd: () => number, n: number): number[] {
  const kind = Math.floor(rnd() * 4)
  const raw: number[] = []

  for (let i = 0; i < n; i++) {
    const t = i / n
    switch (kind) {
      case 0: // déchiré : rayon très irrégulier
        raw.push(0.62 + rnd() * 0.55)
        break
      case 1: // arrondi : ovale légèrement cabossé
        raw.push(1 + Math.sin(t * Math.PI * 2) * 0.12 + (rnd() - 0.5) * 0.12)
        break
      case 2: { // polygone : cinq côtés francs
        const k = Math.floor(t * 5) / 5
        raw.push(0.78 + ((k * 7919) % 1) * 0.4)
        break
      }
      default: // bande allongée
        raw.push(0.5 + Math.abs(Math.cos(t * Math.PI * 2)) * 0.75)
        break
    }
  }

  // Lissage circulaire : sans lui les contours déchirés partent en dents de
  // scie et la pièce ne lit plus comme du tissu.
  return raw.map((_, i) => {
    const a = raw[(i - 1 + n) % n]
    const b = raw[i]
    const c = raw[(i + 1) % n]
    return (a + 2 * b + c) / 4
  })
}

/** Une passe de fil enjambant le bord de la pièce. */
export type Whip = { pos: THREE.Vector3; quat: THREE.Quaternion; length: number }

/** Emplacement d'un élément cousu sur le torse, en coordonnées de surface. */
export type Placement = { az: number; y: number; w: number; h: number }

/**
 * Portion de torse dans laquelle tirer un emplacement.
 *
 * `az` en radians (0 = face avant), `y` en fractions de la demi-hauteur du
 * torse — les mêmes unités que `Placement`.
 */
export type PatchZone = { az: [number, number]; y: [number, number] }

/**
 * Tire un emplacement libre sur le torse.
 *
 * Partagé par les pièces **et** la poche : la poche n'est qu'une pièce parmi
 * les autres, elle doit obéir aux mêmes règles. Fixée à un endroit, elle
 * réapparaissait au même point à chaque génération.
 */
export function samplePlacement(
  rnd: () => number,
  ry: number,
  taken: Placement[],
  wRange: [number, number],
  hRange: [number, number],
  /**
   * Restreint le tirage à une portion du torse, sans le figer.
   *
   * Une pièce imposée ne doit pas devenir une pièce **posée** : ce qui est
   * contraint est la zone, pas l'emplacement. Sans ça la régénération ramène la
   * même pièce au même point et n'a plus l'air de faire quoi que ce soit.
   */
  zone?: PatchZone,
): Placement | null {
  const [az0, az1] = zone?.az ?? [0, Math.PI * 2]
  const [y0, y1] = zone?.y ?? [-0.42, 0.4]

  for (let attempt = 0; attempt < 60; attempt++) {
    const az = az0 + rnd() * (az1 - az0)
    // Ni sur les épaules ni sous le bassin : l'élément y déborderait du volume.
    const y = (y0 + rnd() * (y1 - y0)) * ry
    const w = wRange[0] + rnd() * (wRange[1] - wRange[0])
    const h = (hRange[0] + rnd() * (hRange[1] - hRange[0])) * ry

    const clash = taken.some((q) => {
      let du = az - q.az
      du -= Math.round(du / (Math.PI * 2)) * Math.PI * 2
      return Math.abs(du) < (w + q.w) * 0.9 && Math.abs(y - q.y) < (h + q.h) * 0.9
    })
    if (!clash) return { az, y, w, h }
  }
  return null
}

export type Patch = {
  geometry: THREE.BufferGeometry
  /** Emplacement occupé, pour que d'autres éléments l'évitent. */
  place: Placement
  /** Surjet : le fil passe du tissu à la laine, en biais. */
  stitches: Whip[]
  fabric: PatchMaps
  /**
   * Vrai si le point de surface (azimut, hauteur) tombe sous la pièce.
   * Sert à masquer ce qu'elle recouvre — un ornement qui transperce une pièce
   * cousue par-dessus trahit immédiatement l'assemblage.
   */
  covers: (azimuth: number, y: number) => boolean
  /** Contour en rayons : c'est par lui que le duvet se perce sous la pièce. */
  radii: number[]
}

const UP = new THREE.Vector3(0, 1, 0)

/**
 * Point de surjet.
 *
 * Chaque passe part de l'intérieur de la pièce et ressort sur la laine, en
 * biais. C'est ce qui coud réellement un écusson : une ronde de croix posées à
 * côté du bord ne fait que décorer, elle ne rattache rien à l'œil.
 */
function whipStitches(
  p: DollParams,
  az: number,
  y: number,
  w: number,
  h: number,
  radii: number[],
  /**
   * Altitude du bout intérieur, posé sur le tissu.
   *
   * Pris sur la jupe, il descend avec elle et la passe entière disparaît dans
   * la laine — or c'est le fil qu'on doit voir. On l'ancre donc sur le plateau,
   * en deçà du rabat.
   */
  crest: number,
  every: number,
): Whip[] {
  const out: Whip[] = []
  const n = radii.length
  const slant = ((Math.PI * 2) / n) * 1.1

  /**
   * Plongeon du bout extérieur, **sous** la peau.
   *
   * Un surjet se définit par le fait d'entrer dans le tissu. Les deux bouts
   * posés au-dessus de la peau, la passe n'est qu'un bâtonnet suspendu dans les
   * fibres — et les fibres sont un halo troué, donc au ras de la silhouette on
   * voit le fil s'arrêter en l'air. Sous le creux du bosselage, plus le rayon du
   * fil pour que le bout franc du cylindre soit enterré et pas seulement à ras.
   */
  const dive = -(p.shape.lumps * p.shape.torsoRadius * 0.55 + p.thread.radius * 0.55)

  for (let k = 0; k < n; k += every) {
    const a = (k / n) * Math.PI * 2
    const r = radii[k]
    // Passes courtes, juste à cheval sur le bord. Trop longues, elles forment
    // une frange de cordes autour de la pièce au lieu d'une couture. Le budget
    // de longueur va vers la profondeur, pas vers la course horizontale.
    const inner = onTorso(p, az + Math.cos(a) * w * r * 0.86, y + Math.sin(a) * h * r * 0.86, crest)
    const outer = onTorso(
      p,
      az + Math.cos(a + slant) * w * r * 1.02,
      y + Math.sin(a + slant) * h * r * 1.02,
      dive,
    )

    const dir = outer.pos.clone().sub(inner.pos)
    const length = dir.length()
    if (length < 1e-5) continue

    out.push({
      pos: inner.pos.clone().addScaledVector(dir, 0.5),
      quat: new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize()),
      length,
    })
  }
  return out
}

const SEGMENTS = 28
/**
 * Rayon normalisé où la jupe commence.
 *
 * Plus tôt, elle mange le dégagement du milieu et la pièce retombe sous les
 * fibres ; plus tard, la chute devient un biseau trop dur. Elle se termine là
 * où le duvet revient (`HOLE_SHRINK`), donc les fibres restantes referment
 * justement sur la jupe.
 */
const RAMP = 0.76
/** Anneaux de l'éventail : plateau, départ de jupe, jupe, ourlet. */
const RINGS = [0.45, RAMP, 0.9, 1]

/**
 * Pièce cousue sur le torse.
 *
 * Construite comme un **éventail projeté sur la surface** : chaque sommet du
 * contour passe par la même fonction `onTorso` que les points de couture, donc
 * la pièce et ses sutures ne peuvent pas se désolidariser. Une calotte de
 * sphère plaquée par-dessus, elle, décolle dès que le torse n'est pas une
 * ellipsoïde parfaite — c'est ce qui donnait l'impression d'un morceau posé.
 */
export function buildPatches(
  p: DollParams,
  seed: number,
  /** Zones interdites — la couture intégrale, par exemple. */
  avoid?: (az: number, y: number, w: number, h: number) => boolean,
  /**
   * Zone imposée à la **première** pièce.
   *
   * Certaines variantes ont besoin qu'une pièce tombe à coup sûr quelque part —
   * sur le devant du buste, par exemple. On contraint la zone du premier
   * tirage, pas son résultat : la pièce reste tirée au sort à l'intérieur.
   */
  first?: PatchZone,
): Patch[] {
  const rnd = mulberry32(seed)
  const out: Patch[] = []
  const ry = p.shape.torsoHeight * 0.5
  const count = 2 + Math.floor(rnd() * 3)

  // Tirage libre avec rejet des chevauchements, plutôt qu'une liste
  // d'emplacements fixes légèrement bruités : avec des créneaux figés la
  // première pièce retombait toujours au même endroit d'une génération à
  // l'autre, ce qui vidait la régénération de son intérêt.
  const placed: Placement[] = []

  for (let i = 0; i < count; i++) {
    const zone = i === 0 ? first : undefined
    let spot = samplePlacement(rnd, ry, placed, [0.32, 0.6], [0.15, 0.3], zone)
    // Un second tirage suffit en pratique : la zone interdite est étroite.
    for (let retry = 0; retry < 12 && spot && avoid?.(spot.az, spot.y, spot.w, spot.h); retry++) {
      spot = samplePlacement(rnd, ry, placed, [0.32, 0.6], [0.15, 0.3], zone)
    }
    if (!spot || avoid?.(spot.az, spot.y, spot.w, spot.h)) break
    placed.push(spot)
    const { az, y, w, h } = spot

    const radii = outline(rnd, SEGMENTS)
    // Relèvement : les bosses du rembourrage **et** le duvet.
    //
    // `onTorso` décrit l'ellipsoïde idéale alors que le torse est bruité : sans
    // marge la pièce s'enfonce dans la laine par endroits. Et le duvet est de la
    // géométrie — des coques repoussées le long des normales sur toute la hauteur
    // de fibre — donc une pièce relevée de la seule amplitude des bosses reste
    // **sous les fibres** : elles la traversent, son bord disparaît dans la laine
    // et elle a l'air enfoncée dans la peau.
    //
    // Mais la dégager de toute la hauteur de fibre la décolle : posée au sommet
    // du duvet, plus rien ne mord sur son bord et elle flotte au-dessus de la
    // peluche. Et ce relèvement ne peut pas être **constant** : `onTorso`
    // décale chaque sommet le long de la normale, donc une pièce à relèvement
    // constant est la surface parallèle du torse — et le contour d'une surface
    // parallèle, vu de profil, est celui du corps dilaté d'autant. Son bord
    // sort alors du corps, en l'air, et lit comme un couvercle posé dessus.
    //
    // Un tissu cousu à plat fait l'inverse : dégagé au milieu, là où le
    // rembourrage bombe, et **pincé sous la peau** sur son pourtour, là où le
    // surjet le rabat. On lui donne donc un profil — plateau puis jupe.
    const lift = p.shape.lumps * p.shape.torsoRadius * 0.65 + p.shell.height * 0.3 + 0.006
    // Sous le creux le plus profond du bosselage : le bord est alors invisible
    // par construction, sans que le milieu descende d'un millième.
    const edge = -p.shape.lumps * p.shape.torsoRadius * 0.5
    const liftAt = (rho: number) =>
      THREE.MathUtils.lerp(lift, edge, THREE.MathUtils.smoothstep(rho, RAMP, 1))

    // --- surface de la pièce : un éventail, puis des couronnes de quads. La
    // jupe a besoin de ses propres anneaux, un contour unique ne peut porter
    // aucun profil.
    const centre = onTorso(p, az, y, lift)
    const positions: number[] = [centre.pos.x, centre.pos.y, centre.pos.z]
    const uvs: number[] = [0.5, 0.5]
    const indices: number[] = []

    RINGS.forEach((rho, r) => {
      const base = 1 + r * SEGMENTS
      for (let k = 0; k < SEGMENTS; k++) {
        const a = (k / SEGMENTS) * Math.PI * 2
        const du = Math.cos(a) * w * radii[k] * rho
        const dv = Math.sin(a) * h * radii[k] * rho
        const s = onTorso(p, az + du, y + dv, liftAt(rho))
        positions.push(s.pos.x, s.pos.y, s.pos.z)
        uvs.push(0.5 + (du / (w * 2)) * 0.9, 0.5 + (dv / (h * 2)) * 0.9)

        const next = (k + 1) % SEGMENTS
        if (r === 0) indices.push(0, base + k, base + next)
        else {
          const prev = base - SEGMENTS
          indices.push(prev + k, base + k, base + next, prev + k, base + next, prev + next)
        }
      }
    })

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
    geo.setIndex(indices)
    // Normales calculées, pas reprises de l'ellipsoïde : c'est l'ombrage propre
    // de la jupe qui la fait lire comme un bord rabattu et non comme une coupe.
    geo.computeVertexNormals()

    // Pas de cordon continu sur le bord : un tube qui fait le tour lit comme
    // une corde posée autour d'un trou, pas comme une pièce cousue. Seules les
    // passes de fil doivent se voir.

    const stitches = whipStitches(p, az, y, w, h, radii, liftAt(0.86) + p.thread.radius * 0.55, 4)

    const kind = FABRICS[Math.floor(rnd() * FABRICS.length)]
    const colors = CLOTH[Math.floor(rnd() * CLOTH.length)]

    const meanRadius = radii.reduce((a, b) => a + b, 0) / radii.length

    out.push({
      geometry: geo,
      place: spot,
      radii,
      stitches,
      fabric: makeFabricTexture(kind, colors, seed + i * 31),
      covers: (azimuth, py) => {
        // Écart d'azimut ramené dans [-π, π] : sans ça une pièce à l'arrière
        // recouvrirait le devant.
        let du = azimuth - az
        du -= Math.round(du / (Math.PI * 2)) * Math.PI * 2
        const dv = py - y
        return Math.hypot(du / w, dv / h) < meanRadius * 0.95
      },
    })
  }

  return out
}

/**
 * Poche rapportée : même projection en éventail que les pièces, mais le cordon
 * de couture s'arrête avant le haut — c'est l'ouverture qui fait la poche, et
 * une couture tout autour la ramènerait à une simple pièce.
 */
export function buildPocket(p: DollParams, az: number, y: number, w: number, h: number) {
  const positions: number[] = []
  const normals: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  const rim: THREE.Vector3[] = []
  // Même relèvement que les pièces : bosses du rembourrage plus duvet.
  const lift = p.shape.lumps * p.shape.torsoRadius * 0.65 + p.shell.height * 0.3 + 0.005

  const centre = onTorso(p, az, y, lift)
  positions.push(centre.pos.x, centre.pos.y, centre.pos.z)
  normals.push(centre.normal.x, centre.normal.y, centre.normal.z)
  uvs.push(0.5, 0.5)

  const n = 28
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2
    // Rectangle aux angles arrondis : la puissance 4 aplatit les côtés.
    const c = Math.cos(a)
    const si = Math.sin(a)
    const r = 1 / Math.pow(Math.pow(Math.abs(c), 4) + Math.pow(Math.abs(si), 4), 0.25)
    const du = c * w * r
    const dv = si * h * r
    const sp = onTorso(p, az + du, y + dv, lift)
    positions.push(sp.pos.x, sp.pos.y, sp.pos.z)
    normals.push(sp.normal.x, sp.normal.y, sp.normal.z)
    uvs.push(0.5 + (du / (w * 2)) * 0.9, 0.5 + (dv / (h * 2)) * 0.9)
    rim.push(sp.pos.clone())
    indices.push(0, k + 1, ((k + 1) % n) + 1)
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)

  // Surjet sur le tour cousu uniquement — le haut reste libre.
  const radii = Array.from({ length: n }, (_, k) => {
    const a = (k / n) * Math.PI * 2
    const c = Math.cos(a)
    const si = Math.sin(a)
    return 1 / Math.pow(Math.pow(Math.abs(c), 4) + Math.pow(Math.abs(si), 4), 0.25)
  })
  const stitches = whipStitches(p, az, y, w, h, radii, lift, 3).filter((_, k) => {
    const a = ((k * 3) / n) * Math.PI * 2
    return Math.sin(a) < 0.72
  })

  return { geometry, stitches }
}

/**
 * Trous à percer dans le duvet, un par pièce.
 *
 * Le duvet monte plus haut que la pièce qu'on coud dessus : quelle que soit la
 * hauteur de relèvement, ou les fibres la traversent, ou elle flotte au-dessus
 * d'elles. On retire donc la laine sous chaque pièce, comme sous un vrai
 * morceau de tissu cousu à plat.
 *
 * Le contour est rastérisé dans le **repère local de la pièce** — celui où le
 * contour est un simple polygone de rayons — plutôt que passé au shader comme
 * une liste de rayons : une tuile de masque coûte un échantillonnage, une liste
 * coûte une boucle par fragment et une taille figée dans le programme.
 */
export type PatchHoles = {
  mask: THREE.CanvasTexture
  /** Par pièce : azimut, hauteur, demi-largeur, demi-hauteur. */
  rects: THREE.Vector4[]
  count: number
  dispose: () => void
}

/**
 * Retrait sous le bord : on laisse une frange de laine mordre sur le contour.
 *
 * À zéro la pièce est posée sur un trou net et son bord ne tient à rien ; c'est
 * ce reste de fibres qui la raccroche à la peluche.
 */
const HOLE_SHRINK = 0.94
const HOLE_TILE = 128

export function patchHoles(patches: Patch[]): PatchHoles {
  const size = HOLE_TILE * HOLE_COLS
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, size, size)
  ctx.fillStyle = '#fff'

  // Au-delà de quatre pièces le masque n'a plus de tuile libre ; le tirage en
  // pose au plus quatre, la borne n'est là que pour ne pas déborder en silence.
  const used = patches.slice(0, HOLE_SLOTS)

  used.forEach((patch, i) => {
    const ox = (i % HOLE_COLS) * HOLE_TILE
    const oy = Math.floor(i / HOLE_COLS) * HOLE_TILE
    const n = patch.radii.length
    ctx.beginPath()
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2
      const r = patch.radii[k] * HOLE_SHRINK
      // `y` vers le bas dans le canvas, vers le haut sur la poupée.
      const x = ox + ((Math.cos(a) * r + HOLE_SPAN) / (2 * HOLE_SPAN)) * HOLE_TILE
      const y = oy + ((HOLE_SPAN - Math.sin(a) * r) / (2 * HOLE_SPAN)) * HOLE_TILE
      if (k === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.closePath()
    ctx.fill()
  })

  const mask = new THREE.CanvasTexture(c)
  // Pas de mipmaps : au loin ils mélangeraient les tuiles voisines, et le seuil
  // de découpe se mettrait à percer là où il n'y a pas de pièce.
  mask.flipY = false
  mask.generateMipmaps = false
  mask.minFilter = THREE.LinearFilter
  mask.magFilter = THREE.LinearFilter
  mask.wrapS = mask.wrapT = THREE.ClampToEdgeWrapping

  return {
    mask,
    rects: used.map((q) => new THREE.Vector4(q.place.az, q.place.y, q.place.w, q.place.h)),
    count: used.length,
    dispose: () => mask.dispose(),
  }
}
