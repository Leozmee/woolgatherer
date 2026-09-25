# Proposition — chignon

## cut

chignon — bun() + pulled() (src/doll/hairstyles.tsx, l. 384-443 et 746-780)

## diagnosis

Mesures faites avec la géométrie réelle (onHeadPolar rejoué en Node, réglages du panneau : R = 0,43, headSquash = 1,04, bajoues 0,09, p.hair.thickness = 0,03). Hairdo reçoit le p du panneau : la grosseur tirée par poupée (traits.tsx, gauge) ne sert qu'aux locks. On a donc yarnR = 0,03 × 0,42 × R/0,43 = 0,0126, un fil de chignon r = 0,9 × yarnR = 0,0113 et un diamètre d = 0,0227. Tous les rapports ci-dessous sont indépendants de R.

1) CLAIRSEMÉ, trois causes qui se cumulent.
(a) Racines uniformes en azimut sur une lisière qui ne l'est pas. La lisière mesurée (low = NAPE_LOW + 0,06, pointe de nuque comprise) fait 3,13 = 7,28 R. Avec 120 brins, le pas moyen vaut 0,026 = 1,15 d : il y a déjà un jour en moyenne. Localement, pour 2π/120 d'azimut, le pas vaut 0,011 au front (0,49 d, brins doublés), 1,0 d à az = 0,6, puis 0,059 / 0,068 / 0,061 à az = 0,8 / 0,95 / 1,1. C'est **2,6 à 3,0 d aux tempes**, là où la lisière grimpe de −0,4 à 0,85 en un demi-radian. Côtés et arrière sont à 0,84-0,95 d. Des bandes de crâne de 1,6 à 2 diamètres s'ouvrent donc au-dessus des tempes.
(b) Trou au pôle. onDir borne d.y à 0,98. Tout brin qui passe par le sommet (tous ceux du front vers une pelote haute, et la raie des macarons) est rabattu sur le cercle sy = 0,98 ou coupe en corde. Il reste un disque de rayon acos(0,98) × R = 0,086, soit **7,6 d de diamètre**, que seules traversent quelques cordes enfoncées dans le duvet. C'est exactement la vue de dessus « tirés vers l'arrière ». Simulé : sans la borne, la calotte passe de 93 % à 100 %.
(c) Raie des macarons : 34 positions sur un méridien d'environ 1,39, soit un pas de 0,041 = 1,8 d.
Couverture mesurée, en projection le long de la normale sur 9 000 points au-dessus de la lisière, pelote exclue : **pelote 86 %** (tempes et front 66 %, sommet 77-84 %, côtés 80 %, arrière 94 %) et **macarons 87-90 %** (front 68 %, arrière 79 %).
(d) Brins noyés dans le duvet. Le relèvement vaut r × (0,6 à 1,7), donc le haut du tube est à 1,6-2,7 r = 0,018-0,031. Or le duvet de la tête monte à p.shell.height = 0,02 au-dessus d'une peau bosselée de ±0,0065 (lumps × R × 0,5). Un brin sur six environ a son sommet sous la pointe des fibres, et des fibres beiges le mouchettent.

2) PHYSIQUE. Les cheveux tirés portent 6 sectorMovers : pivot au centre, maxAngle 0,14, stiffness 0,05, free = 0,5 + 0,5t, fling = 0,25t. Leur racine glisse de 0,14 × 0,5 × R = 0,030 (1,3 d), leur bout de 0,060 (2,6 d), et l'extrémité se soulève de 0,03 à 0,045 en rotation rapide. La pelote a son propre ressort (maxAngle 0,18, sommet à 0,027) : tirés et pelote bougent pareil, mais sur des ressorts différents, donc ils cisaillent à la jonction. **Bug** : still(ball, m, 1) fixe aFling = 1, et les ring(…, { free: () => 1 }) héritent de fling = free = 1. À uFling = 1, la pelote est poussée de 0,5 × h, soit 0,10 (pelote haute) à 0,17 (pelote basse), et les macarons de 0,17 à 0,19. C'est **0,8 à 2,2 fois leur propre rayon** (rb = 0,088-0,14), alors que les brins qui y entrent ne bougent que de 0,03 à 0,045 : le chignon se décroche de la tête.

3) STYLE. La lisière avant est à sy = 0,85 : (eyeHeight + 2,7 × taille des boutons)/ry vaut 0,915, borné à 0,85. Tout le front est donc nu jusqu'au sommet, ce qui donne un « chignon de grand-mère » plaqué. Il n'y a ni frange, ni mèches latérales, ni épi, et la silhouette ne se découpe pas. La pelote est une sphère texturée avec 4 anneaux tirés au hasard. ribbonColor n'est jamais tiré pour le chignon, donc aucune note de couleur.

## physics

Principe : ce qui est tiré est tenu. Seules les parties libres bougent. Tous les ressorts ajoutés ont gravity 0 (la géométrie pend déjà, et un repos penché avec du poids fait glisser la mèche au repos) : aucun mouvement au repos.

- **Cheveux tirés** (lisière + raie) : aucun pivot. mover −1, aFree 0, aFling 0, donc immobiles, collés. On retire sectorMovers(6) de pulled(), ce qui libère 6 ressorts. C'est la même règle pour couettes, queue et nattes, puisque pulled() est partagé.
- **Pelote(s)** : pivot à la base, dir = normale. { stiffness 0.14, drag 0.22, gravity 0 }, maxAngle 0.06 au lieu de 0,18 : le sommet bouge au plus de rb × 1,24 × 0,06 ≈ 0,009 (0,4 d), un frémissement vite amorti. aFree 1 et **aFling 0** (correction du bug). Même ressort pour l'hélice d'enroulement et le ruban, avec fling 0.
- **Frange en pointes** (4 à 6 mèches) : un ressort par mèche, pivot au centre du crâne, bout vers la mèche ((sin ac × 0,75, −0,66, cos ac × 0,75), comme bangs). { stiffness 0.025 + rnd × 0.02, drag 0.06 + rnd × 0.05, gravity 0 }, maxAngle 0.25. free = t (nul à la racine : elle borde des cheveux immobiles, une racine qui glisse lirait comme une perruque posée dessus). fling = 0,7 × t^1,2. Le pivot au centre fait glisser la mèche sans qu'elle s'enfonce, et collides reste faux.
- **Mèches latérales** : ce sont les mèches extrêmes de la frange, allongées. Même ressort par mèche, maxAngle 0.3, free = t, fling = t.
- **Pointes de chignon** (pelote seule, une fois sur deux, 3 à 5 pointes) : pivot au centre de la pelote, dir = celle de la pointe. { stiffness 0.1 + rnd × 0.04, drag 0.08, gravity 0 }, maxAngle 0.3. free vaut 0 dans la pelote et monte linéairement jusqu'à 1 à la pointe ; fling = 0,5 × free. Le bout est hors du crâne, donc le collider s'applique.
- **Épi / ahoge** (une fois sur deux) : pivot à la racine. { stiffness 0.16, drag 0.07, gravity 0 }, maxAngle 0.5 : il rebondit. free = t, fling = 0,4t.

Budget : 1-2 + 5-6 + 0-5 + 0-1, soit **14 au plus** sur 32.
Déplacements attendus au débattement maximal, à vérifier en rejouant le shader par zone (règle de CLAUDE.md) : tirés 0 ; pelote ≤ 0,009 ; pointes de frange ≈ 0,25 × R ≈ 0,11, plus l'écartement ; mèches latérales ≈ 0,13 ; pointes de chignon ≈ 0,3 × 1,6 rb ≈ 0,06 ; épi ≈ 0,5 L ≈ 0,1.

## density

Règle : pas entre racines ≤ 0,8 d partout, mesuré sur la courbe réelle et non sur l'azimut. Simulations faites avec le code rejoué.

1) **Racines à pas d'arc constant** le long de la lisière (nouvel outil alongLine) : N = ceil(L_lisière / (0,8 × 2r)), borné à [60, 360]. L_lisière ≈ 7,3-7,4 R, et 2r = 0,756 × thickness × R / 0,43, d'où N ≈ 5,2 / thickness. Cela donne **≈ 176 brins** au panneau (thickness 0,03), 264 à 0,02 et 132 à 0,04, au lieu de 120. Le pas vaut 0,8 d partout, tempes comprises (0,8 d au lieu de 3 d).

2) **Supprimer le trou au pôle** : dans pulled(), onDir sans borne haute (0,9999 au lieu de 0,98). onHeadPolar est régulier en sy = 1 (ring = 0, lateral = 0).

3) **Raie des macarons** : n = ceil(Δang × ry / (0,8 × 2r)) positions, ≈ 62-66 au lieu de 34, soit ×2 brins.

Couverture simulée (lisière avant relevée à 0,93 sous la frange) : **pelote 99,8 %** (sommet 100 %, au lieu de 86 %) ; **macarons 97 %** (99 % à k = 0,65 ; le reste est la raie elle-même, voulue, et un peu de nuque). Aux trois épaisseurs 0,02, 0,03 et 0,04, les chiffres restent entre 96 et 99 %, puisque le compte suit l'épaisseur.

4) **Relèvement au-dessus du duvet** : lo = max(1,2 r, p.shell.height − 0,7 r), soit 0,0136 au panneau (sommet du tube à 0,025 > 0,02) et 0,0147 à thickness 0,02. S'y ajoutent un sillon (0,9 r × (1 − u²), voir anime) et un jitter de 0,25 r. Les racines restent enfouies à −2r, ce qui garde la « sortie du crâne ».

5) **Frange** : count = round(90 × width) + floor(rnd × 15), soit ≈ 95-115, la densité par radian de bangs, en deux rangées décalées d'une demi-mèche.

Total : ≈ 300 brins (pelote) à 430 (macarons), contre 120/188 aujourd'hui. Au plus un peu moins de 100 k triangles (≈ 216 par brin, anneau tous les 3 r, 6 côtés, la moitié des brins de frange étant courts), toujours 2 appels de rendu (fil + ruban). C'est l'ordre de bangs (360 brins), et la planche n'a qu'un chignon.
Ce n'est pas une base : ce sont les mêmes brins, dans le même sens, plus nombreux.

## anime

Silhouette visée : chignon d'héroïne d'anime. Frange en pointes, deux mèches qui encadrent le visage, dessus en mèches bombées qui convergent vers la pelote, pelote enroulée nouée d'un ruban coloré, et parfois un épi ou des pointes qui dépassent.

1. **Frange en pointes** (nouvel outil frontTufts, modelé sur la frange de bangs(), qui n'est pas touchée). 4 à 6 grosses mèches pointues, deux rangées décalées, convergence à 0,6 sur le dernier tiers. Racines **sur la ligne de départ des cheveux tirés** (rootAz = tipAz × 0,8, sy = lisière(rootAz)) : la frange part vers l'avant, les tirés vers l'arrière, d'une même raie, et la frange couvre le front nu. Bord au centre : hairline(p, 0, 1,25 + rnd × 0,4)(0), soit ≈ 0,5-0,6. Il couvre en partie les sourcils, jamais les boutons (même règle que bangs). Pointes relevées d'un souffle au bout.
2. **Mèches latérales** : les mèches extrêmes s'allongent (lengthen au-delà de side > 0,72, en puissance 1,4) jusqu'à sideEnd = −0,45 − rnd × 0,3, de la joue à la mâchoire. L'azimut de leurs pointes est pris sur le visage réel : ≥ asin((eyeSpacing × 0,56 + taille max × EYE_SCALE)/R) + 0,2 ≈ 0,92, donc à l'écart des boutons. Elles sont décollées de R × 0,05 là où elles passent sur les tirés des tempes.
3. **Sillons** (option grooves de pulled, 16 pour le chignon, 0 par défaut pour les autres coupes) : la calotte se partage par azimut de lisière en mèches bombées de 0,9 r qui convergent vers la pelote. Les paliers du cel shading y tracent des stries : la lecture anime des cheveux tirés, sans ouvrir de jour puisque les racines restent au même pas.
4. **Pelote enroulée** : pôle de la sphère aligné sur la normale (ses bandes UV ×16 font le tour), plus **une hélice de 6 à 9 tours** du pied (enfoui) au sommet, au lieu des 4 anneaux au hasard. Vue de dessus, elle lit comme une spirale. Il faut **un yarn par tour** : le plafond de 48 segments de yarn() rendrait sinon l'hélice hexagonale.
5. **Ruban au pied de la pelote** (out.ribbon, ribbonColor tiré dans RIBBONS) : la note de couleur qui dit « coiffé ».
6. **Pointes de chignon** (pelote seule, 50 %) : 3 à 5 pointes de 7 brins qui sortent de la pelote penchées de 55 à 75° sur son axe et retombent un peu (+0,25 × DOWN). Elles se referment jusqu'à 80 % et sont repoussées hors du crâne (clearHead).
7. **Épi** (50 %) : 3 brins qui convergent en pointe, racine au sommet devant la pelote (sy 0,95). Tracé en point d'interrogation : monte, part vers l'avant, puis revient.

Paramètres gardés : deux macarons à 45 %, rayons de pelote actuels. La hauteur de la pelote seule pourrait s'étendre de 0,35 à 0,92 (chignon bas / haut) pour plus de variété.

## codeSketch

// ── outils ──────────────────────────────────────────────────────────────
function still(geo: THREE.BufferGeometry, mover = -1, free = 0, fling = free): THREE.BufferGeometry {
  // … identique, sauf aFling rempli avec `fling` (plus avec `free`)
}

// onDir : borne haute paramétrable ; pulled passe 0.9999 (sinon disque nu de 0,086 au sommet).
function onDir(p: DollParams, d: THREE.Vector3, lift: number, top = 0.98) {
  return onHeadPolar(p, Math.atan2(d.x, d.z), clamp(d.y, -0.98, top), lift)
}

/** Relèvement d'un brin couché : sommet au-dessus de la pointe du duvet de la tête. */
function laidLift(p: DollParams, r: number) {
  return Math.max(1.2 * r, p.shell.height - 0.7 * r)
}

/** Même lisière que `hairline`, front imposé (ligne des racines d'une frange). */
function hairlineAt(low: number, front: number) {
  return (az: number) => {
    const w = clamp((Math.max(0, Math.cos(az)) - 0.25) / 0.6, 0, 1)
    return low + (Math.max(front, low) - low) * w * w * (3 - 2 * w)
  }
}

/** Azimuts à pas d'arc constant le long d'une lisière az → sy (mesurée sur onHeadPolar). */
function alongLine(p: DollParams, line: (az: number) => number, spacing: number, rnd: () => number,
  a0 = 0, a1 = Math.PI * 2, min = 60, max = 360): number[] {
  const K = 360, cum = new Float64Array(K + 1)
  let prev = onHeadPolar(p, a0, line(a0), 0).pos
  for (let j = 1; j <= K; j++) {
    const az = a0 + ((a1 - a0) * j) / K
    const q = onHeadPolar(p, az, line(az), 0).pos
    cum[j] = cum[j - 1] + q.distanceTo(prev); prev = q
  }
  const n = clamp(Math.ceil(cum[K] / spacing), min, max)
  const out: number[] = []
  for (let i = 0, j = 1; i < n; i++) {
    const s = ((i + 0.5 + (rnd() - 0.5) * 0.3) / n) * cum[K]
    while (j < K && cum[j] < s) j++
    const f = clamp((s - cum[j - 1]) / Math.max(1e-9, cum[j] - cum[j - 1]), 0, 1)
    out.push(a0 + ((a1 - a0) * (j - 1 + f)) / K)
  }
  return out
}

// ── cheveux tirés : TENUS ──────────────────────────────────────────────
type PulledOpts = { crown?: number; grooves?: number }
function pulled(p: DollParams, rnd: () => number, r: number, targets: THREE.Vector3[], out: Parts,
  low: number, o: PulledOpts = {}) {
  const limit = o.crown !== undefined ? hairlineAt(low, o.crown) : hairline(p, low)
  const M = 14
  const dirs = targets.map((t) => t.clone().normalize())
  const nearest = (f: THREE.Vector3) => dirs.reduce((a, d) => (d.dot(f) > a.dot(f) ? d : a), dirs[0])
  const lo = laidLift(p, r), ridge = r * 0.9, G = o.grooves ?? 0
  const strand = (from: THREE.Vector3, to: THREE.Vector3, u: number) => {
    const layer = lo + (G ? ridge * (1 - u * u) : 0) + rnd() * r * 0.25
    const pts: THREE.Vector3[] = []
    for (let k = 0; k <= M; k++) {
      const d = from.clone().lerp(to, k / M).normalize()
      pts.push(onDir(p, d, k === 0 ? -r * 2 : layer, 0.9999).pos)
    }
    out.yarn.push(yarn(pts, r))            // pas de mover : aFree = aFling = 0, immobile
  }
  const groove = (az: number) => {
    if (!G) return 0
    const g = ((((az / (Math.PI * 2)) % 1) + 1) % 1) * G
    return (g - Math.floor(g)) * 2 - 1
  }
  const line = (az: number) => limit(az) + 0.02 - Math.max(0, -Math.cos(az)) ** 3 * 0.18
  for (const az of alongLine(p, line, 0.8 * 2 * r, rnd)) {
    const from = dirOf(az, line(az) + (rnd() - 0.5) * 0.05)
    strand(from, nearest(from), groove(az))
  }
  if (dirs.length === 2 && dirs[0].x * dirs[1].x < 0) {
    const a0 = Math.asin(limit(0))
    const a1 = Math.PI - Math.asin(Math.max(-0.9, limit(Math.PI) - 0.1))
    const n = Math.ceil(((a1 - a0) * p.shape.headRadius * p.shape.headSquash) / (0.8 * 2 * r))
    for (let k = 0; k < n; k++) {
      const ang = a0 + ((k + 0.5) / n) * (a1 - a0)
      const from = new THREE.Vector3(0, Math.sin(ang), Math.cos(ang))
      for (const d of dirs) {
        const start = from.clone().add(new THREE.Vector3(Math.sign(d.x) * 0.02, 0, 0)).normalize()
        strand(start, d, G ? ((((k / n) * G * 0.5) % 1) * 2 - 1) : 0)
      }
    }
  }
}

// ── frange en pointes + mèches latérales (bangs() inchangée) ─────────────
function frontTufts(p: DollParams, rnd: () => number, r: number, out: Parts, o: {
  width: number; edge: number; sideEnd: number; tufts: number; count: number
  root: (az: number) => number   // sy de la racine : la lisière des tirés
  over: number; maxAngle: number
}) {
  const R = p.shape.headRadius
  const first = out.movers.length
  for (let k = 0; k < o.tufts; k++) {
    const ac = (((k + 0.5) / o.tufts) * 2 - 1) * o.width * 0.92
    out.movers.push({ pivot: new THREE.Vector3(),
      dir: new THREE.Vector3(Math.sin(ac) * 0.75, -0.66, Math.cos(ac) * 0.75).normalize(),
      length: R, cfg: { stiffness: 0.025 + rnd() * 0.02, drag: 0.06 + rnd() * 0.05, gravity: 0 },
      maxAngle: o.maxAngle })
  }
  const tuftLen = Array.from({ length: o.tufts }, () => rnd())
  const M = 16, lo = laidLift(p, r)
  for (let i = 0; i < o.count; i++) {
    const u = (i + 0.5) / o.count
    const f = clamp(u * o.tufts + (i % 2 ? 0.5 : 0) - 0.25, 0, o.tufts - 0.001)
    const c = Math.floor(f), w = (f - c) * 2 - 1
    const az = (u * 2 - 1) * o.width
    const tipAz = az + ((((c + 0.5) / o.tufts) * 2 - 1) * o.width * 0.92 - az) * 0.6
    const side = Math.abs(tipAz) / o.width
    const lengthen = (o.edge - o.sideEnd) * (side < 0.72 ? 0 : ((side - 0.72) / 0.28) ** 1.4)
    const tipSy = o.edge + tuftLen[c] * 0.05 + Math.abs(w) ** 1.5 * 0.06 + rnd() * 0.015 - lengthen
    const rootAz = tipAz * 0.8
    const from = dirOf(rootAz, o.root(rootAz))
    const tip = dirOf(tipAz, clamp(tipSy, -0.9, 0.9))
    const layer = lo + r * rnd() * 1.6 + o.over * clamp((side - 0.5) / 0.4, 0, 1)
    const phase = rnd() * 6
    if (from.angleTo(tip) < 0.3) continue           // trop court pour exister
    const pts: THREE.Vector3[] = []
    for (let k = 0; k <= M; k++) {
      const t = k / M
      const d = from.clone().lerp(tip, t).normalize()
      const lift = k === 0 ? -r * 2 : layer + R * 0.04 * Math.max(0, (t - 0.8) / 0.2) ** 2
      pts.push(clearHead(p, onDir(p, d, lift, 0.9999).pos, r * 2))
    }
    out.yarn.push(yarn(pts, r * 1.1, { mover: first + c, free: (t) => t,
      fling: (t) => (side > 0.72 ? 1 : 0.7) * t ** 1.2, phase }))
  }
}

// ── chignon ─────────────────────────────────────────────────────────────
function bun(p: DollParams, rnd: () => number, yarnR: number, out: Parts) {
  const R = p.shape.headRadius
  const two = rnd() < 0.45
  const rb = R * (two ? 0.18 + rnd() * 0.05 : 0.24 + rnd() * 0.08)
  const r = yarnR * 0.9
  // Tous les tirages de variante d'abord, faits dans tous les cas.
  out.ribbonColor = RIBBONS[Math.floor(rnd() * RIBBONS.length)]
  const spikeRoll = rnd(), spikeN = 3 + Math.floor(rnd() * 3), ahogeRoll = rnd()
  const crown = 0.9 + rnd() * 0.05
  const spots = two
    ? [-1, 1].map((sx) => onHeadPolar(p, sx * (Math.PI / 2 - 0.35), 0.62 + rnd() * 0.08, 0))
    : [onHeadPolar(p, Math.PI - (rnd() - 0.5) * 0.6, 0.72 + rnd() * 0.2, 0)]
  const buns = spots.map((s) => s.pos.clone().addScaledVector(s.normal, rb * 0.62))

  for (const [bi, c] of buns.entries()) {
    const axis = spots[bi].normal.clone()
    const m = out.movers.length
    out.movers.push({ pivot: spots[bi].pos.clone(), dir: axis.clone(), length: rb * 1.6,
      cfg: { stiffness: 0.14, drag: 0.22, gravity: 0 }, maxAngle: 0.06 })
    const ball = new THREE.SphereGeometry(rb, 28, 18)
    const uv = ball.attributes.uv as THREE.BufferAttribute
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 16, uv.getY(i) * 11)
    ball.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, axis))
    ball.translate(c.x, c.y, c.z)
    out.yarn.push(still(ball, m, 1, 0))                         // fling 0 : ne s'envole plus
    // Hélice d'enroulement, un yarn par tour (plafond de 48 segments).
    const [ta, tb] = tangentBasis(axis)
    const turns = 6 + Math.floor(rnd() * 4), ph0 = rnd() * Math.PI * 2, per = 16
    const at = (t: number) => {
      const th = Math.PI * (0.78 - 0.74 * t), ph = ph0 + t * turns * Math.PI * 2, rr = rb * 1.02
      return c.clone().addScaledVector(axis, Math.cos(th) * rr)
        .addScaledVector(ta, Math.sin(th) * Math.cos(ph) * rr).addScaledVector(tb, Math.sin(th) * Math.sin(ph) * rr)
    }
    for (let k = 0; k < turns; k++) {
      const pts = Array.from({ length: per + 1 }, (_, j) => at((k + j / per) / turns))
      out.yarn.push(yarn(pts, r * 0.9, { mover: m, free: () => 1, fling: () => 0 }))
    }
    out.ribbon.push(ring(c.clone().addScaledVector(axis, -rb * 0.35), axis, rb * 0.94 + r * 1.2, r * 1.4,
      { mover: m, free: () => 1, fling: () => 0 }))
  }

  const low = NAPE_LOW + rnd() * 0.12
  pulled(p, rnd, r, buns, out, low, { crown, grooves: 16 })

  const eyeOut = Math.asin(clamp((p.face.eyeSpacing * 0.56 +
    Math.max(p.face.leftSize, p.face.rightSize) * EYE_SCALE) / R, 0, 0.95))
  const width = Math.max(1.0, eyeOut + 0.25) + rnd() * 0.12
  frontTufts(p, rnd, r, out, {
    width, tufts: 4 + Math.floor(rnd() * 3), count: Math.round(90 * width) + Math.floor(rnd() * 15),
    edge: hairline(p, 0, 1.25 + rnd() * 0.4)(0), sideEnd: -0.45 - rnd() * 0.3,
    root: hairlineAt(low, crown), over: R * 0.05, maxAngle: 0.25,
  })

  if (!two && spikeRoll < 0.5) {
    const c = buns[0], axis = spots[0].normal
    const [ta, tb] = tangentBasis(axis)
    for (let s = 0; s < spikeN; s++) {
      const ph = (s / spikeN) * Math.PI * 2 + rnd() * 0.6, tilt = 0.95 + rnd() * 0.35
      const dk = axis.clone().multiplyScalar(Math.cos(tilt))
        .addScaledVector(ta, Math.sin(tilt) * Math.cos(ph)).addScaledVector(tb, Math.sin(tilt) * Math.sin(ph))
        .addScaledVector(DOWN, 0.25).normalize()
      const len = rb * (1.3 + rnd() * 0.6), inside = rb / len, k0 = out.movers.length
      out.movers.push({ pivot: c.clone(), dir: dk.clone(), length: len,
        cfg: { stiffness: 0.1 + rnd() * 0.04, drag: 0.08, gravity: 0 }, maxAngle: 0.3 })
      const [sa, sb] = tangentBasis(dk)
      const free = (t: number) => clamp((t - inside) / (1 - inside), 0, 1)
      for (let i = 0; i < 7; i++) {
        const a = rnd() * Math.PI * 2, rad = Math.sqrt(rnd()) * rb * 0.35
        const pts = Array.from({ length: 9 }, (_, k) => {
          const t = k / 8, close = 1 - 0.8 * free(t) ** 1.2
          return clearHead(p, c.clone().addScaledVector(dk, len * t).addScaledVector(DOWN, len * 0.25 * t * t)
            .addScaledVector(sa, Math.cos(a) * rad * close).addScaledVector(sb, Math.sin(a) * rad * close), r * 2)
        })
        out.yarn.push(yarn(pts, r, { mover: k0, free, fling: (t) => 0.5 * free(t), phase: rnd() * 6 }))
      }
    }
  }

  if (ahogeRoll < 0.5) {                                            // en dernier : ne décale rien
    const root = onHeadPolar(p, (rnd() - 0.5) * 0.5, 0.95, 0)
    const fwd = new THREE.Vector3(0, 0, 1).projectOnPlane(root.normal).normalize()
    const L = R * (0.35 + rnd() * 0.2)
    const P = (t: number) => root.pos.clone()
      .addScaledVector(root.normal, L * 0.95 * Math.sin(t * Math.PI * 0.55))
      .addScaledVector(fwd, L * (0.55 * Math.sin(t * Math.PI) - 0.35 * t * t))
    const m = out.movers.length
    out.movers.push({ pivot: root.pos.clone(), dir: P(1).sub(root.pos).normalize(), length: L,
      cfg: { stiffness: 0.16, drag: 0.07, gravity: 0 }, maxAngle: 0.5 })
    for (let i = 0; i < 3; i++) {
      const off = new THREE.Vector3(rnd() - 0.5, 0, rnd() - 0.5).multiplyScalar(r * 2)
      const pts = [root.pos.clone().addScaledVector(root.normal, -r * 2)]
      for (let k = 1; k <= 10; k++) pts.push(P(k / 10).addScaledVector(off, 1 - k / 10))
      out.yarn.push(yarn(pts, r, { mover: m, free: (t) => t, fling: (t) => 0.4 * t, phase: rnd() * 6 }))
    }
  }
}

## risks

- **pulled() est partagé** avec couettes, queue et nattes. Les changements « tenus », « pas d'arc », « relèvement » et « pôle » leur profitent aussi (la queue vue de dessus a le même trou polaire). Ils changent aussi leur consommation de rnd, donc toute leur coiffure bouge d'une graine à l'autre : c'est acceptable, rnd est propre à la coiffure (seed + 5303) et le reste de la poupée n'en dépend pas. `crown` et `grooves` sont optionnels et gardent le comportement actuel par défaut. À coordonner avec les propositions faites pour ces coupes.
- **CLAUDE.md à réécrire**. Trois passages contredisent la demande de l'utilisateur : « Toutes les coupes ont une physique… cheveux tirés (léger mouvement, retenu) », « 0,5 pour les cheveux tirés », et le commentaire de bun() (« Pas de physique : un chignon est serré », déjà faux). La nouvelle règle : ce qui est tiré est tenu, seules les parties libres bougent. Il faut aussi noter le bug still(…, 1), qui fixait aFling = 1, et le disque nu au pôle dû à la borne 0,98.
- **Pas de « base »**. Le surplus de brins et les sillons sont les mêmes cheveux tirés, dans le même sens. Ne pas les présenter ni les coder comme une sous-couche distincte (rejetée). Le relèvement porté au-dessus du duvet (≈ 0,014, sommet à 0,025) épaissit un peu la calotte : à vérifier à l'écran, de profil, qu'elle ne lit pas comme un casque. Si c'est le cas, baisser le sillon à 0,6 r plutôt que le relèvement.
- **Frange contre boutons**. Le bord suit hairline(…, 1,25-1,65), toujours au-dessus des boutons. Pendant un geste de tangage (roulade, écrasement), un pivot au centre fait descendre la frange de maxAngle × R = 0,25 × 0,43 ≈ 0,11. C'est moins que bangs (0,42), mais à contrôler dans l'arène. Les mèches latérales sont écartées des boutons par eyeOut + 0,25, calculé sur les réglages du panneau. L'écartement réel des yeux est tiré dans Doll.tsx (±12 %) et Hairdo ne le connaît pas : le 0,56 prend la borne haute.
- **Mèches latérales contre bajoues**. Elles passent par clearHead (marge 2r). Tournant autour du centre, elles changent peu de rayon (≈ 0,007 entre az 1,0 et 1,3 à la hauteur des bajoues) : pas de pénétration attendue, à vérifier aux archétypes dodus (bajoues jusqu'à +0,13).
- **Hélice** : un yarn par tour, sinon le plafond clamp(…, 6, 48) de yarn() la facette. Les pointes de chignon partent vers le bas et l'arrière : clearHead à chaque point, et leur ressort est confronté au crâne (bout hors de la sphère 0,97 R).
- **Tirages conditionnels** : tous les rolls de variante sont faits en tête. L'épi est placé en dernier, donc ses tirages internes ne décalent rien.
- **Répétition entre coupes** : si les autres coupes à cheveux tirés reçoivent aussi une frange, la planche montrera quatre fois le même front. Proposer des fronts distincts : chignon = pointes courtes + mèches latérales ; queue = frange de côté ; couettes = frange en M.
- **Coût** : 300 à 430 brins, au plus un peu moins de 100 k triangles, 2 appels de rendu, ≤ 14 ressorts. Aucun changement de shader, seulement des attributs : pas besoin de purger le cache 'hairdo', mais un rechargement complet reste prudent après modification.
- **Vérification** : rejouer le calcul du shader par zone (tirés = 0 attendu), mesurer la couverture en projection comme ci-dessus (≥ 97 %), et prendre deux captures (panneau masqué = une image par capture).

