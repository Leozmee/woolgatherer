import * as THREE from 'three'

/**
 * Cel shading, posé **à la source** : dans le calcul d'éclairage partagé par
 * tous les matériaux standard et physiques de three.
 *
 * Remplacer chaque matériau par un `MeshToonMaterial` aurait demandé de
 * toucher une vingtaine de fichiers — laine, locks, coiffures, écharpe,
 * boutons, bois, métal — et de perdre au passage les cartes de rugosité, le
 * sheen, les coques de duvet. Ici on ne change qu'une chose : la part de
 * lumière **directe** reçue par un point (`dot(N, L)`) est découpée en paliers
 * nets. Tout le reste du matériau reste intact, et toute la poupée passe en
 * aplats d'un coup, de manière cohérente.
 *
 * Le chunk est lu **à la compilation**, et le cache de programmes de three ne
 * connaît pas le texte des chunks : changer de rendu impose un nouveau
 * renderer. C'est `App` qui s'en charge, en remontant le `Canvas`.
 *
 * **Un rendu en aplats ne supporte qu'une lumière qui décide.** Découpées en
 * paliers chacune de leur côté, trois lumières directionnelles superposent
 * leurs marches en taches incohérentes, et le contre-jour du rendu laine — fort
 * exprès, pour allumer le duvet — inondait tout le dos d'un aplat clair. Chaque
 * style règle donc aussi l'éclairage : une clé qui fait les aplats, un
 * remplissage et un contre-jour réduits à des accents, et l'environnement —
 * qui éclaire en dégradé continu, hors d'atteinte des paliers — baissé au
 * profit d'une ambiance plate.
 */
const ORIGINAL = THREE.ShaderChunk.lights_physical_pars_fragment
const LINE = 'float dotNL = saturate( dot( geometryNormal, directLight.direction ) );'
/**
 * Les paliers ne s'appliquent qu'à la lumière **diffuse**.
 *
 * Posés sur `dotNL` lui-même, ils passaient aussi dans le spéculaire et le
 * sheen, dont les formules divisent par un terme qui s'annule en rasant — et
 * que `dotNL` compense d'ordinaire en tendant lui aussi vers zéro. Avec un
 * palier qui reste à 0,45 en rasant, la compensation disparaît : pixels à 183
 * en linéaire au bord de chaque mèche, liseré blanc sur tous les rendus. Le
 * diffus — la couleur en aplats — prend les paliers ; les reflets gardent le
 * calcul physique.
 */
const DIFFUSE = 'reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );'

export type Lighting = {
  ambient: number
  env: number
  key: number
  fill: number
  rim: number
  /** Teintes : lumière chaude, ombre teintée… Blanc cassé d'origine par défaut. */
  keyColor?: string
  fillColor?: string
  rimColor?: string
  ambientColor?: string
}

/**
 * Trait de contour. `tint` : part de la couleur locale — le trait prend la
 * teinte de ce qu'il cerne, assombrie (façon « colored lineart »).
 */
export type Ink = {
  color: string
  width: number
  threshold: number
  tint: number
  /**
   * `local` : la couleur de ce que le trait cerne, assombrie. `complement` : sa
   * couleur complémentaire — un cheveu rose cerné de vert sombre.
   */
  mode?: 'local' | 'complement'
} | null

/**
 * Traitement propre aux cheveux (matériaux marqués `TOON_HAIR`).
 *
 * Sans lui, la chevelure — reflet satiné passé au sombre, liseré rasant
 * retiré — était devenue une masse mate : plus aucun reflet. Les cheveux
 * d'anime se lisent à deux choses : des paliers **plus contrastés** que la
 * peau, et un **reflet net**, une tache claire posée où la lumière se réfléchit.
 */
export type HairLook = {
  /** Paliers du diffus des cheveux, en fonction de `rawNL` ; vide = ceux du corps. */
  bands: string
  /** Intensité du reflet anime. */
  shine: number
  /** Seuil du reflet sur N·H : plus haut, plus fin. */
  size: number
  /** Plafond du bord sombre (sheen noir) sur les cheveux, plus léger que la laine. */
  rim: number
}

export type RenderLook = {
  id: string
  /** Nom court du bouton ; `label` sert d'infobulle. */
  short: string
  label: string
  /** Expression GLSL qui remplace `dotNL` ; `null` = éclairage continu d'origine. */
  bands: string | null
  lighting: Lighting
  ink: Ink
  /**
   * Reflets du sheen — le reflet satiné qui court sur le bord des volumes :
   * `noirs` (défaut) assombrit ce bord, `blancs` l'allume comme l'original,
   * `aucun` le retire.
   */
  reflets?: 'noirs' | 'blancs' | 'aucun'
  hair?: HairLook
}

/**
 * Rendu de la scène — paliers, dosage et teinte des lumières, trait. Resserré sur le rendu **laine**, finalement
 * retenu : ses variantes de trait, de reflets, d'ambiance et de cheveux. Chaque type règle ensemble les paliers, le dosage
 * et la **teinte** des lumières, et l'encre : un palier sans l'éclairage qui
 * va avec donnait des aplats délavés ou des taches.
 *
 * Les transitions gardent une largeur d'un souffle (`smoothstep` serré) : un
 * palier au pixel près crénelle dès qu'une normale de tricot le traverse. Plus
 * la transition est large, plus le rendu est « doux ».
 */
/**
 * **Rendu retenu : laine, trait encre.**
 *
 * Le rendu laine d'origine — éclairage continu, pas de paliers — avec ses
 * reflets de sheen passés au sombre, sans liseré rasant, et un trait fin
 * d'encre presque noire, à peine teinté de la couleur de ce qu'il cerne.
 * Choisi parmi une quarantaine d'essais (pastel, anime, manga, ghibli…) ;
 * `LOOKS` n'en garde que celui-ci, mais les briques — paliers, traitement des
 * cheveux, trait complémentaire — restent disponibles.
 */
export const RENDER_LOOK: RenderLook = {
  id: 'laine-trait-encre',
  short: 'trait encre',
  label: 'laine — trait encre noire',
  bands: null,
  // Ambiance relevée (0,18 → 0,4) : avec les bords assombris, les ombres
  // bouchaient et la planche entière paraissait trop foncée.
  lighting: { ambient: 0.4, env: 1, key: 1.25, fill: 0.45, rim: 1.5 },
  ink: { color: '#110d0b', width: 0.85, threshold: 0.016, tint: 0.2 },
}


const ORIGINAL_FRAG = THREE.ShaderLib.physical.fragmentShader
const COMPOSE = 'outgoingLight = outgoingLight * sheenEnergyComp + sheenSpecularDirect + sheenSpecularIndirect;'

/**
 * Reflets **noirs** : le sheen assombrit au lieu d'éclairer.
 *
 * Le sheen est une lumière ajoutée en bordure ; le teindre en noir revient à
 * n'ajouter rien. On garde donc sa forme — fort là où la surface fuit, nul de
 * face — et on s'en sert comme d'un **facteur d'assombrissement**, à la façon
 * d'un velours. Surtout visible sur les cheveux : les mèches se cernent de
 * sombre au lieu de s'auréoler de blanc. Plafonné, pour ne jamais boucher le
 * noir.
 */
const darkCompose = (hairRim: number) => `
	#ifdef TOON_HAIR
		float sheenCap = ${hairRim.toFixed(3)};
	#else
		// 0,75 : les bords assombris aux trois quarts noircissaient toute la
		// peluche — la laine paraissait plus foncée que sa couleur.
		float sheenCap = 0.4;
	#endif
	outgoingLight = outgoingLight * sheenEnergyComp * ( 1.0 - clamp( 1.6 * max3( sheenSpecularDirect + sheenSpecularIndirect ), 0.0, sheenCap ) );`

/**
 * Diffus en paliers, et traitement des cheveux.
 *
 * Le reflet anime des cheveux est une tache **nette** sur N·H — le demi-vecteur
 * entre lumière et regard —, pas un spéculaire physique : borné, il ne peut
 * pas exploser en rasant comme le faisait le spéculaire sous les paliers. Il
 * ne se pose que du côté éclairé (`rawNL`), et prend la couleur de la lumière.
 */
function toonDiffuse(look: RenderLook) {
  // Sans paliers (rendu laine), le diffus reste l'éclairage continu d'origine.
  const bands = look.bands ? look.bands.replaceAll('dotNL', 'rawNL') : 'rawNL'
  const h = look.hair
  const hair = h
    ? `
	#ifdef TOON_HAIR
		${h.bands ? `toonNL = ${h.bands};` : ''}
		vec3 toonH = normalize( directLight.direction + geometryViewDir );
		float toonShine = smoothstep( ${h.size.toFixed(3)}, ${(h.size + 0.025).toFixed(3)}, dot( geometryNormal, toonH ) ) * step( 0.08, rawNL );
		reflectedLight.directSpecular += toonShine * ${h.shine.toFixed(3)} * directLight.color;
	#endif`
    : ''
  return `float toonNL = ${bands};${hair}
	reflectedLight.directDiffuse += toonNL * directLight.color * BRDF_Lambert( material.diffuseColor );`
}

const ORIGINAL_MATERIAL = THREE.ShaderChunk.lights_physical_fragment

/**
 * Pas de liseré de Fresnel sur ce qui n'est pas métal.
 *
 * Toute surface, même mate, reflète son environnement quand on la regarde en
 * rasant : three fixe ce reflet rasant (`specularF90`) à 1 pour les matières
 * non métalliques. Juste pour du plastique ou du verre, faux pour de la laine
 * — et l'environnement étant fait de panneaux lumineux blancs, chaque mèche
 * et chaque bord de volume se cernait d'un **liseré blanc**, quel que soit le
 * rendu, même après avoir retiré le sheen. Les métaux (chaîne, épingles)
 * gardent le leur.
 */
const NO_RIM = `${ORIGINAL_MATERIAL}
material.specularF90 = mix( material.specularF90 * 0.06, material.specularF90, metalnessFactor );`

export function setRenderLook(look: RenderLook) {
  THREE.ShaderChunk.lights_physical_fragment = NO_RIM
  if (!ORIGINAL.includes(LINE) || !ORIGINAL.includes(DIFFUSE) || !ORIGINAL_FRAG.includes(COMPOSE)) {
    // Garde-fou : si une montée de version de three renomme ces lignes, on le
    // dit au lieu de rendre silencieusement autre chose que demandé.
    console.warn('[toon] lignes d’éclairage introuvables — rendu d’origine')
    return
  }
  const reflets = look.reflets ?? 'noirs'
  let chunk =
    look.bands || look.hair
      ? ORIGINAL.replace(DIFFUSE, toonDiffuse(look)).replace(LINE, `${LINE}\n\tfloat rawNL = dotNL;`)
      : ORIGINAL
  if (reflets === 'aucun') chunk = withoutSheen(chunk)
  THREE.ShaderChunk.lights_physical_pars_fragment = chunk
  // Le shader du matériau physique est lu, lui aussi, à la compilation.
  THREE.ShaderLib.physical.fragmentShader =
    reflets === 'noirs' ? ORIGINAL_FRAG.replace(COMPOSE, darkCompose(look.hair?.rim ?? 0.75)) : ORIGINAL_FRAG
}

/**
 * Retire le sheen — le reflet satiné qui fait « duvet » dans le rendu laine.
 *
 * C'est un terme d'éclairage **à part**, calculé en rasant la surface : les
 * paliers ne l'atteignent pas, et blanc il cernait chaque poupée d'un halo
 * quel que soit le type de cel shading.
 */
function withoutSheen(chunk: string) {
  const SHEEN = [
    'sheenSpecularDirect += irradiance * BRDF_Sheen(',
    'sheenSpecularIndirect += irradiance * material.sheenColor * IBLSheenBRDF(',
  ]
  let out = chunk
  for (const line of SHEEN) {
    if (!out.includes(line)) {
      console.warn('[toon] terme de sheen introuvable — le halo blanc restera')
      continue
    }
    // Commenté plutôt que supprimé : la fin de l'appel reste sur la ligne.
    out = out.replace(line, `// ${line}`)
  }
  return out
}
