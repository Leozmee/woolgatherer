import * as THREE from 'three'
import { mulberry32 } from './rand'

export type KnitOptions = {
  /** Résolution des canvas. 1024 est le minimum pour que la torsade se lise. */
  size?: number
  /** Nombre de mailles en largeur / hauteur dans la tuile. */
  cols: number
  rows: number
  /** Couleur de fond de la laine. */
  base: string
  /** Couleur du brin (légèrement plus clair que le fond en général). */
  stitch: string
  /** Force du relief dans la normal map. */
  relief: number
  /** Densité du duvet de fibres échappées. */
  fuzz: number
  /**
   * Côtes : nombre de mailles par nervure. 0 ou absent = jersey lisse.
   * Doit diviser `cols`, sinon la nervure ne se raccorde pas d'une tuile à
   * l'autre.
   */
  rib?: number
  seed: number
}

export type KnitMaps = {
  map: THREE.CanvasTexture
  normalMap: THREE.CanvasTexture
  roughnessMap: THREE.CanvasTexture
  dispose: () => void
}

type Pt = [number, number]

function canvas(size: number) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  return c
}

/**
 * Copie floutée. Le champ de hauteur doit passer par là avant le Sobel :
 * des normales très haute fréquence font scintiller le spéculaire dès que la
 * surface est réduite à l'écran, et aucun mipmap ne rattrape ça — la moyenne
 * de normales opposées donne une normale plate, pas une brillance atténuée.
 */
function blurred(src: HTMLCanvasElement, radius: number): HTMLCanvasElement {
  const out = canvas(src.width)
  const ctx = out.getContext('2d')!
  ctx.filter = `blur(${radius}px)`
  ctx.drawImage(src, 0, 0)
  ctx.filter = 'none'
  return out
}

/**
 * Composantes sRGB 0-255 d'une couleur hex.
 * On reste sur les chaînes plutôt que sur THREE.Color : ce dernier stocke du
 * linéaire quand la gestion des couleurs est active, et un canvas attend du
 * sRGB — un aller-retour de trop et la laine change de teinte sans prévenir.
 */
function rgb255(hexStr: string): [number, number, number] {
  const n = parseInt(hexStr.replace('#', ''), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

const shadeHex = (c: [number, number, number], k: number) =>
  `rgb(${Math.min(255, Math.round(c[0] * k))},${Math.min(255, Math.round(c[1] * k))},${Math.min(255, Math.round(c[2] * k))})`

const bez2 = (p0: Pt, p1: Pt, p2: Pt, t: number): Pt => {
  const u = 1 - t
  return [
    u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
    u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1],
  ]
}

/**
 * Échantillonne le « V » d'une maille : deux quadratiques raccordées à la pointe.
 * On travaille sur des points plutôt que sur un Path2D parce qu'il faut ensuite
 * parcourir le brin pour y poser la torsade.
 */
function stitchPath(cx: number, cy: number, armX: number, top: number, bottom: number, n: number): Pt[] {
  const a0: Pt = [cx - armX, cy - top]
  const a1: Pt = [cx - armX * 0.42, cy + bottom * 0.7]
  const a2: Pt = [cx, cy + bottom]
  const b1: Pt = [cx + armX * 0.42, cy + bottom * 0.7]
  const b2: Pt = [cx + armX, cy - top]

  const half = Math.max(2, Math.floor(n / 2))
  const pts: Pt[] = []
  for (let i = 0; i <= half; i++) pts.push(bez2(a0, a1, a2, i / half))
  for (let i = 1; i <= half; i++) pts.push(bez2(a2, b1, b2, i / half))
  return pts
}

function strokePath(ctx: CanvasRenderingContext2D, pts: Pt[]) {
  ctx.beginPath()
  ctx.moveTo(pts[0][0], pts[0][1])
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1])
  ctx.stroke()
}

/**
 * Rainures de torons : le fil est une ficelle, donc un assemblage de brins
 * torsadés séparés par des sillons obliques réguliers.
 *
 * La version précédente hachurait le brin trait par trait, en alternant clair
 * et sombre — ça donnait un grain, pas une corde. Ici on creuse un sillon net à
 * pas constant et on éclaire la crête juste après : l'œil lit alors des torons
 * distincts qui s'enroulent, ce qui est exactement ce qui fait une ficelle.
 */
function drawPlies(
  ctx: CanvasRenderingContext2D,
  pts: Pt[],
  strandWidth: number,
  pitch: number,
  angle: number,
  groove: string,
  crest: string,
  grooveWidth: number,
) {
  const ca = Math.cos(angle)
  const sa = Math.sin(angle)
  const half = strandWidth * 0.5
  let acc = pitch * 0.5

  ctx.lineCap = 'round'

  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i][0] - pts[i - 1][0]
    const dy = pts[i][1] - pts[i - 1][1]
    const seg = Math.hypot(dx, dy)
    if (seg === 0) continue
    acc += seg
    if (acc < pitch) continue
    acc = 0

    const tx = dx / seg
    const ty = dy / seg
    // Axe du sillon : la normale au brin, inclinée — c'est l'obliquité qui
    // donne le sens d'enroulement.
    const ax = -ty * ca + tx * sa
    const ay = tx * ca + ty * sa
    const [x, y] = pts[i]

    // crête du toron, juste en amont du sillon
    ctx.lineWidth = grooveWidth * 1.5
    ctx.strokeStyle = crest
    ctx.beginPath()
    ctx.moveTo(x - ax * half - tx * grooveWidth * 1.4, y - ay * half - ty * grooveWidth * 1.4)
    ctx.lineTo(x + ax * half - tx * grooveWidth * 1.4, y + ay * half - ty * grooveWidth * 1.4)
    ctx.stroke()

    // sillon
    ctx.lineWidth = grooveWidth
    ctx.strokeStyle = groove
    ctx.beginPath()
    ctx.moveTo(x - ax * half, y - ay * half)
    ctx.lineTo(x + ax * half, y + ay * half)
    ctx.stroke()
  }
}

/**
 * Duvet : fibres échappées du fil. Traits très fins, courts, orientés au hasard,
 * en faible opacité. Une laine parfaitement nette ment ; une laine pelucheuse
 * convainc.
 */
function drawFuzz(
  ctx: CanvasRenderingContext2D,
  size: number,
  count: number,
  color: string,
  alpha: number,
  rnd: () => number,
) {
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.strokeStyle = color
  ctx.lineCap = 'round'
  for (let i = 0; i < count; i++) {
    const x = rnd() * size
    const y = rnd() * size
    const a = rnd() * Math.PI * 2
    const l = size * (0.004 + rnd() * 0.012)
    ctx.lineWidth = size * (0.0008 + rnd() * 0.0014)
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.quadraticCurveTo(
      x + Math.cos(a) * l * 0.6 + (rnd() - 0.5) * l * 0.5,
      y + Math.sin(a) * l * 0.6 + (rnd() - 0.5) * l * 0.5,
      x + Math.cos(a) * l,
      y + Math.sin(a) * l,
    )
    ctx.stroke()
  }
  ctx.restore()
}

/**
 * Côtes.
 *
 * Le tricot d'une écharpe n'est pas du jersey lisse : c'est une alternance de
 * colonnes endroit / envers, qui creuse des nervures parallèles bien plus
 * lisibles de loin que la maille elle-même.
 *
 * On les creuse dans le **champ de hauteur** plutôt que de redessiner les
 * mailles : couleur, occlusion et normales en découlent toutes, donc les
 * nervures s'ombrent d'elles-mêmes et ne peuvent pas se désaligner du relief.
 */
function applyRib(height: HTMLCanvasElement, period: number, rowPitch: number) {
  const size = height.width
  const ctx = height.getContext('2d')!
  const img = ctx.getImageData(0, 0, size, size)
  const d = img.data

  // Profil transversal, calculé une fois par colonne : crête arrondie, sillon
  // net. Un simple cosinus donnerait des ondulations molles ; on le durcit au
  // smoothstep pour que le fond du sillon soit franc.
  const prof = new Float32Array(size)
  for (let x = 0; x < size; x++) {
    const t = ((x % period) + period) % period / period
    const w = 0.5 - 0.5 * Math.cos(t * Math.PI * 2)
    prof[x] = w * w * (3 - 2 * w)
  }

  for (let y = 0; y < size; y++) {
    const row = y * size * 4
    // Bosses de l'envers : entre deux nervures on voit la tranche des rangs,
    // pas des V. C'est ce contraste maille / bosses qui distingue une côte
    // tricotée d'une simple rayure en relief.
    const purl = 0.5 + 0.5 * Math.cos((y / rowPitch) * Math.PI * 2)
    for (let x = 0; x < size; x++) {
      const i = row + x * 4
      const r = prof[x]
      // La crête garde tout le détail de la maille — on ne fait que la soulever.
      // Écraser la hauteur dans le creux effaçait le tricot et il ne restait
      // qu'un dégradé peint.
      const v = Math.min(255, d[i] * (0.8 + 0.2 * r) + 52 * r + 30 * (1 - r) * purl)
      d[i] = d[i + 1] = d[i + 2] = v
    }
  }
  ctx.putImageData(img, 0, 0)
}

/** Sobel sur le champ de hauteur → normal map tangente (convention OpenGL, Y haut). */
function heightToNormal(height: HTMLCanvasElement, relief: number): HTMLCanvasElement {
  const size = height.width
  const src = height.getContext('2d')!.getImageData(0, 0, size, size).data

  const out = canvas(size)
  const octx = out.getContext('2d')!
  const dst = octx.createImageData(size, size)

  const at = (x: number, y: number) => {
    const xi = x < 0 ? x + size : x >= size ? x - size : x
    const yi = y < 0 ? y + size : y >= size ? y - size : y
    return src[(yi * size + xi) * 4] / 255
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx =
        at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) -
        (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1))
      const dy =
        at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) -
        (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1))

      // Le canvas a Y vers le bas, la normal map OpenGL Y vers le haut → dy garde son signe.
      const nx = -dx * relief
      const ny = dy * relief
      const len = Math.hypot(nx, ny, 1)

      const i = (y * size + x) * 4
      dst.data[i] = (nx / len * 0.5 + 0.5) * 255
      dst.data[i + 1] = (ny / len * 0.5 + 0.5) * 255
      dst.data[i + 2] = (1 / len * 0.5 + 0.5) * 255
      dst.data[i + 3] = 255
    }
  }
  octx.putImageData(dst, 0, 0)
  return out
}

/**
 * Occlusion ambiante approchée : l'inverse de la hauteur, très floutée.
 * Fondue dans la carte de couleur, elle noircit vraiment le fond des rainures —
 * sans elle les creux restent gris et le tissu paraît imprimé.
 */
function bakeOcclusion(height: HTMLCanvasElement, strength: number): HTMLCanvasElement {
  const size = height.width
  const out = canvas(size)
  const ctx = out.getContext('2d')!
  ctx.filter = `blur(${size / 150}px)`
  ctx.drawImage(height, 0, 0)
  ctx.filter = 'none'

  const img = ctx.getImageData(0, 0, size, size)
  for (let i = 0; i < img.data.length; i += 4) {
    const h = img.data[i] / 255
    const ao = Math.round(255 * (1 - strength * (1 - h)))
    img.data[i] = img.data[i + 1] = img.data[i + 2] = ao
  }
  ctx.putImageData(img, 0, 0)
  return out
}

/**
 * Génère les trois cartes d'une laine tricotée : couleur (occlusion incluse),
 * relief et rugosité. Tout est produit en canvas, aucun asset externe.
 */
export function makeKnitMaps(opts: KnitOptions): KnitMaps {
  const t0 = performance.now()
  const size = opts.size ?? 1024
  const { cols, rows, base, stitch, relief, fuzz, rib, seed } = opts

  const cw = size / cols
  const ch = size / rows
  const armX = cw * 0.5
  // Les jambes de la maille montent d'une rangée entière : c'est ce
  // recouvrement qui donne le tressage du jersey. À 0.44 elles s'arrêtaient au
  // ras de la cellule et les V se raccordaient bout à bout en zigzags continus.
  const top = ch * 0.75
  const bottom = ch * 0.42
  // La grosseur du fil vient du **nombre** de mailles (peu et larges), pas de
  // l'épaisseur du trait dans sa cellule : au-delà de ~0.5 les brins voisins
  // fusionnent, la structure en V disparaît et il ne reste que des boutons.
  const bodyWidth = cw * 0.44

  /**
   * Profil transversal du brin, du bord vers la crête.
   * Un dôme en quatre paliers plutôt qu'une marche : le fil paraît rond et
   * moelleux au lieu d'aplati, et les normales obtenues sont douces — donc
   * beaucoup moins sujettes au scintillement.
   */
  const DOME = [
    { w: 1.0, h: 95, c: 0.82 },
    { w: 0.72, h: 165, c: 0.96 },
    { w: 0.46, h: 215, c: 1.08 },
    { w: 0.18, h: 248, c: 1.22 },
  ]
  const samples = Math.max(14, Math.round((cw + ch) * 0.35))
  const TWIST = 0.75 // radians — l'inclinaison des torons autour du fil

  /**
   * Parcourt la grille de mailles. Le même générateur pseudo-aléatoire est
   * rejoué à chaque passe, donc le bruit de position reste identique et les
   * cartes couleur / hauteur restent alignées au pixel près.
   */
  const forEachStitch = (paint: (pts: Pt[], j: number) => void) => {
    const rnd = mulberry32(seed)
    // Pas de quinconce : le jersey a des colonnes de mailles verticales.
    // Décaler une rangée sur deux fabrique un réseau de losanges, pas du tricot.
    //
    // Rangées parcourues du bas vers le haut, pour que chaque rangée soit
    // dessinée **par-dessus** celle du dessous et masque le sommet de ses
    // jambes — exactement l'ordre dans lequel le tricot se monte. Dessiner dans
    // l'autre sens laisse toutes les jambes visibles et le motif se lit en
    // vagues au lieu de mailles distinctes.
    for (let r = rows + 1; r >= -2; r--) {
      for (let c = -1; c <= cols; c++) {
        const j = rnd()
        const jx = (rnd() - 0.5) * cw * 0.1
        const jy = (rnd() - 0.5) * ch * 0.1
        const sc = 0.94 + rnd() * 0.12
        paint(
          stitchPath(
            c * cw + cw * 0.5 + jx,
            r * ch + ch * 0.5 + jy,
            armX * sc,
            top * sc,
            bottom * sc,
            samples,
          ),
          j,
        )
      }
    }
  }

  // ------------------------------------------------ champ de hauteur
  const heightCanvas = canvas(size)
  const hctx = heightCanvas.getContext('2d')!
  hctx.fillStyle = '#000'
  hctx.fillRect(0, 0, size, size)
  hctx.lineCap = 'round'
  hctx.lineJoin = 'round'

  // Chaque maille est peinte **entièrement** — dôme et torsade — avant la
  // suivante. Peindre palier par palier sur toute la grille remettait la crête
  // par-dessus tout le monde : les mailles ne se recouvraient plus, et l'ordre
  // de tricotage n'avait aucun effet visible.
  forEachStitch((pts, j) => {
    for (const step of DOME) {
      const v = Math.round(Math.min(255, step.h + j * 22))
      hctx.lineWidth = bodyWidth * step.w
      hctx.strokeStyle = `rgb(${v},${v},${v})`
      strokePath(hctx, pts)
    }
    hctx.save()
    hctx.globalAlpha = 0.85
    drawPlies(
      hctx,
      pts,
      bodyWidth * 0.92,
      bodyWidth * 0.62, // pas des torons
      TWIST,
      'rgb(70,70,70)',
      'rgb(255,255,255)',
      bodyWidth * 0.16,
    )
    hctx.restore()
  })
  drawFuzz(hctx, size, Math.round(size * fuzz * 1.4), '#ffffff', 0.2, mulberry32(seed + 991))
  if (rib) applyRib(heightCanvas, cw * rib, ch)

  const normalCanvas = heightToNormal(blurred(heightCanvas, size / 420), relief)
  const aoCanvas = bakeOcclusion(heightCanvas, 0.38)

  // ------------------------------------------------ couleur
  // Dérivée du champ de hauteur plutôt que repeinte à part.
  //
  // Peindre le dôme une seconde fois en couleur ne pouvait pas marcher : la
  // passe la plus large recouvrait les rainures qu'elle venait de creuser, et
  // la carte finissait plate là où la normal map, elle, gardait sa structure.
  // Ici la teinte va du fond de rainure vers la crête du brin, et l'ombrage
  // suit la hauteur — les deux cartes ne peuvent plus diverger.
  const bRGB = rgb255(base)
  const sRGB = rgb255(stitch)
  // Plage d'ombrage : fond de rainure → crête du brin. Le haut dépasse 1 pour
  // que la crête retrouve la teinte nominale de la laine une fois l'occlusion
  // multiplée par-dessus — sinon les deux courbes se cumulent et tout grisonne.
  const SHADE_LO = 0.42
  const SHADE_HI = 1.28

  const colorCanvas = canvas(size)
  const cctx = colorCanvas.getContext('2d')!
  const hData = hctx.getImageData(0, 0, size, size).data
  const cImg = cctx.createImageData(size, size)

  for (let i = 0; i < cImg.data.length; i += 4) {
    const h = hData[i] / 255
    const t = h * h * (3 - 2 * h) // smoothstep : mélange doux fond → brin
    const shade = SHADE_LO + (SHADE_HI - SHADE_LO) * h
    cImg.data[i] = (bRGB[0] + (sRGB[0] - bRGB[0]) * t) * shade
    cImg.data[i + 1] = (bRGB[1] + (sRGB[1] - bRGB[1]) * t) * shade
    cImg.data[i + 2] = (bRGB[2] + (sRGB[2] - bRGB[2]) * t) * shade
    cImg.data[i + 3] = 255
  }
  cctx.putImageData(cImg, 0, 0)

  // Duvet dense : la laine cardée n'a pas de brin net, elle a un halo de fibres.
  cctx.lineCap = 'round'
  drawFuzz(cctx, size, Math.round(size * fuzz * 1.3), shadeHex(sRGB, 1.18), 0.4, mulberry32(seed + 77))
  drawFuzz(cctx, size, Math.round(size * fuzz * 0.7), shadeHex(bRGB, 0.7), 0.16, mulberry32(seed + 178))

  // L'occlusion est fondue ici plutôt que servie en aoMap : ça évite un second
  // jeu d'UV pour un résultat identique sur une surface aussi dense.
  cctx.globalCompositeOperation = 'multiply'
  cctx.drawImage(aoCanvas, 0, 0)
  cctx.globalCompositeOperation = 'source-over'

  // ------------------------------------------------ rugosité
  // Les crêtes de fil, plus tassées, brillent légèrement ; le fond des rainures
  // et le duvet diffusent. Une rugosité constante est ce qui donne l'aspect
  // plastique moulé.
  const roughCanvas = canvas(size)
  const rctx = roughCanvas.getContext('2d')!
  const hImg = hctx.getImageData(0, 0, size, size)
  const rImg = rctx.createImageData(size, size)
  const rnd = mulberry32(seed + 313)
  for (let i = 0; i < rImg.data.length; i += 4) {
    const h = hImg.data[i] / 255
    const v = Math.round(255 * (0.98 - h * 0.22 + (rnd() - 0.5) * 0.06))
    rImg.data[i] = rImg.data[i + 1] = rImg.data[i + 2] = v
    rImg.data[i + 3] = 255
  }
  rctx.putImageData(rImg, 0, 0)

  // ------------------------------------------------ textures
  const map = new THREE.CanvasTexture(colorCanvas)
  map.colorSpace = THREE.SRGBColorSpace

  // Ni la normal map ni la rugosité ne passent en sRGB : ce sont des données,
  // pas des couleurs.
  const normalMap = new THREE.CanvasTexture(normalCanvas)
  const roughnessMap = new THREE.CanvasTexture(roughCanvas)

  for (const t of [map, normalMap, roughnessMap]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.anisotropy = 16
  }

  if (import.meta.env.DEV) {
    // La galerie devra multiplier ce coût par le nombre de poupées : on le
    // garde sous les yeux plutôt que de le découvrir à 20 exemplaires.
    console.info(`[knit] cartes ${size}² générées en ${Math.round(performance.now() - t0)} ms`)
  }

  return {
    map,
    normalMap,
    roughnessMap,
    dispose: () => {
      map.dispose()
      normalMap.dispose()
      roughnessMap.dispose()
    },
  }
}

/**
 * Clone partageant l'image mais avec sa propre répétition.
 * Une par partie du corps : sans ça, la maille serait minuscule sur la tête et
 * énorme sur un bras, puisque chaque UV va de 0 à 1 quelle que soit la taille.
 */
export function tiled(tex: THREE.Texture, rx: number, ry = rx): THREE.Texture {
  const t = tex.clone()
  t.needsUpdate = true
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(rx, ry)
  return t
}

// Réutilisés par le générateur de corde des locks : même chaîne
// hauteur → normales, inutile de la réécrire.
export { canvas as makeCanvas, heightToNormal }
