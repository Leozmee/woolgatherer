# Proposition — houppette

## cut

houppette — tuft() dans /Users/leogallus/Projets/DummyFaces/src/doll/hairstyles.tsx (l. 782-864). Les trois points du retour s'appliquent tous à cette coupe. Je propose de la refaire en coupe anime « palmier » : cheveux tirés et tenus du bas de la nuque jusqu'au nœud posé au sommet, un chouchou de couleur, un palmier de lames pointues qui bouge, une frange en pointes et deux mèches latérales. Rien n'a été modifié. Les scripts de mesure sont dans /private/tmp/claude-501/-Users-leogallus-Projets-DummyFaces/77236db1-43ec-45aa-9052-e59f7758ef81/scratchpad/ : tuft_cov.mjs mesure la coupe actuelle, tuft_new2.mjs la couche tenue, tuft_full.mjs le prototype complet, side_check.mjs le dégagement des mèches latérales.

## diagnosis

MÉTHODE. J'ai recopié tuft() à l'identique avec three.js (mêmes onHeadPolar, hairline et effilage de yarn). Je projette chaque brin radialement sur une grille (azimut × hauteur) à aire égale, puis je calcule la part couverte de la zone de cheveux, sur 3 graines × R = 0,38 / 0,43 / 0,48. Épaisseur du fil : yarnR = 0,03·0,42·R/0,43 ≈ 0,977·thickness·R, et r = yarnR·(1…1,35). À R = 0,43 le diamètre vaut donc 0,025 à 0,034. Toutes les cotes sont proportionnelles à R, et les pourcentages mesurés sont identiques au dixième près quel que soit R.

1) CLAIRSEMÉ, chiffres à l'appui.
- La gerbe compte 80 brins, uniformes en azimut, qui vont du nœud à la lisière. Le périmètre réel de la lisière mesure 2,84 à 2,95 (R = 0,43), soit un pas de 0,036 à la lisière. Le pas vaut 1,14 à 1,38 fois le diamètre : une seule couche couvre au plus 72 à 88 %, même sans effilage.
- Le brin va du nœud vers la lisière, donc son dernier cinquième effilé en cône (yarn) tombe **pile sur la lisière**. Dans la bande [lisière ; lisière + 0,15], la couverture mesurée n'est que de 51 à 54 %.
- Mesure globale : 68 à 74 % de la zone de cheveux est couverte. À l'arrière c'est 59 à 65 %, et sous sy = 0,2 seulement 25 à 36 %.
- La lisière basse vaut low = −0,1…0,15. Tout le bas du crâne, entre la nuque (NAPE_LOW = −0,48) et l'équateur, n'est pas couvert du tout. C'est l'effet « calotte au-dessus d'un crâne chauve » que CLAUDE.md interdit hors « trois poils ».
- Front : hairline(p, low) avec la frange par défaut (2,7) donne (0,04 + 0,137·2,7)/0,447 = 0,92, plafonné à 0,85. Le nœud est à 0,93-0,97, légèrement vers l'avant. Les brins de devant font donc environ 0,1 de haut, et le front est nu depuis le haut des boutons (sy ≈ 0,36) jusqu'à 0,85.
- Entre les brins on voit du beige. La couche va de 0,7 r à 1,9 r, donc le bas des tubes est dans le duvet (fibres de 0,02 de long). Le duvet, dense près de la peau, remplit chaque rainure entre deux brins.

2) PHYSIQUE : la couverture du crâne bouge comme une queue.
- La gerbe qui couvre le crâne suit 8 ressorts de secteur : raideur 0,028-0,042, amortissement 0,10-0,16, débattement maxAngle 0,30. C'est plus du double de pulled() (0,14) : glissement jusqu'à 2R·sin(0,15) ≈ 0,13, un tiers du rayon de la tête.
- aFree = clamp(t/0,2)·(0,4 + 0,6t) dépasse 0,52 dès 20 % de la longueur.
- aFling = t : en rotation rapide, la lisière est poussée de 0,5·|hOut| ≈ 0,2 vers l'extérieur, et la couverture s'ouvre en corolle.
- Les anneaux du nœud n'ont pas de ressort : la couverture glisse donc par rapport à sa propre attache. C'est exactement le point 1 du retour, en pire que pulled().
- Le toupet (18 à 27 brins) utilise le ressort 0, pivot au nœud et direction = normale, presque verticale. Son bout est à seulement 0,13-0,16 de l'axe de rotation : il réagit mal à la rotation de la poupée. Gravité 0,4 alors que le repos est vertical.

3) STYLE.
- Les 80 brins sont identiques : ni mèches groupées ni pointes (aucun pinch ou clump).
- Pas de frange (front nu jusqu'à 0,85), pas de mèches latérales, pas de pointe de nuque.
- Les anneaux sont de la couleur des cheveux.
- Le toupet est un faisceau de brins presque droits, un blaireau.
- Silhouette : un dôme lisse surmonté d'un blaireau. Rien ne dit « anime ».

## physics

Principe : ce qui est tiré est tenu (0 exactement), et seul ce qui sort du lien, ou ce qui pend librement, bouge. Aucune gravité, donc aucun mouvement au repos : tout vient de l'inertie et de uFling.

- **Cheveux tirés** (couche A + B) et les deux anneaux du chouchou : aucun ressort (mover −1), aFree = 0, aFling = 0. On appelle yarn(pts, r) sans option, et `still` s'applique aux anneaux. Le shader ne les touche plus : déplacement nul par construction, même en rotation. Les 8 ressorts de secteur actuels sont supprimés.
- **Palmier**, un ressort par lame (6 à 8) :
  - pivot = haut de la tige (stemTop, juste au-dessus du chouchou) ; dir = direction de repos (pointe − pivot) ; length = |pointe − pivot| ;
  - raideur 0,06 à 0,10, amortissement 0,07 à 0,12, gravité 0 (repos non vertical), maxAngle 0,45 ;
  - aFree = aFling = after(t_lien) : 0 dans le lien, puis linéaire jusqu'à 1 à la pointe ;
  - le bout est hors de la sphère du crâne, donc `collides` passe à vrai tout seul : le collider (0,95 R) empêche une lame de rentrer dans la tête. Les lames s'ouvrent en rotation (uFling) et fouettent quand la poupée démarre ou s'arrête.
- **Lame héroïque** (la plus tournée vers l'avant, elle tient le rôle d'épi) : raideur ×1,5, amortissement 0,05, elle rebondit.
- **Cœur** : 6 à 10 brins courts dressés au centre, sur le ressort de la lame la plus proche, avec aFree = aFling = 0,5·after(t_lien).
- **Frange**, un ressort par mèche (3 à 5) :
  - pivot au centre du crâne, bout vers la mèche, comme bangs() ;
  - raideur 0,025 à 0,045, amortissement 0,06 à 0,11, gravité 0, maxAngle 0,18 (bas, pour les boutons) ;
  - aFree = aFling = after(0,2) : la racine sort de sous la couche tenue et ne doit pas glisser par rapport à elle.
- **Mèches latérales**, un ressort par côté (2) : pivot au centre, bout vers la mèche (azimut ±1,1 à 1,3), raideur 0,025 à 0,04, amortissement 0,06 à 0,10, gravité 0, maxAngle 0,35, aFree = aFling = after(0,15).

Au total 11 à 16 ressorts (≤ MAX_MOVERS = 32), aucun changement de shader. Chaque lame, mèche et côté a son propre ressort, avec raideur et amortissement tirés au sort : la coupe ne balance pas d'un bloc.

## density

Règle : **répartir les brins tenus en azimut autour du nœud, pas le long de la lisière**, et les compter sur le grand cercle situé à 90° du nœud.

POURQUOI. Un brin tiré suit une géodésique depuis le nœud. L'écart entre deux géodésiques voisines vaut sin θ (θ = angle depuis le nœud) : il est maximal à 90°, et tous les brins de l'arrière et des côtés y passent. Avec un nœud à l'avant du sommet, la nuque est à environ 157° du nœud (sin = 0,39) : partis de là, les brins s'écartent 2,5 fois avant de reconverger. Mesuré au même compte, répartis le long de la lisière : arrière à 86-93 %. Répartis en azimut autour du nœud : arrière à 99,5 %.

COMPTE (couche tenue).
- N = ceil(2π·R·w_max / (0,8·2r)), borné à [60 ; 260]. w_max = plus grande largeur du crâne en rayons, bajoues comprises ; environ 1,05, mesurée sur onHeadPolar.
- Comme r = 0,977·thickness·R·g (g = 1…1,35), R s'annule : N ≈ 4,02·w_max / (thickness·g), soit 104 à 141 brins à l'épaisseur par défaut (0,03). Mesuré : 113 à 136.
- Deux couches entrelacées : A (i pair) posée à r·(0,9…1,1), B (i impair) à r·(1,6…2,7), décalée d'un demi-pas. Chaque couche a un pas de 1,6 diamètre et ne couvre seule que 62 %. Ensemble, B se pose dans les rainures de A avec 0,2 diamètre de recouvrement, là même où le duvet (0,02) ressortait.
- Lisière : basse, NAPE_LOW + rnd·0,12 (−0,48…−0,36), avec une pointe de nuque de −0,18 (même formule que pulled()). Lisière avant à hairline(p, low, 1,7) ≈ 0,54-0,67 selon R, là où s'attache la frange.
- Chaque brin part de la lisière, racine enfouie à −2r, et finit sous le chouchou : l'effilage tombe **dans le lien**, plus sur la lisière.

MESURES (prototype, 9 cas).
- Zone tenue couverte à **98,5-99,1 %**, contre 68-74 % aujourd'hui. Arrière 99,5-99,8 %, côtés 98-99 %. Bande de lisière 92-93 %, c'est le bord oblique lui-même. Avant 91-95 %, complété par la frange.
- Frange : nb = 2·ceil(2W·R·√(1−front²)·w_max / (1,6r)), soit 36 à 52 brins en deux rangées décalées d'une demi-mèche (la brique de bangs()). Elle couvre 77 à 87 % du front entre ses pointes et la lisière ; le reste, ce sont les V voulus entre les pointes.
- Mèches latérales : 12 à 16 brins sur ±0,1 rad (environ 0,085 de large), en deux couches, soit plus de trois épaisseurs de recouvrement.
- Palmier : K = 6 à 8 lames × 8 à 10 brins, plus 6 à 10 brins de cœur, soit 55 à 85 brins.

COÛT. Au total 250 à 290 brins, **40 à 53 k triangles** mesurés, contre environ 100 brins et 16,5 k aujourd'hui. C'est à peu près le budget de la grande frange (environ 53 k). Toujours 2 appels de rendu (laine + ruban).

## anime

Refonte : une « houppette palmier » d'anime. Nœud au sommet, un peu en arrière (azimut π ± 0,3, sy 0,90 à 0,96) : vu de face le palmier couronne la tête, et aucune lame ne retombe sur la frange.

1. **Palmier** : 6 à 8 lames de fil qui jaillissent du chouchou en fontaine.
   - Longueur Lc = L·(0,75…1,25) avec L = R·(0,5…0,75). La lame monte de 0,3 à 0,5 Lc puis retombe de 0,35 à 0,65 Lc.
   - Section **aplatie** (0,55), comme une lame dessinée. Largeur r·(3,5…5) à 30 % de la longueur, puis **fermée à 85 %** sur la deuxième moitié : pointe nette.
   - Pointe **relevée** (+4r sur les 18 derniers %), le flick anime.
   - La lame la plus tournée vers l'avant est la **lame héroïque**, qui fait l'épi : ×1,3 en longueur, 5 brins seulement, montée 0,55 Lc, chute 0,1 Lc. Elle s'avance au-dessus du front en crochet.
   - Un cœur de 6 à 10 brins courts dressés remplit le centre, pour que le palmier ne soit pas creux vu de profil.
2. **Chouchou** : deux anneaux en ruban (out.ribbon, out.ribbonColor tiré dans RIBBONS), comme les couettes. C'est l'accent de couleur qui dit « coiffé ».
3. **Cheveux tirés avec lignes de tension** : la couche B est modulée en 12 à 16 crêtes (lift + 0,9r·(0,5 + 0,5·cos(φ·G))) qui convergent vers le nœud. La passe d'encre (dérivée seconde de la profondeur) y trace des traits qui filent vers le chouchou, le dessin classique d'une chevelure tirée en anime. La couche A garantit la couverture sous ces crêtes.
4. **Frange en pointes** (la brique de bangs()) :
   - 3 à 5 mèches sur ±0,62…0,74 rad, deux rangées décalées d'une demi-mèche, convergence 0,6, retombée à la verticale ;
   - pointes relevées de R·0,04, s'arrêtant à hairline(p, 0, 1,1), mesuré ≥ 0,059 au-dessus des boutons ;
   - racines **sous** la couche tenue (lisière + 0,07, posées à 0,6r) : la frange sort de dessous les cheveux tirés.
5. **Deux mèches latérales** qui encadrent le visage, azimut ±(1,1…1,3) :
   - elles partent à hauteur des yeux (sy 0,26 à 0,34), sous la couche tenue, passent **par-dessus** jusqu'à la lisière (relèvement + 3,8r), puis épousent la joue jusqu'à la mâchoire (sy −0,72 à −0,82) ;
   - fermées à 85 % sur leur deuxième moitié, ventre de R·0,05 ;
   - pointe **ramenée vers le visage** (−sx·0,14 rad, chiralité signée). Mesuré : ≥ 0,15 des boutons.
6. **Pointe de nuque** en V (−0,18) derrière.

Silhouettes :
- **de face** : couronne en palmier, épi, frange pointue, deux mèches latérales ;
- **de profil** : lames en éventail au-dessus et derrière ;
- **de dos** : lignes de tension qui convergent vers le chouchou coloré.

## codeSketch

// ---- outils (à ajouter près de sectorMovers) ----------------------------
/** Mobilité nulle jusqu'à t0 (partie tenue), puis linéaire jusqu'à la pointe. */
const after = (t0: number) => (t: number) => clamp((t - t0) / Math.max(1e-3, 1 - t0), 0, 1)

/** Fraction de longueur (sur les cordes) d'un tracé à l'indice k. */
function arcAt(pts: THREE.Vector3[], k: number) {
  let at = 0, total = 0
  for (let i = 1; i < pts.length; i++) {
    const d = pts[i].distanceTo(pts[i - 1])
    total += d
    if (i <= k) at += d
  }
  return total > 0 ? at / total : 0
}

/** Repousse radialement hors du crâne : pour ce qui retombe autour du sommet. */
function clearSkull(p: DollParams, q: THREE.Vector3, margin: number) {
  const need = onDir(p, q.clone().normalize(), margin).pos.length()
  if (q.length() < need) q.setLength(need)
  return q
}

/** Plus grande largeur du crâne (bajoues comprises), en rayons de tête. */
function widest(p: DollParams) {
  let w = 0
  for (let sy = -0.7; sy <= 0.31; sy += 0.05)
    for (const az of [0, Math.PI / 2]) {
      const q = onHeadPolar(p, az, sy, 0).pos
      w = Math.max(w, Math.hypot(q.x, q.z))
    }
  return w / p.shape.headRadius
}

/** Ressort pivotant au centre, bout vers l'azimut az (hors de l'axe de rotation). */
function centerMover(R: number, az: number, stiffness: number, drag: number, maxAngle: number): Mover {
  return {
    pivot: new THREE.Vector3(),
    dir: new THREE.Vector3(Math.sin(az) * 0.75, -0.66, Math.cos(az) * 0.75).normalize(),
    length: R,
    cfg: { stiffness, drag, gravity: 0 },
    maxAngle,
  }
}

// ---- houppette -----------------------------------------------------------
function tuft(p: DollParams, rnd: () => number, yarnR: number, out: Parts) {
  const R = p.shape.headRadius
  const r = yarnR * (1 + rnd() * 0.35)
  // Nœud au sommet, un peu en arrière : devant, les lames retomberaient sur la frange.
  const knotAz = Math.PI + (rnd() - 0.5) * 0.6
  const knotSy = 0.9 + rnd() * 0.06
  const s = onHeadPolar(p, knotAz, knotSy, 0)
  const n = s.normal
  const kd = dirOf(knotAz, knotSy)
  const [e1, e2] = tangentBasis(kd)
  const tieR = r * 4.2
  const W0 = widest(p)
  out.ribbonColor = RIBBONS[Math.floor(rnd() * RIBBONS.length)]

  // 1. Cheveux TIRÉS vers le nœud : tenus, aucun ressort.
  const limit = hairline(p, NAPE_LOW + rnd() * 0.12, 1.7)
  const edgeOf = (az: number) => limit(az) - Math.max(0, -Math.cos(az)) ** 3 * 0.18
  // Répartis en azimut autour du NŒUD, comptés sur le grand cercle à 90° (là où les géodésiques s'écartent le plus).
  const count = clamp(Math.ceil((2 * Math.PI * R * W0) / (0.8 * 2 * r)), 60, 260)
  const grooves = 12 + Math.floor(rnd() * 5)
  for (let i = 0; i < count; i++) {
    const outer = i % 2 === 1 // couche B, décalée d'un demi-pas
    const phi = ((i + 0.5 + (rnd() - 0.5) * 0.2) / count) * Math.PI * 2
    const lift = outer
      ? r * (1.6 + 0.9 * (0.5 + 0.5 * Math.cos(phi * grooves)) + rnd() * 0.2) // crêtes de tension
      : r * (0.9 + rnd() * 0.2)
    const way = e1.clone().multiplyScalar(Math.cos(phi)).addScaledVector(e2, Math.sin(phi))
    let from: THREE.Vector3 | null = null
    let th = 0.05
    for (; th < Math.PI; th += 0.01) {
      const d = kd.clone().multiplyScalar(Math.cos(th)).addScaledVector(way, Math.sin(th))
      if (d.y < edgeOf(Math.atan2(d.x, d.z))) break
      from = d
    }
    if (!from || th < 0.25) continue // tirages déjà faits
    const end = s.pos.clone().addScaledVector(way, tieR * 0.8).addScaledVector(n, r * 1.5).normalize()
    const pts: THREE.Vector3[] = []
    for (let k = 0; k <= 22; k++)
      pts.push(onDir(p, from.clone().lerp(end, k / 22).normalize(), k === 0 ? -r * 2 : lift).pos)
    pts.push(s.pos.clone().addScaledVector(n, r * 2)) // finit sous le chouchou : l'effilage y disparaît
    out.yarn.push(yarn(pts, r)) // mover −1, aFree = aFling = 0
  }
  for (let w = 0; w < 2; w++)
    out.ribbon.push(ring(s.pos.clone().addScaledVector(n, r * (2.2 + w * 2.6)), n, tieR + r * (1.6 - w * 0.2), r * 1.4))

  // 2. Frange en pointes (brique de bangs()), racines sous la couche tenue.
  const front = limit(0)
  const edge = hairline(p, 0, 1.1)(0)
  const W = 0.62 + rnd() * 0.12
  const T = 3 + Math.floor(rnd() * 3)
  const fringe0 = out.movers.length
  for (let k = 0; k < T; k++)
    out.movers.push(centerMover(R, (((k + 0.5) / T) * 2 - 1) * W * 0.9, 0.025 + rnd() * 0.02, 0.06 + rnd() * 0.05, 0.18))
  const tuftLen = Array.from({ length: T }, () => rnd())
  const nb = 2 * Math.ceil((2 * W * R * Math.sqrt(1 - front * front) * W0) / (1.6 * r))
  for (let i = 0; i < nb; i++) {
    const u = (i + 0.5) / nb
    const f = clamp(u * T + (i % 2 ? 0.5 : 0) - 0.25, 0, T - 0.001)
    const c = Math.floor(f)
    const w = (f - c) * 2 - 1
    const az = (u * 2 - 1) * W
    const center = (((c + 0.5) / T) * 2 - 1) * W * 0.9
    const tipAz = az + (center - az) * 0.6
    const side = Math.abs(tipAz) / W
    const tipSy = edge + tuftLen[c] * 0.05 + Math.abs(w) ** 1.5 * 0.06 + side * side * 0.06 + rnd() * 0.015
    const layer = r * (0.8 + rnd() * 1.6)
    const phase = rnd() * 6
    const from = dirOf(az, edgeOf(az) + 0.07)
    const tip = dirOf(tipAz, clamp(tipSy, -0.9, 0.9))
    if (from.angleTo(tip) < 0.08) continue // trop courte pour exister
    const pts: THREE.Vector3[] = []
    let hang: THREE.Vector3 | null = null
    for (let k = 0; k <= 12; k++) {
      const t = k / 12
      const lift = k === 0 ? -r * 2
        : Math.min(layer, r * 0.6 + ((layer - r * 0.6) * t) / 0.3) + R * 0.04 * Math.max(0, (t - 0.8) / 0.2) ** 2
      const q = onDir(p, from.clone().lerp(tip, t).normalize(), lift).pos
      if (t > 0.5) { // tombante, comme bangs()
        hang ??= pts[pts.length - 1].clone()
        if (hang.z > q.z) q.z += (hang.z - q.z) * 0.7
      }
      pts.push(q)
    }
    out.yarn.push(yarn(pts, r, { mover: fringe0 + c, free: after(0.2), fling: after(0.2), phase }))
  }

  // 3. Mèches latérales qui encadrent le visage (chiralité signée par sx).
  for (const sx of [-1, 1]) {
    const azS = sx * (1.1 + rnd() * 0.2)
    const sy0 = 0.26 + rnd() * 0.08
    const endSy = -0.72 - rnd() * 0.1
    const m = out.movers.length
    out.movers.push(centerMover(R, azS, 0.025 + rnd() * 0.015, 0.06 + rnd() * 0.04, 0.35))
    const ns = 12 + Math.floor(rnd() * 5)
    const edgeS = edgeOf(azS)
    for (let j = 0; j < ns; j++) {
      const az = azS + (((j + 0.5) / ns) * 2 - 1) * 0.1
      const base = r * (1 + (j % 2) * 1.1 + rnd() * 0.3)
      const phase = rnd() * 6
      const pts: THREE.Vector3[] = []
      let rMax = 0
      for (let k = 0; k <= 16; k++) {
        const t = k / 16
        const close = 0.85 * clamp((t - 0.45) / 0.55, 0, 1) ** 1.3
        const a = az + (azS - az) * close - sx * 0.14 * Math.max(0, (t - 0.75) / 0.25) ** 2
        const sy = sy0 + (endSy - sy0) * t
        // Par-dessus la couche tenue tant qu'on est au-dessus de sa lisière.
        const over = r * 3.8 * THREE.MathUtils.smoothstep(sy, edgeS - 0.12, edgeS + 0.04)
        const q = onHeadPolar(p, a, sy, k === 0 ? -r * 2 : base + over + R * 0.05 * Math.sin(Math.PI * t)).pos
        const h = Math.hypot(q.x, q.z)
        if (sy < 0 && h < rMax) { q.x *= rMax / h; q.z *= rMax / h }
        rMax = Math.max(rMax, Math.hypot(q.x, q.z))
        pts.push(q)
      }
      out.yarn.push(yarn(pts, r, { mover: m, free: after(0.15), fling: after(0.15), phase }))
    }
  }

  // 4. Palmier : lames pointues en fontaine, un ressort par lame.
  const K = 6 + Math.floor(rnd() * 3)
  const L = R * (0.5 + rnd() * 0.25)
  const ringTop = s.pos.clone().addScaledVector(n, r * 6)
  const stemTop = ringTop.clone().addScaledVector(n, R * (0.06 + rnd() * 0.06))
  const phi0 = rnd() * Math.PI * 2
  const ways = Array.from({ length: K }, (_, c) => {
    const phi = phi0 + ((c + 0.5 + (rnd() - 0.5) * 0.35) / K) * Math.PI * 2
    return e1.clone().multiplyScalar(Math.cos(phi)).addScaledVector(e2, Math.sin(phi))
  })
  // Lame héroïque (épi) : la plus tournée vers l'avant — choisie par la géométrie, aucun tirage conditionnel.
  const hero = ways.reduce((b, w, c) => (w.z > ways[b].z ? c : b), 0)
  const spike0 = out.movers.length
  ways.forEach((way, c) => {
    const isHero = c === hero
    const side = new THREE.Vector3().crossVectors(n, way).normalize()
    const Lc = L * (0.75 + rnd() * 0.5) * (isHero ? 1.3 : 1)
    const rise = Lc * (isHero ? 0.55 : 0.3 + rnd() * 0.2)
    let drop = Lc * (isHero ? 0.1 : 0.35 + rnd() * 0.3)
    const wc = r * (3.5 + rnd() * 1.5)
    const nc0 = 8 + Math.floor(rnd() * 3)
    const nc = isHero ? 5 : nc0
    const axis = (u: number) => stemTop.clone()
      .addScaledVector(way, Lc * 0.8 * u)
      .addScaledVector(n, 4 * rise * u * (1 - u) - drop * u * u + r * 4 * Math.max(0, (u - 0.82) / 0.18) ** 2)
    // Garde-fou : une lame de devant ne descend pas sous la racine de la frange.
    for (let g = 0; g < 6; g++) {
      const d = axis(1).normalize()
      if (d.z <= 0 || d.y >= front + 0.1) break
      drop *= 0.7
    }
    const tipRest = axis(1)
    out.movers.push({
      pivot: stemTop.clone(),
      dir: tipRest.clone().sub(stemTop).normalize(),
      length: tipRest.distanceTo(stemTop),
      cfg: { stiffness: (0.06 + rnd() * 0.04) * (isHero ? 1.5 : 1), drag: isHero ? 0.05 : 0.07 + rnd() * 0.05, gravity: 0 },
      maxAngle: 0.45,
    })
    for (let j = 0; j < nc; j++) {
      const ang = j * GOLDEN
      const rad = Math.sqrt((j + 0.5) / nc)
      const oa = Math.cos(ang) * rad
      const ob = Math.sin(ang) * rad * 0.55 // lame aplatie
      const pts: THREE.Vector3[] = [
        s.pos.clone().addScaledVector(n, -r * 2),
        ringTop.clone().addScaledVector(way, tieR * 0.55 * rad).addScaledVector(side, tieR * 0.4 * oa),
      ]
      for (let k = 1; k <= 14; k++) {
        const u = k / 14
        const wid = wc * (u < 0.3 ? 0.4 + (0.6 * u) / 0.3 : 1) * (1 - 0.85 * clamp((u - 0.45) / 0.55, 0, 1) ** 1.3)
        pts.push(clearSkull(p, axis(u).addScaledVector(side, oa * wid).addScaledVector(n, ob * wid), r * 2))
      }
      const t0 = arcAt(pts, 1) // bout du chouchou
      out.yarn.push(yarn(pts, r, { mover: spike0 + c, free: after(t0), fling: after(t0), phase: rnd() * 6 }))
    }
  })
  // Cœur : brins courts dressés, sur le ressort de la lame la plus proche, à demi-mobilité.
  const core = 6 + Math.floor(rnd() * 5)
  for (let i = 0; i < core; i++) {
    const lean = e1.clone().multiplyScalar(rnd() - 0.5).addScaledVector(e2, rnd() - 0.5)
    const h = L * (0.2 + rnd() * 0.25)
    const pts = [
      s.pos.clone().addScaledVector(n, -r * 2),
      ringTop.clone(),
      stemTop.clone().addScaledVector(n, h * 0.6).addScaledVector(lean, h * 0.3),
      stemTop.clone().addScaledVector(n, h).addScaledVector(lean, h * 0.7),
    ]
    const near = ways.reduce((b, w, c) => (w.dot(lean) > ways[b].dot(lean) ? c : b), 0)
    const t0 = arcAt(pts, 1)
    out.yarn.push(yarn(pts, r, { mover: spike0 + near, free: (t) => 0.5 * after(t0)(t), fling: (t) => 0.5 * after(t0)(t), phase: rnd() * 6 }))
  }
}
// Ressorts : T (3-5) + 2 + K (6-8) = 11 à 15, toujours ≤ MAX_MOVERS. Aucun changement à hairShader ni à Hairdo.

## risks

1. **« Base couchée » (rejetée).** La couche tenue n'est pas une deuxième coupe : ce sont les cheveux de la houppette qui entrent dans le lien. Mais si la convergence sous le chouchou ne se voit pas, on relira « calotte + plumet », comme l'essai rejeté. Garde-fous : les brins finissent **sous** les anneaux, les crêtes de tension filent vers le nœud, et le chouchou est d'une couleur franche. À vérifier à l'écran de dos et de trois quarts. Il faut aussi réécrire le commentaire de tuft() et la ligne de CLAUDE.md « une houppette qui retombe en fontaine sur le crâne », qui ne sera plus vraie.

2. **Bourrelet au pied du nœud.** Environ 115 à 136 brins convergent sur un pourtour d'environ 21r (2π·0,8·4,2r), soit onze fois ce qu'il faudrait pour les poser côte à côte. Ils s'interpénètrent en un cône plein. Si le bourrelet est trop gros, élargir le lien (tieR = max(4,2r ; 0,07R)) ou arrêter les brins de la couche B un peu avant le nœud.

3. **Duvet.** La couche A est posée à 0,9-1,1r : les tubes touchent la peau et le duvet (0,02) reste dans les rainures ; c'est la couche B, décalée d'un demi-pas, qui les recouvre (98,5 à 99 % mesurés en projection radiale). Si des fibres percent encore en vue rasante, monter B à 2r. Percer le duvet sous la coupe (comme patchHoles) est hors sujet ici.

4. **Frange sur les boutons.** Au repos, les pointes sont à au moins 0,059 des boutons (mesuré). En mouvement, elles glissent au plus de maxAngle·R ≈ 0,077 : elles peuvent effleurer le haut d'un bouton quand la tête pique en avant. Si ça se voit, passer maxAngle à 0,14 ou la frange à hairline(p, 0, 1,2). Sur un visage extrême (gros yeux hauts), hairline plafonne à 0,85 : les mèches trop courtes ne sont pas posées (test angleTo < 0,08).

5. **Lames dans le crâne.** Au repos, le dégagement minimal mesuré est de 0,032 à 0,072 (clearSkull, marge 2r). En mouvement, le collider (0,95R) ne retient que le **bout** du ressort ; une lame qui plonge de 0,45 rad peut traverser le crâne à mi-longueur. À mesurer comme pour la grande frange, en rejouant le shader pendant une rotation. Si besoin, maxAngle 0,35. La lame héroïque est gardée au-dessus de la racine de la frange (plus bas bout de lame mesuré à sy 0,66 contre une lisière avant de 0,54 à 0,67).

6. **Mèches latérales.**
   - Dégagement au-dessus de la couche tenue : 0,005 à 0,006 au repos. En glissant vers une zone plus bombée (bajoues), elles peuvent affleurer les brins tenus ; si besoin, over = 4,2r.
   - Elles s'arrêtent au-dessus du bas du crâne (sy ≥ −0,82) à cause des épaules, mais aucun collider des bras ne les protège : léger chevauchement possible bras levé dans l'arène.
   - Elles peuvent masquer l'épingle plantée sur le côté du crâne.
   - Chiralité : la pointe est ramenée vers le visage par −sx (piège documenté du signe).

7. **Graine.** Il n'y a aucun tirage conditionnel : la lame héroïque est choisie par la géométrie, les nc et tirages de rnd sont faits avant tout `continue`. Seules les houppettes changent d'aspect (flux mulberry32(p.seed + 5303) propre à la coiffure) ; rien d'autre ne bouge.

8. **Coût.** 40 à 53 k triangles contre environ 16,5 k (×2,5 à 3), au niveau de la grande frange. Toujours 2 appels de rendu, 11 à 16 ressorts, aucun shader modifié : pas de piège de cache sur 'hairdo'. Si la galerie l'impose, réduire M de 22 à 16 sur la couche tenue (le compte de brins, lui, ne se réduit pas).

9. **Audit à faire, comme dans CLAUDE.md (« le mouvement se mesure par zone »).** Rejouer le shader pendant une rotation : déplacement nul (0,000) attendu sur la couche tenue et le chouchou, non nul sur les lames, la frange et les mèches latérales. Ne pas juger à l'œil avec le panneau masqué.

10. **Remarque pour les autres coupes.** pulled() répartit ses brins uniformément en azimut du crâne alors que ses attaches ne sont pas au pôle. Il a donc le même défaut de divergence des géodésiques que celui mesuré ici : 86-93 % à l'arrière au lieu de 99,5 %. La règle « répartir en azimut autour de l'attache, compter sur le grand cercle à 90° » lui est transposable.

