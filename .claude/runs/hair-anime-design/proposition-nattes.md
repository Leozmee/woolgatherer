# Proposition — nattes

## cut

nattes — braids() + pulled() (src/doll/hairstyles.tsx, l. 384-443 et 1018-1073)

## diagnosis

Mesures faites en lecture seule, avec une réplique des formules (onHeadPolar réel) : échantillonnage de Fibonacci du cuir chevelu au-dessus de la lisière, projection radiale des lignes centrales des brins. Un point est « nu » s'il est à plus de r de tout brin. Paramètres : défauts du panneau et bajoues de la morpho.

**Échelle.** Le fil des coupes vient de p.hair.thickness, la valeur du panneau. Le calibre par poupée de hairLook ne s'applique qu'aux locks. Le fil tiré vaut donc r = 0,9·yarnR = 0,879·thickness·R, soit 0,0113 (Ø 0,0227) à R = 0,43 et thickness 0,03. La natte fait rb = yarnR·(3,2 à 4,2), soit 0,040 à 0,053.

**1. Physique.**
- **Les cheveux tirés bougent presque autant que la natte.** pulled() crée 6 ressorts de secteur : raideur 0,05, débattement 0,14, mobilité aFree 0,5 à la racine et 1 à l'attache, écartement 0,25·t.
  - À l'attache (≈ 0,45 du centre), le déplacement atteint 0,14 × 0,45 ≈ 0,063, plus 0,056 d'écartement à pleine rotation.
  - Le bout de la natte bouge de 0,6 × hang, soit 0,07 à 0,16 (hang = R·0,25 à 0,6).
  - Les cheveux censés être tenus bougent donc de **40 à 90 % du bout de la queue**.
- **Les brins se détachent de la natte.** La partie de la natte posée sur le crâne a aFree = 0, donc elle reste fixe. Les brins tirés qui convergent sur elle bougent jusqu'à 0,06 à 0,12 : ils se décollent de sa racine.
- **Ressorts de secteur.** Deux brins voisins pris dans deux secteurs différents divergent à l'attache.

**2. Densité.**
- Mesuré : **19 % du cuir chevelu est nu**. Par zone : dessus 17 %, côtés 23 %, arrière 14 %, bande de la raie 39 %. À thickness 0,024 on monte à 28 %.
- **Lisière.** 120 brins répartis en azimut, pas en longueur d'arc. Le tour mesure 3,27, d'où un pas de 0,0272 pour un Ø de 0,0227 : recouvrement de 83 %.
- **Raie.** 34 brins par côté sur 1,145, d'où un pas de 0,0337 et un recouvrement de 67 %. Ces brins divergent ensuite : les bandes de crâne visibles de dessus viennent de là.
- **Épi chauve au sommet.** onDir borne d.y à ±0,98 : toute racine de raie plus près du pôle est rejetée sur l'anneau sy = 0,98, à 0,2 rad (≈ 0,086) du pôle. Sans cette borne, l'écart maximal passe de 0,059 à 0,034.
- **Pâté à l'attache.** Les brins finissent tous au même point, sans arrêt sous un lien.
- **Brins noyés dans le duvet.** Les coques du crâne montent à 0,02. Avec une couche de 0,6r à 1,7r, les brins les plus bas culminent à 0,018, donc sous la pointe des fibres.

**3. Style.**
- **Front très dégarni.** La lisière avant est à sy 0,85 (hairline plafonné) : front nu jusqu'à 32° du pôle, cheveux plaqués en arrière.
- **Pas de frange, de mèches latérales ni d'épi.**
- **Natte en saucisse.** C'est un tube unique de rayon constant avec la texture des locks : aucun lobe dans la silhouette, donc rien que l'encre puisse dessiner. Elle est collée au crâne de sy0 (0,15 à 0,35) jusqu'à sy −0,75, puis ne pend que de 0,11 à 0,26.
- **Pointe effilée dans un anneau vide.** yarn() referme le dernier cinquième en cône, alors que le ruban (rayon 1,05·rb) est posé exactement à la pointe : il flotte autour d'un cône.
- **Pompon en balai.** 9 brins droits en éventail, sans pointe.

## physics

**Principe.** Ce qui est tiré ou noué ne bouge pas. Ce qui pend ou est libre bouge, avec une mobilité nulle à la jonction pour qu'aucun raccord ne se déchire.

**Cheveux tirés : immobiles.**
- aMover −1, aFree 0, aFling 0.
- Suppression de sectorMovers dans pulled(), ce qui libère 6 ressorts.
- Le chemin aFree = 0 existe déjà dans le shader : aucun shader à changer.

**Lien du haut de la natte.** Immobile, même traitement que les cheveux tirés.

**Natte.**
- Un ressort par natte. Pivot au point où elle quitte le crâne : axisAt(W·0,6), à 1,2·W décollé sur la normale.
- Repos vertical, conformément à « repos pendant = verticale ».
- Longueur du ressort = longueur de la natte.
- Réglages :
  - raideur 0,03 + rnd·0,015 (les deux nattes se désynchronisent) ;
  - amortissement 0,14 + rnd·0,04 ;
  - gravité 1,4 (cohérente avec le repos vertical) ;
  - débattement 0,4 (contre 0,6 aujourd'hui, la natte est plus longue).
- Mobilité free(t) = t^1,25 : nulle au lien, donc continue avec les cheveux tenus. Le fouetté est concentré vers le bas.
- Écartement 0,8·t : à 5 rad/s, les deux nattes s'ouvrent de ≈ 0,2 (effet « twin tails »).
- Collider du crâne actif, puisque la pose de repos est hors de la sphère : |bout| ≈ 0,6 > 0,97R.

**Lien du bas, nœud et pinceau.** Sur le ressort de la natte, à mobilité constante free(0,93) ≈ 0,91 : ils tournent autour du même pivot du même angle que la natte à cet endroit, donc restent solidaires. Le pinceau passe de 0,91 à 1 sur sa longueur, avec un écartement de 0,8.

**Frange.**
- 4 ou 5 ressorts, pivot au centre, bout orienté vers la mèche, sans gravité.
- Raideur 0,03 + rnd·0,02, amortissement 0,08 + rnd·0,04, débattement 0,2.
- free = 0,1 + 0,9·t^1,2 : racine quasi tenue, puisqu'elle repose sur des cheveux immobiles et ne doit pas y glisser.
- fling = 0,8·t^1,3.
- Pas de collider (pivot au centre).
- Glissement maximal ≈ 0,2 × 0,43 = 0,086, inférieur à l'écart d'environ 0,09 entre le bord de frange et le haut des boutons au réglage par défaut.

**Mèches latérales.** 2 ressorts, pivot au centre, raideur 0,03 + rnd·0,015, amortissement 0,08 + rnd·0,04, gravité 0, débattement 0,3. free = 0,1 + 0,9·t^1,2, fling = 0,9·t^1,3.

**Épi (ahoge).**
- 1 ressort, pivot à la racine, dir = (pointe − racine) normalisé.
- Raideur 0,14, amortissement 0,07, gravité 0 (à la manière de « trois poils » : il rebondit), débattement 0,5.
- free = t^1,1, fling = t. Collider actif, ce qui l'empêche de basculer dans le crâne.
- Situé près de l'axe, il réagit surtout aux pas, aux sauts et aux inclinaisons, peu à la rotation pure. C'est voulu.

**Ressorts à retirer.** Les 6 secteurs de pulled().
**Ressorts à garder.** Un par natte.
**Total.** 9 à 11 ressorts sur MAX_MOVERS = 32.

Aucun mouvement au repos : tous les ressorts sont sans souffle, et la gravité n'agit que sur les nattes, dont le repos est vertical.

## density

**Principe.** Répartir les racines **uniformément en longueur d'arc** sur le bord fermé de chaque zone. Pour deux attaches de part et d'autre, chaque moitié a pour bord la raie (du front à la nuque) puis la demi-lisière (de la nuque au front). Pour une seule attache, le bord est la lisière entière. Chaque brin va de sa racine à l'attache de sa zone par le grand cercle. Le domaine est étoilé autour de l'attache : les brins convergent, donc l'écart maximal est **à la racine**, et il suffit de le tenir là.

**Formule du compte.**
- n_zone = ceil(B / (1,8·r)), où B est la longueur du bord, intégrée dans le code (angleTo × R).
- Pour les nattes, B ≈ 6,3·R : mesuré 2,69 à 2,76 à R = 0,43 selon la hauteur de nuque.
- Avec r = 0,879·thickness·R, on obtient **n_zone ≈ 4,0 / thickness**, indépendant de R.
- Effectifs :

| thickness | par moitié | total | aujourd'hui |
|---|---|---|---|
| 0,03 (défaut) | 133 | 266 | 188 |
| 0,024 | 170 | 340 | 188 |
| 0,0405 | 101 | 202 | 188 |

**Deux couches alternées (i % 2)**, décalées d'un demi-pas, car la racine est tirée au milieu de son intervalle avec ±15 % de jitter.
- Base : base = max(0,8r, shell.height − 0,9r), soit ≈ 0,0098 : le sommet du fil du dessous dépasse la pointe des fibres du duvet (0,02).
- Couche du dessous : base·(1 + 0,2·rnd).
- Couche du dessus : base + r·(0,9 + 0,3·rnd), soit un sommet à 0,031–0,035, la même enveloppe qu'aujourd'hui (0,03).

**Autres corrections.**
- Bornes du pôle relâchées à ±0,999, pour pulled uniquement, via un paramètre `cap` d'onDir.
- Brins arrêtés à `tuck` = 0,8·W de l'attache, dernier point enfoncé de 0,5r : ils rentrent sous le lien au lieu de s'empiler en étoile.

**Couverture mesurée (projection radiale), pour le pas 1,8r et une attache à ±2,12 rad / sy0 0,1.** Nu total 0,1 à 0,4 %, bande de raie 0,5 à 2,3 %, écart p99 = 0, sur R 0,38 à 0,48, thickness 0,024 à 0,0405, nuque −0,48 ou −0,36. Aujourd'hui : 19 à 28 %.

**Courbe pas → crâne nu (thickness 0,03).**

| pas | brins | nu |
|---|---|---|
| 1,6r | 302 | 0,0 % |
| 2,0r | 242 | 0,8 % |
| 2,4r | 202 | 3,4 % |
| 2,88r | 168 | 10 % |

1,8r est le coude.

**Gisements de brins.**
- Sans la correction du pôle, même avec 302 brins, la raie reste nue à 16 % : c'est la borne 0,98 qui fait le trou.
- Option : grossir le fil tiré (×1,15) réduit le compte d'autant, à 115 par moitié.

**Pas de sous-couche.** Ce sont les cheveux tirés eux-mêmes qui couvrent. La frange et les mèches latérales, visibles, se posent **par-dessus**. Les ≈ 20 brins tirés restés sous la frange assurent qu'il n'y a pas de trou à ses bords.

## anime

**Silhouette cible.** Écolière d'anime à nattes basses : frange en pointes, deux mèches latérales qui encadrent le visage, un épi, raie nette sur le dessus, deux nattes à lobes marqués qui pendent derrière les épaules, lien avec nœud de ruban, pinceau pointu au bout.

**1. Frange.** On reprend la brique de la grande frange (extraite en fringeTufts, sans rien changer pour bangs()).
- Plus étroite : width 0,85 à 1,05 rad, contre 1,2 à 1,45.
- Plus courte : edge = hairline(p, 0, 1,35 + rnd·0,4)(0), soit sy ≈ 0,5 à 0,6, au-dessus des sourcils (contre 1,02 pour la grande frange).
- 4 ou 5 mèches, deux rangées décalées, pointes.
- Les mèches des tempes s'allongent jusqu'à edge − 0,3 : bord en M.
- Brins de r·1,1. Couche posée au-dessus des cheveux tirés : over = sommet de la couche du dessus.
- Compte proportionnel à la largeur : (95 + rnd·20) × width / 1,33, soit ≈ 60 à 85 brins.

**2. Mèches latérales (×2).**
- Parties de la raie comme la frange, à l'azimut ±(width + 0,12), soit ≈ ±1,0 à 1,2 rad, devant l'oreille.
- Descendent jusqu'à la mâchoire : endSy −0,42 à −0,57.
- 14 brins r·1,1, gonflement de 0,035R au milieu, bords plus courts (+|u|^1,4·0,14).
- Refermées à 75 % sur leur dernier 40 % : pointe nette.
- Pointe rentrée vers la joue (tipAz = az − sx·0,1, façon « hime »).
- Règle rMax sous l'équateur : elles passent par-dessus les bajoues au lieu d'y entrer.

**3. Épi (ahoge).** 65 % des poupées, tirages faits dans tous les cas.
- 4 brins r·1,15 partis juste derrière le pôle, derrière les racines de frange.
- Hauteur 0,26 à 0,40·R.
- Tracé : normale·H(1,3t − 0,6t²) + avant·0,6H·t^1,6, donc monte puis se courbe en crochet vers l'avant.
- Brins serrés jusqu'à se fondre en une pointe.

**4. Raie nette.** Racines à ±0,02 du méridien, qui se recouvrent (r > 0,0086) : on ne voit pas de crâne. La raie se lit au chevron des directions et au trait d'encre, pas à une bande beige.

**5. Natte à trois brins.**
- Chaque brin décrit un huit : latéral A·sin θ, profondeur B·sin 2θ, déphasage 2π/3.
- Rayon de brin rs = 0,52W, A = W − rs, B = rs.
- Aux croisements, les brins sont séparés de 2B·sin(π/3) = 1,73rs, avec 13 % d'interpénétration : laine tassée.
- Période P = 4,2W, soit trois lobes par face, chacun long d'environ 1,4W.
- Demi-largeur W = yarnR·(3,4 + rnd·1,0), soit 0,043 à 0,055.
- Largeur resserrée à 70 % sous le lien du haut, pleine au milieu, rentrée de 30 % sur le dernier cinquième : la natte se pince dans l'élastique.
- Les lobes alternés gauche/droite créent des sauts de profondeur que la passe d'encre dessine (critère de dérivée seconde). C'est ce qui fera lire « natte d'anime » plutôt que « locks ».
- Fil retors sur les brins, pas la texture de tresse (une tresse de tresses serait illisible). Tout passe dans out.yarn : le mesh `braid` disparaît, un appel de rendu de moins.

**6. Attache basse, derrière l'oreille.**
- az0 = π/2 + 0,5 à 0,62 (2,07 à 2,19 rad), sy0 = 0 à 0,2.
- La natte se décolle du crâne de 1,2W sur la normale, puis tombe à la verticale, repoussée hors des bajoues point par point (clearHead, marge 1,15W). Elle ne reste plus collée à la tête jusqu'à la mâchoire.
- Longueur déduite des bras : le corps de la natte s'arrête au-dessus du haut des sphères d'avant-bras (armSpheres ramenées dans le repère de la tête), × (0,85 + rnd·0,15), soit ≈ 1,05 à 1,25R. Le pinceau descend sous ce niveau.
- Dégagement au repos mesuré : ≥ 0,08 à az 2,07, ≥ 0,12 à 2,17, sur 0,6 sous le lien.

**7. Liens et nœud.**
- Lien du haut : anneau ribbon W·0,78 + 1,2r, qui cache la convergence des cheveux tirés.
- Lien du bas à 93 % de la longueur, rayon W·0,62 + 1,2r : serré sur la partie pincée, et non plus autour d'un cône vide.
- Nœud de ruban dans 60 % des cas : deux boucles en pétale plus deux pans. Tubes de r·1,1 écrasés ×2,4 selon la radiale (makeBasis S, UP, radiale), pour lire comme un ruban et non une ficelle.

**8. Pinceau (pointe effilée).**
- 15 brins r en trois sous-mèches.
- Longueur W·(2,4 à 3,4), chaque sous-mèche ±15 %.
- Évasement en sin(π·t·1,3)·0,35W, puis convergence sur la seconde moitié vers trois pointes à 0,4W de l'axe.
- Remplace le pompon.

**Variété d'une graine à l'autre.** Largeur et nombre de mèches de frange, hauteur de bord, longueur des mèches latérales, présence de l'épi, hauteur et recul de l'attache, grosseur et longueur de la natte, nœud ou simple lien, teinte du ruban.

## codeSketch

// ---- imports en plus
import { onHeadPolar, armSpheres } from './surface'
import { dollLayout } from './layout'
const smooth = (x: number) => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t) }

// ---- yarn : pas d'anneaux réglable (brins épais de la natte : un anneau tous les 0,8 rayon)
type YarnOpts = { /* …existant… */ step?: number }
// dans yarn() :
const segs = clamp(Math.ceil(len / (radius * (o.step ?? 3))), 6, o.step !== undefined ? 128 : 48)

// ---- onDir : borne du pôle en paramètre (0,98 par défaut → grande frange inchangée)
function onDir(p: DollParams, d: THREE.Vector3, lift: number, cap = 0.98) {
  return onHeadPolar(p, Math.atan2(d.x, d.z), clamp(d.y, -cap, cap), lift)
}

/**
 * Cheveux tirés : TENUS (aucun ressort), racines uniformes en longueur d'arc sur le
 * bord de chaque zone, deux couches alternées au-dessus des fibres du duvet.
 * n = ceil(B / (spacing·r)) ; à 1,8r le cuir chevelu est couvert à 99,6 %.
 */
function pulled(
  p: DollParams, rnd: () => number, r: number, targets: THREE.Vector3[], out: Parts, low: number,
  o: { spacing?: number; tuck?: number } = {},
) {
  const R = p.shape.headRadius
  const limit = hairline(p, low)
  const dirs = targets.map((t) => t.clone().normalize())
  const nearest = (from: THREE.Vector3) => dirs.reduce((a, d) => (d.dot(from) > a.dot(from) ? d : a))
  const rim = (az: number) => dirOf(az, limit(az) + 0.02 - Math.max(0, -Math.cos(az)) ** 3 * 0.18)
  const split = dirs.length === 2 && dirs[0].x * dirs[1].x < 0
  const a0 = Math.asin(limit(0))
  const a1 = Math.PI - Math.asin(Math.max(-0.9, limit(Math.PI) - 0.1))
  const zones: { to: THREE.Vector3 | null; line: THREE.Vector3[] }[] = split
    ? dirs.map((to) => {
        const s = Math.sign(to.x)
        const part = Array.from({ length: 61 }, (_, k) => {
          const a = a0 + ((a1 - a0) * k) / 60
          return new THREE.Vector3(s * 0.02, Math.sin(a), Math.cos(a)).normalize()
        })
        const edge = Array.from({ length: 89 }, (_, k) => rim(s * (Math.PI - (Math.PI * (k + 1)) / 90)))
        return { to, line: [...part, ...edge] }
      })
    : [{ to: dirs.length === 1 ? dirs[0] : null, line: Array.from({ length: 181 }, (_, k) => rim((k / 180) * Math.PI * 2)) }]
  // Sommet du fil du dessous au-dessus de la pointe des fibres (shell.height).
  const base = Math.max(r * 0.8, p.shell.height - r * 0.9)
  const stop = (o.tuck ?? 0) / R
  for (const z of zones) {
    const cum = [0]
    for (let i = 1; i < z.line.length; i++) cum.push(cum[i - 1] + z.line[i].angleTo(z.line[i - 1]) * R)
    const B = cum[cum.length - 1]
    const n = Math.ceil(B / ((o.spacing ?? 1.8) * r))
    for (let i = 0; i < n; i++) {
      const at = ((i + 0.5 + (rnd() - 0.5) * 0.3) / n) * B
      let j = 1
      while (j < cum.length - 1 && cum[j] < at) j++
      const from = z.line[j - 1].clone().lerp(z.line[j], (at - cum[j - 1]) / (cum[j] - cum[j - 1])).normalize()
      const to = z.to ?? nearest(from)
      const layer = i % 2 ? base + r * (0.9 + rnd() * 0.3) : base * (1 + rnd() * 0.2)
      const ang = from.angleTo(to)
      const reach = Math.max(0.2, 1 - stop / Math.max(ang, 1e-3))
      const M = clamp(Math.ceil(ang / 0.08), 6, 24)
      const pts: THREE.Vector3[] = []
      for (let k = 0; k <= M; k++) {
        const d = from.clone().lerp(to, (k / M) * reach).normalize()
        const lift = k === 0 ? -r * 2 : k === M && stop > 0 ? -r * 0.5 : layer
        pts.push(onDir(p, d, lift, 0.999).pos)
      }
      out.yarn.push(yarn(pts, r)) // mover −1, aFree 0, aFling 0 : tenus
    }
  }
}

/**
 * Frange en mèches pointues, extraite TELLE QUELLE de bangs() (l. 1166-1272) :
 * même ordre de tirages. bangs() l'appelle avec
 *   { width, tufts, edge, sideTo: longEnd, over: (s) => FRINGE_OVER * R * clamp((s - 0.35) / 0.5, 0, 1),
 *     count: () => 110 + Math.floor(rnd() * 20), radius: r * 1.15,
 *     cfg: () => ({ stiffness: 0.018 + rnd() * 0.02, drag: 0.05 + rnd() * 0.05, gravity: 0 }),
 *     maxAngle: 0.42, free: (t) => 0.4 + 0.6 * t, fling: (t) => t }
 * Ordre à respecter : ressorts (cfg), rnd() « toujours effilée », count(), tuftLen, puis la boucle
 * (tipSy, from, layer, phase).
 */
function fringeTufts(p: DollParams, rnd: () => number, r: number, out: Parts, o: {
  width: number; tufts: number; edge: number; sideTo: number
  over: (side: number) => number; count: () => number; radius: number
  cfg: () => SpringConfig; maxAngle: number
  free: (t: number) => number; fling: (t: number) => number
}): void { /* corps de bangs() l. 1179-1272, longEnd → o.sideTo, r*1.15 → o.radius */ }

/** Mèche latérale : de la raie à la mâchoire, devant l'oreille, pointe rentrée vers la joue. */
function sideLock(p: DollParams, rnd: () => number, r: number, out: Parts,
  sx: 1 | -1, az: number, endSy: number, lay: number) {
  const R = p.shape.headRadius
  const m = out.movers.length
  out.movers.push({
    pivot: new THREE.Vector3(),
    dir: new THREE.Vector3(Math.sin(az) * 0.75, -0.66, Math.cos(az) * 0.75).normalize(),
    length: R,
    cfg: { stiffness: 0.03 + rnd() * 0.015, drag: 0.08 + rnd() * 0.04, gravity: 0 },
    maxAngle: 0.3,
  })
  const n = 14, M = 18, span = 0.24, tipAz = az - sx * 0.1
  for (let i = 0; i < n; i++) {
    const u = ((i + 0.5) / n) * 2 - 1
    const a0 = az + u * span * 0.5
    const from = new THREE.Vector3(sx * 0.03, 1, Math.cos(a0) * 0.55 - 0.12 + (rnd() - 0.5) * 0.06).normalize()
    const tip = dirOf(a0, clamp(endSy + Math.abs(u) ** 1.4 * 0.14 + rnd() * 0.02, -0.9, 0.9))
    const layer = lay + r * (0.4 + rnd() * 0.8)
    const phase = rnd() * 6
    let rMax = 0
    const pts: THREE.Vector3[] = []
    for (let k = 0; k <= M; k++) {
      const t = k / M
      const d = from.clone().lerp(tip, t).normalize()
      const close = 0.75 * clamp((t - 0.6) / 0.4, 0, 1) ** 1.5
      const a = Math.atan2(d.x, d.z) + (tipAz - a0) * close
      const sy = clamp(d.y, -0.98, 0.999)
      const s = onHeadPolar(p, a, sy, k === 0 ? -r * 2 : layer + R * 0.035 * Math.sin(Math.PI * t))
      const h = Math.hypot(s.pos.x, s.pos.z)
      if (sy < 0 && h < rMax) { s.pos.x *= rMax / h; s.pos.z *= rMax / h }
      rMax = Math.max(rMax, Math.hypot(s.pos.x, s.pos.z))
      pts.push(s.pos)
    }
    out.yarn.push(yarn(pts, r, { mover: m, free: (t) => 0.1 + 0.9 * t ** 1.2, fling: (t) => 0.9 * t ** 1.3, phase }))
  }
}

/** Épi : jaillit derrière le pôle, se courbe en crochet vers l'avant. Tirages faits dans tous les cas. */
function ahoge(p: DollParams, rnd: () => number, r: number, out: Parts) {
  const R = p.shape.headRadius
  const has = rnd() < 0.65
  const root = onDir(p, new THREE.Vector3((rnd() - 0.5) * 0.06, 1, -0.08 - rnd() * 0.1).normalize(), 0, 0.999)
  const H = R * (0.26 + rnd() * 0.14)
  const lean = (rnd() - 0.5) * 0.6
  const fwd = new THREE.Vector3(Math.sin(lean), 0, Math.cos(lean))
  const side = new THREE.Vector3().crossVectors(UP, fwd).normalize()
  const at = (t: number) => root.pos.clone()
    .addScaledVector(root.normal, H * (1.3 * t - 0.6 * t * t))
    .addScaledVector(fwd, H * 0.6 * t ** 1.6)
  const phases = [0, 1, 2, 3].map(() => rnd() * 6)
  if (!has) return
  const tip = at(1)
  const m = out.movers.length
  out.movers.push({ pivot: root.pos.clone(), dir: tip.clone().sub(root.pos).normalize(),
    length: tip.distanceTo(root.pos), cfg: { stiffness: 0.14, drag: 0.07, gravity: 0 }, maxAngle: 0.5 })
  phases.forEach((phase, i) => {
    const u = ((i + 0.5) / 4) * 2 - 1
    const pts = Array.from({ length: 13 }, (_, k) => {
      const t = k / 12
      const q = at(t).addScaledVector(side, u * r * 1.8 * (1 - t) ** 1.2)
      return k === 0 ? q.addScaledVector(root.normal, -r * 2) : q
    })
    out.yarn.push(yarn(pts, r, { mover: m, free: (t) => t ** 1.1, fling: (t) => t, phase }))
  })
}

/**
 * Natte à trois brins : huit décalé d'un tiers de période. Latéral A·sin θ,
 * profondeur B·sin 2θ ; aux croisements, écart 2B·sin(π/3) = 1,73 rs.
 * Lobes alternés dans la silhouette → l'encre les dessine.
 */
function plait(axisAt: (s: number) => THREE.Vector3, len: number, S0: THREE.Vector3, W: number, o: YarnOpts) {
  const rs = W * 0.52, A = W - rs, B = rs, P = W * 4.2
  const N = Math.ceil(len / (W * 0.3))
  const T = new THREE.Vector3(), S = new THREE.Vector3(), D = new THREE.Vector3()
  return [0, 1, 2].map((j) => {
    const pts: THREE.Vector3[] = []
    for (let k = 0; k <= N; k++) {
      const s = (k / N) * len
      const c = axisAt(s)
      T.copy(axisAt(Math.min(len, s + W * 0.2))).sub(axisAt(Math.max(0, s - W * 0.2))).normalize()
      S.copy(S0).addScaledVector(T, -S0.dot(T)).normalize()
      D.crossVectors(T, S)
      const w = (0.7 + 0.3 * smooth(s / (W * 3))) * (1 - 0.3 * smooth((s / len - 0.8) / 0.2))
      const th = (s / P) * Math.PI * 2 + (j * Math.PI * 2) / 3
      pts.push(c.addScaledVector(S, A * w * Math.sin(th)).addScaledVector(D, B * w * Math.sin(2 * th)))
    }
    return yarn(pts, rs, { ...o, step: 0.8, phase: (o.phase ?? 0) + j })
  })
}

/** Nœud : deux boucles en pétale + deux pans, tracés dans (S, U) puis écrasés ×2,4 sur D. */
function bow(c: THREE.Vector3, S: THREE.Vector3, U: THREE.Vector3, D: THREE.Vector3,
  size: number, thread: number, o: YarnOpts): THREE.BufferGeometry[] {
  const place = new THREE.Matrix4().makeBasis(S, U, D).setPosition(c)
    .multiply(new THREE.Matrix4().makeScale(1, 1, 2.4))
  const out: THREE.BufferGeometry[] = []
  for (const sx of [-1, 1]) {
    const loop = Array.from({ length: 13 }, (_, k) => {
      const f = -0.6 + (1.2 * k) / 12 // angle autour du nœud
      const rho = size * Math.cos((f * Math.PI) / 1.2)
      return new THREE.Vector3(sx * rho * Math.cos(f + 0.3), rho * Math.sin(f + 0.3), 0)
    })
    const tailPts = [0, 0.5, 1].map((t) => new THREE.Vector3(sx * size * 0.35 * t, -size * 1.1 * t, 0))
    out.push(yarn(loop, thread, o).applyMatrix4(place), yarn(tailPts, thread, o).applyMatrix4(place))
  }
  return out
}

/** Pinceau sous le lien : s'évase puis se referme en trois pointes. */
function tail(rnd: () => number, r: number, out: Parts, knot: THREE.Vector3, S: THREE.Vector3,
  D: THREE.Vector3, W: number, m: number, f0: number) {
  const Lt = W * (2.4 + rnd() * 1.0)
  const tipLen = [0, 1, 2].map(() => 0.85 + rnd() * 0.3)
  for (let i = 0; i < 15; i++) {
    const c = i % 3
    const phi = (i / 15) * Math.PI * 2 + rnd() * 0.3
    const rad = W * 0.5 * Math.sqrt(rnd())
    const a = (c * Math.PI * 2) / 3 + 0.4
    const tipOff = S.clone().multiplyScalar(Math.cos(a) * W * 0.4).addScaledVector(D, Math.sin(a) * W * 0.4)
    const pts = Array.from({ length: 9 }, (_, k) => {
      const t = k / 8
      const b = rad + W * 0.35 * Math.sin(Math.PI * Math.min(1, t * 1.3))
      const off = S.clone().multiplyScalar(Math.cos(phi) * b).addScaledVector(D, Math.sin(phi) * b)
        .lerp(tipOff, clamp((t - 0.5) / 0.5, 0, 1) ** 1.3)
      return knot.clone().addScaledVector(DOWN, Lt * tipLen[c] * t).add(off)
    })
    out.yarn.push(yarn(pts, r, { mover: m, free: (t) => f0 + (1 - f0) * t, fling: () => 0.8, phase: rnd() * 6 }))
  }
}

function braids(p: DollParams, rnd: () => number, yarnR: number, out: Parts) {
  const R = p.shape.headRadius
  const r = yarnR * 0.9
  const W = yarnR * (3.4 + rnd() * 1.0)
  const az0 = Math.PI / 2 + 0.5 + rnd() * 0.12 // ≥ 2,07 rad : les bras passent devant
  const sy0 = rnd() * 0.2
  out.ribbonColor = RIBBONS[Math.floor(rnd() * RIBBONS.length)]
  const ties = [-1, 1].map((sx) => onHeadPolar(p, sx * az0, sy0, 0))
  pulled(p, rnd, r, ties.map((t) => t.pos), out, NAPE_LOW + rnd() * 0.12, { tuck: W * 0.8 })
  const top = Math.max(r * 0.8, p.shell.height - r * 0.9) + r * 2.2 // dessus de la couche tirée

  const width = 0.85 + rnd() * 0.2
  const tufts = 4 + Math.floor(rnd() * 2)
  const edge = hairline(p, 0, 1.35 + rnd() * 0.4)(0)
  fringeTufts(p, rnd, r, out, {
    width, tufts, edge, sideTo: edge - 0.3, over: () => top, radius: r * 1.1,
    count: () => Math.round(((95 + rnd() * 20) * width) / 1.33),
    cfg: () => ({ stiffness: 0.03 + rnd() * 0.02, drag: 0.08 + rnd() * 0.04, gravity: 0 }),
    maxAngle: 0.2, free: (t) => 0.1 + 0.9 * t ** 1.2, fling: (t) => 0.8 * t ** 1.3,
  })
  const sideEnd = -0.42 - rnd() * 0.15
  for (const sx of [-1, 1] as const) sideLock(p, rnd, r * 1.1, out, sx, sx * (width + 0.12), sideEnd, top)
  ahoge(p, rnd, r * 1.15, out)

  // Longueur déduite des bras (repère du cou → repère de la tête).
  const arms = armSpheres(p, 0, -dollLayout(p).headY).filter((s) => s.center.x > 0).slice(1)
  const armTop = Math.max(...arms.map((s) => s.center.y + s.radius))
  ties.forEach((tie, n) => {
    const radial = new THREE.Vector3(tie.normal.x, 0, tie.normal.z).normalize()
    const S0 = new THREE.Vector3().crossVectors(UP, radial).normalize()
    const axisAt = (s: number) => clearHead(p, tie.pos.clone()
      .addScaledVector(tie.normal, W * 1.2 * smooth(s / (W * 2.5)))
      .addScaledVector(DOWN, Math.max(0, s - W * 0.6)), W * 1.15)
    const L = Math.max(W * 6, (tie.pos.y - armTop) * (0.85 + rnd() * 0.15))
    const m = out.movers.length
    out.movers.push({ pivot: axisAt(W * 0.6), dir: DOWN.clone(), length: L,
      cfg: { stiffness: 0.03 + rnd() * 0.015, drag: 0.14 + rnd() * 0.04, gravity: 1.4 }, maxAngle: 0.4 })
    const free = (t: number) => t ** 1.25
    out.yarn.push(...plait(axisAt, L, S0, W, { mover: m, free, fling: (t) => 0.8 * t, phase: n * 3 }))
    const tan = (s: number) => axisAt(s + W * 0.3).sub(axisAt(Math.max(0, s - W * 0.3))).normalize()
    out.ribbon.push(ring(axisAt(W * 0.6), tan(W * 0.6), W * 0.78 + r * 1.2, r * 1.3)) // tenu
    const tk = 0.93, fk = free(tk), knot = axisAt(L * tk)
    const tied: YarnOpts = { mover: m, free: () => fk, fling: () => 0.8 * tk }
    out.ribbon.push(ring(knot, tan(L * tk), W * 0.62 + r * 1.2, r * 1.3, tied))
    const hasBow = rnd() < 0.6
    const size = W * (1.1 + rnd() * 0.4)
    if (hasBow) out.ribbon.push(...bow(knot, S0, UP, radial, size, r * 1.1, tied))
    tail(rnd, r, out, knot, S0, radial, W, m, fk)
  })
}

## risks

**pulled() est partagé** avec couettes, queue de cheval et chignon.
- La refonte (tenue, densité, bord uniforme, pôle) leur profite aussi et il faut la mener une seule fois, avec les autres agents.
- Supprimer sectorMovers décale leur suite de tirages et l'index de leurs ressorts. L'index se recalcule tout seul (m = out.movers.length) ; la suite change de toute façon avec les nouveaux comptes.
- Le code existant traite déjà le cas une attache / une zone : lisière entière, sans raie.

**Grande frange à ne pas toucher.**
- La borne 0,98 d'onDir passe en paramètre (0,999 seulement pour pulled, sideLock et ahoge). Il ne faut pas changer onDir ni le clamp de radiate() pour tous : la grande frange a le même trou au pôle, mais elle plaît. À signaler, sans y toucher.
- L'extraction de fringeTufts doit être un refactor pur. Vérifier que bangs() donne une géométrie identique : somme des positions sur une cinquantaine de graines avant/après, ordre des rnd() conservé.

**Pièges de CLAUDE.md.**
- « Repos pendant = verticale » : dir DOWN pour les nattes, gravité 0 ailleurs.
- « Pas de collider pour ce qui repose contre le crâne » : pivot au centre pour la frange et les mèches latérales, donc collides = false. Les nattes et l'épi ont une pose de repos hors de la sphère, donc collider actif.
- « Ressort sur l'axe ne ressent rien » : les nattes sont à x ≈ ±0,4. L'épi est près de l'axe, son bout est avancé de 0,1 : il réagit aux pas et aux inclinaisons plus qu'à la rotation, c'est voulu.
- « Tirage conditionnel fait quand même » : les tirages de l'épi et du nœud sont faits avant le test.
- « Hauteur de pointe bornée à [−0,9 ; 0,9] » : clamp sur tipSy des mèches latérales.
- « Pointe effilée » : c'est yarn(). Et le lien du bas est désormais sur la partie resserrée, pas autour d'un cône vide.

**Collisions.**
- **Frange et boutons.** Bord à hairline(p, 0, ≥ 1,35), contre 1,02 pour la grande frange. Glissement maximal 0,2 × R ≈ 0,086, pour un écart d'environ 0,09 au défaut. À vérifier sur les poupons, dont les grands yeux font plafonner hairline à 0,85.
- **Nattes et bras.** Au repos, le dégagement mesuré est ≥ 0,08 (az 2,07) ou ≥ 0,12 (az 2,19) sur 0,6 sous le lien. Mais Hairdo, dans le repère de la tête, ne connaît pas les bras animés : un armé de coup vers l'arrière peut encore effleurer la natte. Parade possible plus tard : passer au SpringBone des nattes les sphères de bras recalées comme followLimbs.
- **Nattes et bajoues.** clearHead point par point avec une marge de 1,15W. La rotation est nulle au lien : ≈ 0,011 d'enfoncement au pire au niveau des bajoues.

**Duvet.** La couche du dessous est relevée à shell.height − 0,9r pour dominer la pointe des fibres. Si des fibres restent visibles entre les brins, le vrai remède est celui de CLAUDE.md : percer le duvet du crâne sous la coiffure (holeShader). C'est transversal, donc hors de ce lot.

**Encre.** Deux couches plus des lobes font plus de traits. Si c'est trop chargé à la taille d'une planche, ramener l'écart entre couches de 0,9–1,2r à 0,6r.

**Coût.** Environ 266 brins tirés, 60 à 85 de frange, 28 de mèches latérales, 4 d'épi, 6 de natte (pas 0,8 rs, ≈ 35 segments) et 30 de pinceau, plus les anneaux et le nœud. Soit ≈ 420 tubes et ≈ 80 000 triangles, contre ≈ 35 000 aujourd'hui et ≈ 65 000 pour la grande frange. Deux appels de rendu au lieu de trois (le mesh `braid` disparaît). 9 à 11 ressorts sur 32. Levier : fil tiré ×1,15, soit −15 % de brins.

**Fusion.** Toutes les pièces passent par yarn(), ring() ou applyMatrix4 sur yarn(), avec les mêmes attributs aMover, aFree, aFling et aPhase. applyMatrix4 transforme les normales et laisse ces attributs intacts : mergeGeometries fonctionne.

**Shader.** Aucune modification (le chemin aFree = 0 existe déjà), donc pas de piège de cache `hairdo`. En revanche, une géométrie modifiée demande de régénérer la poupée.

**Remarque.** Les coupes lisent p.hair.thickness (panneau), pas le calibre par poupée de hairLook. Le compte déduit de r reste juste si on les branche un jour dessus.

**Documentation.** Mettre à jour CLAUDE.md : cheveux tirés tenus, loi n ≈ 4/thickness, borne du pôle, natte à trois brins, longueur déduite des bras.

