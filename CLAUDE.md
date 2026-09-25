# Notes de travail — woolgatherer

Journal des avancées, tenu à jour à chaque étape (demande de Leo). Le plus récent
en haut. Branche de travail : `claude/quirky-galileo-g4u9c5`, partie de
`peluches-jouables`.

## Tester soi-même

```bash
git fetch origin
git checkout claude/quirky-galileo-g4u9c5
npm install
npm run dev          # http://localhost:5173
```

Choisir une peluche → **Jouer**. Arène :

| Geste | Clavier | Manette |
|---|---|---|
| Se déplacer | ZQSD / WASD / flèches | stick gauche |
| Sprinter | Maj (tenue) | gâchettes basses LT/RT, ou stick cliqué |
| Sauter (tenir = plus haut) | Espace | A |
| Attaquer (×3) · en l'air : plongeon | J / clic | X |
| Pas de côté | L | B |
| Parer | K | LB / RB |
| Tester : coup reçu / K.O. | H / X | Y / Select |

Atelier (dev) : `window.__fighter` (état du combattant : `current`, `pos`, `vel`,
`speed` pour un ralenti), `window.__stepper`, `window.__legK`, `window.__doll`.

## Vérifier sans navigateur

Le rendu headless (swiftshader) tourne à ~2 i/s : inutilisable pour juger du
mouvement. La mécanique se mesure en Node : un petit fichier `src/__sim.ts`
qui importe `Fighter`, `SpringBone`, `solveLeg`, bundlé par esbuild
(`npx esbuild src/__sim.ts --bundle --platform=node --format=esm --outfile=/tmp/sim.mjs`),
puis supprimé. Mesures de référence ci-dessous.

## Journal

### 2026-09-25 — physique et animations des personnages (2)

- **K.O. physique** (`fighter.ts`, `fall` / `toppleStep`) : le corps bascule en
  arrière autour des pieds (`θ'' = g/h · sin θ`, gravité réduite de peluche),
  touche le sol du dos à ~0,75 s, rebondit (vitesse × −0,3), bouffée,
  secousse, puis se balance sur son dos rond jusqu'à 1,5 rad. Bras et tête
  restent sur ressorts, mous.
- **Relevée** (X à nouveau, geste `rise`, ~1,1 s) : assise en poussant sur les
  bras, accroupie mains sur les genoux (IK des genoux active), debout d'une
  détente, tête qui secoue, sonnée. Les ressorts repartent de la pose au sol.
- **Collisions avec son propre corps** (`Doll.tsx`) : tête, poitrine et ventre
  en sphères monde relues chaque image (rayons pris sur l'ellipsoïde du
  torse). Les mains (ressorts d'avant-bras) ne rentrent plus dans le corps ;
  la lame de l'épingle pivote autour de la main pour contourner tête et torse
  (`avoidSphere`), le sol gardant le dernier mot.
- Bouffées de laine plus fines (elles lisaient comme des boules de neige).

### 2026-09-25 — physique et animations des personnages (1)

Demandes : marche qui tangue moins, sprint rapide, saut, genoux/coudes (membres
moins raides, plus de vie), esquive en pas de côté au lieu de la roulade.

- **Marche calmée** (`fighter.ts`, `locomotion`) : dandinement 0,1 → 0,035 rad,
  torsion de foulée 0,16 → 0,06, report du dandinement dans le cisaillement
  0,6 → 0,35. Mesuré sur 1,5 s de marche : roulis du bassin 0,073 → 0,022 rad,
  cisaillement 0,079 → 0,014, torsion 0,167 → 0,063, déplacement latéral de la
  tête ≈ 0,061 → 0,003 u.
- **Sprint** : Maj / gâchettes. 5 u/s (course : 2), pleine vitesse en ~0,5 s,
  glissade de ~0,55 u à l'arrêt. Buste penché (≈ 0,5 rad), tête relevée, bras
  en équerre qui pompent (fréquence des ressorts du bras libre relevée), arme
  couchée derrière, virages plus larges et plus penchés, presque plus de roulis.
  Pas plus courts et plus vifs (jusqu'à 13/s, `Stepper`), genoux hauts.
  Bouffées de laine sous chaque pas, en glissade, à la réception (`Dust`).
- **Saut** : Espace / A. Appel accroupi de 0,06 s puis poussée ; gravité 20 à
  la montée tant que le bouton est tenu, 34 sinon et à la descente (sommet
  flottant, chute franche). Tenu : sommet 0,70 u (≈ 0,36 × la hauteur),
  0,47 s en l'air ; bref : 0,43 u, 0,32 s. Poses de vol (genoux repliés à la
  montée, jambes tendues et bras qui moulinent à la descente), réception
  écrasée proportionnelle à la vitesse de chute. Élan du sprint conservé en
  l'air. Appui de saut en l'air mis en file : rebond immédiat à l'atterrissage.
- **Plongeon** : attaque en l'air → suspension, épingle levée, chute droite
  pointe en bas, impact (`slam`) avec gel d'image et secousse.
- **Pas de côté** (remplace la roulade) : la poupée garde son cap, petit bond
  bas (≈ 0,09 u, 0,16 s de vol) de ~1,2 u dans la direction du stick (en
  arrière sans direction). Buste penché dans le mouvement, jambe de tête
  écartée, l'autre repliée, bras à l'opposé, tête qui compense, freinage à
  l'atterrissage.
- **Genoux et coudes** (`limbs.ts`, `rig.ts`, `Doll.tsx`) : chaque membre plie à
  mi-longueur. Le boudin reste d'une pièce ; sa moitié basse suit un second os
  (`lowerPose` : angle du geste, puis `lowerSpring` : ressort). Pli fondu sur
  un quart du membre dans le vertex shader (`jointShader`, remplace l'ancienne
  courbure en sinus `bowShader`), duvet compris. Nouveaux os de pose
  `elbow±1`, `knee±1` avec ressorts et butées ; tous les gestes les
  renseignent (coude armé puis déplié en fouet sur les frappes, bras pliés en
  course, repliés en parade…). Avant-bras/tibias sur ressort plus mou : ils
  arrivent en dernier.
- **IK des jambes à deux segments** (`solveLeg`) : au sol, la jambe rejoint son
  pied planté par hanche + genou, dans le repère de la hanche (écrasement
  compris). Le genou part devant ; quand le corps se tasse (course,
  réception, appel), le genou plie au lieu que la jambe rapetisse. Étirement
  du tissu seulement au-delà de la portée tendue (≤ 1,15). Genoux souples à
  l'arrêt (bassin −4 % de jambe). Erreur de pied mesurée : ~1e-15.
- **Ornements de membres** (`traits.tsx`) : `limbEnds` pour ce qui vit sous le
  pli (bracelet, bandage au bout) ; le bandage à mi-membre remonte au-dessus.
- **Ressorts à pas fixe** (`springBone.ts`) : 1/60 s par sous-pas, cible
  interpolée, bout extrapolé à l'affichage. Identique à l'ancien calcul à
  60 i/s ; écart max à 30/120/144 Hz : 0,124/0,060/0,070 rad → 0,011/0/0,032.
  Concerne aussi locks et coiffures.
- **Coups reçus variés** : côté tiré au sort (`hitSide`), torsion et tête de ce côté.
- **Attente vivante** : après ~1,4 s immobile, regards ailleurs (tête puis
  buste), report de poids ; aussi sur la planche, déphasé par poupée.
- **Arène** : rayon 2,3 → 6 ; tapis en points de couture + croix semées
  (`ArenaFloor`) pour lire la vitesse sur le blanc ; lumière porteuse d'ombre et
  ombres de contact qui suivent la poupée ; caméra avec un peu d'avance dans
  le sens de la course, qui recule au sprint et suit le saut à moitié.

