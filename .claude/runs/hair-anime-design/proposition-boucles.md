# Proposition — bouclettes (`curls()`)

Copie de travail lue : `/Users/leogallus/Projets/DummyFaces-coupes/src/doll/hairstyles.tsx`
(branche `coupes-anime`, 52a1704 + cb715fc) : `curls()` l. 563–611 et ses outils
(`sectorMovers`, `yarn`, `hairline`, `hairlineAt`, `pulled`, `tangentBasis`, `onDir`,
`clearHead`, `faceSafe`, `after`, `smooth`), plus `SpringBone` et le shader `hairdo`.
Aucun fichier source modifié.

Fichiers voisins :
- `proposition-boucles.diff` — le diff complet contre la copie de travail (527 lignes) ;
  `tsc --noEmit` passe sur une copie du projet qui l'applique ;
- `proposition-boucles.png` — ligne 1 : coupe actuelle ; lignes 2 à 4 : refonte, 3 graines ;
  5 vues (face, 3/4, profil, 3/4 dos plongeant, dessus) ;
- `proposition-boucles-face.png` — gros plans face et 3/4, actuelle puis refonte ;
- `proposition-boucles-geste.png` — ressorts à leur débattement + écartement 0,5 (poupée
  qui tourne), actuelle puis refonte.

Mesures : scripts dans le scratchpad de session
`/private/tmp/claude-501/-Users-leogallus-Projets-DummyFaces/77236db1-43ec-45aa-9052-e59f7758ef81/scratchpad/b3/`
— `audit.ts` (couverture par lancer de rayons le long de la normale et par vues,
émulation du vertex shader, sommets dans le crâne), `cur.ts` (coupe actuelle), `anew.ts`
(refonte), `cost.ts` (triangles sur 60 graines), `sim.ts` (le vrai `SpringBone` à pas
de 1/60 sur trois gestes), `turns.ts` (anneaux par tour), `fp.ts` (non-régression des
autres coupes), `render.ts` (rastériseur avec encre à la dérivée seconde de la
profondeur). Construction : `./build.sh x.ts x.mjs && node x.mjs` (esbuild, React stubé).
Matrice : R ∈ {0,36 ; 0,43 ; 0,55} × épaisseur ∈ {0,02 ; 0,03 ; 0,045} × graines
{1, 7, 42} (27 poupées), bajoues 0,15, ovale 0,07 (poupée morphée typique).
Brouillon précédent d'un autre agent (escargots, `scratchpad/boucles/`) : lu,
non retenu (voir risks).

**Zone cible** d'une coupe « non chauve », la même pour toutes les mesures : au-dessus
de `hairline(p, −0,25, 2,7)` + 0,04, nuque abaissée de 0,2·max(0, −cos az)^1,5 —
oreilles sur les côtés, bas du crâne derrière, lisière de front à 2,7 tailles de
bouton. Zones : devant |az| < 0,6, tempes 0,6–1,25, côtés 1,25–2,2, arrière, sommet sy > 0,9.

## En bref

| | actuelle | refonte |
|---|---|---|
| couverture de la zone cible (normale) | **26–57 %** (moy. 40) | **98,9–99,9 %** (moy. 99,5) |
| pire zone | côtés 25 %, arrière 25 % | arrière 98,1 % ; sommet 99,7–100 % |
| crâne caché, 8 vues horizontales | 42–72 % | 96,3–97,6 % |
| forme | 170–310 boucles debout, hexagonales | épi en tourbillon + 14 anglaises + 3–4 crosses de frange |
| anneaux par tour de spirale | 4–6 | 12,0–14,5 (méd. 13,3) |
| ressorts | 8 secteurs ; 88 % en butée sur la platine | 17–18, un par anglaise ou crosse ; anglaises jamais en butée sur la platine |
| racines qui glissent | 0,09–0,25 | calotte tenue (0) ; têtes d'anglaise ≤ 0,02 |
| sommets qui entrent dans le crâne (débattement max) | 4,1 % | 0,02 % |
| sommets de laine sur un bouton | — | 0 (marge ≥ 0,017, lacet compris) |
| triangles à 0,03 (60 graines) | 11–24 k | 38–58 k (p95 56 k) |

## diagnosis

**1. Clairsemée — la plus clairsemée de toutes les coupes non chauves.** Couverture de
la zone cible le long de la normale : **26 à 57 % (moyenne 40 %)** ; devant 42–75 %,
tempes 29–59 %, côtés 25–62 %, arrière 25–52 %, sommet 32–62 %. Même mesurée sur sa
propre zone (au-dessus de sa lisière), elle ne couvre que 38–75 % (moy. 55 %). Vue de
côté (8 vues horizontales), 42–72 % du crâne visible est caché. Pour comparaison, la
grande frange (référence aimée) est à 87–88 % et les cheveux tirés refondus à 98–99 %
(chiffres de `synthese-run1.md`).

Trois causes, toutes géométriques :

- **Les boucles sont debout.** Chaque boucle est une spirale dans le plan
  (direction tangente, normale) : vue le long de la normale — c'est-à-dire telle
  qu'elle couvre le crâne — elle n'est qu'un trait de la largeur du fil, étiré sur
  2·lr, plus la dérive latérale de 0,9·lr. Le bas de la boucle est enfoui
  (centre à lr/2 au-dessus de la peau, rayon lr). L'empreinte réelle d'une boucle
  est un zigzag, pas un disque.
- **Le compte suppose des disques.** `count = cap / (loop·1,55)²` pose une boucle
  par carré de 1,55 diamètre... de boucle. Mesuré : voisin le plus proche à
  **0,49 diamètre de boucle** (serrées), mais **0,8 à 2,1 diamètres de fil** —
  l'écart qui compte pour couvrir est celui du fil, et il est jusqu'à deux fois trop
  grand à fil fin (`yarnR = 0,977·épaisseur·R`, soit 0,0126 au panneau).
- **La lisière est haute** : `low = −0,1 + 0,3·rnd`, soit sy −0,1 à +0,2. Tout le
  bas du crâne, oreilles et nuque comprises, reste nu : c'est une calotte, pas une
  tignasse — l'effet chauve que CLAUDE.md réserve à « trois poils ». S'y ajoute le
  plafond `sy ≤ 0,97` : un disque nu au pôle (sommet 32–62 %).

**2. Pas anime, pas stylée.**

- **Polygonale** : `yarn` par défaut (un anneau tous les 3 rayons) donne **6,0 à
  10,0 anneaux pour toute la boucle** (moy. 7,4), soit 4 à 6 par tour : des
  hexagones (déjà relevé par `synthese-run1.md`).
- **Une queue droite dans chaque boucle** : le rayon vaut
  `lr·sin(π·min(1, 1,4u))^0,3`, nul dès u ≥ 1/1,4. Les derniers 29 % du tracé ne
  tournent plus : un segment droit qui traverse la boucle le long de `side`. La
  spirale « d'un tour et demi » n'en fait qu'un peu plus d'un, finie par un bâtonnet.
- **Du bruit, pas des formes** : 170 à 310 boucles identiques d'orientation
  aléatoire (`phi = rnd·π`). À la taille d'une planche et sous le trait d'encre, ça
  lit comme du vermicelle posé sur une calotte (`proposition-boucles.png`, ligne 1).
  L'anime lit par **grandes formes** — mèches, vrilles, virgules — et par silhouette.
  Ici rien ne cadre le visage, rien ne dépasse de la silhouette, rien au front :
  de face, un bonnet.

**3. Physique à contresens.**

- 8 ressorts en **secteurs** de 45° (`sectorMovers`, raideur 0,064–0,096, amorti
  0,10–0,16, maxAngle 0,16) : toute la toison d'un secteur bouge d'un bloc, et deux
  secteurs voisins se déchirent à leur frontière. Simulés (vrai `SpringBone`) : **88 %
  des ressorts touchent leur butée sur la platine, 100 % au saut** — le mouvement
  plafonne et se lit comme un bloc qui glisse, pas comme des boucles qui rebondissent.
- **Les racines glissent** : `free = 0,6 + 0,4t` dès la racine. Émulé au shader
  (ressort à maxAngle, écartement plein) : sommets enfouis déplacés de **0,09 à
  0,25** — la calotte glisse comme une perruque.
- Rotation autour du centre sur un crâne qui n'est pas une sphère (squash 1,05,
  bajoues, rz = 0,96·rx) : **4,1 % des sommets visibles entrent dans le crâne** de
  plus de 5 mm au débattement maximal (12 008 / 295 422 sur 27 poupées).
- Mouvement moyen 0,06–0,08 partout, sommet compris : rien ne distingue une boucle
  libre d'une racine.

**Coût** : 11–24 k triangles, 1 appel de rendu, 8 ressorts.

## physics

**Principe : ce qui est posé sur le crâne est tenu, ce qui pend rebondit.** La
calotte est faite de brins `pulled` (aMover −1, aFree = aFling = 0) : elle ne bouge
pas, exactement comme les cheveux tirés — c'est le retour 1 appliqué à la partie
posée. Tout ce qui est libre a **son** ressort : chaque anglaise, chaque crosse de
frange. Aucun changement de shader, aucun ressort par secteur.

- **Anglaises (14 ressorts)** : pivot au **centre du crâne**, bout vers le milieu
  de la vrille (`dir = normalize(tête − length/2·ŷ)`), `length = R`, gravité 0 —
  c'est le modèle de la grande frange et l'arbitrage n° 7 de `synthese-run1.md` : une
  rotation autour du centre garde la distance au centre, donc pas de lutte avec les
  bajoues, et le repos est la géométrie (aucun mouvement au repos : angle max
  0,0 sur 10 s, mesuré). Raideur 0,06–0,10, amorti 0,08–0,12, tirés **par
  anglaise** (sinon quatorze ressorts identiques bougent comme un seul) :
  f = √k·60/2π ≈ 2,3–3,0 Hz, ζ = amorti/(2√k) ≈ 0,15–0,2 — elles **sautillent**
  (≈ 3 rebonds) et se posent en ~1 s. `maxAngle` 0,3.
- **Mobilité** : `free(t) = smooth(0,04 ; 0,35 ; t)·(0,55 + 0,45t)` — la tête de la
  vrille est cousue (elle ne bouge qu'à partir du premier tour, pas de décrochage
  avec la calotte tenue), le bas prend tout. **Écartement** : `0,6·smooth(0,1 ; 1 ; t)`,
  nul à la tête : en tournant, les anglaises s'ouvrent en corolle
  (`proposition-boucles-geste.png`). 0,6 et non 1 : à 1, l'écartement radial étire
  l'hélice à l'horizontale (le côté extérieur de la vrille part plus que l'intérieur).
- **Anglaises de tempe** (les deux qui encadrent le visage) : leur débattement est
  **déduit** du visage — chaque point de la vrille, tourné autour du centre, se
  déplace au plus de |v|·angle·free ; `maxAngle = 0,8 · min(écart au bouton / (|v|·free))`
  sur les points du demi-espace avant, boutons pris aux bornes hautes des tirages
  (écart ×1,12, taille ×1,14, comme `faceSafe`). Mesuré : 0,16–0,21 (contre 0,3
  ailleurs). Pour ne pas vivre en butée, leur raideur est multipliée par
  (0,3/maxAngle)^0,8 et l'amorti par la racine de ce facteur (même ζ) : en
  simulation, pic 0,15–0,18 sur la platine, 3 rebonds.
- **Crosses de frange (3–4 ressorts)** : pivot au centre, bout vers la mèche
  (`(sin ac·0,75, −0,66, cos ac·0,75)`, comme `bangs`), raideur 0,05–0,08, amorti
  0,07–0,11, `maxAngle = faceSafe.maxAngle(edgeSy)` (0,27–0,30 mesuré),
  `free = smooth(0,05 ; 0,5 ; t)` (racine tenue : elle borde la calotte immobile),
  écartement 0,35·smooth(0,3 ; 1 ; t).
- **Pas d'épi (ahoge)** : le tourbillon tient ce rôle au sommet, et le tableau des
  fronts de `synthese-run1.md` en met déjà sur couettes, queue et nattes.

**Mesures.** Simulation du vrai `SpringBone` (`sim.ts`, pas de 1/60 ; « butée » = part
des ressorts qui atteignent leur `maxAngle` pendant le geste) :

| geste | actuel (8 secteurs) | anglaises | anglaises de tempe | crosses |
|---|---|---|---|---|
| platine 5 rad/s 0,6 s puis arrêt | pic 0,16, **butée 88 %**, 2–2,5 rebonds | pic 0,20–0,25, **butée 0 %**, 3–3,5 rebonds, calme en 1,0 s | pic 0,15–0,18, 3 rebonds, 0,7–0,8 s | pic 0,20–0,23, butée 0 %, 3–3,5 rebonds |
| saut (0,25 u en 0,3 s) | butée 100 % | butée 100 % (au plafond 0,3), 3,4–3,8 rebonds | butée 100 % | butée 100 % |
| secousse latérale 2 Hz | 0,15, butée 38–50 % | 0,15–0,18 | 0,07–0,09 | 0,26–0,28 |
| repos 10 s | 0 | 0 | 0 | 0 |

(Au saut tout le monde est en butée, coupe actuelle comprise : le saut du
combattant décolle à ≈ 5 u/s. C'est le rôle de `maxAngle`.)

Émulation du shader à débattement max (pire de 10 axes) + écartement plein, sur les
27 poupées : déplacement moyen par zone — côtés 0,053–0,131 (max 0,272), arrière
0,036–0,097 (max 0,266), tempes 0,066–0,120, devant 0,094–0,160 (crosses) ; **sommet
0,003–0,070** (calotte tenue, seules les racines de frange y bougent) ; écartement
max 0,23 sur les anglaises, 0,07 au sommet. Racines enfouies : ≤ 0,02. Sommets qui
entrent de plus de 5 mm dans le crâne : **0** partout sauf 49 / 213 442 aux tempes
(0,02 %), contre 4,1 % aujourd'hui — l'anglaise ne descend jamais plus près du crâne
que `clearHead(…, ρ + r + base + 0,015 R)` ; ce dégagement de 0,015 R (air) couvre
l'écart rx/rz du crâne quand la rotation part vers le flanc.

## density

Étalon : `yarnR = 0,42·épaisseur·R/0,43 = 0,977·épaisseur·R` ; fil de la coupe
`r = yarnR·(0,9 + 0,3g)` (g = grosseur tirée). Toutes les longueurs sont relatives à
R et r : la couverture ne dépend ni de R ni de l'épaisseur (mesuré sur la matrice).

**Calotte : la loi de `pulled`, sans exception.** Racines au pas constant en
**longueur réelle** le long de la lisière, un brin tous les 1,8 r, deux couches
alternées (dessous `max(0,8 r, fibre − 0,9 r)`, dessus + 0,9 à 1,2 r), longueur
pondérée par 1/sin θ au-delà de 90° de l'épi. Le compte est donc déduit de la
lisière : **130–152 brins à 0,03, 195–229 à 0,02, 86–101 à 0,045**. Voisin réel le plus
proche (médiane) : **1,43–1,59 r** — donc 0,72–0,8 diamètre de fil : les brins se
recouvrent par construction. Au lieu d'une attache, un **épi libre** derrière le
sommet (az π ± 0,4, sy 0,86–0,94) : les bouts s'arrêtent en étoile entre un diamètre
au-delà et trois en deçà (`whorl: true`), pôle couvert grâce à `POLE`.

**Lisière** : côtés à sy −0,33 à −0,39 (oreilles), nuque en pointe (la loi `rimOf`
de `pulled`, −0,18 de plus au milieu du dos), front **sous** les racines de la frange
(`front − 4r/ry`) : entre deux crosses, on voit la calotte, pas le front.

Deux essais **rejetés sur mesure** (calotte seule, R 0,43, fil 0,03) :
- tourbillon en fraction du brin (rotation ∝ t²) : **−1,5 point** (97,1 contre
  98,6 %) — deux voisins de longueurs différentes ne tournaient pas du même angle.
  En fonction de la **distance à l'épi** (`swirlReach`), la torsion conserve les
  aires : **−0,0 point** ;
- mèches par resserrement des racines vers chaque anglaise (`pinch` 0,7) : −3,5 à
  −4,5 points ; avec une ondulation en phase par mèche : −5 à −6. La couche du dessous
  seule (3,6 r entre brins) ne couvre plus les frontières. Retenu à la place : un
  **bombé par mèche** (`puff` 0,05 R × (1 − 0,7·across²)) — seul le relèvement change,
  la couverture ne bouge pas, et le creux à la frontière est ce que l'encre dessine.

**Anglaises** : 14 sur l'arc de lisière de la tempe (±`faceSafe.sideAz`) à la nuque,
au pas de leur diamètre (`round(arc/1,05 D) + 1`, D = 2(ρ + r), plafonné à 14 pour le
coût). ρ = R·(0,105 + 0,03g + 0,01u) : **ρ/r = 3,9–4,3 à 0,03** (2,6–2,8 à 0,045 ;
5,8–6,4 à 0,02). Chaque vrille est un ruban de S brins côte à côte, **S = round(2,6ρ /
2,05r) = 3 à 6** ; le pas vaut la largeur du ruban (S·2,05 r ≈ 2,6ρ, hélice à 22°) : la
vrille est **pleine**, et le sillon entre deux tours est plus profond que l'écart
entre deux brins. 0,9 à 5 tours (méd. 2,0), **12,0–14,5 anneaux par tour**.

**Frange** : 3–4 mèches, brins par mèche `clamp(ceil(2·w0 / 1,8r), 6, 18)` sur deux
rangées décalées d'une demi-maille (la règle de `bangs`), w0 = largeur de la mèche à
la racine × 1,1 : **7–8 brins à 0,03**, 10–12 à 0,02.

**Résultat** (27 poupées) : zone cible **98,9–99,9 %** (moy. 99,5) ; devant 100 ;
tempes 100 ; côtés 99,0–100 ; arrière 98,1–99,8 ; **sommet 99,7–100** ; vues
horizontales 96,3–97,6 % (la pire vue 90–94 %, de profil à fil fin 0,02 : on y voit
le crâne entre deux anglaises, sous la lisière). Au repos, aucun sommet d'anglaise ou de frange dans le
crâne ; la calotte en a 0–86 à plus de 5 mm, le fond de la couche du dessous au pas
de 6 rayons — même comportement que les autres coupes à `pulled`.

## anime

Une coupe de poupée d'anime **ojou-sama** — anglaises (tate-roll) et frisettes — en
laine, au lieu d'un bonnet de vermicelle (`proposition-boucles-face.png`) :

1. **Silhouette** : quatorze vrilles qui pendent de la lisière tout autour, **longues
   aux tempes** où elles encadrent le visage (R·0,95 × tirages), **courtes à la
   nuque** (R·0,35 ×), longueur propre à chacune (×0,75–1,25) pour ne pas faire une
   frise. Le bout reste au-dessus des épaules sur les côtés (−0,8 ry) et du bas du
   crâne derrière (−1,0 ry). Axe repoussé hors des bajoues point par point : elles
   s'évasent en cloche sur les joues.
2. **Vrilles pleines, en pointe** : ruban de 3 à 6 brins, rayon qui se resserre de
   moitié vers le bas (cône), brins qui convergent, pointe effilée (`taper 0,3`). Le
   sillon en spirale entre deux tours est l'élément que l'encre dessine le mieux.
3. **Miroir** : le sens d'enroulement porte le signe du côté (`hand · sign(sin az)`) :
   les deux moitiés sont en miroir, pas une copie tournée (leçon de l'écharpe et du
   nœud papillon).
4. **Frange en crosses** (« virgules ») : 3–4 mèches pointues comme celles de la
   grande frange (deux rangées décalées, largeur pleine à la racine), dont le bout
   **s'enroule** — cap qui tourne de plus en plus vite (spirale d'Euler, h =
   −π/2 + sx·2π·tours·u^1,6, 0,9–1,2 tour) — en ruban qui se referme en pointe et se
   décolle un peu du front (+0,03 R). Enroulement vers l'extérieur, signé par le côté.
   Bord au-dessus des sourcils : `faceSafe.edge(2,0–2,25)`, la règle de toutes les
   franges courtes.
5. **Épi en tourbillon** : les brins de la calotte tournent autour de l'épi
   (0,7–1,2 rad, sens tiré) — la spirale se lit en vue plongeante, celle de l'arène.
6. **Mèches bombées** : la couche du dessus bombe au milieu de chaque section (une
   par anglaise ou crosse) et se creuse à la frontière — des sillons qui descendent
   vers chaque vrille.
7. **Ruban** (2 poupées sur 5) : anneau de la couleur tirée dans `RIBBONS`, en tête
   des deux anglaises de tempe. `ribbonColor` et la sous-graine d'un futur `bowKnot`
   sont **tirés dans tous les cas**.

Front de la planche (tableau des arbitrages n° 8 de `synthese-run1.md`) :
**bouclettes = frange en crosses + anglaises de tempe, pas d'épi.** Aucun autre front
ne l'utilise.

## codeSketch

Diff complet et compilé : `proposition-boucles.diff`. Trois morceaux.

**1. `pulled()` — quatre options, toutes éteintes par défaut.** Vérifié : couettes,
queue, chignon, nattes, houppette, mèches, trois poils et grande frange sont
**identiques au bit près** (empreinte des positions, 50 graines × 3 épaisseurs).
`rimOf` est extraite (même formule) pour que les têtes d'anglaise soient **sur** la
lisière des tirés — une seule source.

```ts
type PulledOpts = {
  pitch?: number; crown?: number; tuck?: number; grooves?: number
  /** Épi libre : bouts en étoile, d'un diamètre au-delà à trois en deçà. */
  whorl?: boolean
  /** Tourbillon (rad, signé) autour de l'attache, nul à `swirlReach` (1,1) : fonction de la DISTANCE. */
  swirl?: number
  swirlReach?: number
  /** Couche du dessus bombée par section (la plus proche), creusée aux frontières. */
  sections?: THREE.Vector3[]
  puff?: number
}
function rimOf(limit: (az: number) => number) {
  return (az: number) => dirOf(az, limit(az) + 0.02 - Math.max(0, -Math.cos(az)) ** 3 * 0.18)
}
// dans la boucle des brins de pulled :
const reach = o.tuck ? Math.max(0.2, 1 - o.tuck / ang)
  : o.whorl ? 1 - (r * (-2 + rnd() * 8)) / (R * ang) : 1          // tirage seulement si whorl
let across = 0                                                      // 0 milieu de section, 1 frontière
if (upper && secs) { /* s1, s2 = deux sections les plus proches */ across = clamp(2 * b1 / (b1 + b2), 0, 1) }
for (let k = 0; k <= M; k++) {
  const t = k / M
  const d = from.clone().lerp(to, t * reach).normalize()
  if (o.swirl) d.applyAxisAngle(to, o.swirl * clamp(1 - d.angleTo(to) / (o.swirlReach ?? 1.1), 0, 1) ** 2)
  const puff = upper && o.puff ? o.puff * Math.sin(Math.PI * t) * (1 - 0.7 * across * across) : 0
  pts.push(onDir(p, d, k === 0 ? -r * 2 : k === M && o.tuck ? -r * 0.5 : layer + puff, POLE).pos)
}
return { frontLine: (az: number) => limit(az) + 0.02, rim }
```

**2. `ringlet()` — une anglaise** (nouvelle ; rend son débattement sûr).

```ts
function ringlet(p, r, out, o: { az; head: THREE.Vector3; length; rho; strands; hand: ±1; mover; phase;
                                 eyes: { x; y; size }[] }) {
  const base = Math.max(r * 0.8, p.shell.height - r * 0.9)
  const free = (t: number) => smooth(0.04, 0.35, t) * (0.55 + 0.45 * t)
  let safe = Infinity
  const s = onDir(p, o.head, 0, POLE)
  const w = r * 2.05, turns = o.length / (o.strands * w), K = Math.ceil(turns * 12) + 1
  const air = base + p.shape.headRadius * 0.015
  const top = s.pos.clone().addScaledVector(s.normal, o.rho + r + air)
  for (let j = 0; j < o.strands; j++) {
    const off = (j - (o.strands - 1) / 2) * w
    const pts = [s.pos.clone().addScaledVector(s.normal, -r * 2)]      // racine sous le premier tour
    for (let k = 0; k <= K; k++) {
      const u = k / K, rho = o.rho * (1 - 0.5 * u ** 1.2)                // cône
      const ax = clearHead(p, top.clone().addScaledVector(DOWN, o.length * u), rho + r + air)
      const outH = new THREE.Vector3(ax.x, 0, ax.z).normalize(), tan = new THREE.Vector3(outH.z, 0, -outH.x)
      const th = o.hand * turns * Math.PI * 2 * u
      const q = ax.addScaledVector(DOWN, off * (1 - u ** 2))              // ruban refermé en pointe
        .addScaledVector(outH, -Math.cos(th) * rho).addScaledVector(tan, Math.sin(th) * rho)
      pts.push(q)
      const f = free((k + 1) / (K + 2))
      if (q.z > 0 && f > 0) for (const e of o.eyes)
        safe = Math.min(safe, (Math.hypot(q.x - e.x, q.y - e.y) - e.size - r) / (q.length() * f))
    }
    out.yarn.push(yarn(pts, r, { mover: o.mover, free, fling: (t) => 0.6 * smooth(0.1, 1, t),
                                 phase: o.phase, segs: K + 2, taper: 0.3 }))
  }
  return 0.8 * safe
}
```

**3. `curledFringe()` — frange en crosses.** À fondre dans `fringeTufts` (étape 4 de
`synthese-run1.md`) comme option `curl: { rho, turns }` dès que la brique existe ;
d'ici là, fonction propre. Par mèche : axe dans la carte du front (X est, Y haut),
droit puis spirale d'Euler ; brins décalés en travers de l'axe (normale gauche du
cap), largeur `w0 → 0,9ρ` sur la partie droite puis `0,9ρ·(1−u)^0,9`.

```ts
const h = -Math.PI / 2 + sx * Math.PI * 2 * turns * u ** 1.6          // u : avancée dans la crosse
const w = s <= straight ? w0 + (band - w0) * (s / straight) ** 0.8 : band * (1 - u) ** 0.9
const px = cx - Math.sin(h) * off * w, py = cy + Math.cos(h) * off * w
const lat = lat0 + py / R, az = center + px / (R * Math.max(0.2, Math.cos(lat)))
pts.push(onHeadPolar(p, az, clamp(Math.sin(lat), -0.98, POLE), k === 0 ? -r * 2 : layer + R * (0.015 + 0.03 * u)).pos)
// straight = (lat0 − asin(edgeSy))·R − ρ(0,6 + 0,3·len) − band/2 − r : le bas de la crosse reste au-dessus du bord
// yarn(pts, r, { mover, free: smooth(0.05, 0.5, t), fling: 0.35·smooth(0.3, 1, t), segs: 22, taper: 0.25 })
```

**4. `curls()` — composition.** Ordre des tirages (tous inconditionnels) : g, sens,
épi (2), tourbillon, lisière, ρ, longueur, bord de frange, nombre de crosses, ρ de
crosse, ruban, sous-graine du nœud, couleur ; puis `pulled` ; puis la frange ; puis
les anglaises (longueur, raideur, amorti, phase, chacune).

```ts
const fs = faceSafe(p)
const edgeSy = fs.edge(2.0 + rnd() * 0.25)
const front = clamp(edgeSy + (rhoC * 2.6 + r) / ry, 0.6, 0.88)
const rim = rimOf(hairlineAt(sideLow, front))                          // sideLow = −0,33 − 0,06·rnd
// 14 têtes d'anglaise sur rim(az), az de fs.sideAz à 2π − fs.sideAz, au pas d'arc réel
pulled(p, rnd, r, [whorl], out, sideLow, { crown: front - (4 * r) / ry, whorl: true, swirl,
                                           sections: [...heads, ...fringeRoots], puff: R * 0.05 })
curledFringe(p, rnd, r, out, { rim, width: fs.sideAz - (rho + r) / R - 0.05, tufts, edgeSy, hand,
                               maxAngle: fs.maxAngle(edgeSy), rho: rhoC })
const S = clamp(Math.round((2.6 * rho) / (r * 2.05)), 2, 6)
ringAz.forEach((az, k) => {
  const back = clamp((Math.abs(wrap(az)) - azR) / (Math.PI - azR), 0, 1)
  const want = R * (0.95 - 0.6 * back) * (0.8 + 0.3 * lenK) * (0.75 + rnd() * 0.5)
  const length = Math.max(R * 0.15, Math.min(want, top.y + ry * (0.8 + 0.2 * back)))
  out.movers.push({ pivot: new THREE.Vector3(), dir: mid.normalize(), length: R,
                    cfg: { stiffness: 0.06 + rnd() * 0.04, drag: 0.08 + rnd() * 0.04, gravity: 0 }, maxAngle: 0.3 })
  const safe = ringlet(p, r, out, { az, head, length, rho: rho * (1 - 0.15 * back), strands: S,
                                    hand: Math.sign(Math.sin(az)) * hand, mover: m, phase: rnd() * 6, eyes })
  mv.maxAngle = clamp(safe, 0.05, 0.3)
  const stiff = clamp(0.3 / mv.maxAngle, 1, 2) ** 0.8; mv.cfg.stiffness *= stiff; mv.cfg.drag *= Math.sqrt(stiff)
})
```

Suppressions : l'ancien corps de `curls` et la constante `GOLDEN` (plus utilisée) ;
`onHead` s'ajoute à l'import de `./surface`. `sectorMovers` reste (houppette).

**CLAUDE.md** à réécrire : « bouclettes (secteurs, raides : elles sautillent) » et
« 0,6 pour les bouclettes » deviennent : calotte tenue, un ressort par anglaise et par
crosse ; ajouter les pièges — une boucle debout ne couvre pas (vue le long de la
normale, c'est un trait) ; une torsion en fraction du brin fait perdre la couverture,
en fonction de la distance elle la conserve ; resserrer des mèches ouvre des jours,
les bomber non ; le débattement d'une mèche qui borde les yeux se déduit en lacet
aussi, pas seulement vers le bas.

## risks

1. **Identité de la coupe.** Elle devient une coupe à **anglaises** plus qu'une
   « tignasse de bouclettes ». C'est voulu (grandes formes, lecture anime), mais c'est
   un choix de style à faire valider sur capture ; le libellé `bouclettes` pourrait
   devenir « anglaises ». L'alternative « escargots » du brouillon précédent
   (`scratchpad/boucles/r4.png`) couvre aussi mais lit comme un plat de nouilles
   sous l'encre, et demandait des options de `yarn` et un pivot par sommet qui
   n'existent pas (changement du shader `hairdo`).
2. **Calotte lisse de profil.** Le bombé par mèche (0,05 R) est peu visible dans mon
   rastériseur, qui n'a ni carte de laine ni vrai cel shading ; vue de côté, la
   coupe peut lire « carré + anglaises ». Leviers mesurés comme neutres pour la
   couverture : `puff` jusqu'à 0,08 R, `grooves` de `pulled`. À régler sur capture
   réelle (rechargement complet : cache `hairdo`, deux captures).
3. **Coût.** 38–58 k triangles à 0,03 (p95 56 k, 60 graines), sous le plafond ;
   mais ∝ 1/épaisseur : 65–101 k à 0,02 (comme toutes les coupes denses). Le plafond
   de 14 anglaises est là pour ça ; au-delà, passer le pas des anglaises de 2,6 à
   3 ρ ne fait rien gagner (le coût suit la longueur totale de vrille / r).
4. **Écartement fort.** À `uFling` = 1, l'écartement radial étire les vrilles à
   l'horizontale (la face extérieure part plus que l'intérieure) : retenu à 0,6 ;
   CLAUDE.md signale déjà le « chapeau » à forte amplitude.
5. **Anglaises de tempe bridées** (0,16–0,21) : elles bougent moins que les autres,
   par construction (visage). La compensation raideur/amorti les garde hors butée
   sur la platine, pas au saut (personne n'y échappe).
6. **Épaules / bras.** Aucun collider bras–cheveux (comme toutes les coupes) : le
   bout des anglaises latérales est borné à −0,8 ry (le haut des bras est à
   ≈ −0,81 ry au panneau), mais un bras levé par le combattant les traversera.
7. **`pulled` partagée.** Les options sont éteintes par défaut et l'empreinte des
   huit autres coupes est identique au bit près ; le seul changement visible de la
   signature est `rim` en plus dans l'objet rendu.
8. **Pénétrations résiduelles** : 49 sommets sur 213 442 aux tempes au débattement
   maximal (axe le plus défavorable) ; aucun au repos hors calotte.
9. **Mesures sur une poupée type** (bajoues 0,15, ovale 0,07, visage du panneau
   mis à l'échelle de R) : les archétypes extrêmes (bajoues +0,13, yeux hauts)
   sont couverts par `faceSafe` et `clearHead`, mais à vérifier en planche via
   `window.__hairs` / `__advance`, comme le prévoit `synthese-run1.md` (mesures 1 à 5).
10. **Ruban** : un simple anneau lit peu (une barre de face) ; le `bowKnot` prévu à
    l'étape 4 le rendrait lisible, avec la sous-graine déjà tirée. Si nattes et
    couettes portent déjà un nœud sur la même planche, le garder en anneau.
