import * as THREE from 'three'
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { FrameCarry, followLimbs, localFloor, useRigBones } from '../doll/rig'
import { mulberry32 } from '../core/rand'
import { ClothSheet } from './cloth_old'
import { makeKnitMaps } from '../core/knit'
import { useDisposable } from '../core/useDisposable'
import type { Collider } from '../core/springBone'
import { fringeGeometry, writeFringe, type FringeEnd } from '../doll/fringe'
import { sheetGeometry, writeSheet, writeSheetUv } from '../doll/sheet'
import { makeFiberTexture, makeShellUniforms, shellInstances, shellShader } from '../doll/fuzz'
import type { DollParams } from '../doll/params'
import {
  armClearance,
  armSpheres,
  bodyRadius as bodyProfile,
  bodySpheres,
  legSpheres,
} from '../doll/surface'

/**
 * Rangs de la nappe, **du bout avant au bout arrière**.
 *
 * L'ordre compte : le tissu s'enroule en se posant par-dessus lui-même, donc le
 * bout attaché au début du tour est celui qui passe **dessous**. C'est celui-là
 * qu'on veut devant — sinon le pan visible a l'air posé sur l'écharpe sans rien
 * qui le retienne, et on se demande comment il tient.
 */
export const FRONT_PTS = 18
export const WRAP_PTS = 26
// Pan arrière très long (voir `TAIL`) : plus de rangs, sinon il se plie en
// segments raides quand il flotte.
export const BACK_PTS = 30
export const ROWS = FRONT_PTS + WRAP_PTS + BACK_PTS

/**
 * Colonnes en travers.
 *
 * Six suffisaient à faire onduler le tissu mais pas à **arrondir** sa section :
 * le roulé des bords s'y lisait comme un pli net au milieu du pan. Il en faut
 * assez pour que la courbe soit une courbe.
 */
export const COLS = 10

/**
 * Tuile de tricot propre à l'écharpe : côtes 2 × 2.
 *
 * `rib` mailles par nervure, donc `cols / rib` nervures par tuile.
 */
const KNIT = { size: 768, cols: 10, rows: 12, rib: 2 }

/**
 * Colonnes de la nappe **au rendu**.
 *
 * Quatre par nervure : en dessous de deux, les côtes se replient et donnent des
 * battements au lieu de nervures. Elles ne coûtent que des sommets — la
 * simulation, elle, reste sur ses dix colonnes.
 */
/**
 * Colonnes de rendu, dimensionnées sur le **maximum** de côtes réglable.
 *
 * Quatre par nervure : en dessous de deux, les côtes se replient et donnent des
 * battements au lieu de nervures. Le maillage ne pouvant pas changer de taille
 * quand on bouge le curseur, on le taille pour le pire cas.
 */
const RCOLS = 14 * 4 + 1

/** Coques de duvet de l'écharpe — plafond, la planche allégée en a déjà moins. */
const SCARF_SHELLS = 4
/** Longueur de fibre de l'écharpe, relative à celle du corps : un vêtement, pas la peau. */
const SCARF_FUZZ = 0.45

/**
 * Jeu entre la ligne médiane du tissu et la peau, en fraction de la largeur.
 *
 * La nappe est un volume : sa face intérieure descend d'une demi-épaisseur sous
 * la médiane, davantage sur les crêtes des côtes. Et le corps porte son duvet,
 * qui déborde du maillage. Sans ce jeu, les pans s'enfoncent visiblement dans la
 * peluche ; trop généreux, il rouvre le jour entre le corps et l'écharpe. Il
 * suit donc les réglages d'épaisseur et de relief, sinon les deux dérivent.
 */
/**
 * **Signature de silhouette.** Le pan arrière est trois fois plus long que
 * celui d'une écharpe ordinaire : il traîne derrière la poupée, se soulève
 * dans la course, fouette dans les coups — il fait partie de l'animation. Le
 * pan avant, lui, s'allonge à peine : c'est le dos qui porte la ligne.
 */
const TAIL = { back: 2.7, front: 1.15 }

/** Part d'inertie « monde » des pans libres (voir `ClothExtras.carry`). */
const CARRY = 0.92

const clearOf = (p: DollParams) => (p.scarf.thickness * (1 + p.scarf.ribDepth)) / 2

/**
 * Rangs sur lesquels vrille et roulé s'installent en quittant le tour de cou.
 *
 * Les faire suivre la rampe de retenue les concentrait sur quatre rangs : la
 * section changeait d'un coup et le pli en travers se voyait comme une cassure.
 */
const EASE_ROWS = 13

/**
 * Rangs sur lesquels un pan vient se plaquer contre le corps en sortant du tour.
 *
 * Le tour garde son volume, les pans épousent : il faut bien passer de l'un à
 * l'autre. Cette rampe évite la marche à la jonction, et c'est elle qui fait
 * plonger le pan **sous** la couche qui le recouvre.
 */

/**
 * Enfoncement du pan sous la couche qui le recouvre : profondeur, en fraction
 * de la largeur de bande, et nombre de rangs sur lesquels il se joue.
 *
 * Discret et étalé. Marqué, il creuse une gorge à la sortie du tour : le pan y
 * prend une bosse et paraît détaché du reste de l'écharpe au lieu d'en être la
 * continuation.
 */
const TUCK_SPAN = 9

/**
 * Mèches de frange : borne haute du réglage, et sections par mèche.
 *
 * Bien moins nombreuses que les colonnes de la nappe : une mèche par colonne
 * donnait des brins jointifs qui se soudaient en une plaque. Une frange se lit
 * aux **vides** entre les mèches autant qu'aux mèches elles-mêmes.
 *
 * Le maillage est taillé pour le maximum — il ne peut pas changer de taille
 * quand on bouge le curseur — et les mèches en trop sont repliées.
 */
const FRINGE_MAX = 14
// Assez de sections pour porter plus d'une vague : à six, l'ondulation ne peut
// pas se replier et le brin reste une tige.
const FRINGE_SEGS = 10

/**
 * Unités monde couvertes par une tuile de tricot.
 *
 * Calée sur la **largeur de l'écharpe**, pas sur le corps : c'est la seule cote
 * que l'œil compare, puisqu'on voit les nervures courir d'un bord à l'autre. Le
 * corps sert d'étalon pour ses propres mailles ; ici l'étalon est la bande.
 */
function knitUnit(p: DollParams, m: Metrics) {
  return (m.band * (KNIT.cols / KNIT.rib)) / p.scarf.ribs
}

export function scarfMetrics(p: DollParams) {
  const r = p.shape.torsoRadius * p.shape.torsoTaper
  const rnd = mulberry32(p.seed + 717)
  const band = r * (0.82 + rnd() * 0.3) * p.scarf.width

  // La peluche n'a pratiquement pas de cou : le sommet des bras arrive plus haut
  // que le bas du crâne. Une bande posée à hauteur de cou traverse donc les
  // épaules. On la place sous le menton — c'est d'ailleurs là qu'une écharpe
  // finit sur une peluche.
  //
  // Le **haut de la bande** se cale au menton, pas sa ligne médiane : c'est sa
  // largeur qui décide. Plus haut elle monte sur la courbure du crâne, plus bas
  // elle glisse sous l'aisselle. Ainsi calée, elle part du menton et couvre le
  // haut des épaules — qui la portent.
  const chin = -p.shape.headRadius * p.shape.headSquash * 0.22
  const localY = chin - band * p.scarf.drop

  return {
    r,
    band,
    localY,
    torsoY: p.shape.torsoHeight * 0.44 + localY,
    front: p.shape.torsoHeight * (0.55 + rnd() * 0.3) * p.scarf.front * TAIL.front,
    back: p.shape.torsoHeight * (0.56 + rnd() * 0.3) * p.scarf.back * TAIL.back,
    /**
     * Sens d'enroulement, et côté du pan avant — les deux vont ensemble.
     *
     * **Fixe.** L'écharpe s'enroule toujours dans ce sens : le miroir existait
     * et a été retiré, un seul sens de roulage est voulu. La constante reste
     * plutôt qu'un `1` semé dans les formules, pour que les signes de chiralité
     * restent lisibles — vrille et roulé des bords en portent, et devraient le
     * porter encore si le miroir revenait un jour.
     */
    side: 1 as 1 | -1,
  }
}

type Metrics = ReturnType<typeof scarfMetrics>

/**
 * Rayon du corps à une hauteur donnée, dans le repère de l'écharpe.
 *
 * Simple changement de repère : la formule vit dans `surface.ts`, source unique
 * des profils, et sert aussi au collier.
 */
const bodyRadius = (p: DollParams, m: Metrics, y: number) => bodyProfile(p, y + m.localY)

const _h = new THREE.Vector3()

/** Hermite cubique : passe par les deux points **avec** les deux tangentes. */
function hermite(
  p0: THREE.Vector3,
  m0: THREE.Vector3,
  p1: THREE.Vector3,
  m1: THREE.Vector3,
  s: number,
) {
  const s2 = s * s
  const s3 = s2 * s
  return _h
    .set(0, 0, 0)
    .addScaledVector(p0, 2 * s3 - 3 * s2 + 1)
    .addScaledVector(m0, s3 - 2 * s2 + s)
    .addScaledVector(p1, -2 * s3 + 3 * s2)
    .addScaledVector(m1, s3 - s2)
    .clone()
}

/**
 * Ligne médiane de l'écharpe au repos, du bout arrière au bout avant.
 *
 * Construite en trois tronçons de comptes connus plutôt qu'en rééchantillonnant
 * une courbe : on a besoin de savoir quels rangs appartiennent au tour de cou
 * pour les retenir, et un rééchantillonnage global brouille cette frontière.
 */
function centerline(p: DollParams, m: Metrics) {
  const pts: THREE.Vector3[] = []
  const pin: number[] = []
  /** Force du placage sur le corps, par rang : 1 sur les pans, 0 sur le tour. */
  const hugAmt: number[] = []

  // Un tour et demi, **de l'avant vers l'arrière**.
  //
  // Trois choses se jouent dans ces quelques lignes.
  //
  // Un tour complet ramènerait au point de départ : les deux pans partiraient du
  // même endroit et celui de devant traverserait la poitrine en bandoulière. Et
  // dans ce repère l'angle 0 pointe vers le **côté** (cos → x, sin → z), pas
  // vers l'avant — à un tour et quart le tour de cou finissait sur le flanc. Il
  // faut un demi-tour de plus qu'un compte entier pour relier l'avant à
  // l'arrière.
  //
  // Le sens de rotation suit `side` : sans ça l'écharpe s'enroule toujours de la
  // même façon quel que soit le côté où tombent les pans. Multiplier **à la
  // fois** le décalage et l'incrément d'angle donne un vrai miroir — les deux
  // bouts restent en diagonale, ils sont séparés d'un demi-tour.
  const dir = m.side
  const A0 = Math.PI * 0.5 - dir * p.scarf.diagonal
  // Toujours un demi-tour de plus qu'un compte entier : c'est ce qui relie
  // l'avant à l'arrière.
  const TURNS = p.scarf.wraps - 0.5
  // Profil de rayon : **le corps aux deux bouts, une couche au-dessus au milieu**.
  //
  // Une croissance monotone ne peut faire sortir qu'**un** pan de dessous, celui
  // attaché au début du tour ; l'autre, accroché à la couche extérieure, pend
  // par-dessus sans que rien ne le retienne. Or c'est le geste réel qu'il faut
  // reproduire : on rentre **chaque** bout sous la boucle. Les deux racines sont
  // donc à l'intérieur, et le milieu du tour — qui repasse devant à un tour pile
  // (t = 2/3) et derrière à un demi-tour (t = 1/3) — vient les recouvrir toutes
  // les deux.
  const step = (a: number, b: number, t: number) => {
    const u = Math.min(1, Math.max(0, (t - a) / (b - a)))
    return u * u * (3 - 2 * u)
  }
  // Vaut 0 aux deux bouts, 1 sur le tronçon qui repasse devant (t = 2/3) et
  // derrière (t = 1/3) — c'est-à-dire au-dessus des deux racines.
  const cover = (t: number) => step(0.05, 0.26, t) * (1 - step(0.7, 1.02, t))

  // La boucle **monte puis redescend** : les deux racines sont en bas, la partie
  // qui les recouvre au-dessus.
  //
  // En descendant régulièrement le long du parcours, la boucle n'est symétrique
  // qu'en apparence : la couche qui recouvre la racine arrière se trouve
  // au-dessus d'elle — le pan s'en éloigne en tombant, il sort proprement de
  // dessous — tandis que celle qui recouvre la racine avant est en dessous, si
  // bien que le pan doit la traverser en descendant. D'où un devant qui n'a
  // jamais voulu se comporter comme l'arrière.
  //
  // C'est d'ailleurs ce que fait une vraie écharpe : ses tours s'empilent à peu
  // près à la même hauteur et les deux bouts pendent depuis le **bord bas** de
  // la boucle.
  const yRoot = -m.band * 0.1
  const yRise = m.band * p.scarf.loop

  const angleAt = (t: number) => A0 + dir * t * TURNS * Math.PI * 2
  const yAt = (t: number) => yRoot + yRise * Math.sin(Math.PI * t)

  const clear = m.band * clearOf(p)

  // Le dégagement entre deux couches se compte en **demi-épaisseurs de crête** :
  // la nappe est renflée par ses côtes (`RIB_BUMP`), donc deux couches face à
  // face occupent `2 · ht · (1 + p.scarf.ribDepth)`, pas deux épaisseurs nominales.
  const th = m.band * p.scarf.thickness * (1 + p.scarf.ribDepth) * p.scarf.layers

  /**
   * Rayon du tour : **le sien**, pas celui du corps.
   *
   * Le tour est la seule partie de l'écharpe qui ne doit pas épouser la
   * silhouette — c'est un rouleau de tissu, il a son propre volume, et le
   * plaquer sur le corps lui donne l'air peint dessus. Il se contente donc de
   * dégager le corps : une constante prise au plus large sur toute la hauteur
   * **balayée par la bande**, bords compris. Prise sur la seule ligne médiane,
   * les bords se retrouveraient dans le crâne, le collider les repousserait
   * contre le rappel, et le tissu retenu se friperait.
   */
  let base = 0
  for (let k = 0; k <= 16; k++) {
    const y = yRoot - m.band * 0.5 + (k / 16) * (yRise + m.band)
    base = Math.max(base, bodyRadius(p, m, y))
  }
  base += clear

  const wrapAt = (t: number) => {
    const a = angleAt(t)
    const r = base + cover(t) * th
    return new THREE.Vector3(Math.cos(a) * r, yAt(t), Math.sin(a) * r)
  }

  const wrapTangent = (t: number) =>
    wrapAt(Math.min(1, t + 1e-3)).sub(wrapAt(Math.max(0, t - 1e-3))).normalize()

  // Raccord des pans au tour de cou **par tangente**, pas par segment droit.
  //
  // Un pan tiré au cordeau depuis le dernier point du tour repart dans une autre
  // direction que celle où le tissu tournait : il se forme un coude net à la
  // jonction, que la simulation ne défait pas — elle a justement pour consigne
  // d'y retenir le tissu. Une courbe d'Hermite quitte le tour dans le sens où il
  // tournait, puis s'infléchit vers le bas : la continuité est géométrique, il
  // n'y a plus d'angle à lisser.
  // Le pan ne tombe pas de la même façon devant et derrière : `front` porte le
  // signe de la profondeur. Une chute qui repart vers l'avant pour le pan
  // arrière le rabat contre le dos au lieu de le laisser pendre.
  const fall = (out: number, front: number) =>
    new THREE.Vector3(out * 0.2, -1, front * 0.1).normalize()

  /**
   * Bout d'un pan, posé **contre le corps** dans une direction donnée.
   *
   * Un pan lâché au large du torse reste en porte-à-faux : rien ne le ramène —
   * la gravité tire vers le bas, pas vers l'axe — donc il garde son rayon de
   * repos. On voit alors le jour entre le dos et l'écharpe, il frôle par
   * l'extérieur la couche qui devrait le recouvrir, et il croise les jambes de
   * biais au lieu de tomber devant. Son rayon est donc pris sur le profil, comme
   * celui du tour. Le plancher couvre le bas du corps, là où le torse s'achève
   * et où ce sont les jambes qui portent le tissu.
   */
  const tailEnd = (x: number, z: number, y: number) => {
    const d = Math.hypot(x, z)
    const r = Math.max(bodyRadius(p, m, y) + clear, p.shape.torsoRadius * 0.52)
    return new THREE.Vector3((x / d) * r, y, (z / d) * r)
  }

  /**
   * Enfonce les premiers rangs d'un pan **sous** la couche qui les recouvre.
   *
   * Le pan sort du tour au rayon du tour, puis vient se plaquer sur le corps :
   * il finit bien à l'intérieur, mais il commence au ras et frôle la couche de
   * recouvrement au lieu de passer franchement dessous. Accélérer le placage
   * ferait un coude à la jonction. On creuse donc un enfoncement à part, nul à
   * la jonction — pour ne pas décoller le pan du tour — maximal juste après,
   * puis résorbé.
   */
  const tuckUnder = (q: THREE.Vector3, depth: number) => {
    if (depth > TUCK_SPAN) return q
    const u = depth / TUCK_SPAN
    // Nul en 0 et en 1, maximal au milieu.
    const bell = Math.sin(Math.PI * u) ** 2
    const rad = Math.hypot(q.x, q.z)
    if (rad < 1e-5) return q
    const k = 1 - (m.band * p.scarf.tuck * bell) / rad
    q.x *= k
    q.z *= k
    return q
  }

  // Pan avant, du bout vers le cou — il rejoint la couche intérieure du tour.
  //
  // Il pend **au large** du torse. Ramené près de l'axe, il se retrouve plaqué
  // sur la sphère du buste : la nappe s'enroule autour d'elle et le pan se
  // referme en cordon. C'est la croissance du rayon du tour, pas la position du
  // pan, qui décide lequel passe dessous.
  const frontEnd = tailEnd(dir * 0.55, 0.88, -m.front)
  const frontJoin = wrapAt(0)
  const frontChord = frontEnd.distanceTo(frontJoin)
  const frontM0 = fall(dir, 1).multiplyScalar(-frontChord * 0.75)
  const frontM1 = wrapTangent(0).multiplyScalar(frontChord * 0.6)
  for (let i = 0; i < FRONT_PTS; i++) {
    const q = hermite(frontEnd, frontM0, frontJoin, frontM1, i / FRONT_PTS)
    pts.push(tuckUnder(q, FRONT_PTS - i))
    pin.push(0)
    hugAmt.push(Math.min(1, (FRONT_PTS - i) / p.scarf.hug))
  }

  // Tour de cou : retenu, sinon l'écharpe glisse et tombe au sol.
  //
  // Sauf là où une épaule dépasse. Le rayon du tour se déduit du corps de
  // **révolution** — crâne et torse — donc les bras n'y sont pas, et le tour
  // leur passe au ras. Élargir la boucle pour les dégager la ferait enfler
  // partout, pour une gêne qui n'existe que sur deux azimuts. On **relâche la
  // retenue** à la place : le collider pousse alors le tissu par-dessus l'épaule
  // et il y reste, au lieu de lutter contre le rappel et de s'y enfoncer.
  const arms = armSpheres(p, m.band * clearOf(p), -m.localY)
  for (let i = 0; i < WRAP_PTS; i++) {
    const t = i / (WRAP_PTS - 1)
    const a = angleAt(t)
    const y = yAt(t)
    const over = Math.max(
      armClearance(arms, a, y),
      armClearance(arms, a, y + m.band * 0.35),
      armClearance(arms, a, y - m.band * 0.35),
    ) - base
    // Relâchement mesuré : à retenue trop faible le tissu ne se contente pas de
    // céder, il gondole — les plis de l'épaule virent au froissé.
    const u = Math.min(1, Math.max(0, over / (m.band * 0.3)))
    pts.push(wrapAt(t))
    pin.push(0.9 * (1 - p.scarf.shoulder * u * u * (3 - 2 * u)))
    hugAmt.push(0)
  }

  // Pan arrière, du cou vers le bout — il part lui aussi de la couche
  // intérieure, et ressort donc de dessous le tour.
  const backJoin = wrapAt(1)
  // Long, il descendrait au sol le long du dos : son bout s'écarte en arrière.
  const backEnd = tailEnd(-dir * 0.55, -0.85, -m.back * 0.8).add(new THREE.Vector3(0, 0, -m.back * 0.45))
  const backChord = backJoin.distanceTo(backEnd)
  const backM0 = wrapTangent(1).multiplyScalar(backChord * 0.6)
  const backM1 = fall(-dir, -1).multiplyScalar(backChord * 0.75)
  for (let i = 1; i <= BACK_PTS; i++) {
    const q = hermite(backJoin, backM0, backEnd, backM1, i / BACK_PTS)
    pts.push(tuckUnder(q, i))
    pin.push(0)
    hugAmt.push(Math.min(1, i / p.scarf.hug))
  }

  // Transition longue de part et d'autre du tour de cou. Une frontière nette
  // entre retenu et libre casse le tissu en angle ; la rampe doit couvrir
  // plusieurs rangs pour que la flexion se répartisse.
  const FADE = 7
  for (let k = 1; k <= FADE; k++) {
    const f = 0.9 * (1 - k / (FADE + 1)) ** 1.6
    pin[FRONT_PTS - k] = Math.max(pin[FRONT_PTS - k], f)
    const j = FRONT_PTS + WRAP_PTS - 1 + k
    if (j < pin.length) pin[j] = Math.max(pin[j], f)
  }

  return { pts, pin, hugAmt, clear }
}

/**
 * Nappe de repos : la ligne médiane élargie en grille.
 *
 * L'axe de largeur est `tangente × radiale`, la radiale étant la direction qui
 * s'éloigne de l'axe du corps. Cette règle unique pose le tissu à plat contre le
 * torse quand il fait le tour du cou et de face quand il retombe, sans transition
 * à écrire. Ensuite c'est la simulation qui l'oriente.
 */
export function restGrid(p: DollParams, m: Metrics) {
  const { pts, pin: rowPin, hugAmt, clear } = centerline(p, m)
  const unit = knitUnit(p, m)
  const rest: THREE.Vector3[] = []
  const pin: number[] = []
  const alongV: number[] = []
  const acrossU: number[] = []

  for (let j = 0; j < COLS; j++) acrossU.push(((j / (COLS - 1)) * m.band) / unit)

  const arms = armSpheres(p, m.band * clearOf(p), -m.localY)
  const tan = new THREE.Vector3()
  const radial = new THREE.Vector3()
  const across = new THREE.Vector3()
  const nrm = new THREE.Vector3()
  const phase = mulberry32(p.seed + 313)() * Math.PI * 2
  let arc = 0

  for (let i = 0; i < ROWS; i++) {
    const c = pts[i]
    if (i > 0) arc += c.distanceTo(pts[i - 1])
    alongV.push(arc / unit)

    tan.subVectors(pts[Math.min(ROWS - 1, i + 1)], pts[Math.max(0, i - 1)])
    if (tan.lengthSq() < 1e-12) tan.set(0, -1, 0)
    tan.normalize()

    radial.set(c.x, 0, c.z)
    if (radial.lengthSq() < 1e-8) radial.set(0, 0, 1)
    radial.normalize()

    across.crossVectors(tan, radial)
    if (across.lengthSq() < 1e-8) across.set(1, 0, 0)
    across.normalize()

    /** Rangs parcourus depuis le tour de cou : 0 dessus, croissant sur les pans. */
    const depth =
      i < FRONT_PTS ? FRONT_PTS - i : i >= FRONT_PTS + WRAP_PTS ? i - (FRONT_PTS + WRAP_PTS) + 1 : 0

    // Vrille et roulé des bords, seulement sur les pans. Ils sont inscrits dans
    // la pose de repos, donc dans les longueurs au repos des contraintes : la
    // nappe les garde d'elle-même. Un pan lâché parfaitement plat, lui, reste
    // plat — la gravité tire dans l'axe où il pend déjà, rien ne le fait plier,
    // et aucune souplesse ne le sauve.
    const e = Math.min(1, depth / EASE_ROWS)
    const free = e * e * (3 - 2 * e)

    // La vrille porte le signe de `side`, et le roulé s'oriente sur la radiale.
    //
    // Basculer `side` fait tourner toute la configuration — et une rotation
    // n'inverse pas une torsion. Sans le signe, les deux écharpes se vrillent
    // dans le même sens au lieu d'être des miroirs, et le bord de la bande part
    // vers le bras d'un côté et vers le vide de l'autre. Même piège pour le
    // roulé : `across × tan` suit la main du produit vectoriel, qui bascule avec
    // le sens d'enroulement. On le ramène donc toujours **vers l'extérieur**.
    across.applyAxisAngle(tan, m.side * free * p.scarf.twist * Math.sin(arc * 1.5 + phase))
    nrm.crossVectors(across, tan).normalize()
    if (nrm.dot(radial) < 0) nrm.negate()

    // Placage des **pans** sur le corps, point par point.
    //
    // La ligne médiane peut bien suivre le profil, la bande a de la largeur :
    // ses bords tombent à des hauteurs où le corps n'a plus le même rayon, et
    // c'est là qu'on voit le jour. Chaque point est donc ramené sur le rayon du
    // corps à **sa** hauteur.
    //
    // Le tour de cou en est exclu : c'est un rouleau de tissu, il a son propre
    // volume, et le plaquer sur la silhouette lui donne l'air peint dessus. La
    // rampe sur les premiers rangs évite la marche à la jonction — et fait
    // plonger le pan sous la couche qui le recouvre.
    const grip = hugAmt[i]

    for (let j = 0; j < COLS; j++) {
      const jn = j / (COLS - 1)
      const edge = Math.abs(jn - 0.5) * 2
      const q = c
        .clone()
        .addScaledVector(across, (jn - 0.5) * m.band)
        // Puissance élevée : les bords se retournent, le milieu reste plat.
        // Un profil doux sur toute la largeur gonfle le pan en boudin.
        .addScaledVector(nrm, edge ** 3 * m.band * p.scarf.curl * free)

      if (grip > 0.01) {
        const rad = Math.hypot(q.x, q.z)
        if (rad > 1e-5) {
          // Les bras comptent aussi : un pan dont la pose de repos démarre dans
          // un bras y reste à moitié, la simulation ne faisant que le repousser
          // d'une frame sur l'autre.
          const want = Math.max(
            bodyRadius(p, m, q.y) + clear,
            p.shape.torsoRadius * 0.52,
            armClearance(arms, Math.atan2(q.z, q.x), q.y),
          )
          const k = 1 + ((want / rad - 1) * grip)
          q.x *= k
          q.z *= k
        }
      }

      rest.push(q)
      // Bords moins retenus que le milieu : même la partie tenue doit pouvoir
      // gondoler, sinon le tour de cou lit comme un anneau rigide.
      pin.push(rowPin[i] * (1 - 0.45 * edge))
    }
  }

  return { rest, pin, acrossU, alongV, unit }
}

/**
 * Colliders du corps, dans le repère de l'écharpe.
 *
 * Simple changement de repère : la chaîne de sphères inscrites et celles des
 * bras vivent dans `surface.ts`, source unique des profils, et servent aussi au
 * collier.
 */
export function bodyColliders(p: DollParams, m: Metrics): Collider[] {
  const skin = m.band * clearOf(p)
  const shift = -m.localY
  return [
    ...bodySpheres(p, 0, -p.shape.torsoHeight * 0.86, skin, shift),
    ...armSpheres(p, skin, shift),
    ...legSpheres(p, skin, shift),
  ]
}

/**
 * Écharpe : une nappe de tissu simulée d'un bout à l'autre.
 *
 * Tout est en tissu, tour de cou compris. Un anneau rigide, si bien placé
 * soit-il, lit comme une pièce enfilée ; c'est la simulation qui lui donne
 * l'air **posée par-dessus** — elle se drape sur les épaules et le crâne au lieu
 * de les traverser.
 *
 * La simulation vit dans le repère de la nappe, dont l'origine est sur l'axe du
 * corps : c'est ce repère qui donne la direction « vers l'extérieur » qui oriente
 * la largeur du tissu au repos. La gravité y est donc réorientée à chaque frame.
 */
export function Scarf({ p, tint }: { p: DollParams; tint: string }) {
  const m = scarfMetrics(p)

  // Tricot propre à l'écharpe, teinté **à la génération**.
  //
  // Reprendre les cartes du corps et les multiplier par une couleur donnait deux
  // teintures superposées, et surtout la même maille fine que la peluche : rien
  // ne disait qu'on regardait un vêtement séparé. Ici l'écharpe a ses grosses
  // mailles et ses côtes, et le matériau reste blanc.
  const wool = useDisposable(() => {
    const base = new THREE.Color(tint)
    const stitch = base.clone().offsetHSL(0, -0.03, 0.06)
    return makeKnitMaps({
      ...KNIT,
      // Planche allégée : même rapport que le tricot du corps (512 / 1024).
      size: p.wool.mapSize ? Math.round((KNIT.size * p.wool.mapSize) / 1024) : KNIT.size,
      base: `#${base.getHexString()}`,
      stitch: `#${stitch.getHexString()}`,
      relief: p.wool.relief,
      fuzz: p.wool.fuzz,
      seed: p.seed + 4711,
    })
  }, [tint, p.wool.relief, p.wool.fuzz, p.seed, p.wool.mapSize])

  const colliders = useMemo(() => bodyColliders(p, m), [p, m.localY, m.band])
  const grid = useMemo(() => restGrid(p, m), [p, m.band, m.front, m.back, m.side, m.localY])
  const cloth = useMemo(
    () =>
      new ClothSheet(grid.rest, grid.pin, ROWS, COLS, {
        // `bend` décide entre du drap et du carton ; juste au-dessus de zéro, la
        // nappe garde des courbes souples au lieu de s'écraser comme un poids mort.
        shear: 0.5,
        bend: p.scarf.bend,
        slack: p.scarf.slack,
      }, p.seed),
    [grid, p.seed, p.scarf.bend, p.scarf.slack],
  )

  const geo = useMemo(() => sheetGeometry(ROWS, RCOLS), [])
  useEffect(() => () => geo.dispose(), [geo])



  // Profil des nervures et tampon d'interpolation : constants, calculés une fois.
  const render = useMemo(() => {
    const rib = new Float32Array(RCOLS)
    const acrossU: number[] = []
    for (let j = 0; j < RCOLS; j++) {
      const u = j / (RCOLS - 1)
      // Les deux bords tombent dans un creux : une écharpe s'amincit sur sa
      // lisière, elle ne s'arrête pas au milieu d'un bourrelet.
      rib[j] = 0.5 - 0.5 * Math.cos(u * p.scarf.ribs * Math.PI * 2)
      acrossU.push((u * m.band) / grid.unit)
    }
    return { rib, acrossU, mid: new Float32Array(ROWS * RCOLS * 3) }
  }, [m.band, grid.unit])

  // UV figées sur la pose de repos : recalculées à chaque frame, la texture
  // glisserait sur le tissu au lieu de se plier avec lui.
  useEffect(
    () => writeSheetUv(geo, ROWS, RCOLS, render.acrossU, grid.alongV, (m.band * p.scarf.thickness) / grid.unit),
    [geo, grid, render, m.band, p.scarf.thickness],
  )

  const fringeGeo = useMemo(() => fringeGeometry(FRINGE_MAX * 2, FRINGE_SEGS), [])
  useEffect(() => () => fringeGeo.dispose(), [fringeGeo])
  const fringe = useMemo(() => {
    const rnd = mulberry32(p.seed + 8123)
    const n = p.scarf.strands * 2
    const end = (): FringeEnd => ({
      roots: Array.from({ length: p.scarf.strands }, () => new THREE.Vector3()),
      flow: new THREE.Vector3(),
      across: new THREE.Vector3(),
    })
    return {
      ends: [end(), end()],
      // Longueurs et écarts inégaux : des mèches identiques lisent comme un
      // peigne, pas comme des fils noués à la main.
      lengths: Array.from({ length: n }, () => m.band * (0.55 + rnd() * 0.4) * p.scarf.fringe),
      spread: Array.from({ length: n }, () => (rnd() - 0.5) * 0.7),
    }
  }, [p.seed, m.band, p.scarf.strands, p.scarf.fringe])

  // Le matériau est partagé par la nappe et les franges : c'est la même laine,
  // et deux instances doubleraient la compilation du shader.
  const material = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        map: wool.map,
        normalMap: wool.normalMap,
        normalScale: new THREE.Vector2(p.scarf.relief, p.scarf.relief),
        roughnessMap: wool.roughnessMap,
        roughness: 1,
        metalness: 0,
        // Sheen modéré : à 0.9 avec une teinte sombre, le reflet blanchit toute
        // la bande et la maille disparaît sous le voile.
        sheen: p.scarf.sheen,
        sheenColor: new THREE.Color(p.wool.sheenColor),
        sheenRoughness: 0.9,
        side: THREE.DoubleSide,
      }),
    [wool, p.wool.sheenColor, p.scarf.relief, p.scarf.sheen],
  )
  useEffect(() => () => material.dispose(), [material])

  /**
   * Duvet de l'écharpe : des coques, comme le corps.
   *
   * Nue, la nappe avait des côtes nettes et un bord franc, à côté d'une peluche
   * dont tout le contour est pelucheux : c'est ce contraste qui la faisait lire
   * comme du plastique côtelé plutôt que comme un tricot. Le halo est plus court
   * que celui du corps — c'est un vêtement, pas la peau — et moins de coques :
   * l'essentiel de l'effet est dans le contour.
   *
   * Contrairement au corps, la nappe est réécrite à chaque frame : des copies
   * précalculées ne suivraient pas. Les coques partagent donc **la même**
   * géométrie et chacune se repousse le long de la normale dans le shader.
   * Même programme pour toutes (`customProgramCacheKey`), seule la valeur de
   * l'uniforme change d'une coque à l'autre.
   */
  const fiber = useDisposable(
    () => makeFiberTexture(512, p.shell.density, p.seed + 4343),
    [p.shell.density, p.seed],
  )
  const shells = useMemo(() => {
    const count = Math.min(SCARF_SHELLS, p.shell.count)
    const height = p.shell.height * SCARF_FUZZ
    // Même densité de fibres au centimètre que le corps : une tuile de tricot
    // de l'écharpe couvre `grid.unit`, une tuile du corps le tour du crâne
    // divisé par la taille de maille.
    const bodyTile = (2 * Math.PI * p.shape.headRadius * 1.08) / p.wool.knitScale
    const alpha = fiber.clone()
    alpha.repeat.setScalar(1.2 * (grid.unit / bodyTile))
    alpha.needsUpdate = true
    // Une seule matière pour toutes les coques, dessinées en une fois (voir
    // `shellInstances`).
    const uni = makeShellUniforms()
    uni.uShellCount.value = count
    uni.uShellHeight.value = height
    // Seuil relevé et teinte rabattue : au seuil du corps, le halo couvrait
    // la face de paillettes claires et noyait les côtes — or ce sont elles
    // qui disent « écharpe ». Le duvet doit rester au contour.
    uni.uShellBias.value = 0.08
    uni.uShellShade.value = 0.88
    const mats = count <= 0 ? [] : [0].map(() => {
      const mat = new THREE.MeshPhysicalMaterial({
        map: wool.map,
        alphaMap: alpha,
        roughness: 1,
        metalness: 0,
        sheen: p.scarf.sheen,
        sheenColor: new THREE.Color(p.wool.sheenColor),
        sheenRoughness: 0.92,
        side: THREE.DoubleSide,
        // Comme le duvet du corps : hors de la profondeur, sinon chaque fibre
        // aurait son contour d'encre.
        depthWrite: false,
      })
      mat.onBeforeCompile = shellShader(uni)
      mat.customProgramCacheKey = () => 'scarf-shell'
      return mat
    })
    return { alpha, mats, count, height }
  }, [fiber, wool, grid.unit, p.shell.count, p.shell.height, p.shape.headRadius, p.wool.knitScale, p.wool.sheenColor, p.scarf.sheen])
  useEffect(
    () => () => {
      shells.alpha.dispose()
      shells.mats.forEach((m) => m.dispose())
    },
    [shells],
  )
  // Instanciée sur la nappe elle-même : ses attributs, réécrits à chaque image,
  // sont partagés. Pas de libération : elle rendrait aussi les tampons de la
  // nappe, encore affichée.
  const shellGeo = useMemo(() => shellInstances(geo, Math.max(1, shells.count), shells.height), [geo, shells])

  const group = useRef<THREE.Group>(null!)
  const gravityDir = useRef(new THREE.Vector3()).current
  const quat = useRef(new THREE.Quaternion()).current
  const uvDone = useRef(false)
  // Les UV des mèches dépendent de leur longueur et de leur largeur : une
  // nouvelle graine les redessine, donc il faut les réécrire. Sans cette remise
  // à zéro, toutes les poupées suivantes gardaient l'échelle de la première.
  useEffect(() => {
    uvDone.current = false
  }, [fringe, grid.unit, m.band])

  const rig = useRigBones()
  const carry = useMemo(() => new FrameCarry(), [])
  const floor = useMemo(() => ({ n: new THREE.Vector3(0, 1, 0), d: -1e9 }), [])
  useFrame((_, dt) => {
    // Obstacles des membres sur la pose **animée** : bras levé, le tissu doit
    // passer par-dessus, pas au travers. Bras puis jambes, en fin de liste.
    if (rig) {
      const n = colliders.length
      followLimbs(rig, group.current, colliders, n - 16, 'arm', p.limbs.armLength)
      followLimbs(rig, group.current, colliders, n - 8, 'leg', p.limbs.legLength)
    }
    group.current.getWorldQuaternion(quat)
    gravityDir.set(0, -1, 0).applyQuaternion(quat.invert())
    // Écharpe de peluche : presque rien ne pèse, et le tissu continue de bouger.
    // Les pans libres gardent leur élan dans le monde (rotations comprises) :
    // la torsion d'une attaque les fait voler. Le long pan se pose au sol.
    const delta = carry.update(group.current)
    if (rig) localFloor(group.current, rig.floorY + p.shape.headRadius * 0.02, floor)
    cloth.step(
      dt,
      { gravity: p.scarf.weight, damping: p.scarf.drape, iterations: 9 },
      colliders,
      gravityDir,
      undefined,
      { carry: delta, carryK: CARRY, floor: rig ? floor : null },
    )
    writeSheet(geo, cloth.points, ROWS, COLS, RCOLS, render.mid, m.band * p.scarf.thickness, render.rib, p.scarf.ribDepth)

    readEnd(fringe.ends[0], cloth.points, 0, 1)
    readEnd(fringe.ends[1], cloth.points, ROWS - 1, ROWS - 2)
    writeFringe(
      fringeGeo,
      fringe.ends,
      FRINGE_SEGS,
      // Épaisseur d'un brin = **une demi-maille**, l'étalon du fil qui a tricoté
      // le tissu. Déduite du compte de mèches, elle valait les trois quarts
      // d'une maille entière : les brins se touchaient presque, et une frange se
      // lit aux vides autant qu'aux mèches.
      (grid.unit / KNIT.cols) * 0.5,
      fringe.lengths,
      fringe.spread,
      gravityDir,
      colliders,
      grid.unit,
      !uvDone.current,
    )
    uvDone.current = true
  })

  return (
    <group ref={group} position={[0, m.localY, 0]}>
      <mesh geometry={geo} material={material} castShadow receiveShadow />
      {shells.mats.map((mat, i) => (
        <mesh key={i} geometry={shellGeo} material={mat} renderOrder={1} frustumCulled={false} />
      ))}
      <mesh geometry={fringeGeo} material={material} castShadow />
    </group>
  )
}

/**
 * Relit le dernier rang de la nappe pour y accrocher les mèches.
 *
 * Les racines sont **interpolées** le long du rang, pas prises sur ses sommets :
 * le nombre de mèches n'a alors rien à voir avec la résolution de la simulation,
 * et on les répartit régulièrement en laissant un demi-pas à chaque bord.
 */
function readEnd(end: FringeEnd, pts: readonly THREE.Vector3[], tip: number, inner: number) {
  const base = tip * COLS
  const mid = COLS >> 1
  const n = end.roots.length
  for (let k = 0; k < n; k++) {
    const u = ((k + 0.5) / n) * (COLS - 1)
    const i = Math.min(COLS - 2, Math.floor(u))
    end.roots[k].lerpVectors(pts[base + i], pts[base + i + 1], u - i)
  }
  end.flow.subVectors(pts[base + mid], pts[inner * COLS + mid])
  // Normalisée : `across` est une **direction**, pas la corde de la rangée.
  // Laissée brute, sa norme vaut la largeur de la bande — l'écart latéral des
  // mèches se trouvait donc divisé par six, et la frange sortait en peigne de
  // brins parallèles quelles que soient les valeurs d'écart demandées.
  end.across.subVectors(pts[base + COLS - 1], pts[base]).normalize()
}
