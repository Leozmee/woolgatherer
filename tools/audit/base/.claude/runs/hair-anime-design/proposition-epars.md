# Proposition — epars

## cut

epars : wisps() dans src/doll/hairstyles.tsx, affichée « trois poils ». C'est la seule coupe qui a le droit de laisser le crâne nu. Je n'ai modifié aucun fichier. Les chiffres viennent de deux scripts de mesure placés dans le scratchpad : wisps_audit.ts rejoue la coupe actuelle sur 4000 graines, wisps_new.ts prototype la refonte sur 3000 graines. Tous deux utilisent le vrai onHeadPolar et le vrai mulberry32, avec R entre 0,38 et 0,48 et une épaisseur de panneau entre 0,02 et 0,045.

## diagnosis

Grandeurs utilisées. Hairdo reçoit `p` (l'épaisseur du panneau), pas le `hairLook` de la poupée. Donc yarnR = 0,03 × 0,42 × R/0,43 = 0,0126 à R = 0,43. Un brin a r = yarnR × (1 à 1,4), soit 0,011 à 0,020, et un diamètre de 0,025 à 0,035. Sur la planche, la caméra est à 4,4 × 2,6 = 11,4 avec un fov de 34°, ce qui donne 6,99 unités visibles, soit environ 129 px par unité pour un écran de 900 px. La tête y fait donc environ 111 px et un brin 3 à 4,5 px, moins que l'épaisseur du trait d'encre.

1) Nombre et répartition : ce qui fait « clairsemé ».
- Le nombre est tiré uniformément entre 2 et 5. Trois poils n'apparaissent que sur 25 % des poupées : le nom est faux trois fois sur quatre.
- Les racines sont tirées indépendamment dans une bande az ±1,2 rad × sy 0,8–0,97, soit une aire d'environ 0,41 R². Rien n'empêche deux racines de se toucher. L'écart moyen est d'environ 0,34R, soit 4,8 diamètres. Pourtant 47,7 % des poupées ont deux racines à moins de 0,15R l'une de l'autre, et 10 % ont deux racines qui se chevauchent (moins de 0,77 diamètre).
- À la lisière sy = 0,8, le tour du crâne vaut 2π × 0,6R ≈ 1,62. Pour couvrir en brins jointifs de 0,03, il faudrait environ 54 brins. Avec 5 brins, l'écart est de 10,8 diamètres.
- Entre 5 et une cinquantaine de brins, on lit une calvitie : le défaut signalé par l'utilisateur. Avec 3 brins regroupés, on lit un gag voulu. La coupe actuelle, à 4 ou 5 brins dispersés (50 % des poupées), tombe dans la zone qui se lit comme une calvitie.

2) Les tire-bouchons ne se lisent pas comme des tire-bouchons.
- Rayon de la spirale : 0,74 à 1,87 r (médiane 1,21 r). Le trou central vaut 2(coil − r), environ 0,4 r : l'hélice est fermée et lit comme un boudin bosselé.
- Pas de la spirale : médiane 1,64 diamètre. Il est sous 1 diamètre dans 5,7 % des cas (le fil se traverse lui-même) et sous 1,3 diamètre dans 23 % des cas (les spires se touchent).
- Le problème principal est le sous-échantillonnage du tube. yarn() pose un anneau tous les 3 rayons, borné entre 6 et 48. L'arc de l'hélice mesure 0,20 à 0,65, ce qui donne 6 à 16 anneaux pour 2,5 à 5 tours. On obtient 1,3 à 4,2 anneaux par tour (médiane 2,4), et 100 % des brins sont sous 6 anneaux par tour. Le tube relie des points pris à 2,4 par tour : c'est un bâton en zigzag. L'allègement « un anneau tous les trois rayons » a cassé cette coupe sans que personne ne le remarque.
- Il y a aussi un saut de repère. tangentBasis(axis) change de vecteur de référence quand |axis.y| passe 0,9, or l'axe fléchit le long du brin. 27,5 % des tire-bouchons ont donc un saut de phase dans l'hélice, masqué aujourd'hui par le sous-échantillonnage. Il apparaîtra dès qu'on corrigera l'échantillonnage.

3) Silhouette.
- La pointe dépasse le haut du crâne de 0,18R en médiane (environ 0,076, soit 10 px sur la planche), et de presque rien au 10e percentile.
- 48 % des brins ont une corde dont la composante z dépasse 0,5. Ils partent vers la caméra ou à l'opposé, donc on les voit raccourcis de face.

4) Physique.
- Il y a un ressort par brin, avec le pivot à la racine : c'est correct. La mobilité vaut t et l'écartement vaut t.
- Mais tous les ressorts ont les mêmes réglages : raideur 0,16, amortissement 0,07. Cela donne 3,9 Hz, ζ ≈ 0,09 et une demi-vie de 0,32 s, et les 2 à 5 brins oscillent en phase. C'est le piège « vingt ressorts identiques bougent comme un seul ».
- La gravité vaut 0,3 alors que le repos n'est pas vertical. Au repos, le ressort s'affaisse donc de 0,087 rad en médiane, 0,24 rad au pire, soit jusqu'à 43 % du maxAngle de 0,55. Ce n'est pas un mouvement au repos, mais cela enfreint la règle « repos = géométrie » : le débattement est entamé et la pose change quand la tête penche.

Point 1 du retour (cheveux tenus contre queues) : il ne s'applique pas tel quel, car il n'y a ni cheveux tirés ni attache. Son équivalent ici, c'est la partie enfouie sous le duvet, qui doit rester tenue. Aujourd'hui elle bouge un tout petit peu (mobilité = t dès la racine enfouie).

## physics

Parties tenues et parties libres :
- La racine est enfouie de 2·r0 sous le crâne, puis traverse le duvet (p.shell.height = 0,02). Elle est tenue : mobilité et écartement nuls pour t < t0, avec t0 = (2·r0 + shell.height) / longueur du tracé, borné à 0,3. C'est la partie « cousue ».
- Au-delà, tout est libre : mobilité = ((t − t0)/(1 − t0))^whip, avec whip = 1,2 pour la crosse (la boucle fouette en retard) et 0,9 pour le ressort et la pointe.
- Écartement = 0,5 × mobilité². La racine ne décolle jamais. En rotation, les trois poils s'ouvrent en éventail. Le bras de levier (centre du dernier 40 % du brin) est à 0,44–0,89R de l'axe vertical, médiane 0,66R. La pointe est donc poussée d'au plus environ 0,165R à écartement plein.

Ressorts : trois, un par poil, loin des 32 permis.
- Pivot à la racine, sur la surface : un poil dressé pivote sur sa racine. On ne pivote pas autour du centre, ce qui est réservé à ce qui est couché sur le crâne.
- dir = direction de la racine vers le centre du dernier 40 % des points, et length = cette distance. Le bout du ressort est ainsi placé sur la masse de la boucle, loin de l'axe de rotation.
- Gravité 0 partout. Le repos est alors exactement la géométrie : angle nul au repos, aucun mouvement sans geste. L'affaissement dû au poids est dessiné dans le tracé.
- Réglages tirés **pour chaque poil**, pour qu'ils soient déphasés :
  - crosse : raideur 0,07–0,11, amortissement 0,06–0,09. Cela donne 2,6 à 3,2 Hz, ζ 0,09–0,17, demi-vie 0,24–0,37 s. maxAngle 0,4.
  - ressort : raideur 0,12–0,18, amortissement 0,05–0,08. Cela donne 3,4 à 4,1 Hz, ζ 0,06–0,12 : le ressort rebondit, c'est voulu. maxAngle 0,5.
  - pointe : raideur 0,10–0,14, amortissement 0,08–0,11. Environ 3,4 Hz, ζ ≈ 0,14. maxAngle 0,4.
- Collider : le bout du ressort au repos est hors de 0,97R, donc `collides` vaut vrai. Mais le dégagement mesuré reste au-dessus du collider (0,95R), donc il ne mord jamais et ne cale aucun ressort. On le garde.
- On ne crée aucun ressort de secteur : il n'y a rien de couché sur le crâne.

Étape 2, optionnelle : le « boing ». Aujourd'hui un tire-bouchon vertical ne réagit pas aux bonds de la course : le spring bone garde une longueur fixe, et une accélération dans l'axe ne le plie pas. On ajouterait un étirement axial par ressort, uStretch vec4[32] (xyz = axe de repos, w = étirement), entraîné en JS par un oscillateur à une dimension : e'' = −ω²e − 2ζωe' − gain·(accélération monde du pivot projetée sur l'axe), avec ω = 2π·3,5, ζ = 0,15 et e borné entre −0,2 et 0,25. Seuls le ressort (gain 1) et la crosse (gain 0,4) l'utiliseraient. Les autres coupes restent à w = 0 et ne changent pas.

## density

On ne « couvre » pas avec cette coupe : c'est la seule qui a le droit d'être chauve. Il y a toujours exactement **3 poils**, pour que le nom et le gag soient vrais. Ajouter des brins ferait tomber la coupe dans la zone des 5 à 50 brins, qui se lit comme une calvitie : c'est le défaut signalé. On traite donc le « clairsemé » en rendant les poils plus gros et en les regroupant.

Tout se déduit de R et de yarnR :
- Rayon à la racine : r0 = clamp(1,7·yarnR, 0,03R, 0,055R) × (0,9–1,1). Pour le ressort, on prend 1,3·yarnR au lieu de 1,7. Le diamètre à la racine vaut 0,054–0,12R (médiane 0,094R ≈ 0,040, soit environ 5 px sur la planche contre 3,9 aujourd'hui), puis s'effile en pointe. La borne empêche qu'une épaisseur de 0,1 au panneau donne des boudins d'un tiers de R.
- Implantation : un seul épi à az ±0,2, sy 0,90–0,95. Les trois racines sont espacées de 2,6·r0 le long de l'axe latéral du plan, soit 1,26 diamètre (mesuré entre 1,24 et 1,27). La base forme une touffe d'environ 0,25R de large, lue comme un seul geste.
- Longueurs : poil du milieu de 0,8–1,0R pour la crosse, 0,55–0,75R pour le ressort, 0,6–0,8R pour la pointe. Les côtés font 0,72 à 0,85 fois le milieu. Le plus haut des trois dépasse le haut du crâne de 0,31–0,67R, médiane 0,46R (environ 25 px sur la planche contre 10). C'est au plus la hauteur du toupet de la houppette, donc ça tient dans la rangée.
- Ressort :
  - rayon de spirale = 2,6–3,2·r0 : le trou fait au moins 3,2·r0, plus d'un diamètre, donc le vide se voit ;
  - pas = 2,4–3,0 diamètres : on voit l'air entre les spires ;
  - nombre de tours **déduit** = L / pas, soit 1,2 à 5,4 (médiane 2,65) ;
  - diamètre extérieur 0,2–0,5R, médiane 0,3R, soit environ 16 px sur la planche.
- Échantillonnage : points de contrôle = ceil(12·tours) + 4. Le tube a N + 8 anneaux, ce qui donne 12,7 à 16 anneaux par tour mesurés, contre 2,4 aujourd'hui. Crosse et pointe : 32 points de contrôle et 40 anneaux.
- Coût : 3 tubes de 80 anneaux au plus × 7 sommets, soit moins de 2 000 sommets et un seul appel de rendu (fil fusionné).

## anime

Référence : les « trois cheveux » dressés du personnage de manga Obake no Q-Tarō. C'est le trois-poils le plus connu du manga, et il se lit comme un gag voulu, pas comme une calvitie. On y ajoute la mèche rebelle dressée sur le sommet (ahoge).

1. **Composition** : un épi unique au sommet, un peu en avant. Trois poils en éventail dans un plan **face caméra** : (u ≈ x, v = normale penchée de 0,12 à 0,27 rad vers l'avant). Le poil du milieu est le plus haut. Les côtés sont en miroir à ±(0,30–0,44) rad, ou ±(0,38–0,52) pour la pointe. La silhouette se lit de face et sur la planche. De profil, la légère avancée donne de la profondeur, comme une mèche rebelle.

2. **Trait de pinceau** : effilage sur 85 % de la longueur (contre 20 % aujourd'hui), épais à la racine, pointe en aiguille, comme un trait de manga. Pour le ressort, l'effilage se limite à 30 %, pour garder un fil régulier. Le reflet anime des cheveux (TOON_HAIR) a enfin une surface assez large pour se poser.

3. **Trois familles**, tirées par poupée (le même geste pour les trois poils) :
   - **crosse** (45 %) : une courbe dont la courbure croît vers la pointe, α(s) = θ + signe·φ·s^3,2, avec φ = 2,6–3,6 rad (0,4 à 0,57 tour). Le poil monte droit puis s'enroule en crosse de fougère. Les côtés s'enroulent vers l'extérieur ; le milieu s'enroule du côté tiré au sort.
   - **ressort** (35 %) : l'héritage de la coupe, mais corrigé. Spirale ouverte avec de l'air entre les spires ; axe qui s'infléchit légèrement vers l'extérieur ; sens d'enroulement inversé d'un côté à l'autre.
   - **pointe** (20 %) : épi effilé en S, α(s) = θ(1 + 0,5s) + signe·0,3·sin(2πs).

4. **Chiralité portée par le signe** : signe = −1, +1, ou un tirage pour le milieu. Il s'applique à l'enroulement de la crosse et au sens de rotation de l'hélice. Les deux côtés sont donc des miroirs exacts, pas une rotation l'un de l'autre.

5. **Mouvement** : trois ressorts déphasés qui rebondissent, et une ouverture en éventail quand la poupée tourne (écartement). Avec l'étape 2, le ressort fait « boing » à chaque bond de course.

Paramètres récapitulés : 3 poils ; r0 = clamp(1,7·yarnR, 0,03R, 0,055R), ou 1,3·yarnR pour le ressort ; racines à 2,6·r0 d'écart ; θ_côtés = ±(0,30–0,52) ; épi à sy 0,90–0,95, az ±0,2 ; inclinaison vers l'avant 0,12–0,27.

## codeSketch

// 1) YarnOpts : deux options. Leurs valeurs par défaut gardent le comportement actuel des autres coupes.
type YarnOpts = {
  // ...champs existants
  /** Part du brin qui s'effile (0,2 par défaut). 0,85 : trait de pinceau. */
  taper?: number
  /** Nombre d'anneaux imposé : une spirale en demande plus que sa longueur. */
  segs?: number
}
// Dans yarn() :
const segs = o.segs ?? clamp(Math.ceil(len / (radius * 3)), 6, 48)
// ...dans la boucle des anneaux :
const tl = o.taper ?? 0.2
const taper = closed ? 1 : Math.sqrt(clamp((1 - t) / tl, 0, 1))

// 2) Ramène au-dessus du crâne, le long du rayon, un point qui passerait dessous
//    (même famille que clearHead).
function clearScalp(p: DollParams, q: THREE.Vector3, margin: number) {
  const need = onDir(p, q.clone().normalize(), margin).pos.length()
  if (q.length() < need) q.setLength(need)
  return q
}

// 3) Nouvelle version de wisps().
type WispKind = 'crosse' | 'ressort' | 'pic'
const X_AXIS = new THREE.Vector3(1, 0, 0)
const Z_AXIS = new THREE.Vector3(0, 0, 1)
const WISP_CFG = {
  crosse:  { k: [0.07, 0.04], d: [0.06, 0.03], max: 0.4, whip: 1.2, taper: 0.85 },
  ressort: { k: [0.12, 0.06], d: [0.05, 0.03], max: 0.5, whip: 0.9, taper: 0.3 },
  pic:     { k: [0.10, 0.04], d: [0.08, 0.03], max: 0.4, whip: 0.9, taper: 0.85 },
} as const

function wisps(p: DollParams, rnd: () => number, yarnR: number, out: Parts) {
  const R = p.shape.headRadius
  const f = rnd()
  const kind: WispKind = f < 0.45 ? 'crosse' : f < 0.8 ? 'ressort' : 'pic'
  const C = WISP_CFG[kind]
  const r0 = clamp(yarnR * (kind === 'ressort' ? 1.3 : 1.7), R * 0.03, R * 0.055) * (0.9 + rnd() * 0.2)
  // Épi unique au sommet, un peu en avant : le bout des ressorts reste loin de l'axe de rotation.
  const crown = onHeadPolar(p, (rnd() - 0.5) * 0.4, 0.9 + rnd() * 0.05, 0)
  const tilt = 0.12 + rnd() * 0.15
  const fwd = Z_AXIS.clone().addScaledVector(crown.normal, -crown.normal.z).normalize()
  // Plan de l'éventail face à la caméra ; w, sa normale, est constante.
  const v = crown.normal.clone().multiplyScalar(Math.cos(tilt)).addScaledVector(fwd, Math.sin(tilt)).normalize()
  const u = X_AXIS.clone().addScaledVector(v, -v.x).normalize()
  const w = new THREE.Vector3().crossVectors(u, v)
  const midSign = rnd() < 0.5 ? -1 : 1
  const spread = (kind === 'pic' ? 0.38 : 0.3) + rnd() * 0.14
  const Lmid = R * (kind === 'crosse' ? 0.8 + rnd() * 0.2 : kind === 'ressort' ? 0.55 + rnd() * 0.2 : 0.6 + rnd() * 0.2)
  const margin = r0 + p.shell.height * 0.5
  for (let i = -1; i <= 1; i++) {
    const sgn = i === 0 ? midSign : i // chiralité : les côtés en miroir
    const theta = i * spread + (rnd() - 0.5) * 0.1
    const L = Lmid * (i === 0 ? 1 : 0.72 + rnd() * 0.13)
    // Tirés quelle que soit la famille : la suite des tirages n'en dépend pas.
    const phi = 2.6 + rnd() * 1.0
    const coil = r0 * (2.6 + rnd() * 0.6)
    const pitch = 2 * r0 * (2.4 + rnd() * 0.6)
    const stiffness = C.k[0] + rnd() * C.k[1]
    const drag = C.d[0] + rnd() * C.d[1]
    const root = onDir(p, crown.pos.clone().addScaledVector(u, i * 2.6 * r0).normalize(), 0)
    const turns = L / pitch
    const N = kind === 'ressort' ? Math.ceil(turns * 12) + 4 : 32
    const pts: THREE.Vector3[] = [root.pos.clone().addScaledVector(root.normal, -r0 * 2)]
    let at = root.pos.clone()
    for (let n = 1; n <= N; n++) {
      const s = n / N
      const alpha =
        kind === 'crosse' ? theta + sgn * phi * s ** 3.2
        : kind === 'pic' ? theta * (1 + 0.5 * s) + sgn * 0.3 * Math.sin(2 * Math.PI * s)
        : theta + sgn * 0.3 * s * s
      const axis = v.clone().multiplyScalar(Math.cos(alpha)).addScaledVector(u, Math.sin(alpha))
      at = at.clone().addScaledVector(axis, L / N)
      const q = at.clone()
      if (kind === 'ressort') {
        // Repère continu (pas tangentBasis, qui change de référence à |y| = 0,9).
        const b1 = u.clone().multiplyScalar(Math.cos(alpha)).addScaledVector(v, -Math.sin(alpha))
        const a = sgn * s * turns * Math.PI * 2
        const cr = coil * Math.sqrt(Math.min(1, s / 0.3))
        q.addScaledVector(b1, Math.cos(a) * cr).addScaledVector(w, Math.sin(a) * cr)
      }
      pts.push(q.distanceTo(root.pos) > 3 * r0 ? clearScalp(p, q, margin) : q)
    }
    const cut = Math.floor(pts.length * 0.6)
    const tipC = pts.slice(cut).reduce((a, b) => a.add(b), new THREE.Vector3()).divideScalar(pts.length - cut)
    const m = out.movers.length
    out.movers.push({
      pivot: root.pos.clone(),
      dir: tipC.clone().sub(root.pos).normalize(),
      length: tipC.distanceTo(root.pos),
      cfg: { stiffness, drag, gravity: 0 }, // repos = géométrie
      maxAngle: C.max,
    })
    let len = 0
    for (let n = 1; n < pts.length; n++) len += pts[n].distanceTo(pts[n - 1])
    // Partie tenue : enfouie, puis dans le duvet.
    const t0 = clamp((2 * r0 + p.shell.height) / len, 0, 0.3)
    const free = (t: number) => clamp((t - t0) / (1 - t0), 0, 1) ** C.whip
    out.yarn.push(
      yarn(pts, r0, {
        mover: m,
        free,
        fling: (t) => 0.5 * free(t) ** 2,
        taper: C.taper,
        segs: kind === 'ressort' ? N + 8 : 40,
      }),
    )
  }
}

// 4) Étape 2, optionnelle : le « boing ».
// Mover gagne `boing?: number`.
// Uniformes : uStretch: { value: Array.from({ length: MAX_MOVERS }, () => new THREE.Vector4()) }
// GLSL, dans la boucle de sélection existante :
//   vec4 hs = vec4(0.0); ... if (i == hm) { hk = uAxis[i]; ha = uAngle[i]; hp = uPivot[i]; hs = uStretch[i]; }
// begin_vertex, avant la rotation :
//   vec3 hr = transformed - hp; hr += hs.xyz * dot(hr, hs.xyz) * hs.w * aFree;
//   transformed = hp + hairRotate(hr, hk, ha);
// useFrame, pour chaque mover avec boing :
//   acc = (x_n - 2 x_{n-1} + x_{n-2}) / h² (position monde du pivot)
//   e'' = -ω² e - 2ζω e' - boing * dot(acc, axeMonde), ω = 2π·3,5, ζ = 0,15
//   uStretch[i].set(m.dir.x, m.dir.y, m.dir.z, clamp(e, -0.2, 0.25))

## risks

Pièges de CLAUDE.md concernés :
- **Allègement des tubes** (« un anneau tous les trois rayons ») : c'est lui qui a cassé les spirales. L'option `segs` est réservée aux tracés qui s'enroulent. Les valeurs par défaut de yarn() (effilage 0,2, `segs` calculé) doivent laisser les huit autres coupes identiques. À vérifier en comparant le nombre de sommets et une empreinte des positions de chaque coupe avant et après.
- **Changement de repère de tangentBasis** : 27,5 % des tire-bouchons actuels ont un saut de phase. L'hélice doit utiliser le repère fixe du plan (b1, w).
- **Chiralité** : les côtés portent le signe, pour l'enroulement de la crosse comme pour le sens de rotation du ressort. Sinon les deux côtés tournent dans le même sens au lieu d'être en miroir.
- **Tirage conditionnel** : phi, coil et pitch sont tirés pour toutes les familles. Le PRNG est propre à buildHair et wisps en est le seul consommateur, mais on garde la règle pour que changer de famille ne décale pas le reste.
- **Repos penché plus gravité** : gravité 0, sinon la pose au repos décroche de la géométrie.
- **Ressort dont le bout est sur l'axe de rotation** : l'épi est pris en avant du pôle, avec une inclinaison vers l'avant. Bras de levier mesuré à 0,44–0,89R, médiane 0,66R. Ne pas poser l'épi exactement au pôle.
- **Ne pas ajouter de brins** pour « remplir » : entre 5 et une cinquantaine de brins, la coupe se lit comme une calvitie. Ne pas ajouter de base couchée sur le crâne non plus (déjà rejeté).

Collisions, mesurées au repos et à ±maxAngle autour des deux axes perpendiculaires. Les chiffres donnent le dégagement au-dessus du crâne, rayon du brin déduit :
- crosse : au moins +0,052R au repos comme en rotation ;
- pointe : au moins +0,041R au repos, +0,039R en rotation ;
- ressort sans clearScalp : jusqu'à −0,009R au repos et −0,02R en rotation, sur la première spire. C'est moins que la hauteur du duvet (0,047R), donc caché. clearScalp règle le cas au repos.

Éléments voisins : aucun conflit.
- Les poils partent de sy ≥ 0,9 et ne redescendent jamais sous environ sy 0,8.
- Les boutons des yeux et les sourcils sont bien plus bas.
- Le bout des épingles de la couronne (plantées à sy 0,42, dépassant de 0,22R) reste loin sous l'épi.
- L'épingle isolée est sur le côté du crâne, à sy ≤ 0,4.

Planche : le poil le plus haut dépasse le crâne d'au plus 0,67R, comme le toupet de la houppette, ce qui reste sous l'écart de rangée de 2,9.

Pointes effilées et trait d'encre : à la taille de la planche, une pointe réduite à 5 % du rayon passe sous le pixel. Si l'encre scintille en rotation, relever ce plancher à 0,1 pour les effilages longs.

Écartement : il pousse chaque sommet en proportion de sa distance à l'axe, ce qui déforme une spirale. C'est limité par 0,5·mobilité². À vérifier sur une capture pendant une rotation, en faisant avancer le temps à la main avec `__advance`, pas sur le panneau masqué.

Si l'étape 2 est faite :
- le shader partagé (`customProgramCacheKey: 'hairdo'`) oblige à recharger complètement la page pour voir le changement ;
- elle ajoute 32 vec4 d'uniformes par sommet, raisonnable face aux 256 minimum.

Coût : moins de 2 000 sommets, un seul appel de rendu, 3 ressorts sur les 32 permis.

Vérification proposée :
- rejouer le script `wisps_new.ts` : dégagement, hauteur, espacement des racines, anneaux par tour ;
- regarder une planche avec la coupe « trois poils » forcée en mode seul (réglage board.hairStyle) ;
- tester la réaction en arène (course, rotation de la platine) avec `__advance`.

