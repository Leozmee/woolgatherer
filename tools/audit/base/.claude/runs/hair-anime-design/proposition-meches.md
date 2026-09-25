# Proposition — mèches

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
débattement déduit du dégagement**. Pas de gravité (repos non vertical), donc
aucun mouvement au repos ; tout vient de l'inertie et de `uFling`. Aucun
changement de shader.

- **16 ressorts de mèche** (au lieu de 8 secteurs), pivot au centre du crâne,
  bout vers le centre de la mèche extérieure (`ac = (k+1)·2π/16`), raideur
  0,032…0,048, amortissement 0,08…0,12 (f ≈ 1,7…2,1 Hz, ζ ≈ 0,22…0,30 : un
  dépassement qui se voit, puis se pose — même famille que la grande frange,
  mais resserrée pour que deux mèches voisines ne divergent pas au point
  d'ouvrir un jour). Couche de dessous et couche de dessus partagent les
  ressorts, décalées d'une demi-mèche : là où deux mèches extérieures
  s'écartent, le brin de dessous appartient à l'une ou l'autre et bouche.
- **Mobilité** : dessus `aFree = 0,12 + 0,88·smooth(0,1 → 1, t)` ; dessous
  `0,08 + 0,45·smooth(0,15 → 1, t)` (la couche plaquée bouge deux fois moins :
  c'est elle qui « tient »). Racine ≠ 0 pour ne pas figer le dessus (leçon
  CLAUDE.md), mais assez bas pour que l'épi reste un point : **racines
  déplacées de 0,2 à 0,3 diamètre** au débattement max (contre 0,7…0,9).
- **Écartement** : dessus `(0,5 + 0,5·reach)·smooth(0,3 → 1, t)`, dessous
  `0,35·smooth(0,4 → 1, t)`, nul sur le premier tiers : la calotte ne décolle
  plus, seules les longueurs s'ouvrent.
- **Débattement déduit du dégagement aux boutons** (plus de valeur à la main) :
  pendant la construction, chaque brin posé rapporte (`onStrand`) son plus
  petit écart au disque des boutons en vue de face et son bras de levier ;
  `maxAngle = clamp(0,9·écart / levier, 0,06, 0,3)`. Mesuré : mèches de frange
  0,12…0,25, côtés et nuque 0,30, mèches d'encadrement 0,20…0,24. Aucune
  pointe ne peut venir sur un bouton, quelle que soit la graine ou la taille
  des yeux.
- **Mèches d'encadrement** (2) : un ressort chacune, pivot au centre, mobiles
  à partir du tiers (`0,1 + 0,9·clamp((t−0,3)/0,7)`), écartement dès 0,4.
- **Épi rebelle (ahoge)** : un ressort à la racine, raide et peu amorti
  (0,14 / 0,06 → f ≈ 3,6 Hz, ζ ≈ 0,07 : il vibre), `maxAngle` 0,5. Sa
  direction de repos pointe **vers sa pointe réelle** (courbée en avant) et
  non selon la normale : à la verticale du sommet, le bout était sur l'axe de
  rotation de la poupée et ne ressentait rien. Hors de la sphère du crâne, il
  a le collider automatiquement.
- Total **19 ressorts** (≤ 32).

Mesures de couverture en pose (6 graines, R 0,43) :

| état | actuel | refonte |
|---|---|---|
| repos | 82,0 % | 95,3 % |
| tous les ressorts au débattement, même sens (tête qui tourne) | 82,6 | 95,7 |
| voisins en sens opposés (pire cas, cisaillement) | 75,8 | 92,0 |
| sommet (sy > 0,97) en cisaillement | 63 | 100 |
| + écartement 0,5 | 75,3 | 92,3 |
| + écartement 1 (corolle voulue) | 57,8 | 87,7 |

## density

**Compte déduit de la géométrie** : `n = clamp(round(COVER·π·R·1,05 / r), 140,
360)`, COVER = 2,4 ; 45 % en couche de dessous, 60 % en couche de dessus
(1,05·n brins au total). Soit Σ diamètres / périmètre au plus large =
(1,05·n·2r)/(2π·R·1,05) = COVER = 2,4 : chaque couche seule couvre déjà
nominalement. `r = yarnR·(0,95…1,30)`, donc `n ≈ 2,6/(thickness·(0,95+0,35g))`
— R s'annule : **245 à 300 brins** à l'épaisseur 0,03, pour 265…301 posés
(+ ~14 par mèche d'encadrement + 5 d'épi).

**Répartis en angle autour de l'épi** (`fan`) : on tire la direction ψ
uniformément autour de l'épi et la pointe est le premier point du grand cercle
qui passe sous la lisière (dichotomie `fanTip`). L'écart `sin ρ·Δψ` est alors
le même dans toutes les directions : à ρ = 0,9, p90 **0,62** diamètre et 0 %
de paires à jour (contre 1,13 et 13 %) ; à ρ = 1,2 : 6 % (restes : les V des
pointes et le visage).

**Pôle** : option `pole` de `radiate` (0,9995 ici, 0,98 par défaut pour la
grande frange) : calotte sy > 0,97 couverte à **100 %** (82 % avant).

**Deux couches** : dessous plaquée (lift r·(0,6…1,1) + 0,03R), plus courte
(+0,02 sous la lisière), peu pincée (0,3), pointes à 0,08 ; dessus en mèches
(voir anime). Les V entre les pointes du dessus tombent sur le plein des
mèches du dessous (décalage d'une demi-mèche).

Mesures (8 graines, R 0,43, épaisseur 0,03) : **95,3 % couvert** (min 94) ;
côtés mi-hauteur 99 %, dessus et nuque 100 %, sommet 100 %, vue 3/4 97 %,
profil 97,5 %, dos 99 %, plongée 98 %. Restent 85…89 % en bas (côtés, nuque) :
ce sont les V voulus entre pointes et l'effilage. Invariant en R. En épaisseur :
0,02 → 94,7 % ; 0,045 → 96,3 % ; 0,06 → 97,1 % ; 0,015 → 91,4 % (le plafond de
360 mord) — l'actuel fait 62 / 72 / 92 % aux mêmes épaisseurs.

**Coût** : 69 k triangles en moyenne (61…81 k) à 0,03, contre 47 k aujourd'hui
et 58 k pour la grande frange ; construction 20 ms (13 aujourd'hui). À 0,015 :
190 k — voir risques.

## anime

Silhouette cible : **coupe au bol d'anime** — dôme gonflé à lobes, frange en
grosses pointes **balayée d'un côté**, deux **mèches qui encadrent le visage**
jusqu'à la mâchoire, nuque en pointes dont certaines se **retroussent**, un
**épi rebelle** sur le dessus et un **tourbillon** à l'épi.

1. **Mèches** : 16 autour de la tête (≈ 3 à 4 sur la frange). Dessus pincé à
   0,66 sur le dernier tiers, pointes de 0,2 (bords plus courts), longueur de
   mèche ±0,1, ondulation par mèche (pas par brin).
2. **Mèches en lentille** (`lens`) : une profondeur par mèche (0,3…1), bombée
   au milieu (`√(1−u²)`) et pincée aux bords ; le bruit de hauteur par brin est
   divisé par trois. Le dôme cesse d'être un tapis de brins à des hauteurs au
   hasard : chaque mèche est un volume, la silhouette a des **lobes** (jusqu'à
   ~0,04 de relief, 5 px sur la planche, 13 px en présentation — encrés, puisque
   c'est un contour sur le fond) et les sillons entre mèches reçoivent l'ombre
   portée (carte d'ombre 1024 sur 5 unités : 0,005 par texel, sillon de 0,02…0,04
   résolu).
3. **Frange balayée** (`sweep`) : les pointes de devant glissent de
   `hand·(0,18…0,40)·cos²az` en azimut, progressivement à partir du quart de la
   longueur ; le plancher (`floor`, au-dessus des boutons) est évalué à
   l'azimut **final**. Monotone (dérivée < 1) : pas de croisement. Le sens
   `hand` est tiré par poupée et porté comme un signe (chiralité, cf. écharpe).
4. **Tourbillon** (`swirl`) : rotation autour de l'axe de l'épi de
   `−hand·(0,45…0,75)·(1 − ρ/0,55)²` — maximale à l'épi, nulle à 0,55 rad. Ne
   dépend que de ρ, donc préserve l'ordre des brins (aucun croisement) et ne
   déplace pas les pointes. Se voit de dessus et de dos : c'est ce qui dit
   « cheveux » plutôt que « perruque ».
5. **Frange plus basse** : lisière avant `hairline(p, end, 1,45)` et plancher
   = haut du bouton + 0,08 R, qui redescend autour de l'œil (la frange
   **encadre** le bouton au lieu de s'arrêter en ligne droite). Dégagement brin
   ↔ bouton en vue de face : médiane 0,079, min 0,056 (0,107 / 0,083 avant).
6. **Mèches d'encadrement** (`faceLock`) : deux faisceaux (~14 brins) partis de
   l'épi, passant sur la tempe et tombant devant l'oreille à az ±(faceAz + 0,22)
   ≈ ±62°, pointe recourbée vers la joue, jusqu'à sy −0,38…−0,93 (mâchoire),
   repoussés hors des bajoues.
7. **Pointes relevées par mèche** : 40 % des mèches hors frange se
   retroussent **en entier** (r·7·(0,6+0,4·profondeur) sur le dernier
   cinquième) — au lieu d'un brin sur trois au hasard, qui faisait des
   épis isolés. Évasement 0,07 R, volume 0,09 R.
8. **Épi rebelle** : 4-5 brins en arc qui montent puis ploient vers l'avant
   (angle 1,9…2,5 rad, longueur 0,4…0,65 R), sur le dessus avant.
9. **Reflet anime gratuit** : le reflet `TOON_HAIR` est une tache sur N·H ;
   sur un tube, il s'allume là où la tangente est ⟂ à H. Des brins cohérents
   qui rayonnent d'un épi le placent donc sur un **anneau** autour du dôme — le
   « tenshi no wa » — à condition que les tracés restent lisses et ordonnés :
   c'est une raison de plus pour la lentille (bruit de hauteur réduit) et pour
   un tourbillon qui ne dépend que de ρ.

## codeSketch

(voir brouillon 2 — en cours)

## risks

(voir brouillon 2 — en cours)
