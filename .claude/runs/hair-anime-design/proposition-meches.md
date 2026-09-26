# Proposition — mèches

> **Version 3 (26/09), complète.** Portée sur la copie de travail
> `DummyFaces-coupes` (branche coupes-anime : yarn step/taper, onDir/POLE,
> smooth, faceSafe) et mise en conformité avec `synthese-run1.md`. Le diff
> exact est `proposition-meches-v3.diff` (contre la copie de travail ; il
> passe `tsc --noEmit` dans une copie du projet), la planche de comparaison
> est `proposition-meches-v3.png` (actuel / refonte, graines 3, 8, 12, 21 ;
> face, 3/4, profil, dessus, dos). Prototype et mesures v3 :
> `…/scratchpad/meches_v3/` (`cln.tsx` = fichier proposé instrumenté ;
> `meas.tpl` couverture ; `eyes.ts` boutons et sourcils ; `mob.ts` mobilité
> par zone ; `same.ts` non-régression ; `drive_cln.ts` rendus). Les sections
> diagnosis et les mesures du brouillon 1 sont conservées ; ce qui a changé
> depuis est dit dans chaque section.
>
> Brouillon 1 (sauvegarde anticipée). Chiffres mesurés, prototype dans
> `/private/tmp/claude-501/-Users-leogallus-Projets-DummyFaces/77236db1-43ec-45aa-9052-e59f7758ef81/scratchpad/meches_v2/`
> (`hs_v2.tsx` = copie instrumentée de `hairstyles.tsx` avec la refonte ;
> `measure_v2.ts` couverture au repos et en pose ; `fanspacing.ts` écart entre
> brins autour de l'épi ; `tipcheck.ts` dégagement aux boutons ; `same.ts`
> non-régression des autres coupes ; `drive_v2.ts` rendus SVG/PNG dans `out/`).
> Reprend et vérifie le prototype de la session coupée (`meches_bowlcut_x7/`).
> Aucun fichier du code source n'a été modifié.

## cut

« mèches » — `bowlCut()` + `radiate()` dans `src/doll/hairstyles.tsx`
(l. 541-757). Cheveux **libres** (aucune attache) : le point 1 du retour
(racines tenues) s'y applique au sens « le dessus du crâne ne se déchire pas » —
racines quasi fixes, longueurs mobiles. Les points 2 (clairsemé) et 3 (anime,
physique) s'appliquent pleinement.

## diagnosis

Étalon : `yarnR = 0,42·thickness·R/0,43 = 0,977·thickness·R` (Hairdo reçoit
l'épaisseur du **panneau**, 0,03 par défaut) → 0,0126 à R = 0,43.

**1. Clairsemé — mesuré.** `r = yarnR·(0,8…1,15)` = 0,0101…0,0145 (diamètre
0,020…0,029), `count = 210 − 50g` = 160…210, fixe, indépendant du rayon réel.
Nominalement c'est large : au plus large (équateur, périmètre ≈ 2π·R·1,05 =
2,84) Σ diamètres / périmètre = 1,5…1,6. Pourtant, mesuré (8 graines, rayons
lancés du crâne, R = 0,43, épaisseur 0,03) : **82 % du crâne couvert** (min 74),
côtés à mi-hauteur **70 %** (min 55), vue 3/4 **80 %** (min 58), profil 85 %.
Invariant en R (r ∝ R) — identique à R = 0,38 et 0,50. Trois causes :

- **Répartition en azimut de pointe, pas en angle autour de l'épi.** Les brins
  partent d'un épi *derrière* le sommet (az π ± 0,6, sy 0,80…0,92) mais leurs
  pointes sont réparties uniformément autour de l'axe **vertical**. Vu de
  l'épi, l'éventail est donc dense vers la nuque (pointes proches) et lâche
  vers les côtés et l'avant. Coupé par des cercles centrés sur l'épi
  (`fanspacing.ts`) : à ρ = 0,9 rad de l'épi, écart entre voisins médiane
  0,39 diamètre mais **p90 1,13**, 13 % des paires laissent voir le crâne ; à
  ρ = 1,2 : 24 % ; à ρ = 1,5 : 33 %. L'écart entre géodésiques issues d'un
  point vaut `sin ρ · Δψ` : maximal à 90° de l'épi, précisément sur les côtés.
- **Trou au sommet.** `radiate` borne `sy` à 0,98 : tout brin qui passe
  au-dessus du pôle (tous ceux de devant, puisque l'épi est derrière) est
  rabattu sur l'anneau sy = 0,98 et contourne une calotte de rayon 0,2 R
  (≈ 0,086). Couverture sy > 0,97 : **82 %** ; visible en vue de dessus
  comme une tonsure — et la caméra d'arène est plongeante.
- **Frange perchée.** `hairline(p, end, 2,3)` place la lisière avant à
  (eyeHeight + 2,3 × taille bouton)/ry = **0,79** en hauteur normalisée, soit à
  37° du sommet : dégagement frange ↔ bouton en vue de face médiane 0,107,
  **front nu sur ~0,1 au-dessus des yeux** ; zone front/mi-hauteur couverte à
  43 %. C'est le « front dégarni » des captures.

Sous la finesse : à épaisseur 0,015 la même coupe tombe à **62 %** (compte
fixe, fil deux fois plus fin).

**2. Physique.** 8 ressorts de secteur (raideur 0,035…0,055, amortissement
0,12…0,18 → f ≈ 1,8…2,2 Hz, ζ ≈ 0,35…0,42), `maxAngle` 0,22 pour tous, frange
comprise, `aFree = 0,4 + 0,6·t^0,9` dès la racine. Conséquences mesurées en
posant chaque ressort à son débattement (`measure_v2.ts`, POSE) :
- racines déplacées de **0,7 à 0,9 diamètre** en moyenne : or les 8 secteurs
  **convergent tous à l'épi** — deux secteurs voisins y tirent dans deux
  directions, le sommet se déchire (sommet en cisaillement : 82 → **63 %**
  couvert) ;
- huit blocs : la coupe balance en huit quartiers (le reproche « perruque »
  déjà fait pour la grande frange) ;
- la frange a le même débattement que la nuque : 0,22 × 0,45 ≈ 0,1 de
  glissement de pointe, tenu seulement parce qu'elle est perchée haut ;
- écartement centrifuge plein (fling 1) : couverture **58 %** (côtés bas 3 %)
  — toute la calotte se soulève en corolle, racines comprises à 45 %.

**3. Pas anime.** 160 à 210 brins identiques, sans mèches (`clumps` absent,
donc ni pincement ni pointes), bout effilé au hasard, volume 0,045 R, une
lisière horizontale presque continue : c'est un balai-serpillière posé en
calotte. Ni frange en pointes, ni mèches qui encadrent le visage, ni épi, ni
pointes relevées, silhouette sans lobes.

## physics

Principe : **racines quasi tenues, longueurs libres, un ressort par mèche,
débattement déduit du dégagement aux boutons**. Une coupe au bol n'a pas
d'attache, donc le retour 1 (« tiré = tenu ») s'y lit ainsi : la calotte
couchée sur le crâne ne bouge presque pas, seules les longueurs bougent.

- **16 ressorts de mèche** au lieu de 8 secteurs. Pivot au centre du crâne, bout
  vers le centre de la mèche du dessus (`ac = (k+1)·2π/16`), **gravité 0** (le
  repos est la géométrie : aucun mouvement au repos, tout vient de l'inertie et
  de `uFling`). Raideur 0,032…0,048, amortissement 0,08…0,12 (f ≈ 1,7…2,1 Hz,
  ζ ≈ 0,22…0,30 : un dépassement visible, puis la mèche se pose ; même famille
  que la grande frange, resserrée pour que deux voisines ne s'écartent pas au
  point d'ouvrir un jour). Les deux couches partagent les ressorts, décalées
  d'une demi-mèche : là où deux mèches du dessus divergent, le brin du dessous
  appartient à l'une ou à l'autre et bouche.
- **Mobilité** : dessus `0,12 + 0,88·smooth(0,1 ; 1 ; t)`, dessous
  `0,08 + 0,45·smooth(0,15 ; 1 ; t)`. Pas zéro à la racine (sinon le dessus reste
  figé sous des pointes qui balancent, piège déjà noté), mais assez bas pour que
  l'épi reste un point.
- **Écartement** : dessus `(0,5 + 0,5·portée)·smooth(0,3 ; 1 ; t)`, dessous
  `0,35·smooth(0,4 ; 1 ; t)` : **nul sur le premier tiers**, la calotte ne décolle
  plus, seules les longueurs s'ouvrent.
- **Débattement déduit** : chaque brin posé rapporte (`onStrand`) son plus petit
  dégagement aux boutons et son bras de levier ; `maxAngle = clamp(0,9·dégagement
  / levier ; 0,06 ; 0,3)`. Le dégagement vient d'une nouvelle fonction de
  faceSafe, `gap(q, rr)` : distance, vue de face, au **segment** que balaie le
  bouton entre les bornes d'écart (±12 %), taille +14 % — une seule source pour
  toutes les franges. Mesuré : 0,18…0,30.
- **Supprimés par rapport au brouillon 1** : la mèche d'encadrement à ressort
  propre (faceLock ×2) et l'épi rebelle (ahoge). Voir anime et risks. Total
  **16 ressorts** (≤ 32, 19 au brouillon 1).

Mobilité par zone (borne du shader : |x|·maxAngle·aFree, et 0,5·|hOut|·aFling à
uFling = 1 ; 8 graines, R 0,43, épaisseur 0,03) :

| zone | actuel : glissement / écartement | refonte |
|---|---|---|
| racines (t = 0) | 0,036 / 0 | **0,010…0,013** / 0 |
| t = 0,1 | 0,049 / 0,006…0,017 | 0,012…0,014 / **0** |
| mi-longueur | 0,073…0,076 / 0,014…0,119 | 0,046…0,055 / 0,003…0,028 |
| pointes frange | 0,101 / 0,072 | 0,104 / 0,060 |
| pointes côtés | 0,114 / 0,221 | 0,105 / 0,151 |
| pointes nuque | 0,115 / 0,239 | **0,130** / 0,183 |

Racines déplacées de 0,2 à 0,3 diamètre au débattement (0,7 à 0,9 aujourd'hui) ;
les pointes bougent autant ou plus. Couverture en pose (graines 1–8) :

| état | actuel | refonte v3 |
|---|---|---|
| repos | 82,0 % | **94,9 %** |
| ressorts au débattement, même sens (tête qui tourne) | 80,9 | 93,5 |
| voisins en sens opposés (pire cas, cisaillement) | 74,4 (sommet 64) | 89,3 (sommet 98,6) |
| + écartement 0,5 | 73,5 | 90,1 |
| + écartement 1 (corolle voulue) | 56,1 (côtés bas 4) | 86,1 (côtés bas 60) |

Boutons (32 graines, écart 0,88 / 1 / 1,12, taille +14 %) : dégagement minimal
**0,103 au repos, 0,046 en pose** (±maxAngle sur 8 axes) — actuel 0,048 et
**0,015**.

## density

**Compte déduit de la géométrie** : `n = clamp(round(2,8·π·R·1,05 / r), 140, 360)`,
45 % en couche de dessous, 60 % en couche de dessus (1,05·n brins). Au tour le
plus large (2π·R·1,05), chaque couche pose un brin tous les
`2r/(2,8·part)` : **2,1 r dessous, 1,6 r dessus** — la loi des cheveux tirés
(1,8 r par couche) tenue au plus large, là où l'éventail est le plus ouvert.
`r = yarnR·(0,95…1,30)`, `yarnR = 0,977·épaisseur·R`, donc
`n ≈ 3,0/(épaisseur·(0,95 + 0,35g))` : R s'annule, **272 à 313 brins posés** à
0,03 (183 aujourd'hui). BOWL_COVER passe de 2,4 (brouillon 1) à 2,8 : le carré
plongeant a plus de surface à couvrir, et le coût le permet (ci-dessous).

**Répartis en angle autour de l'épi** (`fan`) : direction ψ uniforme autour de
l'épi, pointe = premier point du grand cercle sous la lisière (dichotomie).
L'écart `sin ρ·Δψ` est le même dans toutes les directions (brouillon 1 : à
ρ = 0,9, p90 0,62 diamètre et 0 % de paires à jour, contre 1,13 et 13 %).
**Pôle** : borne POLE (0,9995) passée à `radiate` : sommet couvert à 100 %
(82 % avant). **Deux couches** : dessous plaqué, plus court, peu pincé (0,3) ;
dessus en mèches ; les V du dessus tombent sur le plein du dessous.

Mesures (graines 1–8 ; méthode du brouillon 1 : rayons lancés depuis le crâne
au-dessus de la lisière réelle + 0,06, **les V voulus entre pointes comptent
comme des trous**) :

| | actuel | refonte v3 |
|---|---|---|
| global, R 0,43, ép. 0,03 | 82,0 % (min 74) | **94,9 %** (min 92) |
| sommet / dessus | 82,5 / 96,0 | **100 / 100** |
| corps de frange (entre racines et haut des V) | — | **100** |
| côtés mi-hauteur | 70,4 | 98,0 |
| vue 3/4 · profil · dessus · dos | 79,7 · 84,5 · 88,6 · 95,8 | 95,4 · 97,7 · 98,4 · 99,0 |
| ép. 0,015 / 0,02 | 60,9 / 70,1 | 88,8 / 93,0 (plafond 360 atteint) |
| ép. 0,045 / 0,06 | — | 95,3 / 95,5 |
| R 0,36 / 0,55 (ép. 0,03) | — | 94,8 / 94,9 |

Ce qui reste (côtés bas 87 %, nuque basse 90 %, haut de frange 85 %), ce sont
les V entre pointes et l'effilage. Pour comparaison, la grande frange (aimée)
fait 87–88 % avec la même méthode.

**Coût**, à pas de tube relatif au crâne (`step = 0,13·R/r` dessus, 0,2·R/r
dessous : le tracé se courbe à l'échelle du crâne, pas du fil, donc le nombre
de segments ne grimpe plus quand le fil s'affine) : **44 k triangles en moyenne
(40–48 k) à 0,03** ; 55 k à 0,02 et 0,015 ; 31 k à 0,045. L'actuel fait 47 k
à 0,03 mais **67 k à 0,02 et 86 k à 0,015**. Construction 19 ms (14 aujourd'hui).
Un seul appel de rendu, comme aujourd'hui.

## anime

Silhouette cible : **carré au bol d'anime** — dôme gonflé à lobes, frange en
lames pointues au-dessus des sourcils, joues encadrées par un **carré
plongeant**, nuque courte en pointes dont certaines se **retroussent**, et un
**tourbillon** à l'épi. Front distinct sur une planche (tableau de
`synthese-run1.md`) : ni frange de côté (nattes), ni mèches latérales à part
(couettes, chignon, nattes), ni épi rebelle (couettes, queue, nattes,
houppette).

1. **Mèches** : 16 autour de la tête (3 à 4 sur la frange), pincées à 0,66 sur
   le dernier tiers (0,40 sur la frange : des lames larges), pointes de 0,2
   (0,12 sur la frange), longueur de mèche ±0,1 (±0,03 sur la frange),
   ondulation par mèche et non par brin.
2. **Mèches en lentille** : profondeur par mèche, bombée au milieu (√(1−u²)),
   bruit de hauteur par brin divisé par trois. Silhouette à **lobes** (jusqu'à
   ~0,04 de relief, encré puisque c'est un contour), sillons d'ombre entre
   mèches.
3. **Frange posée** (nouveau en v3) : bord à `faceSafe.edge(2,0…2,15)`, la règle
   commune des franges courtes ; le centre des mèches de frange tombe **sur**
   ce bord (plus de ±0,1 de longueur ni de désordre de pointe), les pointes
   se **posent sur le front** (relèvement ×0,3 sur le dernier tiers, pas
   d'évasement) au lieu de rester au sommet du volume. Mesuré : la pointe la
   plus basse passe de ~0,1 au-dessus du bord à 0,0–0,03. Les mèches sont
   calées pour qu'une pointe tombe au milieu du front après le coiffage.
4. **Sens de coiffage** : les pointes de frange glissent de `hand·(0,06…0,12)`
   rad, bord horizontal. C'est ce qui sépare le bol de la frange de côté des
   nattes (±0,25…0,35, bord en pente). Réduit depuis le brouillon 1 (0,18…0,40).
5. **Carré plongeant** (remplace les deux faceLock du brouillon 1) : la lisière
   est plate jusqu'à `sideAz` (au-delà du bout des sourcils), plonge jusqu'à la
   mâchoire `min(nuque, −0,3) − 0,1…0,25` sur 0,45 rad, puis remonte vers la
   nuque. Une seule coupe, un seul jeu de ressorts : pas de faisceau posé à
   part (qui aurait doublé le sideLock des autres coupes). Plonger dès le coin
   de l'œil faisait passer les longueurs sur le bout des sourcils froncés
   (11 graines sur 32) : réglé en partant de sideAz (0 sur 32).
6. **Tourbillon** : rotation autour de l'axe de l'épi de
   `−hand·(0,45…0,75)·(1 − ρ/0,55)²`, fonction de ρ seul : ordre des brins
   conservé, pointes inchangées. Visible de dessus et de dos — la caméra
   d'arène est plongeante.
7. **Pointes retroussées par mèche** : 40 % des mèches hors frange se
   retroussent en entier sur le dernier cinquième, évasement 0,07 R tout
   autour sauf sur la frange, volume 0,09 R.
8. **Reflet anime** (gratuit) : la tache `TOON_HAIR` sur N·H s'allume là où la
   tangente est ⟂ à H ; des brins lisses et ordonnés qui rayonnent d'un épi la
   placent sur un anneau autour du dôme (« tenshi no wa »). C'est une raison de
   plus pour la lentille et pour un tourbillon qui ne dépend que de ρ.

Sourcils (32 graines, humeurs à sourcils) : seuls les sourcils **surpris**
(sommet à 2,54 tailles de bouton au-dessus de l'œil) sont touchés, sur
**14 graines sur 32 — contre 21 aujourd'hui** ; froncé, triste, espiègle : 0.

## codeSketch

Diff complet et compilé : `proposition-meches-v3.diff` (453 lignes, contre
`DummyFaces-coupes/src/doll/hairstyles.tsx`). Trois changements, rien d'autre :

**1. `faceSafe` gagne `gap`** (source unique du dégagement aux boutons) :

```ts
gap: (q: THREE.Vector3, rr: number) => {
  if (q.z < R * 0.3) return Infinity
  const x = Math.abs(q.x)
  const x0 = p.face.eyeSpacing * 0.44
  const x1 = p.face.eyeSpacing * 0.56
  return Math.hypot(x - clamp(x, x0, x1), q.y - p.face.eyeHeight) - size - rr
},
```

**2. `radiate()` : options nouvelles, toutes absentes par défaut.** Vérifié : la
grande frange et les huit autres coupes sont **identiques au bit près** (empreinte
positions + aMover/aFree/aFling, 50 graines × 3 épaisseurs, 0 build différent
sur 150 pour chaque coupe) ; même graine → même géométrie.

```ts
whorl?: THREE.Vector3            // épi imposé (sinon tiré comme avant)
fan?: boolean                    // brins en angle autour de l'épi
jitter?: number                  // 0,08 par défaut
clumpShift?: number              // décalage des mèches, en fraction de mèche
clumpVarAt?: (az) => number      // écart de longueur par mèche selon l'azimut (0,14)
point?: number; pointAt?: (az) => number    // profondeur des pointes (0,16)
pinchAt?: (az) => number         // fermeture selon l'azimut (pinch par défaut)
frontAt?: (az) => number         // poids de frange : ni évasement ni désordre, pointe posée
clumpWave?: boolean              // ondulation en phase dans la mèche
layerSpan?: [number, number]     // hauteur de pose r·(a + hasard·b) ; [0,7 ; 1,4]
floor?: (az) => number           // plancher de pointe (garde-fou boutons)
rootK?: [number, number]         // part du trajet épi → pointe où naît le brin
free?, fling?: (t, reach) => number
taper?, step?: number            // transmis à yarn
pole?: number                    // borne haute ; 0,98 par défaut, POLE ici
swirl?: number                   // tourbillon signé
lens?: boolean; flickRate?: number
sweep?: (az) => number           // glissement des pointes en azimut
onStrand?: (pts, r, mover) => void
```

Corps, dans l'ordre : tirages de mèche en tête (`clumpPhase`, `clumpDepth`,
`clumpFlick` **seulement si l'option est là** — présence décidée par la coupe,
jamais par la graine) ; `fanTip(ψ)` ; écart au centre de mèche **ramené dans
]−π, π]** (sans ce repli, un brin d'azimut légèrement négatif tombait dans la
dernière mèche avec un écart de ~2π — sans effet sur la grande frange, dont ces
brins sont sous la frange et non posés : prouvé par l'empreinte) ; plancher
évalué à l'azimut **final** (pincé + balayé) ; lentille ; tourbillon
`d.applyAxisAngle(whorl, swirl·w²)` avant le calcul d'azimut ; relèvement
`(layer + puff)·(1 − 0,7·front·smooth(0,7 ; 1 ; t)) + flip + flare·(1 − front)`
; `o.onStrand?.(pts, r, mover)` avant `yarn(pts, r, { mover, free, fling,
phase, taper, step })`.

**3. `bowlCut()` réécrite** (extrait, commentaires dans le diff) :

```ts
const BOWL_COVER = 2.8, SWIRL_RHO = 0.55, FRONT_POINT = 0.12, BOWL_SEG = 0.13

const safe = faceSafe(p)
const g = rnd(), r = yarnR * (0.95 + g * 0.35)
const n = clamp(Math.round((BOWL_COVER * Math.PI * R * 1.05) / r), 140, 360)
const end = -0.2 - rnd() * 0.5
const wave = rnd() < 0.5 ? 0 : 0.03 + rnd() * 0.04
const whorl = dirOf(Math.PI + (rnd() - 0.5) * 1.2, 0.8 + rnd() * 0.12)
const hand = rnd() < 0.5 ? -1 : 1
const comb = hand * (0.06 + rnd() * 0.06)
const swirl = -hand * (0.45 + rnd() * 0.3)
const edge = safe.edge(2.0 + rnd() * 0.15)
const jaw = Math.max(-0.92, Math.min(end, -0.3) - 0.1 - rnd() * 0.15)
// 16 ressorts : pivot centre, dir vers (k+1)·2π/16, {0,032–0,048 ; 0,08–0,12 ; gravité 0}
const A = safe.sideAz
const hem = (az) => { const a = |wrap(az)|
  return edge + (jaw - edge) * smooth(A, A + 0.45, a) + (end - jaw) * smooth(A + 0.6, Math.PI - 0.25, a) }
const front = (az) => smooth(Math.cos(A + 0.1), Math.cos(A * 0.5), Math.cos(az))
const report = (pts, rr, m) => /* min de safe.gap(q, rr) et bras de levier |q| par ressort */
const shared = { fan: true, whorl, clumps: 16, clumpMover: clump0, floor, pole: POLE, swirl,
  onStrand: report, sweep: (az) => comb * Math.max(0, Math.cos(az)) ** 2, frontAt: front }
radiate(p, rnd, r, Math.round(n * 0.45), (az) => hem(az) + 0.02 + FRONT_POINT * 0.4 * front(az), out, {
  ...shared, clumpShift: -comb / span, clumpVarAt: (az) => 0.05 - 0.03 * front(az), point: 0.08,
  pinch: 0.3, layerSpan: [0.6, 0.5], volume: R * 0.03, taper: 0.12, rootK: [0.005, 0.025],
  jitter: (2π / (0.45n)) * 0.3, step: (1.5 * BOWL_SEG * R) / r,
  free: (t) => 0.08 + 0.45 * smooth(0.15, 1, t), fling: (t) => 0.35 * smooth(0.4, 1, t) })
radiate(p, rnd, r, Math.round(n * 0.6), hem, out, {
  ...shared, clumpShift: 0.5 - comb / span, clumpVarAt: (az) => 0.1 - 0.07 * front(az), point: 0.2,
  pointAt: (az) => 0.2 + (FRONT_POINT - 0.2) * front(az), pinch: 0.66, pinchAt: (az) => 0.66 - 0.26 * front(az),
  layerSpan: [1.2, 1.0], volume: R * 0.09, flare: R * 0.07, ragged: 0.03, wave, clumpWave: true,
  rootK: [0.02, 0.04], lens: true, flickRate: 0.4, jitter: (2π / (0.6n)) * 0.3, step: (BOWL_SEG * R) / r,
  free: (t) => 0.12 + 0.88 * smooth(0.1, 1, t), fling: (t, reach) => (0.5 + 0.5 * reach) * smooth(0.3, 1, t) })
for (const [m, c] of clear) out.movers[m].maxAngle = clamp((0.9 * c.gap) / c.lever, 0.06, 0.3)
```

Ordre des tirages : g, end, wave (2 tirages), épi (2), hand, comb, swirl, bord,
mâchoire, 16×2 ressorts, puis les deux `radiate`. Tous faits quelle que soit la
variante.

**Place dans le plan** (`synthese-run1.md`, ordre) : indépendante des étapes
4–10 — elle n'utilise que les outils déjà en place (smooth, faceSafe, POLE,
step/taper). Peut se faire à tout moment après l'étape 3 ; contrôle :
empreinte de la grande frange inchangée, puis les mesures ci-dessus avec
`__hairs`. CLAUDE.md : réécrire « Mèches (coupe au bol) » (8 secteurs →
16 mèches, racines quasi tenues) et ajouter les pièges ci-dessous.

## risks

- **Conflit ouvert avec l'arbitrage : hauteur de frange.** Le brouillon 1
  descendait la frange à f ≈ 1,45 (juste au-dessus des boutons) ; la v3 suit la
  règle commune f ≥ 2 pour ne pas couvrir les sourcils. Conséquence visible
  sur la planche comparative : **de face, le front reste haut**, à peu près à
  la hauteur actuelle (f = 2,3) — plus dense et mieux posé, mais c'est le point
  faible de la coupe côté « anime » (dans le dessin anime, la frange couvre les
  sourcils et on dessine les sourcils par-dessus). Deux sorties, à trancher par
  l'utilisateur sur capture : (a) une constante, `edge = faceSafe.edge(1,45)`
  — mesuré au brouillon 1, sourcils couverts sur toutes les humeurs à sourcils ;
  (b) plus ambitieux, **dessiner les sourcils par-dessus les franges** (passe
  stencil ou ordre de rendu, limitée à la face avant) : lèverait la contrainte
  pour toutes les coupes à frange. Hors lot ; à ne pas faire en douce.
- **Épis par planche** : même sans épi sur les mèches, le plan arbitré ne tient
  pas la cible « au plus deux épis dans 95 % des planches » : calcul exact sur
  les C(10,6) planches, avec houppette 1, couettes 0,4, nattes 0,4, queue 0,5
  → **91,0 %** (moyenne 1,38). Un épi à 40 % sur les mèches la ferait tomber à
  83,7 %. D'où son retrait ici ; à signaler à la synthèse finale.
- **radiate() prend une vingtaine d'options.** C'est lourd pour une fonction
  qui ne sert qu'à deux coupes. Le prix est payé une fois, et l'empreinte de la
  grande frange doit être rejouée à chaque retouche de `radiate`. Alternative
  écartée : une copie `bowlStrands()` — deux copies divergent (CLAUDE.md).
- **Garde-fou `floor` inactif au panneau** : avec la lisière plate jusqu'à
  sideAz, il ne mord que si sideAz est plafonné (1,3 : très gros boutons très
  écartés). Gardé comme filet ; à tester avec `leftSize` au maximum du panneau.
- **Pire cas de cisaillement** (voisins en sens opposés au débattement) : le
  corps de frange descend à 91 % (min 81). Improbable en jeu (les 16 ressorts
  ont des raideurs proches et reçoivent la même inertie), mais c'est la limite
  du « un ressort par mèche ». Si ça se voit : resserrer encore l'écart de
  raideur ou lier les deux couches au même ressort sur la frange.
- **Plafond 360 brins** : sous 0,02 d'épaisseur il mord (88,8 % à 0,015). Le
  relever à 480 (celui des tirés) rendrait 1 à 2 points pour ~72 k triangles à
  0,015 : hors budget. Choix : budget tenu sur toute la plage.
- **Écartement plein** : côtés bas à 60 % (corolle voulue). Si la corolle paraît
  trop ouverte en arène, baisser le coefficient `0,5 + 0,5·portée` du dessus,
  pas la mobilité.
- **Mesures faites hors navigateur** (géométrie + formule du shader). À refaire
  en vrai, après rechargement complet (cache 'hairdo'), avec `__hairs` et
  `__advance` pendant une rotation de platine à 5 rad/s ; deux captures.
- **Pièges à ajouter à CLAUDE.md** : (1) un éventail réparti en azimut de pointe
  est lâche à 90° de l'épi — répartir en angle autour de l'épi ; (2) un bord de
  frange « cible » est dépassé de ~0,1 par le désordre de longueur, les
  pointes et le relèvement : c'est le **centre** des mèches qui doit tomber
  dessus, pointe posée sur le front ; (3) un carré qui plonge dès le coin de
  l'œil passe sur le bout des sourcils — plonger au-delà de sideAz ; (4) un pas
  de tube en rayons de fil fait exploser le coût quand le fil s'affine (1/ép²) :
  pour un tracé qui se courbe à l'échelle du crâne, le pas se prend sur R.
