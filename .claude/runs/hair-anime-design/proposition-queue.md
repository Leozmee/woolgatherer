# Proposition — queue de cheval

## cut

queue — ponytail() + pulled() + bunch() (src/doll/hairstyles.tsx, l. 387-463, 943-1003, 1017-1028), mesurés sur l'**arbre de travail** : pulled() déjà immobile (brins sans pivot), deux couches, pas de 3r réparti en azimut.

Banc de mesure : copie instrumentée dans le scratchpad (`queue/hs.tsx`, `cur.ts`, `proto.ts`, `sim.ts`). onHeadPolar et SpringBone réels, aucun fichier du projet modifié. Graines 1, 7, 42 et 99. Réglages : R = 0,43, headSquash 1,04, headEgg 0,03, bajoues 0,14 (morpho), thickness 0,03, shell.height 0,02.

Échelle : Hairdo reçoit le p morphé, mais p.hair.thickness reste celle du panneau. On a r = 0,9·yarnR = 0,879·th·R, soit **0,0113** (d = 0,0227) au réglage courant. Tous les rapports ci-dessous en r ou en R sont indépendants de R.

## diagnosis

**1. Physique (arbre de travail).**
- Les cheveux tirés sont bien immobiles : 0 brin avec pivot, aMover −1. Le nœud ne bouge pas (0,000 mesuré).
- La queue n'a qu'**un seul ressort** (0,04 / 0,16 / gravité 1,2, débattement 0,7, repos = DOWN), avec free = t^1,2. Elle bouge donc d'un bloc. Déplacements simulés (tête qui tourne à 5 rad/s, démarrage-arrêt de course, bonds de 6 cm à 7 Hz) :
  - rotation : pointe 0,070, mi-queue 0,010 ;
  - course : pointe 0,060 ;
  - **bonds : 0,000**. L'os pend à la verticale, dans l'axe du mouvement, et la contrainte de longueur absorbe tout. Or une queue qui sautille à chaque bond est LE mouvement d'une queue de cheval.
- Pour une queue de 0,4 à 0,6 de long, ces amplitudes sont faibles : c'est ce qui la fait paraître raide.

**2. Clairsemé.** 152 brins tirés (76 par couche, uniformes en azimut de la tête).

| Zone | Normale | Face | Profil |
|---|---|---|---|
| Tout | 71–81 % | 67–80 % | 71–79 % |
| Côtés | **56–69 %** | — | 59–70 % |
| Tempes | **46–56 %** | 55–70 % | 61–65 % |
| Arrière | 91–98 % | — | — |
| Sommet | 92–96 % | — | — |

- **Cause principale** (carte ASCII de couverture) : de larges **bandes de crâne nu en haut des côtés** (sy 0,2 à 0,8, az 1 à 2,4), entre des paires de brins espacées de 3 à 5 d.
- Ces brins viennent de la lisière des tempes. Là, la lisière grimpe de sy −0,4 à 0,85 en 0,75 rad d'azimut, si bien que le pas **par couche** y vaut de **1,3 à 4,7 d** (1,6 d sur les côtés, 0,8–1,1 d devant).
- Or ce sont ces brins-là qui balayent tout le haut du côté en diagonale jusqu'à l'attache arrière. L'échantillonnage en azimut de la tête est le mauvais paramètre pour une attache unique.
- Autres défauts :
  - (b) **Duvet** : 76 brins sur 152 (toute la couche du dessous, relevée de 0,5 à 0,9 r) ont le dessus du tube sous la pointe des fibres (0,02 + bosses 0,0065). La laine beige les mouchette.
  - (c) **Pôle** : la borne 0,98 de onDir coupe les brins avant–arrière en corde sous la peau au sommet. L'effet est peu visible ici (sommet 92–96 %), mais le brin y est noyé dans le duvet.
  - (d) **Pâté** : les 152 brins finissent tous sur le point d'attache, sans passer sous le ruban.

**3. Style : pas « anime ».**
- **Attache basse** : sy 0,2 à 0,65, donc une queue « de travail », pas la queue haute des héroïnes.
- **Queue de rat**, mesurée en largeur relative à la tête (0,86), de haut en bas :
  - de dos : **9 → 20 %** ;
  - de profil : 16 → 5 %.
- 23 à 31 brins tirés uniformément dans un disque (sqrt(rnd)) : ni volume, ni mèches, ni pointes, et une section circulaire.
- Bas de queue à y −0,14 à −0,25 : elle pend à mi-hauteur de tête, sans courbe de fontaine.
- **Front nu** jusqu'à sy 0,85 (hairline plafonnée) : cheveux gominés en arrière, sans frange, mèches latérales ni épi.
- Deux anneaux de ruban seulement.

## physics

**Principe.**
- Ce qui est tiré ou noué est tenu.
- Ce qui pend réagit par **inertie**, avec un repos égal à la géométrie : gravité 0, bout du ressort dirigé vers la masse réelle de la mèche et non à la verticale.
- Aucun terme temporel : **zéro mouvement au repos**. Simulé : déplacement résiduel 0,0000 après chaque scénario, sur tous les points.

**Tenu (aucun pivot).**
- Cheveux tirés : déjà immobiles.
- Chouchou ou nœud (anneau, fronces, boucles) : immobiles.
- Base de la queue : free = 0 à la sortie du chouchou.

**Queue : un ressort racine et, chaînés dessous, un ressort par mèche.**
- *Racine* (1 ressort) :
  - pivot au centre du chouchou, dir = normalize(axisAt(0,6) − nœud), longueur = |axisAt(0,6) − nœud| ;
  - { stiffness 0,06, drag 0,14, gravity 0 }, maxAngle 0,35 ;
  - free_racine(t) = smooth(0,02 ; 0,2 ; t) : nulle dans le chouchou, pleine dès le haut de la fontaine ;
  - collider actif (repos hors de la sphère).
- *Mèches* (K = 6, plus le cœur : 7 ressorts), **enfants de la racine** :
  - pivot en axisAt(0,4), là où la queue commence à tomber ; dir vers la pointe de la mèche ;
  - { stiffness 0,035 + rnd·0,02, drag 0,10 + rnd·0,06, gravity 0 }, maxAngle 0,40 ;
  - free2(t) = smooth(0,4 ; 1 ; t)^1,1.
  - Chaque mèche a son rythme : elles se séparent au geste, puis se referment.
- *Écartement centrifuge* : aFling = 0,9·t^1,2. À 5 rad/s la queue s'envole vers l'extérieur ; nul au chouchou.

**Déplacements simulés** (même queue, L = 1,25 R, attache sy 0,65) :

| Scénario | Actuel (pointe) | Chaîné (pointes) | Mi-queue chaîné | Mèches à plat, sans chaîne |
|---|---|---|---|---|
| Rotation 5 rad/s | 0,070 | **0,29 à 0,34** | 0,059 | 0,11 à 0,16 |
| Course | 0,060 | **0,23 à 0,25** | — | 0,09 à 0,11 |
| Bonds | **0** | **0,015 à 0,022** | — | 0,005 à 0,014 |

- Le nœud reste à 0,000 dans tous les cas.
- Le pic des pointes arrive après celui de la mi-queue (0,25–0,28 s contre 0,22–0,25 s) : c'est le **fouetté**.
- L'écart de 0,29 à 0,34 entre pointes est la **désynchronisation** des mèches.

**Le chaînage demande une petite extension du shader** (codeSketch §6) :
- attributs aMover2 / aFree2 : rotation de la mèche d'abord, autour de son pivot de repos, puis celle de la racine ;
- Mover.parent ;
- os imbriqués : l'os d'une mèche est **enfant** de l'os racine, et SpringBone lit déjà le parent (restWorld) ;
- ordre de mise à jour : parent d'abord (ordre du tableau).
- Repli sans shader : 7 ressorts à plat au nœud, free = smooth(0,03 ; 0,25 ; t)·(0,3 + 0,7t). On perd la moitié de l'amplitude et le fouetté.

**Autres parties libres.**
- **Frange** (4 à 6 mèches, un ressort par mèche) :
  - pivot au centre du crâne, bout vers la mèche (comme bangs), { 0,025 + rnd·0,02 ; 0,06 + rnd·0,05 ; 0 } ;
  - **maxAngle 0,12** : glissement ≤ 0,43 × 0,12 ≈ 0,05, alors que 0,13 séparent le bord de frange (sy ≈ 0,70) du haut des boutons (sy 0,40) ;
  - free = 0,1 + 0,9·t^1,2 : la racine borde des cheveux tenus ;
  - fling = 0,6·t^1,3.
- **Mèches latérales** (2 ressorts) :
  - pivot au point où la mèche quitte la joue, repos DOWN (elle pend réellement), { 0,05 ; 0,15 ; gravité 0,8 }, maxAngle 0,35, collider actif ;
  - partie posée sur la tempe : free 0 ; partie pendante : smooth(tLeave ; 1 ; t).
- **Épi** (une fois sur deux) : pivot à la racine, { 0,16 ; 0,07 ; 0 }, maxAngle 0,5, free = t^1,3.
- **Pans du nœud** (variante nœud) : sur le ressort racine, free 0,3 → 1.

**Budget** : 1 + 7 + (4 à 6) + 2 + (0 ou 1) = **14 à 17 ressorts** sur MAX_MOVERS = 32.

## density

**Idée clé : pour une attache unique, les cheveux tirés sont des méridiens autour de l'attache.**
- Tous les brins convergent vers un point : ce sont les grands cercles issus de ce point.
- Leur écart vaut Δφ·sin θ, maximal à θ = 90° de l'attache. La lisière est à θ ≈ 95–110° devant et sur les côtés, 64° à la nuque.
- On échantillonne donc l'**azimut autour de l'attache** (φ), pas l'azimut de la tête.
- Critère : un brin **dès que l'écart atteint le pas, soit à l'équateur de l'attache, soit le long de la lisière**. Le second terme rattrape les tempes, que les méridiens croisent en biais.
- Chaque brin part du point où son méridien sort de la zone chevelue et suit le méridien jusqu'au bord du chouchou, puis plonge dessous.

**Compte déduit de la géométrie.**
- Équateur de l'attache : C ≈ **6,6 R** (mesuré 6,59–6,62 R). Pas par couche P = 3,6 r, soit 1,8 r = 0,9 d à deux couches décalées d'un demi-pas.
- n = C/P par couche ≈ 6,6 R / (3,6 × 0,879·th·R) = **2,09/th**, plus environ 14 % par le critère de lisière. Total ≈ **4,8/th** :
  - **160 brins** à th 0,03 (80 par couche, mesuré) ;
  - 240 à th 0,02 ; 107 à th 0,045 ;
  - borné à [80 ; 400], sinon 600 à th 0,008.
- C'est **moins** qu'aujourd'hui (152), mais bien répartis.
- Variante lisière × 0,8 : 198 brins, 98–99 % partout. Réserve si l'œil juge le 97 % insuffisant.

**Couverture mesurée** (4 graines, attache haute sy 0,56–0,72) :

| Zone | Actuel | Proposé |
|---|---|---|
| Normale | 71–81 % | **97 %** |
| Côtés | 56–69 % | **98 %** |
| Arrière | 91–98 % | 98–99 % |
| Sommet | 92–96 % | 97–100 % |
| Tempes | 46–56 % | 87–92 % |
| Face | 67–80 % | **91–94 %** |
| Dessus | 78–87 % | 97–98 % |
| Dos | 81–93 % | 98–99 % |
| Profil | 71–79 % | 97–98 % |

- La carte montre que le reste des tempes est **la bande d'implantation elle-même** : le premier segment plonge sous la peau.
- Dans la coupe complète, cette bande est recouverte par la racine des mèches latérales et le bord de la frange.

**Compléments.**
- **Pôle** : onDir borné à 0,9995 dans les cheveux tirés (onHeadPolar est régulier en sy = 1). Plus de corde sous la peau au sommet.
- **Au-dessus du duvet** : couche du dessous à lo = max(1,2 r ; shell.height − 0,7 r), soit 1,2 r ; couche du dessus à lo + 0,9 r. Le dessus du tube passe à 0,025, au-dessus de la pointe des fibres (0,02). La racine reste enfouie à −2 r : le brin **sort** du crâne.
- **Arrêt au chouchou** : le brin s'arrête à θ_rim = (rim + r)/R, avec rim = 2,6 r, puis un dernier point plonge à −2 r sous le chouchou. Plus de pâté : les fronces du chouchou (rayon extérieur ≥ rim + 2,5 r) couvrent la convergence.
- **Coût** : ces brins sont des arcs lisses, donc un anneau tous les **6 rayons** (YarnOpts.step), soit environ **22 000 triangles** pour 160 brins (environ 38 000 aujourd'hui pour 152 brins au pas de 3).
- **Queue** : section elliptique W × D, avec :
  - brins extérieurs nO = ⌈périmètre(W, D)/(1,7 r)⌉ ;
  - couronne intérieure 0,55 nO ;
  - cœur de 5 brins.
  - Pour W = 12 à 15 r : **69 à 80 brins** (contre 23 à 31), soit 15 000 à 22 000 triangles au pas de 3,5.
  - **Remplissage 100 %** de dos sur les deux tiers hauts. Le dernier sixième tombe à 40–76 % : ce sont les vides voulus entre pointes.
- **Total de la coupe** : tirés 22 k + queue 15–22 k + frange environ 12 k + mèches latérales environ 3 k + chouchou ou nœud environ 2 k, soit **environ 55 à 61 k triangles** (aujourd'hui 43 à 46 k).
  - Toujours **2 appels de rendu** (fil et ruban) : +30 % de triangles, et une seule queue par planche.

## anime

Silhouette visée : l'héroïne à **queue haute**. Tête compacte et nette, fontaine volumineuse qui jaillit du haut de l'arrière du crâne puis retombe en mèches pointues, frange en pointes, deux mèches qui encadrent le visage, et un chouchou ou un nœud de couleur franche.

1. **Attache haute** : sy 0,5 + rnd·0,3 (contre 0,2 à 0,65), az π ± 0,15. Vue de face, la queue dépasse du crâne derrière le sommet : c'est la lecture « ponytail » à distance de planche.
2. **Fontaine** : l'axe est une courbe d'Hermite.
   - Départ du nœud selon normalize(normale + 0,9·UP), tangente de départ 1,1 L.
   - Arrivée : nœud + outH·R·(0,18 à 0,26) + DOWN·L, tangente DOWN − 0,15·outH : la pointe revient un peu vers le dos. Tangente d'arrivée 0,9 L.
   - Apex mesuré : **0,25 à 0,30 R au-dessus du nœud**.
   - L = R·(1,0 à 1,5), bas de queue à y −0,16 à −0,30, au-dessus du menton (−0,45).
   - clearHead (marge 2,5 r) garde la queue hors du crâne.
3. **Volume** : section elliptique, W = r·(12 à 15) en largeur et D = 0,72 W en profondeur.
   - Mesuré : **30 à 39 % de la largeur de la tête de dos**, 20 à 29 % de profil (contre 9–20 % et 5–16 %).
   - Gonflement sur t ∈ [0 ; 0,22] depuis le chouchou (bouffant juste après le lien), affinement de 25 % vers le bas.
   - L'ellipse donne une queue qui s'étale de dos et reste fine de profil, comme un dessin.
4. **Mèches pointues** (K = 6 plus le cœur, qui est le plus long) :
   - mèches latérales plus courtes de 20 % (1 − 0,2·|sin a_c|^1,5), si bien que vue de dos la pointe est en **V** ;
   - fermeture 0,7·smooth(0,55 ; 1 ; u)^1,2 vers le centre de la mèche, à 0,62 du rayon ;
   - **sillons** : 0,15 de fermeture dès u = 0,1–0,35. Les mèches creusent des lobes tout le long de la queue, et le trait d'encre (dérivée seconde de la profondeur) les dessine ;
   - **pointes retroussées** de 5 r vers l'extérieur sur une mèche sur deux ;
   - **vrille** signée `hand` de 0,4 à 0,9 rad sur la longueur.
5. **Cheveux tirés peignés** : la couche du dessus est groupée en 12 mèches peignées bombées de 0,55 r en leur milieu (sin²). Ce sont des arêtes qui convergent vers la queue, les lignes « peignées en arrière » d'un dessin d'anime. Ce n'est pas une base : ce sont les mêmes brins, relevés différemment. Couverture mesurée avec les sillons : 97 %.
6. **Frange en pointes** (helper partagé fringeTufts, modelé sur bangs() sans y toucher) :
   - 4 à 6 mèches, deux rangs décalés d'une demi-mèche ;
   - **balayée une fois sur deux** : sweep = hand. Les pointes glissent de 0,25 rad vers un côté et s'allongent de ce côté (−0,12 en sy à l'extrémité), et raccourcissent de l'autre ;
   - bord : hairline(p, 0.15, 2.0 + 0,4·rnd)(az), soit sy ≈ 0,70 à 0,78 au réglage courant. C'est au-dessus des sourcils froncés ou tristes (≤ 0,67), au niveau des sourcils relevés (0,77), que l'on voit par les encoches en V (0,06 à 0,08). Jamais sur les boutons (0,40).
   - Les racines sont sur une **raie en arc** part(az) = 0,94 − 0,36·(az/Wb)², qui sert aussi de départ aux cheveux tirés dans ce secteur : la frange part vers l'avant, les tirés vers l'arrière, d'une même ligne, **sans superposition**.
7. **Mèches latérales** (helper sidelock) :
   - une de chaque côté, à az = ±(Wb + 0,05) ≈ ±1,0 à 1,1, donc à l'écart des boutons (±0,35) et des pommettes (cheekSpot) ;
   - 2 couches de 5 brins : sur la tempe, rayon jamais décroissant (comme braids), puis elles pendent jusqu'à la mâchoire (−0,55 à −0,75) ;
   - pointe refermée (0,85) et recourbée vers le menton, signe = côté.
8. **Lien** : chouchou ou nœud, tirés à 50/50 dans tous les cas.
   - *Chouchou* : tore froncé autour du nœud (rayon rim + 0,6 r, fil 1,6 r, 8 fronces de ±0,5 r).
   - *Nœud* : deux boucles en goutte inclinées de ±30° vers le haut, longueur 0,14 à 0,2 R, fil 1,6 r, plus deux pans qui pendent sur la queue. Signe `hand` pour l'inclinaison.
   - Teinte RIBBONS.
9. **Épi** une fois sur deux : 3 brins en crochet, juste devant la raie.

## codeSketch

```ts
// ===== 1. Outils (partagés avec les autres coupes) =====
const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t) }
/** onDir sans le trou polaire : 0,9995 au lieu de 0,98 (onHeadPolar est régulier au pôle). */
const onDirPole = (p: DollParams, d: THREE.Vector3, lift: number) =>
  onHeadPolar(p, Math.atan2(d.x, d.z), clamp(d.y, -0.9995, 0.9995), lift)
// YarnOpts : + step?: number — un anneau tous les `step` rayons (3 par défaut)
//   yarn() : const segs = clamp(Math.ceil(len / (radius * (o.step ?? 3))), 6, 48)
// YarnOpts : + mover2?: number, free2?: (t) => number  → attributs aMover2 / aFree2 (−1 / 0 par défaut, aussi dans still())

// ===== 2. Cheveux tirés vers UNE attache : méridiens autour de l'attache =====
function pulledTo(
  p: DollParams, rnd: () => number, r: number,
  tie: { pos: THREE.Vector3 }, start: (az: number) => number, out: Parts,
  o: { pitch: number; rim: number; groups: number },
) {
  const R = p.shape.headRadius
  const T = tie.pos.clone().normalize()
  const [e1, e2] = tangentBasis(T)
  const dirAt = (th: number, ph: number) =>
    T.clone().multiplyScalar(Math.cos(th))
      .addScaledVector(e1.clone().multiplyScalar(Math.cos(ph)).addScaledVector(e2, Math.sin(ph)), Math.sin(th)).normalize()
  const inside = (d: THREE.Vector3) => d.y > start(Math.atan2(d.x, d.z))
  const exitAt = (ph: number) => {                        // sortie de la zone chevelue le long du méridien
    let th = 0.2
    while (th < 3.1 && inside(dirAt(th, ph))) th += 0.02
    let a = th - 0.02, b = th
    for (let k = 0; k < 12; k++) { const m = (a + b) / 2; if (inside(dirAt(m, ph))) a = m; else b = m }
    return a
  }
  // φ échantillonné pour que l'écart reste ≤ pas À L'ÉQUATEUR et LE LONG DE LA LISIÈRE
  const F = 720
  const cum = [0]
  let E0 = onDirPole(p, dirAt(Math.PI / 2, 0), 0).pos, X0 = onDirPole(p, dirAt(exitAt(0), 0), 0).pos
  for (let i = 1; i <= F; i++) {
    const ph = (i / F) * Math.PI * 2
    const E = onDirPole(p, dirAt(Math.PI / 2, ph), 0).pos, X = onDirPole(p, dirAt(exitAt(ph), ph), 0).pos
    cum.push(cum[i - 1] + Math.max(E.distanceTo(E0) / o.pitch, X.distanceTo(X0) / o.pitch))
    E0 = E; X0 = X
  }
  const n = clamp(Math.ceil(cum[F]), 40, 200)                  // par couche : ≈ 2,4/th
  const phiAt = (c: number) => { let j = 0; while (j < F - 1 && cum[j + 1] < c) j++; return ((j + (c - cum[j]) / Math.max(1e-9, cum[j + 1] - cum[j])) / F) * Math.PI * 2 }
  const thRim = (o.rim + r) / R
  const lo = Math.max(1.2 * r, p.shell.height - 0.7 * r)       // dessus du tube au-dessus des fibres
  for (let layer = 0; layer < 2; layer++) {
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5 * layer + (rnd() - 0.5) * 0.3 + n) % n / n
      const ph = phiAt(u * cum[F])
      const th1 = exitAt(ph) - rnd() * 0.03
      const g = (u * o.groups) % 1                               // mèches peignées : arêtes vers l'attache
      const lift = lo + layer * 0.9 * r + (layer ? 0.55 * r * Math.sin(Math.PI * g) ** 2 : 0) + rnd() * 0.2 * r
      const M = Math.max(6, Math.ceil(((th1 - thRim) * R) / (r * 5)))
      const pts: THREE.Vector3[] = []
      for (let k = 0; k <= M; k++) pts.push(onDirPole(p, dirAt(th1 + (thRim - th1) * (k / M), ph), k === 0 ? -r * 2 : lift).pos)
      pts.push(onDirPole(p, dirAt(thRim * 0.45, ph), -r * 2).pos) // plonge sous le chouchou
      out.yarn.push(yarn(pts, r, { step: 6 }))                     // TENU : aucun pivot
    }
  }
}
// pulled() existant : garder pour 2 attaches ; à une attache, appeler pulledTo (profite aussi au chignon à pelote).

// ===== 3. Queue d'anime =====
type PonyOpts = { L: number; K: number; W: number; D: number; hand: 1 | -1; rim: number }
function ponyTail(p: DollParams, rnd: () => number, r: number, tie: SurfacePoint, out: Parts, o: PonyOpts) {
  const R = p.shape.headRadius
  const outH = new THREE.Vector3(tie.normal.x, 0, tie.normal.z).normalize()
  const knot = tie.pos.clone().addScaledVector(tie.normal, r * 2.2)
  // Fontaine : Hermite, départ vers le haut-arrière, arrivée verticale qui revient un peu vers le dos.
  const P1 = knot.clone().addScaledVector(outH, R * (0.18 + rnd() * 0.08)).addScaledVector(DOWN, o.L)
  const m0 = tie.normal.clone().addScaledVector(UP, 0.9).normalize().multiplyScalar(o.L * 1.1)
  const m1 = DOWN.clone().addScaledVector(outH, -0.15).normalize().multiplyScalar(o.L * 0.9)
  const axisAt = (t: number) => {
    const t2 = t * t, t3 = t2 * t
    return knot.clone().multiplyScalar(2 * t3 - 3 * t2 + 1).addScaledVector(m0, t3 - 2 * t2 + t)
      .addScaledVector(P1, -2 * t3 + 3 * t2).addScaledVector(m1, t3 - t2)
  }
  const twist = o.hand * (0.4 + rnd() * 0.5)                    // chiralité signée
  const K = o.K
  const clumpLen = Array.from({ length: K + 1 }, (_, c) =>
    c === K ? 1 : 1 - 0.2 * Math.abs(Math.sin(((c + 0.5) / K) * Math.PI * 2)) ** 1.5 - rnd() * 0.08) // pointe en V
  const flick = Array.from({ length: K }, () => rnd())          // tirés dans tous les cas
  const rho = (t: number) => smooth(0, 0.22, t) * (1 - 0.25 * smooth(0.6, 1, t))
  /** Repère de section en t : largeur `bl` (≈ x), profondeur `bd` ; point de l'ellipse d'angle a, fraction s. */
  const ell = (t: number, a: number, s: number) => {
    const tan = axisAt(Math.min(1, t + 0.01)).sub(axisAt(Math.max(0, t - 0.01))).normalize()
    const bl = new THREE.Vector3().crossVectors(tan, outH).normalize()
    const bd = new THREE.Vector3().crossVectors(bl, tan).normalize()
    const tw = twist * t
    return bl.multiplyScalar(Math.cos(a + tw) * o.W * s).addScaledVector(bd, Math.sin(a + tw) * o.D * s)
  }

  // Ressorts : racine, puis une mèche par clump + cœur, ENFANTS de la racine.
  const tp = 0.4
  const root = out.movers.length
  const cen = axisAt(0.6)
  out.movers.push({ pivot: knot.clone(), dir: cen.clone().sub(knot).normalize(), length: cen.distanceTo(knot),
    cfg: { stiffness: 0.06, drag: 0.14, gravity: 0 }, maxAngle: 0.35 })
  const low = axisAt(tp)
  const clump0 = out.movers.length
  for (let c = 0; c <= K; c++) {
    const ac = ((c + 0.5) / K) * Math.PI * 2
    // Bout du ressort = pointe de la mèche (centre de mèche à 0,62 ρ) : repos = géométrie, gravité 0.
    const tip = axisAt(clumpLen[c]).add(c === K ? new THREE.Vector3() : ell(clumpLen[c], ac, 0.62 * rho(clumpLen[c])))
    out.movers.push({ pivot: low.clone(), dir: tip.clone().sub(low).normalize(), length: tip.distanceTo(low), parent: root,
      cfg: { stiffness: 0.035 + rnd() * 0.02, drag: 0.1 + rnd() * 0.06, gravity: 0 }, maxAngle: 0.4 })
  }

  const perim = Math.PI * (3 * (o.W + o.D) - Math.sqrt((3 * o.W + o.D) * (o.W + 3 * o.D)))
  const nO = Math.ceil(perim / (1.7 * r)), nI = Math.ceil(nO * 0.55)
  const strands = [
    ...Array.from({ length: nO }, (_, i) => ({ s: 0.88 + rnd() * 0.12, a: ((i + rnd() * 0.4) / nO) * Math.PI * 2, core: false })),
    ...Array.from({ length: nI }, (_, i) => ({ s: 0.5 + rnd() * 0.2, a: ((i + 0.5 + rnd() * 0.4) / nI) * Math.PI * 2, core: false })),
    ...Array.from({ length: 5 }, () => ({ s: 0.25 * Math.sqrt(rnd()), a: rnd() * Math.PI * 2, core: true })),
  ]
  const N = 22
  for (const st of strands) {
    const c = st.core ? K : Math.floor(st.a / ((Math.PI * 2) / K)) % K
    const ac = ((c + 0.5) / K) * Math.PI * 2
    const tEnd = clumpLen[c] * (0.93 + rnd() * 0.07)
    const pts = [tie.pos.clone().addScaledVector(tie.normal, -r * 2)]
    for (let k = 1; k <= N; k++) {
      const t = (k / N) * tEnd, u = t / tEnd
      const close = 0.15 * smooth(0.1, 0.35, u) + 0.7 * smooth(0.55, 1, u) ** 1.2   // sillons, puis pointe
      const off = ell(t, st.a, st.s).lerp(st.core ? new THREE.Vector3() : ell(t, ac, 0.62), close).multiplyScalar(rho(t))
      off.addScaledVector(ell(t, st.a, 1).normalize(), (o.rim - r) * (1 - smooth(0, 0.22, t)))  // sort de dans le chouchou
      if (!st.core && flick[c] < 0.5) off.addScaledVector(ell(t, ac, 1).normalize(), r * 5 * Math.max(0, (u - 0.78) / 0.22) ** 2)
      pts.push(clearHead(p, axisAt(t).add(off), r * 2.5))
    }
    out.yarn.push(yarn(pts, r, {
      step: 3.5,
      mover: root, free: (t) => smooth(0.02, 0.2, t * tEnd),
      mover2: clump0 + c, free2: (t) => smooth(tp, 1, t * tEnd) ** 1.1,
      fling: (t) => 0.9 * (t * tEnd) ** 1.2, phase: rnd() * 6,
    }))
  }
  return { knot, axisAt, root }
}

// ===== 4. Lien =====
function scrunchie(knot: THREE.Vector3, axis: THREE.Vector3, rim: number, r: number, out: Parts) {
  const [a, b] = tangentBasis(axis)
  const pts = Array.from({ length: 48 }, (_, k) => {
    const t = (k / 48) * Math.PI * 2, rr = rim + 0.6 * r + 0.5 * r * Math.sin(8 * t)   // fronces
    return knot.clone().addScaledVector(a, Math.cos(t) * rr).addScaledVector(b, Math.sin(t) * rr).addScaledVector(axis, 0.6 * r * Math.cos(8 * t))
  })
  out.ribbon.push(yarn(pts, 1.6 * r, { closed: true }))                         // TENU
}
// bowKnot(p, rnd, r, knot, tie.normal, hand, out, rootMover) — voir la fiche couettes : 2 boucles fermées sans pivot,
// 2 pans ouverts sur le ressort racine, free (t) => 0.3 + 0.7 * t.

// ===== 5. Assemblage =====
function ponytail(p: DollParams, rnd: () => number, yarnR: number, out: Parts) {
  const R = p.shape.headRadius, r = yarnR * 0.9
  // Tous les tirages d'abord, sans condition ; chaque partie a sa sous-graine.
  const tie = onHeadPolar(p, Math.PI + (rnd() - 0.5) * 0.3, 0.5 + rnd() * 0.3, 0)   // attache HAUTE
  const L = R * (1.0 + rnd() * 0.5)
  out.ribbonColor = RIBBONS[Math.floor(rnd() * RIBBONS.length)]
  const low = NAPE_LOW + rnd() * 0.12
  const W = r * (12 + rnd() * 3)
  const hand: 1 | -1 = rnd() < 0.5 ? -1 : 1
  const bow = rnd() < 0.5, swept = rnd() < 0.5, hasAhoge = rnd() < 0.5
  const tufts = 4 + Math.floor(rnd() * 3)
  const fringeK = 2.0 + rnd() * 0.4
  const sub = () => mulberry32(Math.floor(rnd() * 2 ** 31))
  const [rPull, rTail, rFringe, rSide, rTop] = [sub(), sub(), sub(), sub(), sub()]

  const size = Math.max(p.face.leftSize, p.face.rightSize) * EYE_SCALE * 1.14
  const Wb = clamp(Math.asin(clamp((p.face.eyeSpacing * 0.5 + size * 1.3) / (1.02 * R), 0, 0.95)) + 0.07, 0.9, 1.15)
  const hl = hairline(p, low)
  const nape = (az: number) => Math.max(0, -Math.cos(az)) ** 3 * 0.18
  const part = (az: number) => 0.94 - 0.36 * (az / Wb) ** 2                          // raie en arc de la frange
  const start = (az: number) => Math.max(hl(az) + 0.02 - nape(az), Math.abs(az) < Wb ? part(az) : -1)

  const rim = r * 2.6
  pulledTo(p, rPull, r, tie, start, out, { pitch: 3.6 * r, rim, groups: 12 })
  const tail = ponyTail(p, rTail, r, tie, out, { L, K: 6, W, D: W * 0.72, hand, rim })
  const axis = tail.axisAt(0.08).sub(tail.axisAt(0)).normalize()
  if (bow) bowKnot(p, rTail, r, tail.knot, tie.normal, hand, out, tail.root)
  else scrunchie(tail.knot, axis, rim, r, out)
  fringeTufts(p, rFringe, r, out, { width: Wb, tufts, root: part, edge: hairline(p, 0.15, fringeK), sweep: swept ? hand : 0 })
  for (const s of [-1, 1] as const) sidelock(p, rSide, r, out, s, { az: s * (Wb + 0.05), end: -0.55 - rSide() * 0.2 })
  if (hasAhoge) ahoge(p, rTop, r, out)
}
// fringeTufts : boucle de frange de bangs() copiée sans toucher bangs ; racines sur root(tipAz), deux rangs décalés,
//   tipAz = az + (center − az)·0,6 + sweep·0,25·(0,5 + 0,5·az/width) ;
//   tipSy = edge(tipAz) + tuftLen[c]·0,04 + |w|^1,5·0,07 + rnd()·0,015 − sweep·0,12·max(0, sweep·tipAz/width)
//   count = 2·⌈longueur de la ligne des pointes / (1,8 r)⌉ (≈ 70 à 90) ; un ressort par mèche (voir physics).

// ===== 6. Chaînage au vertex shader (hairShader + Hairdo) =====
// Mover : + parent?: number
// GLSL, dans <common> : attribute float aMover2; attribute float aFree2;
// dans <beginnormal_vertex> (une seule boucle pour les deux) :
//   int hm = int(aMover + 0.5), hm2 = int(aMover2 + 0.5);
//   float ha = 0.0, ha2 = 0.0; vec3 hk = vec3(1,0,0), hk2 = vec3(1,0,0), hp = vec3(0), hp2 = vec3(0);
//   for (int i = 0; i < MAX_MOVERS; i++) {
//     if (i == hm)  { hk = uAxis[i];  ha = uAngle[i];  hp = uPivot[i]; }
//     if (i == hm2) { hk2 = uAxis[i]; ha2 = uAngle[i]; hp2 = uPivot[i]; }
//   }
//   ha *= (aMover > -0.5 ? aFree : 0.0); ha2 *= (aMover2 > -0.5 ? aFree2 : 0.0);
//   objectNormal = hairRotate(hairRotate(objectNormal, hk2, ha2), hk, ha);
// dans <begin_vertex> :
//   transformed = hp2 + hairRotate(transformed - hp2, hk2, ha2);   // la mèche, dans le repère de repos
//   transformed = hp  + hairRotate(transformed - hp,  hk,  ha);    // puis la racine
// Hairdo : os imbriqués — l'os d'un Mover à parent est rendu DANS celui du parent, position = pivot − pivot du parent.
//   uPivot garde le pivot de repos (repère de la tête) : c'est exactement ce qu'attend la formule ci-dessus.
//   SpringBone lit déjà la rotation du parent (restWorld) : l'os enfant hérite du balancement de la racine.
//   Mise à jour dans l'ordre du tableau : parent toujours poussé avant ses enfants.
//   `collides` : calculer le bout de repos en repère tête (pivot + dir·length) — inchangé.
// Rechargement complet nécessaire (clé de cache 'hairdo').
```

## risks

- **Shader modifié** (chaînage aMover2 / aFree2) :
  - Toutes les coupes passent par ce programme. still() et yarn() doivent poser aMover2 = −1 et aFree2 = 0 partout, sinon mergeGeometries refuse de fusionner (attributs différents).
  - Rechargement complet obligatoire (clé 'hairdo').
  - Le repli à plat (7 ressorts au nœud) marche sans toucher au shader, avec la moitié de l'amplitude et sans fouetté.
- **Os imbriqués** : avec R3F, rendre l'enfant dans le JSX du parent (arbre construit depuis `parent`) plutôt que de le reparenter à la main. Reparenté impérativement, le démontage peut laisser un os orphelin ; sans gravité, c'est inoffensif.
- **Amplitude** : 0,29 à 0,34 en rotation à 5 rad/s, pour une queue d'environ 0,55.
  - Si l'œil juge que « ça vole trop », baisser d'abord le maxAngle des mèches (0,4 → 0,3), pas la raideur : le fouetté vient du retard, pas de l'amplitude.
  - Le collider protège le crâne ; le torse n'est pas modélisé, mais la queue pend à plus de 0,5 de l'axe et ne descend pas sous le menton.
- **Pas de gravité** : tête penchée (roulade, K.O.), la queue suit la tête au lieu de tomber vers le sol.
  - C'est voulu pour respecter « repos = géométrie ». Avec de la gravité, le repos glisse, sauf à découpler la cible élastique de la référence d'affichage (dir d'affichage ≠ dir du ressort) et à pré-rouler les ressorts : c'est faisable dans Hairdo, mais hors de cette fiche.
  - À réévaluer quand le K.O. sera visible.
- **Frange et sourcils** : bord à sy 0,70–0,78, au-dessus des sourcils froncés ou tristes (≤ 0,67). Les sourcils relevés (surpris, espiègle : 0,77) sont en partie sous les pointes et se voient par les encoches. À juger à l'œil sur « surpris » avec les plus gros boutons : la lisière est bornée à 0,85, donc la frange y devient courte.
  - Frange balayée : la chiralité porte `hand`.
  - Glissement ≤ 0,05, bien loin des boutons.
- **Raie de frange = départ des tirés** : si part(az) et la frange divergent (deux copies), il ressort une bande nue ou une superposition. Une seule fonction `part` sert aux deux (règle de la cote unique).
- **Tirages** : tout est tiré en tête de ponytail(), sans condition, puis chaque partie reçoit sa sous-graine. Ajouter des brins à la queue ne change pas la frange. La suite de la graine de la queue change par rapport à aujourd'hui, mais buildHair a sa propre graine (seed + 5303) : le reste de la poupée ne bouge pas.
- **pulledTo à une attache seulement** : les méridiens ne valent que pour un seul point de convergence (queue, chignon à pelote). Pour les couettes, les nattes et les macarons, garder pulled() avec l'échantillonnage le long de la lisière (fiche couettes) : deux attaches partagent la tête par la raie.
- **Méridien qui recoupe la lisière** : la lisière n'est pas étoilée par rapport à une attache très basse. exitAt prend la **première** sortie, donc sur une nuque en pointe un brin peut s'arrêter tôt. Mesuré sans défaut pour sy ≥ 0,5 ; ne pas redescendre l'attache sous 0,4 sans revérifier.
- **Coût** : environ 55 à 61 k triangles contre 43 à 46 k (+30 %), 2 appels de rendu, 14 à 17 ressorts. Le compte varie en 1/th, donc il est borné. step: 6 sur les tirés est indispensable, sinon on dépasse 80 k.
- **Duvet** : relever la couche du dessous à 1,2 r fait passer le tube au-dessus des fibres, mais les bosses (±0,0065) laissent quelques pointes percer sur les bosses. C'est acceptable : le duvet est un halo troué, et un dixième des fibres passe sur la coque externe.
- **Pièges de mesure** : avec le panneau masqué, requestAnimationFrame est suspendu. Juger la physique avec __advance et window.__hairs (clé `queue#seed`), et rejouer la formule du shader par zone plutôt qu'à l'œil. Une capture peut montrer l'image précédente : en prendre deux.
