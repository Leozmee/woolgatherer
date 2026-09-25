# Proposition — couettes

## cut

couettes — pigtails() + pulled() + bunch(), dans /Users/leogallus/Projets/DummyFaces/src/doll/hairstyles.tsx. Mesures faites sur la version de HEAD. Attention : l'arbre de travail contient une modification non commitée de pulled() (brins sans pivot, pas de 3r réparti en azimut, deux couches) et d'autres fichiers. Elle est mesurée plus bas, et cette proposition la remplace.

## diagnosis

Mesuré avec les vraies fonctions de la coupe (copie instrumentée dans le scratchpad, aucun fichier du projet touché), sur les graines 1, 7 et 42, avec R = 0,43 et p.hair.thickness = 0,03.

Rappel important : Hairdo reçoit le p du panneau. La grosseur tirée par hairLook ne sert qu'aux locks, donc l'épaisseur est de 0,03 sur toutes les poupées. Le fil vaut r = 0,9 · yarnR = 0,9 · 0,42 · th · R/0,43, soit 0,879 · th · R. À th = 0,03, r = 0,0113 et le diamètre 0,0227 (0,053 R).

Critère de couverture : un point du crâne est couvert si un brin passe à moins de r du rayon issu de ce point. On le teste le long de la normale, puis depuis quatre vues.

1) CLAIRSEMÉ, pulled() à HEAD : 188 brins, soit 120 depuis la lisière, pris régulièrement en azimut (un tous les 3°), et 2×34 depuis la raie. Trois causes :
 - Écart le long de la lisière. Derrière et sur les côtés (ρ ≈ 0,40), il vaut 0,021, soit 0,92 diamètre : les brins se touchent tout juste, sur une seule couche. Aux tempes, la lisière monte de sy −0,38 à 0,85 sur 0,76 rad d'azimut, ce qui fait environ 1,13 de longueur par radian. On y a donc un brin tous les 0,059, soit 2,6 diamètres. Couverture mesurée entre ±45° et ±70° : 31 à 47 %.
 - Raie : 34 brins sur 1,12, soit 0,033 (1,45 diamètre) ; environ 69 % sur la raie.
 - Sommet : onDir borne d.y à 0,98. Tout point à moins de 11,5° du pôle est projeté sur l'anneau sy = 0,98, de rayon 0,2 R = 0,086 (3,8 diamètres) : le sommet a un trou. C'est la vue de dessus des captures.
 - Au total, à HEAD : normale 78–80 %, face (de face, 20° au-dessus) 69–73 %, dessus 86–88 %, dos 87–89 %, profil 86–88 %.
 - L'arbre de travail actuel (288 brins) : normale 89–90 %, face 75–80 %, dessus 91–93 %. Il atteint 94–95 % de dessus si l'on corrige aussi le pôle. Les tempes restent à 39–57 %, parce qu'on échantillonne toujours en azimut.

2) PHYSIQUE : pulled pousse 6 ressorts de secteur (raideur 0,04–0,06, amortissement 0,10–0,16, débattement 0,14). La mobilité aFree vaut 0,5 + 0,5t, donc elle est **maximale au bout noué**. Ce bout glisse de 0,14 · R ≈ 0,06 (2,6 diamètres) autour du centre, alors que le ruban (sans pivot) et la racine de la queue restent fixes : le cheveu tenu sort de dessous le ruban. En plus aFling vaut 0,25t. La queue a un seul ressort (0,04 / 0,16 / gravité 1,2, débattement 0,7) : même raideur, donc même échelle de temps que le crâne, et tout balance ensemble. C'est le « même physique » dont se plaint l'utilisateur. La queue bouge d'un bloc.

3) STYLE : la queue n'est pas clairsemée (remplissage mesuré 100 %), elle est maigre. Elle fait 0,06 à 0,09 de large vue de face, soit 7 à 10 % de la largeur de la tête (0,86). C'est un cylindre de 22 à 31 brins tirés uniformément dans un disque (sqrt(rnd)), sans mèches ni pointes : une queue de rat. Le devant est plaqué en arrière depuis sy 0,85, il n'y a ni frange, ni mèches latérales, ni épi, et le ruban se réduit à deux anneaux. On lit « cheveux gominés », pas « twin-tails ».

## physics

Ce qui ne bouge pas :
- Cheveux tirés (pulled) : **aucun pivot**. On appelle yarn(pts, r) sans option, ce qui donne aMover −1, aFree 0 et aFling 0. On supprime sectorMovers(…, 6, 0.14, 0.05), ce qui libère 6 ressorts.
- Nœud (anneaux et boucles du ruban) : fixe, sans pivot, via still() ou yarn sans pivot.
- Portion d'une queue sous le ruban : aFree = 0 pour t < 0,06.

Ce qui bouge, en ordre de mobilité croissante :
- Frange (5 ou 7 mèches, un ressort par mèche) : pivot au centre du crâne, bout dirigé vers la mèche comme dans bangs. Raideur 0,03–0,05, amortissement 0,08–0,12, gravité 0, débattement **0,08**. Le bout glisse au plus de 0,43 · 0,08 · 0,7 ≈ 0,024 : il ne descend jamais sur les sourcils relevés (sy 0,78) ni sur les boutons. Mobilité free(t) = smooth(0,15 ; 0,55 ; t) · (0,3 + 0,7t) · 0,7 : la racine sur la raie reste tenue, comme les cheveux tirés d'à côté. Écartement fling(t) = 0,4t².
- Mèches latérales (2 ressorts) : pivot là où la mèche quitte la joue (au plus large des bajoues), repos à la verticale, raideur 0,05, amortissement 0,15, gravité 1,0, débattement 0,35. Le collider reste actif, puisque le repos est hors de la sphère. free = clamp((t − tLeave)/(1 − tLeave))^1,2, avec tLeave ≈ 0,57 ; fling = free. La partie posée sur la tempe reste tenue.
- Queues (2 × 6 ressorts : 5 mèches et un cœur) : pivot au nœud (tie + normale · 2r), repos à la verticale. Mèches : raideur 0,035 · (0,8–1,2), amortissement 0,12–0,20, gravité 1,0–1,4. Cœur : raideur 0,055 · (0,8–1,2), plus raide, il sert de colonne pendant que les mèches traînent autour et se séparent au geste. Débattement 0,75. free(t) = fling(t) = smooth(0,06 ; 0,3 ; t) · (0,25 + 0,75t) : ruban tenu, fouetté aux pointes. En rotation rapide les queues s'écartent vraiment, environ +0,25 à x ≈ 0,5, soit l'envol des twin-tails.
- Pans du nœud : sur le ressort du cœur, free de 0 à 0,6.
- Épi (une fois sur deux, 1 ressort) : pivot à la racine, raideur 0,18, amortissement 0,06, **gravité 0**. Une gravité en désaccord avec un repos dressé le ferait fléchir au repos. Débattement 0,5, free = t^1,3, fling = t.

Budget : 20 à 22 ressorts sur MAX_MOVERS = 32 (frange 5–7, mèches latérales 2, queues 12, épi 1). Rien ne bouge au repos : aucun terme temporel n'est ajouté, et le repos de ce qui pend est la verticale.

## density

Principe : échantillonner la lisière et la raie **à pas constant en longueur réelle**, sur deux couches décalées d'un demi-pas, avec un pas de 4r par couche. Cela fait un brin par diamètre au total, là où les brins sont le plus écartés, puisqu'ils convergent ensuite vers le nœud. Deux compléments : chaque brin s'arrête au bord du ruban puis plonge dessous, et onDir est borné à 0,9995 au lieu de 0,98.

Compte déduit de la géométrie (mesuré, l'échelle ne change rien) :
- Longueur de lisière L_lis ≈ 7,44 R (3,20 à R = 0,43). Longueur de raie L_raie ≈ 2,6 R (1,12).
- N = 2 couches × [L_lis/(4r) + 2 côtés × L_raie/(4r)] ≈ 7,2 / th, soit 242 brins à th = 0,03 (142 depuis la lisière, 100 depuis la raie).
- Autres épaisseurs : 360 brins à 0,02, 162 à 0,045. Borner à [120 ; 420] pour les extrêmes du panneau : à 0,008 on dépasserait 900.

Résultat de la maquette (3 graines) :
| Vue | Pas 4r | Pas 3,2r | Pas 5r | HEAD |
|---|---|---|---|---|
| Normale | 96,2–96,8 % | 97 % | 92–93 % | 78–80 % |
| Face | 94,4–96,1 % | — | — | 69–73 % |
| Dessus | 95,8–96,4 % | — | — | 86–88 % |
| Dos | 96–97 % | — | — | 87–89 % |
| Profil | 99 % | — | — | 86–88 % |
- La correction du pôle seule fait passer le dessus de 86 % à 97 % (pas 3,2r).
- Coût des cheveux tirés : environ 43 600 triangles, contre environ 34 000 à HEAD. Avec un anneau tous les 6 rayons au lieu de 3 sur ces brins (ce sont des arcs lisses), on tombe à environ 22 000.

Autres parties :
- Frange : 2 rangs × ceil(L_pointes/(1,8r)). La ligne des pointes hairline(p, 0.15, 2.45) sur |az| ≤ 0,95–1,05 mesure 0,68 à 0,89, soit **68 à 88 brins**.
- Queue : ceil(1,5 · 2π · bulge/(1,8r)), avec bulge = r · (8 à 11), soit **42 à 50 brins** par queue (22 à 31 aujourd'hui). Largeur mesurée : 0,18 à 0,22 vue de face (21 à 25 % de la tête, contre 7 à 10 %). Remplissage de 100 % sur les deux tiers hauts, puis 57 à 87 % dans le dernier sixième : ce sont les vides voulus entre les pointes. Environ 6 500 à 7 800 triangles par queue.
- Mèches latérales : 2 couches × 5 = 10 brins par côté.

Total : environ 430 tubes pour environ 46 000 triangles si l'on passe au pas de 6 rayons (HEAD : 246 tubes, environ 44 000). Toujours deux appels de rendu (fil et ruban).

## anime

La silhouette visée est celle des twin-tails d'anime : une tête compacte avec raie au milieu, deux queues volumineuses hautes et évasées, une frange en pointes et deux mèches qui encadrent le visage.

1) Attaches plus hautes et un peu plus en arrière : sy de 0,4 à 0,7 (contre 0,3 à 0,55), azimut ±(π/2 + 0,25 à 0,40).

2) Queues en mèches, sur le modèle clumps/pinch de radiate :
 - Le faisceau sort serré du ruban (2,6r), gonfle vite (smooth(0,04 ; 0,4)) jusqu'à 8 à 11r, puis se divise en 5 mèches et un cœur.
 - Chaque mèche a sa longueur (0,8 à 1,02 L ; le cœur est le plus long) et ses brins se referment vers sa pointe sur le dernier moitié, avec un pinch de 0,78. Les pointes sont effilées par yarn.
 - Axe en arc « ( ) » : un bombé vers l'extérieur de 0,05 à 0,10 R en sin(πt), en plus du décollement stand déjà présent.
 - Légère vrille, de 0,3 à 0,8 rad sur la longueur, **signée par côté** : la paire est un miroir.
 - Pointes retroussées vers l'extérieur de 3r, sur la moitié des mèches.
 - Gabarit commun aux deux queues (bulge, bombé, vrille) : elles forment une paire, pas deux tirages.

3) Frange en pointes courte, distincte de la grande frange : 5 ou 7 mèches, deux rangs décalés d'une demi-mèche (la technique de bangs), racines sur l'avant de la raie.
 - Pointes centrales sur hairline(p, 0.15, 2.45) : sy 0,84 au réglage courant. Elles restent au-dessus des sourcils relevés (sy 0,78 mesuré, cambrure comprise) et ne couvrent ni les boutons ni l'humeur.
 - Sur les côtés, la même lisière descend d'elle-même vers les tempes (sy 0,37 à 0,57 à |az| ≈ 1) et rejoint les mèches latérales : un cadre en M.
 - Les encoches en V montent de 0,06 à 0,07, et l'on y voit les cheveux tirés de dessous, pas le crâne.

4) Mèches latérales (une de chaque côté) :
 - Racine à az = ±clamp(asin((eyeSpacing/2 + taille·1,3)/(1,02 R)) + 0,12 ; 0,95 ; 1,25), environ 55°. Le bord des yeux est à 38°, pommettes et larme restent dégagées.
 - Elles descendent sur la tempe, rayon jamais décroissant comme dans braids, jusqu'au plus large des bajoues, puis pendent jusqu'à 0,08 à 0,18 R sous le menton.
 - Elles se referment en pointe (pinch 0,85) et la pointe se recourbe vers le menton de 0,12 rad, signe selon le côté.

5) Nœud plutôt que deux anneaux : un anneau au ras du crâne, deux boucles en goutte (fermées, dans le plan tangent au crâne, à ±30° vers le haut, longueur 0,12 à 0,18 R, fil de 1,6r) et deux pans courts qui pendent sur la queue. La teinte vient toujours de RIBBONS.

6) Épi (une fois sur deux) : 3 brins de 1,1r qui convergent en crochet « ? ». Ils montent de 0,22 à 0,34 R, avancent de 0,14 à 0,22 R, et la pointe retombe. Racine juste derrière le sommet, sur la raie.

7) Cheveux tirés : deux couches plaquées (relèvement 0,5r et 1,4r, plus 0 à 0,3r d'aléa), raie visible derrière, lisière qui garde son jitter (±0,015 en sy) et sa pointe sur la nuque.

## codeSketch

// === hairstyles.tsx — outils ===
const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t) }

// onDir : 0,9995 et non 0,98 (trou de 0,2 R au sommet ; dessus 86 % → 97 %)
function onDir(p: DollParams, d: THREE.Vector3, lift: number) {
  return onHeadPolar(p, Math.atan2(d.x, d.z), clamp(d.y, -0.9995, 0.9995), lift)
}

// YarnOpts : + step?: number   (anneau tous les `step` rayons, 3 par défaut)
//   dans yarn() : const segs = clamp(Math.ceil(len / (radius * (o.step ?? 3))), 6, 48)

/** Directions régulièrement espacées EN LONGUEUR RÉELLE le long d'une ligne du crâne. */
function alongSkull(p: DollParams, line: THREE.Vector3[], pitch: number, offset = 0): THREE.Vector3[] {
  const pos = line.map((d) => onDir(p, d, 0).pos)
  const cum = [0]
  for (let i = 1; i < pos.length; i++) cum.push(cum[i - 1] + pos[i].distanceTo(pos[i - 1]))
  const total = cum[cum.length - 1], n = Math.max(1, Math.round(total / pitch))
  const out: THREE.Vector3[] = []
  for (let k = 0, j = 0; k < n; k++) {
    const s = ((k + 0.5 + offset) / n) * total
    while (j < cum.length - 2 && cum[j + 1] < s) j++
    const f = clamp((s - cum[j]) / Math.max(1e-9, cum[j + 1] - cum[j]), 0, 1)
    out.push(line[j].clone().lerp(line[j + 1], f).normalize())
  }
  return out
}

// === pulled : TENUS, densité déduite ===
function pulled(p: DollParams, rnd: () => number, r: number, targets: THREE.Vector3[], out: Parts, low: number, rim = r * 2.6) {
  const limit = hairline(p, low), R = p.shape.headRadius, M = 14
  const dirs = targets.map((t) => t.clone().normalize())
  const nearest = (f: THREE.Vector3) => dirs.reduce((a, d) => (d.dot(f) > a.dot(f) ? d : a), dirs[0])
  const rimAng = (rim + r) / R
  const strand = (from: THREE.Vector3, to: THREE.Vector3, lift: number) => {
    const axis = new THREE.Vector3().crossVectors(to, from).normalize()
    const edge = to.clone().applyAxisAngle(axis, rimAng)             // s'arrête au bord du ruban…
    const pts: THREE.Vector3[] = []
    for (let k = 0; k <= M; k++) pts.push(onDir(p, from.clone().lerp(edge, k / M).normalize(), k === 0 ? -r * 2 : lift).pos)
    pts.push(onDir(p, to.clone().applyAxisAngle(axis, rimAng * 0.4), -r * 2).pos) // …et plonge dessous
    out.yarn.push(yarn(pts, r, { step: 6 }))                           // pas de mover : aFree = aFling = 0
  }
  const pitch = r * 4
  const line = Array.from({ length: 721 }, (_, i) => {
    const az = -Math.PI + (i / 720) * Math.PI * 2
    return dirOf(az, limit(az) + 0.02 - Math.max(0, -Math.cos(az)) ** 3 * 0.18)
  })
  const lift = (layer: number) => r * (layer ? 1.4 : 0.5) + r * 0.3 * rnd()
  for (let layer = 0; layer < 2; layer++)
    for (const f of alongSkull(p, line, pitch, layer * 0.5)) {
      const j = dirOf(Math.atan2(f.x, f.z), clamp(f.y + (rnd() - 0.5) * 0.03, -0.98, 0.98))
      strand(j, nearest(j), lift(layer))
    }
  if (dirs.length === 2 && dirs[0].x * dirs[1].x < 0) {
    const a0 = Math.asin(limit(0)), a1 = Math.PI - Math.asin(Math.max(-0.9, limit(Math.PI) - 0.1))
    const mer = Array.from({ length: 201 }, (_, i) => { const a = a0 + (i / 200) * (a1 - a0); return new THREE.Vector3(0, Math.sin(a), Math.cos(a)) })
    for (let layer = 0; layer < 2; layer++)
      for (const f of alongSkull(p, mer, pitch, layer * 0.5))
        for (const d of dirs) strand(f.clone().add(new THREE.Vector3(Math.sign(d.x) * 0.02, 0, 0)).normalize(), d, lift(layer))
  }
}

// === queue en mèches (remplace bunch pour les couettes ; la queue de cheval peut l'appeler avec clumps: 6, side: 1) ===
type TailOpts = { clumps: number; bulge: number; bow: number; twist: number; side: -1 | 1 }
function tail(p: DollParams, rnd: () => number, r: number, tie: { pos: THREE.Vector3; normal: THREE.Vector3 }, L: number, out: Parts, o: TailOpts) {
  const R = p.shape.headRadius, stand = R * (0.16 + rnd() * 0.08), tight = r * 2.6
  const outH = new THREE.Vector3(tie.normal.x, 0, tie.normal.z).normalize()
  const knot = tie.pos.clone().addScaledVector(tie.normal, r * 2)
  const axisAt = (t: number) => tie.pos.clone()
    .addScaledVector(tie.normal, r * 2 + stand * Math.min(1, t * 2.5) ** 0.7)
    .addScaledVector(outH, o.bow * Math.sin(Math.PI * clamp(t, 0, 1)))
    .addScaledVector(DOWN, L * Math.max(0, t - 0.08) ** 1.25)
  const rho = (t: number) => tight + (o.bulge - tight) * smooth(0.04, 0.4, t)
  const m0 = out.movers.length
  for (let c = 0; c <= o.clumps; c++) out.movers.push({
    pivot: knot.clone(), dir: DOWN.clone(), length: L,
    cfg: { stiffness: (c === o.clumps ? 0.055 : 0.035) * (0.8 + rnd() * 0.4), drag: 0.12 + rnd() * 0.08, gravity: 1.0 + rnd() * 0.4 },
    maxAngle: 0.75,
  })
  const clumpLen = Array.from({ length: o.clumps + 1 }, () => 0.8 + rnd() * 0.22); clumpLen[o.clumps] = 1.02
  const count = Math.ceil(((2 * Math.PI * o.bulge) / (1.8 * r)) * 1.5)
  const N = 18, span = (Math.PI * 2) / o.clumps
  const free = (t: number) => smooth(0.06, 0.3, t) * (0.25 + 0.75 * t)
  for (let i = 0; i < count; i++) {
    const core = i % 6 === 5
    const a = (i * GOLDEN) % (Math.PI * 2)
    const s = core ? 0.35 * Math.sqrt(rnd()) : 0.55 + 0.45 * Math.sqrt(rnd())
    const c = core ? o.clumps : Math.floor(a / span)
    const ac = (c + 0.5) * span
    const tEnd = clumpLen[c] * (0.9 + rnd() * 0.1)
    const flick = rnd() < 0.5 ? 1 : 0.3                                  // tiré même pour le cœur
    const pts = [tie.pos.clone().addScaledVector(tie.normal, -r * 2)]
    for (let k = 1; k <= N; k++) {
      const t = (k / N) * tEnd, u = t / tEnd, tw = o.side * o.twist * t   // chiralité signée
      const tan = axisAt(Math.min(1.1, t + 0.02)).sub(axisAt(Math.max(0, t - 0.02))).normalize()
      const [b1, b2] = tangentBasis(tan)
      const close = 0.78 * smooth(0.5, 1, u) ** 1.2
      const own = b1.clone().multiplyScalar(Math.cos(a + tw)).addScaledVector(b2, Math.sin(a + tw)).multiplyScalar(s)
      const cc = core ? new THREE.Vector3() : b1.clone().multiplyScalar(Math.cos(ac + tw)).addScaledVector(b2, Math.sin(ac + tw))
      const off = own.lerp(cc.clone().multiplyScalar(0.62), close).multiplyScalar(rho(t))
      if (!core) off.addScaledVector(cc, flick * r * 3 * Math.max(0, (u - 0.8) / 0.2) ** 2)
      pts.push(clearHead(p, axisAt(t).add(off), r * 2.5))
    }
    out.yarn.push(yarn(pts, r, { mover: m0 + c, free, fling: free, phase: rnd() * 6 }))
  }
  const kc = axisAt(0.05), ax = axisAt(0.12).sub(axisAt(0)).normalize()
  out.ribbon.push(ring(kc, ax, tight + r * 1.6, r * 1.4))              // tenu (pas de mover)
  bowKnot(p, rnd, r, kc, tie.normal, o.side, out, m0 + o.clumps)       // boucles fixes, pans sur le cœur
}

// bowKnot(p, rnd, r, at: Vector3, n: Vector3, side: -1|1, out: Parts, coreMover: number)
//   deux boucles fermées en goutte dans le plan ⟂ n (x = l·(1−cosθ)/2, y = 0,45·l·sinθ·√(x/l)), l = R·(0,12..0,18), yarn(…, r*1.6, { closed: true }) → sans mover ;
//   deux pans ouverts (DOWN + outH·0,3, longueur 0,6..0,9 l) : yarn(…, r*1.5, { mover: coreMover, free: (t) => 0.6 * t }).

// fringeTufts(p, rnd, r, out, o: { width: number; tufts: number; edge: (az: number) => number })
//   = boucle de frange de bangs() copiée SANS toucher bangs : racines sur la raie
//   new Vector3(sign·0.03, 1, cos(tipAz)·0.55 − 0.12).normalize(), deux rangs (shift 0 / 0.5),
//   tipAz = az + (center − az)·0.6, tipSy = o.edge(tipAz) + tuftLen[c]·0.04 + |w|^1.5·0.07 + rnd()·0.015 (pas de `lengthen`),
//   count = 2 * alongSkull(p, tipLine, r * 1.8).length ; un mover par mèche : pivot (0,0,0), dir vers la mèche,
//   cfg { stiffness: 0.03 + rnd()*0.02, drag: 0.08 + rnd()*0.04, gravity: 0 }, maxAngle 0.08 ;
//   yarn(pts, r * 1.1, { mover: f0 + c, free: (t) => 0.7 * smooth(0.15, 0.55, t) * (0.3 + 0.7 * t), fling: (t) => 0.4 * t * t, phase }).

// sidelock(p, rnd, r, out, side: -1 | 1, edge: (az: number) => number)
//   az0 = side·clamp(asin(clamp((p.face.eyeSpacing/2 + size·1.3)/(1.02·R), 0, 0.95)) + 0.12, 0.95, 1.25), size = max(leftSize,rightSize)·EYE_SCALE·1.14
//   10 brins (2 couches × 5) sur une largeur r·(7..9) : 9 points sur le crâne de edge(az0) à p.shape.headCheekY (rayon jamais décroissant,
//   comme braids), puis 6 points qui pendent jusqu'à −ry − R·(0,08..0,18), refermés (0,85·t^1,3), pointe tournée de −side·0,12·t² autour de UP, clearHead(…, r*2) ;
//   mover { pivot: leave, dir: DOWN, length: leave.y − bottom, cfg { 0.05, 0.15, 1.0 }, maxAngle 0.35 } ; free = fling = clamp((t − 8/14)/(6/14), 0, 1) ** 1.2.

// ahoge(p, rnd, r, out) : racine onHeadPolar(p, π + (rnd()−0.5)·0.6, 0.985, 0) ; 3 brins r*1.1 convergeant sur un crochet
//   (montée H = R·(0,22..0,34), avancée F = R·(0,14..0,22), pointe qui retombe) ;
//   mover { pivot: racine, dir: (milieu − racine).normalize(), length: |milieu − racine|, cfg { 0.18, 0.06, 0 }, maxAngle 0.5 } ; free = t ** 1.3, fling = t.

// === couettes ===
function pigtails(p: DollParams, rnd: () => number, yarnR: number, out: Parts) {
  const R = p.shape.headRadius, r = yarnR * 0.9
  const sy = 0.4 + rnd() * 0.3
  const L = R * (0.75 + rnd() * 0.5)
  const back = 0.25 + rnd() * 0.15
  const ties = [-1, 1].map((sx) => onHeadPolar(p, sx * (Math.PI / 2 + back), sy, 0))
  out.ribbonColor = RIBBONS[Math.floor(rnd() * RIBBONS.length)]
  const hasAhoge = rnd() < 0.5                                        // tiré dans tous les cas
  const tufts = rnd() < 0.5 ? 5 : 7
  const bulge = r * (8 + rnd() * 3), bow = R * (0.05 + rnd() * 0.05), twist = 0.3 + rnd() * 0.5
  const edge = hairline(p, 0.15, 2.45)
  pulled(p, rnd, r, ties.map((t) => t.pos), out, NAPE_LOW + rnd() * 0.12, r * 2.6)
  const azSide = clamp(Math.asin(clamp((p.face.eyeSpacing * 0.5 + Math.max(p.face.leftSize, p.face.rightSize) * EYE_SCALE * 1.14 * 1.3) / (1.02 * R), 0, 0.95)) + 0.12, 0.95, 1.25)
  fringeTufts(p, rnd, r, out, { width: azSide - 0.05, tufts, edge })
  for (const s of [-1, 1] as const) sidelock(p, rnd, r, out, s, edge)
  ties.forEach((t, i) => tail(p, rnd, r, t, L, out, { clumps: 5, bulge, bow, twist, side: i ? 1 : -1 }))
  const ahogeRnd = mulberry32(Math.floor(rnd() * 1e9))                 // sous-graine : la suite ne dépend pas de hasAhoge
  if (hasAhoge) ahoge(p, ahogeRnd, r, out)
}

## risks

- **Travail concurrent** : hairstyles.tsx est modifié et non commité (pulled sans pivots, pas de 3r réparti en azimut, champ yarnR dans Built, audit __hairs). Cette proposition remplace l'échantillonnage en azimut, qui laisse les tempes à 39–57 %. Il faut s'accorder avec qui édite, pour ne pas écraser l'audit.
- **pulled est partagé** par la queue de cheval, le chignon et les nattes : l'échantillonnage en longueur réelle et l'arrêt au bord du ruban les concernent aussi. Le rayon du bord est un paramètre, à régler sur tight pour une queue et sur rb pour une pelote. La raie ne vaut que pour deux attaches opposées.
- **onDir est partagé** (bangs, tuft, pulled) : passer à 0,9995 ne change que les points à moins de 11,5° du pôle, mais la grande frange « plaît ». Il faut vérifier qu'elle ne bouge pas. Sinon, n'utiliser qu'un onDirPole local dans pulled.
- **Tirages conditionnels** (CLAUDE.md) : épi, retroussé des pointes, nombre de mèches de frange. Les rnd() sont appelés dans tous les cas, et l'épi prend une sous-graine. Tout ajout de rnd() change la suite des couettes, mais pas celle des autres éléments de la poupée, puisque buildHair a sa propre graine (seed + 5303).
- **Chiralité** : vrille des queues, courbure des mèches latérales, boucles du nœud. Tout porte `side` : une paire est un miroir, pas une copie tournée.
- **Frange sur les yeux ou sourcils couverts** : pointes sur hairline(p, 0.15, 2.45), qui se cale sur la taille réelle des boutons (EYE_SCALE compris). Débattement 0,08 et mobilité plafonnée à 0,7 : 0,024 au plus, contre une marge de 0,027 sur les sourcils relevés. À vérifier sur l'humeur « surpris » avec les plus gros boutons (leftSize 0,22 : la lisière est bornée à 0,85, la frange est alors très courte).
- **Mèches latérales** : l'azimut se déduit d'eyeSpacing et de la taille des boutons, pour laisser libres pommettes, larme et rousseur (cheekSpot). À contrôler sur une tête très large (bajoues 0,2 et plus) : clearHead avec une marge de 2r repousse la partie pendante.
- **Collider** : les ressorts de frange ont leur pivot au centre, donc pas de collision, ce qui est voulu. Queues et mèches latérales ont leur repos hors de la sphère, donc la collision est active. L'épi aussi.
- **Deux coiffures superposées** : les cheveux tirés sous la frange ne sont pas une « base ». C'est la même coupe (cheveux tirés vers les attaches, frange par-dessus), sans rien de couché à part. Mais à juger à l'œil. Autre point à juger : que la frange courte ne rapproche pas la silhouette de la « grande frange ». Elle s'arrête au-dessus des sourcils, sans longueurs, et les queues dominent.
- **Pièges de mesure** : le cache 'hairdo' ne gêne pas ici, aucun shader n'est modifié. Avec le panneau masqué, requestAnimationFrame est suspendu : juger la physique avec __advance et les variables exposées. Un repos de mèche pendante qui ne serait pas vertical la ferait glisser au repos ; ici tous les ressorts pendants sont réglés sur DOWN.
- **Coût** : à th 0,03, environ 430 tubes pour environ 46 000 triangles avec step: 6 sur les cheveux tirés (environ 67 000 sans), contre environ 44 000 à HEAD. Le nombre de triangles varie en 1/th² : borner le compte des cheveux tirés à [120 ; 420], sinon 900 brins à th 0,008. Toujours deux appels de rendu, 20 à 22 ressorts sur 32. Le shader boucle sur MAX_MOVERS quoi qu'il arrive.
- **Nœud en tubes** : un nœud de ruban en fil lit comme un cordon. sweptBand (ribbon.ts) oriente la largeur par tangente × radiale du corps, ce qui ne convient pas à une boucle posée sur le côté de la tête ; il faudrait une orientation dédiée. Garder les tubes au premier jet.

