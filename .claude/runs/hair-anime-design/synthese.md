# Synthèse finale — refonte anime des coupes en laine

Run `hair-anime-design`, synthèse finale du 26/09/2026. Elle **reprend `synthese-run1.md` comme base**
(couettes, chignon, nattes, houppette, trois poils, grande frange) et y intègre les trois fiches
arrivées depuis : `proposition-queue.md`, `proposition-meches.md` (v3, diff `proposition-meches-v3.diff`)
et `proposition-boucles.md` (diff `proposition-boucles.diff`). Chaque fois qu'une fiche nouvelle ou une
consigne du README impose de contredire run1, c'est dit explicitement (marque **[révise run1]**).

Code lu : la copie de travail `/Users/leogallus/Projets/DummyFaces-coupes/src/doll/hairstyles.tsx`
(branche `coupes-anime` @ cb715fc, arbre propre), en lecture seule.

Retours de l'utilisateur, à traiter impérativement :
1. les cheveux **tirés** sont **tenus**, immobiles ; seules les parties libres bougent ;
2. certaines coupes sont **clairsemées** : couverture dense exigée ;
3. pas assez **anime**, pas assez **stylées** : physique et aspect à améliorer.

Contraintes fermes : `hair.tsx` (locks) intouchable ; `bangs()` (grande frange) est la référence aimée ;
aucune base ni sous-couche ; seule « trois poils » peut être chauve ; aucun mouvement au repos ; rendu
laine + trait encre ; `MAX_MOVERS = 32` ; ≤ 60 k triangles par coupe à épaisseur 0,03.

Deux consignes utilisateur consignées dans `README.md` (26/09) sont intégrées :
- **queue de cheval haute** (`croquis-queue-haute.png`) : attache au sommet, un peu en arrière ; la
  queue monte puis se recourbe en arc vers l'arrière, sans retomber sur la fermeture éclair ; nuque sans
  pointes isolées. Elle **prime** sur `proposition-queue.md` pour l'attache et la trajectoire ;
- **fermeture éclair** (`zip.tsx`, `reference-fermeture-ok.webp`) : raie exactement sur la fermeture le
  long de son étendue, brins de chaque côté, aucun devant ; au-dessus du bout haut, la raie se referme.

---

## 0. Ce qui a été vérifié dans le code (lecture seule)

| Affirmation | Statut |
|---|---|
| `MAX_MOVERS = 32`, `POLE = 0,9995`, `onDir(…, cap = 0,98)` par défaut | confirmé (l. 127, 304-309) |
| `yarn` : `segs = clamp(ceil(len/(r·step)), closed ? 16 : 6, step ? 128 : 48)`, `taper` 0,2 par défaut | confirmé (l. 225, 256) |
| `still(geo, mover, free, fling = free)` : écartement séparé | confirmé (l. 165) |
| `pulled()` refondue : pas 1,8 r en longueur réelle, pondération 1/sin θ, [60 ; 480] brins, deux couches, `base = max(0,8 r, h − 0,9 r)`, `crown`/`tuck`/`grooves`, rend `frontLine` seulement, `yarn(…, { step: 6 })` sans mouvement | confirmé (l. 482-549) |
| pelote du chignon : `still(ball, m, 1, 0)`, ressort {0,14 ; 0,22 ; 0}, maxAngle 0,06, anneaux `fling: 0` | confirmé ; mais pôle **toujours aléatoire** (Euler), `ribbonColor` **jamais tiré** dans `bun()`, commentaire « Pas de physique » **faux** |
| houppette : 8 secteurs maxAngle 0,3, `mover: 0` codé en dur pour le toupet, 80 brins mobiles sur le crâne | confirmé : c'est la dernière coupe qui viole le retour 1 |
| bouclettes : 8 secteurs (raideur 0,064–0,096, maxAngle 0,16), `free = 0,6 + 0,4t` dès la racine, lisière `−0,1 + 0,3·rnd`, rayon nul pour u ≥ 1/1,4 (bâtonnet final) | confirmé (l. 563-611) |
| mèches : 8 secteurs maxAngle 0,22, 160–210 brins (`210 − 50g`), `r = yarnR·(0,8–1,15)`, épi π ± 0,6 / sy 0,80–0,92, borne 0,98 dans `radiate` | confirmé (l. 627-654, 726, 792) |
| queue : attache sy 0,20–0,65, L = R·(0,85–1,40), `bunch` 22–31 brins, un seul ressort DOWN g 1,2 maxAngle 0,7, `free = t^1,2` | confirmé. Le diagnostic « 152 brins en azimut, côtés 56–69 % » de la fiche queue portait sur l'arbre **d'avant** `pulled` refondue : l'audit v2 du README donne maintenant **98–99 %** |
| nattes : anneau et pompon du bout sur le ressort avec `fling = free = 1` | confirmé : légitime (partie libre) |
| écartement appliqué **même sans ressort** (`transformed += … * uFling * aFling`) | confirmé (l. 1495) |
| `Mover` n'a pas de `parent` ; os rendus à plat ; `SpringBone.restWorld` lit la rotation monde de `bone.parent` | confirmé : un chaînage par os imbriqués fonctionne sans toucher `springBone.ts` |
| `faceSafe` : `edge`, `maxAngle`, `sideAz` ; **pas** de `gap` | confirmé |
| `sectorMovers` et `GOLDEN` ne servent qu'à bouclettes et houppette | confirmé : morts après leurs refontes |
| `proposition-boucles.diff` et `proposition-meches-v3.diff` s'appliquent sur la copie de travail, **seuls et l'un après l'autre** | vérifié (`git apply --check`, `patch --dry-run`) : 2 221 lignes après les deux |
| la branche cloud `claude/quirky-galileo-g4u9c5` contient déjà cb715fc (merge-base = HEAD de `coupes-anime`, `hairstyles.tsx` identique) | vérifié : `coupes-anime` peut **avancer en fast-forward** et récupérer `zip.tsx` sans conflit |
| fermeture : méridien arrière az π, de sy **0,93** (TOP) à **−0,72** (BOTTOM), largeur **0,17 R** ; `zipMetrics` ne rend pas encore l'étendue | vérifié dans `zip.tsx` (branche cloud) |
| épis par planche (tirage sans remise de 6 coupes sur 10) : plan run1 → **91,0 %** des planches à ≤ 2 épis (moyenne 1,38) ; avec un épi à 40 % sur les mèches → 83,7 % | recalculé exactement sur les C(10,6) planches : confirmé |

Orphelin à nettoyer au passage : le commentaire « Rubans : des teintes franches » (l. 386) est détaché de `RIBBONS` (l. 397).

---

## 1. Briques communes à factoriser dans `hairstyles.tsx`

Déjà en place (étapes 1–3 de run1) : `yarn({ step, segs, taper })`, tubes fermés ≥ 16 segments, `onDir(cap)` + `POLE`,
`still(fling)`, `smooth`, `after`, `faceSafe`, alerte > 32 ressorts, `buildHairParts` exporté, `pulled()` refondue,
pelote tenue. Les briques ci-dessous s'y ajoutent. Règle de toutes : **options absentes ⇒ géométrie identique au bit
près** pour les coupes qui ne s'en servent pas (empreinte de positions + aMover/aFree/aFling, 50 graines × 3 épaisseurs).

### B1. `pulled()` — options de la synthèse finale **[complète run1]**

Base run1 (implémentée). S'ajoutent : `whorl`, `swirl`, `sections`/`puff` (fiche boucles, diff vérifié), `nape`
(consigne queue : nuque sans pointes isolées), `seam` (fermeture, étape 14), et `rim` rendu en plus de `frontLine`.

```ts
type Seam = { az: number; halfAt: (sy: number) => number /* demi-ouverture en azimut */; top: number; bottom: number }
type PulledOpts = {
  pitch?: number; crown?: number; tuck?: number; grooves?: number   // run1
  whorl?: boolean          // épi libre : bouts en étoile, d'un diamètre au-delà à trois en deçà
  swirl?: number           // tourbillon signé autour de l'attache, via swirlAbout (B2)
  swirlReach?: number      // 1,1 rad
  sections?: THREE.Vector3[]; puff?: number   // couche du dessus bombée par section, creusée aux frontières
  nape?: number            // profondeur du V de nuque (0,18 par défaut ; 0 = bord fermé)
  seam?: Seam              // raie ouverte sur la fermeture, refermée au-delà de ses bouts
}
function rimOf(limit: (az: number) => number, nape = 0.18): (az: number) => THREE.Vector3
function pulled(p, rnd, r, targets, out, low, o?: PulledOpts): { frontLine: (az: number) => number; rim: (az: number) => THREE.Vector3 }
```

```ts
function rimOf(limit, nape = 0.18) {
  return (az) => dirOf(az, limit(az) + 0.02 - Math.max(0, -Math.cos(az)) ** 3 * nape)
}
// Zones : deux attaches opposées → raie (run1) ; une attache + seam → DEUX demi-zones qui visent la même attache,
// bordées par les deux lèvres de la fermeture ; sinon la lisière entière.
// Ligne de raie : offset latéral = max(0,02 ; seam.halfAt(sy)) entre seam.bottom et seam.top,
// puis refermé en 0,05 de sy au-delà du bout haut (smooth) : au-dessus de la fermeture les deux zones
// partent de la MÊME ligne et leurs brins se recouvrent (défaut « trou au-dessus de la fermeture »).
// Dans la boucle des brins (diff boucles) :
const reach = o.tuck ? Math.max(0.2, 1 - o.tuck / ang) : o.whorl ? 1 - (r * (-2 + rnd() * 8)) / (R * ang) : 1 // tirage si whorl seulement
if (o.swirl) swirlAbout(d, to, o.swirl, o.swirlReach ?? 1.1)
const puff = upper && o.puff ? o.puff * Math.sin(Math.PI * t) * (1 - 0.7 * across * across) : 0
// nape = 0 : bord fermé — en plus, les deux premiers échantillons sont enfouis (−2 r puis −0,5 r) :
// tous les brins émergent sur une même ligne, pas en pointes isolées.
```
Usage : couettes, queue, chignon, nattes, houppette, **bouclettes** (calotte : `whorl`, `swirl`, `sections`, `puff`).

### B2. `swirlAbout()` — tourbillon fonction de la distance **[nouveau, unifie deux fiches]**

Mèches (radiate, portée 0,55) et bouclettes (pulled, portée 1,1) font le même tourbillon avec deux formules. Une
seule : la rotation ne dépend que de la **distance à l'épi**, ce qui conserve les aires, donc la couverture (mesuré
par la fiche boucles : −0,0 point, contre −1,5 point pour une torsion en fraction du brin) et l'ordre des brins.

```ts
function swirlAbout(d: THREE.Vector3, axis: THREE.Vector3, amount: number, reach: number): THREE.Vector3 {
  return d.applyAxisAngle(axis, amount * clamp(1 - d.angleTo(axis) / reach, 0, 1) ** 2)
}
```
Usage : bouclettes (0,7–1,2 rad, sens tiré), mèches (−hand·(0,45–0,75)).

### B3. `faceSafe.gap` + `faceGuard()` — débattement déduit du visage, source unique **[révise run1]**

Trois formules coexistaient : `faceSafe.maxAngle(edge)` (run1, pointe qui glisse droit vers le bas), `0,9·gap/levier`
(mèches), `0,8·min(écart/(|q|·free))` avec une liste d'yeux (bouclettes). On garde **le modèle de dégagement des mèches**
(distance, vue de face, au segment que balaie le bouton entre les bornes d'écart ±12 %, taille +14 %) et **l'agrégat des
bouclettes** (minimum sur tous les points, mobilité comprise, facteur 0,8 — il couvre aussi le lacet). `maxAngle(edge)`
reste pour les rappels où aucun brin n'est encore posé.

```ts
// dans faceSafe(p) :
gap: (q: THREE.Vector3, rr: number) => {
  if (q.z < R * 0.3) return Infinity
  const x = Math.abs(q.x), x0 = p.face.eyeSpacing * 0.44, x1 = p.face.eyeSpacing * 0.56
  return Math.hypot(x - clamp(x, x0, x1), q.y - p.face.eyeHeight) - size - rr
}
function faceGuard(p: DollParams) {
  const fs = faceSafe(p), best = new Map<number, number>()
  return {
    /** Un brin posé : `free` évaluée à l'abscisse curviligne réelle (celle de TubeGeometry), pas à l'indice. */
    add(m: number, pts: THREE.Vector3[], free: (t: number) => number, rr: number) {
      const cum = arcFractions(pts)
      let a = best.get(m) ?? Infinity
      pts.forEach((q, k) => { const f = free(cum[k]); if (f > 0) a = Math.min(a, fs.gap(q, rr) / (q.length() * f)) })
      best.set(m, a)
    },
    apply(out: Parts, lo = 0.04, hi = 0.3) {
      for (const [m, a] of best) out.movers[m].maxAngle = Math.min(out.movers[m].maxAngle, clamp(0.8 * a, lo, hi))
    },
  }
}
```
Usage : mèches (remplace `report`), bouclettes (remplace `eyes`), fringeTufts hors grande frange, sideLock, mèche rebelle,
lame héroïque de la houppette. La grande frange garde son 0,42 (référence).

### B4. `centerMover()` — ressort pivotant au centre du crâne **[nouveau]**

Le même motif est écrit six fois (grande frange ×2, mèches, secteurs, crosses, anglaises) : pivot au centre, bout vers
la mèche, longueur R, gravité 0. Le `cfg` est tiré **par l'appelant** : l'ordre des tirages de `bangs()` ne bouge pas.

```ts
const tuftDir = (az: number) => new THREE.Vector3(Math.sin(az) * 0.75, -0.66, Math.cos(az) * 0.75).normalize()
function centerMover(out: Parts, dir: THREE.Vector3, cfg: SpringConfig, maxAngle: number, R: number): number {
  out.movers.push({ pivot: new THREE.Vector3(), dir, length: R, cfg, maxAngle })
  return out.movers.length - 1
}
```
Usage : grande frange (refactor pur), mèches (16), fringeTufts, sideLock, anglaises, crosses. `sectorMovers` est supprimé
à la fin (plus d'utilisateur après bouclettes et houppette).

### B5. `fringeTufts()` — frange en pointes extraite de `bangs()` (+ crosses) **[run1 + fiche boucles]**

Signature et esquisse de run1 inchangées (`width, tufts, edge, sideTo, lengthenFrom, root, over, count, radius, cfg,
maxAngle, free, fling, hang, sweep, split, minAngle`). Extraction **pure**, prouvée par l'empreinte de référence du README :
`buildHair(p, 'frange')`, 50 graines × 3 épaisseurs → **1406201.063069**, **5 566 540 sommets**.

Ajout : `curl?: { rho: number; turns: number; hand: 1 | -1 }` — la **crosse** des bouclettes (`curledFringe` du diff) :
axe droit puis spirale d'Euler `h = −π/2 + sx·2π·turns·u^1,6`, ruban `w0 → 0,9 ρ` puis `0,9 ρ·(1−u)^0,9`, décollé de
0,015–0,045 R, `straight` calculé pour que le bas de la crosse reste au-dessus de `edge`. `curl` absent : code de bangs.
Si le repli dans `fringeTufts` complique l'ordre des tirages de bangs, `curledFringe` reste une fonction à part mais
**partage** la disposition des mèches (centres, deux rangées décalées, racines sur `rim`/`frontLine`) et `centerMover`.

Variantes par coupe : droite (couettes), rideau `split` (chignon), de côté `sweep` ±0,25–0,35 (nattes), courte (houppette),
crosses `curl` (bouclettes). Toujours : racines sur la lisière relevée (`frontLine`/`rim`), bord `faceSafe.edge(f ≥ 2,0)`,
racine tenue `after(0,15)`, maxAngle par `faceGuard`.

### B6. `sideLock()` — mèche qui encadre le visage (+ mèche rebelle) **[run1 + fiche queue]**

Signature run1 (`az, root, endSy, hang, strands, span, over, curl, maxAngle`), pivot au centre, gravité 0, racine
`after(0,15)^1,2`, fermeture en pointe sur le dernier 40 %, règle rMax sous l'équateur, `curl` signé `sx`.
Ajout : `across?: number` — la **mèche rebelle** de la queue : racine sur la lisière avant à az ±0,3, pointe portée de
`across` rad vers la tempe opposée, `tipSy ≥ faceSafe.edge(2,4)`. maxAngle par `faceGuard` (0,3 au plus).
Arbitrage physique (run1, n° 7) maintenu contre la fiche queue (pivot à la joue, repos DOWN, gravité 0,8) : pas de
lutte avec les bajoues qui débordent le collider de 0,95 R.

### B7. `ahoge()` — épi en crochet **[run1, usage réduit]**

Signature et esquisse de run1 (présence toujours tirée, contenu dans une sous-graine, gravité 0, raideur 0,14–0,18).
**[révise run1]** : n'est plus porté que par couettes (40 %) et nattes (40 %). Queue : retiré (voir conflits, n° 3).
Mèches, bouclettes : aucun (le tourbillon tient ce rôle).

### B8. `bundle()` — faisceau noué en mèches pointues **[run1 + fiche queue]**

Remplace `bunch()`. Base run1 (sortie serrée 2,6 r, gonflement `smooth(0,04 ; 0,4)`, `clumps` + cœur, fermeture 0,78 sur
la seconde moitié, pointes retroussées une sur deux, vrille signée `side`, `clearHead` 2,5 r, compte
`ceil(1,5·2π·bulge/(1,8 r))`). Ajouts de la fiche queue : colonne vertébrale **fournie par l'appelant** (arc de la queue
haute), section **elliptique**, pointe en **V**, **sillons** entre mèches, deux régimes de physique et chaînage (B11).

```ts
type BundleOpts = {
  clumps: number; bulge: number; twist: number; side: -1 | 1
  spine?: (t: number) => THREE.Vector3      // défaut : chute de run1 (stand, bow, DOWN·L·(t−0,08)^1,25)
  depth?: number                            // profondeur/largeur de la section (1 ; queue 0,72)
  vTip?: number                             // mèches latérales raccourcies : 1 − vTip·|sin a_c|^1,5 (queue 0,2)
  grooves?: number                          // fermeture précoce 0,15·smooth(0,1 ; 0,35 ; u) : lobes le long du faisceau
  hang: boolean                             // true : ressorts dir DOWN, gravité 1,0–1,4 (couettes) ;
                                            // false : dir vers la pointe de la mèche, gravité 0 (queue haute)
  chain?: boolean                           // ressort racine au nœud + mèches enfants (B11)
  step?: number                             // pas de tube (3,5 ; queue 4 pour tenir 60 k)
}
function bundle(p, rnd, r, tie: SurfacePoint, L: number, out: Parts, o: BundleOpts): { knot: THREE.Vector3; axisAt: (t: number) => THREE.Vector3; root: number; core: number }
```
```ts
const clumpLen = (c) => c === K ? 1 : 1 - (o.vTip ?? 0) * Math.abs(Math.sin(((c + 0.5) / K) * 2 * Math.PI)) ** 1.5 - rnd() * 0.08
const close = (o.grooves ?? 0) * smooth(0.1, 0.35, u) + 0.7 * smooth(0.55, 1, u) ** 1.2      // sillons puis pointe
// ressorts : chain ? [racine {0,06 ; 0,14 ; 0}, maxAngle 0,35, collider actif] + K+1 enfants {0,035–0,055 ; 0,10–0,16 ; 0}
//          : K+1 ressorts au nœud ; hang ? dir DOWN, gravité 1,0–1,4 : dir = pointe de mèche − nœud, gravité 0
// free = smooth(0,02 ; 0,2 ; t) (racine), free2 = smooth(tp ; 1 ; t)^1,1 (mèche) ; fling = 0,9·t^1,2, nul dans le lien
```
Usage : couettes (×2, clumps 5, hang), queue haute (clumps 6, arc, ellipse 0,72, vTip 0,2, grooves 0,15, chain).

### B9. Liens : `bowKnot()` + `scrunchie()` **[run1 + fiche queue]**

`bowKnot` de run1 (anneau fixe, deux boucles en goutte fermées aplaties ×2,4 par `makeBasis`, deux pans sur le ressort
racine/cœur, free 0 → 0,6). `scrunchie` de la fiche queue : tore froncé (48 points, 8 fronces ±0,5 r, fil 1,6 r) —
**tenu**. Choix tiré dans tous les cas (sous-graine). Usage : couettes (nœud), queue (50/50), nattes (nœud aplati 60 %),
houppette (chouchou), bouclettes (anneau puis nœud sur 2 poupées sur 5, sous-graine déjà tirée par le diff).

### B10. `radiate()` — options de la coupe au bol **[révise run1]**

run1 disait « déduire `count` au site d'appel, sans toucher `radiate` ». La fiche mèches v3 montre que ça ne suffit pas
(répartition en azimut de pointe, lâche à 90° de l'épi : p90 1,13 diamètre) et ajoute des options, toutes absentes par
défaut, avec la preuve « grande frange et huit autres coupes identiques au bit près » ; une copie `bowlStrands` est
exclue (deux copies divergent). Accepté, avec l'empreinte de la grande frange rejouée à chaque retouche.

```ts
// options ajoutées (diff v3) :
whorl?, fan?, jitter?, clumpShift?, clumpVarAt?, point?, pointAt?, pinchAt?, frontAt?, clumpWave?, layerSpan?,
floor?, rootK?, free?, fling?, taper?, step?, pole?, swirl?, lens?, flickRate?, sweep?, onStrand?
// + seam?: Seam (étape 14) : pour ψ dans le secteur de la fermeture, la racine quitte l'épi et se pose sur la lèvre
//   de la fermeture à la hauteur du brin (mode `parting` local) : brins de chaque côté du ruban, aucun devant.
```
Correctif du diff à garder : écart au centre de mèche **ramené dans ]−π, π]** avant l'affectation de mèche.

### B11. Second étage de ressort (chaînage) **[nouveau, fiche queue — révise run1]**

run1 avait reporté toute modification du shader `hairdo`. La fiche queue mesure que sans chaînage la queue ne tient pas
la cible de run1 (« pointe ≥ 0,2 de rotation ») : à plat 0,11–0,16, chaînée **0,29–0,34**, fouetté (pic des pointes
0,25–0,28 s après celui de la mi-queue 0,22–0,25 s), et réponse aux bonds (0,015–0,022 contre 0 aujourd'hui). Retenu,
comme étape propre sans effet visuel.

```ts
type Mover = { pivot; dir; length; cfg; maxAngle; parent?: number }   // parent toujours poussé AVANT ses enfants
type YarnOpts = { …; mover2?: number; free2?: (t: number) => number } // aMover2 = −1, aFree2 = 0 par défaut
// still() pose aussi aMover2 = −1, aFree2 = 0 : mergeGeometries refuse des attributs différents.
// GLSL (<beginnormal_vertex> / <begin_vertex>) : une seule boucle lit (hk, ha, hp) et (hk2, ha2, hp2) ;
//   transformed = hp2 + hairRotate(transformed − hp2, hk2, ha2 * aFree2);  // la mèche, repère de repos
//   transformed = hp  + hairRotate(transformed − hp,  hk,  ha  * aFree);   // puis la racine
//   même composition pour objectNormal.
// Hairdo : os d'un Mover à parent rendu DANS celui du parent (position = pivot − pivot du parent), arbre JSX
//   construit depuis `parent` (pas de reparentage impératif) ; uPivot garde le pivot de repos ; uAngle lit
//   bone.quaternion, qui est local au parent : exactement ce que la composition attend.
//   Rechargement complet obligatoire (clé de cache 'hairdo').
```
Usage : queue haute (1 racine + 7 mèches), couettes (bundle `chain`), nattes (natte = racine, pinceau = enfant).

### B12. `zipSeam()` — la fermeture comme raie **[nouveau, consigne README]**

Une seule source pour l'étendue de la fermeture, lue par `zip.tsx` et par les coiffures : `zipMetrics(p)` rend en plus
`top: 0,93`, `bottom: −0,72` (sy), aujourd'hui constantes privées de `zip.tsx`.

```ts
function zipSeam(p: DollParams, r: number): Seam {
  const z = zipMetrics(p), R = p.shape.headRadius
  const half = z.width * 0.5 + r   // le brin s'arrête contre la lèvre, pas dessus
  return { az: Math.PI, top: z.top, bottom: z.bottom,
           halfAt: (sy) => half / (R * Math.max(0.2, Math.sqrt(1 - sy * sy))) }
}
```
Usage : `pulled` (couettes, queue, chignon, nattes, houppette, calotte des bouclettes), `radiate` (mèches ; grande
frange, secteur arrière seulement, sous réserve de validation), placement des épis et des attaches (voir plan).

---

## 2. Plan par coupe

Tableau des fronts (arbitrage n° 8 de run1, complété) — un front distinct par coupe :

| Coupe | Front | Encadrement | Sommet |
|---|---|---|---|
| couettes | frange droite en pointes (5/7 mèches) | longues mèches latérales sous le menton | épi 40 % |
| chignon | frange rideau | mèches fines jusqu'à la joue | pointes de chignon (pelote seule, 50 %) |
| nattes | frange de côté (sweep ±0,25–0,35) | une mèche latérale, côté opposé | épi 40 % |
| queue haute | dégagé + mèche rebelle en travers | — | la queue elle-même (**plus d'épi**) |
| houppette | frange courte | aucune | lame héroïque du palmier |
| mèches | frange au bol posée, peignée ±0,06–0,12 | carré plongeant au-delà de sideAz | tourbillon |
| bouclettes | frange en crosses | anglaises de tempe | tourbillon |
| trois poils | crâne nu (seule coupe chauve) | — | les trois poils |
| grande frange | inchangée (référence) | longueurs | — |
| locks | inchangés (`hair.tsx`) | — | — |

Épis par planche avec ce tableau (houppette 1, couettes 0,4, nattes 0,4) : **97,3 %** des planches à ≤ 2 épis, moyenne
1,08 (calcul exact sur les 210 planches) — la cible run1 (≥ 95 %) est tenue ; elle ne l'était pas avec le plan run1 (91,0 %).

Emplacement des masses au sommet, compte tenu de la fermeture (az π, sy 0,93 → −0,72) :
- **queue haute** et **pelote du chignon** : juste au-dessus du bout haut de la fermeture (az π, sy ≈ 0,95–0,98) ; le
  lien couvre le bout de la fermeture, qui en sort vers le bas — « la fermeture s'arrête sous le ruban » ;
- **houppette** : au pôle, légèrement en avant (sy 0,97–0,99) ;
- **épis libres** des mèches et des bouclettes : sur le méridien arrière, **au bout haut** de la fermeture (az π,
  sy = top + 0,02–0,05) : la fermeture part de l'épi comme une raie naturelle.

### Bouclettes — `curls()` (fiche boucles, diff prêt) **[révise run1 : n'est plus « hors lot »]**

La plus clairsemée des coupes non chauves : **26–57 %** de la zone cible (moyenne 40), lisière haute (effet chauve).
Refonte « ojou-sama » : calotte tenue + anglaises + frange en crosses.
1. **Calotte** : `pulled(p, rnd, r, [whorl], out, sideLow, { crown: front − 4r/ry, whorl: true, swirl, sections:
   [têtes d'anglaise, racines de frange], puff: R·0,05 })`, `sideLow = −0,33 − 0,06·rnd` (oreilles), nuque en V.
   130–152 brins à 0,03. Épi : **[révise la fiche]** az π, sy = top_fermeture + 0,02–0,05 (la fiche : π ± 0,4, sy 0,86–0,94,
   c'est-à-dire sur la fermeture). Tourbillon 0,7–1,2 rad, sens tiré, `swirlAbout` portée 1,1.
2. **14 anglaises** (`ringlet`) sur la lisière, de ±sideAz à la nuque, au pas de leur diamètre (plafond 14) : ruban de
   S = 3–6 brins, pas = largeur du ruban (vrille pleine), cône ×0,5, `segs` = 12 anneaux par tour au moins, `taper 0,3`,
   longues aux tempes (R·0,95), courtes à la nuque (R·0,35), ×0,75–1,25 chacune ; bout ≥ −0,8 ry sur les côtés ;
   enroulement signé `hand·sign(sin az)` (miroir).
3. **Frange en crosses** : 3–4 mèches, bord `faceSafe.edge(2,0–2,25)`, crosse 0,9–1,2 tour vers l'extérieur.
4. **Physique** : calotte 0 ; anglaises `centerMover` {0,06–0,10 ; 0,08–0,12 ; 0}, maxAngle 0,3, free
   `smooth(0,04 ; 0,35 ; t)·(0,55 + 0,45t)`, fling `0,6·smooth(0,1 ; 1 ; t)` ; anglaises de tempe bridées par `faceGuard`
   (0,16–0,21) avec raideur ×(0,3/maxAngle)^0,8 et amorti ×√ ; crosses {0,05–0,08 ; 0,07–0,11 ; 0}, free
   `smooth(0,05 ; 0,5 ; t)`, fling `0,35·smooth(0,3 ; 1 ; t)`. **17–18 ressorts.** Pas d'épi.
5. Ruban : 2 poupées sur 5, anneau puis `bowKnot` (sous-graine déjà tirée).
6. Mesuré par la fiche : 98,9–99,9 % de la zone cible, sommet 99,7–100 %, 0 sommet sur un bouton, 0,02 % de sommets dans
   le crâne au débattement max (4,1 % aujourd'hui), 38–58 k triangles (p95 56 k).
7. Décision à demander à l'utilisateur sur capture : libellé « bouclettes » → « anglaises » (clé `boucles` inchangée).
Suppressions : ancien corps, `GOLDEN`.

### Mèches — `bowlCut()` + `radiate()` (fiche mèches v3, diff prêt)

Mesuré aujourd'hui : 82 % (min 74), côtés mi-hauteur 70 %, sommet 82 % (borne 0,98), racines déplacées de 0,7–0,9
diamètre au débattement (sommet qui se déchire : 63 % en cisaillement), 8 blocs qui balancent.
1. **Densité** : `n = clamp(round(2,8·π·R·1,05/r), 140, 360)`, 45 % dessous, 60 % dessus ; `r = yarnR·(0,95–1,30)` ;
   272–313 brins à 0,03 ; répartition **en angle autour de l'épi** (`fan`) ; `pole: POLE`.
2. **Épi** **[révise la fiche]** : az π, sy = top_fermeture + 0,02–0,05 (la fiche : π ± 0,6, sy 0,80–0,92, sur la fermeture).
   Mesures de la fiche à rejouer après ce déplacement.
3. **Mèches** : 16, pincées 0,66 (0,40 sur la frange), en lentille (lobes encrés), pointes retroussées sur 40 % des
   mèches hors frange, évasement 0,07 R, volume 0,09 R, tourbillon `swirlAbout` −hand·(0,45–0,75), portée 0,55.
4. **Frange posée** : bord `faceSafe.edge(2,0–2,15)`, **centre** des mèches sur le bord, pointe posée sur le front,
   peignée `hand·(0,06–0,12)`, bord horizontal.
5. **Carré plongeant** : lisière plate jusqu'à `sideAz`, plonge à la mâchoire `min(fin, −0,3) − 0,1–0,25` sur 0,45 rad,
   remonte vers la nuque. Pas de mèches latérales à part, pas d'épi.
6. **Physique** : 16 `centerMover` {0,032–0,048 ; 0,08–0,12 ; 0}, une par mèche, deux couches partagées décalées d'une
   demi-mèche ; free dessus `0,12 + 0,88·smooth(0,1 ; 1 ; t)`, dessous `0,08 + 0,45·smooth(0,15 ; 1 ; t)` ; fling nul sur
   le premier tiers ; maxAngle par `faceGuard` **[remplace `report`, facteur 0,8 au lieu de 0,9]**.
7. Pas de tube relatif au crâne (`step = 0,13·R/r` dessus, `0,2·R/r` dessous) : 40–48 k à 0,03, 55 k à 0,02.
8. Mesuré par la fiche : 94,9 % (V comptés comme trous ; la grande frange fait 87–88 % à méthode égale), sommet 100,
   côtés 98, corps de frange 100 ; boutons : dégagement 0,103 au repos, 0,046 en pose ; sourcils surpris touchés sur
   14 graines sur 32 (21 aujourd'hui).

### Houppette — `tuft()` (run1)

Plan run1 inchangé (palmier 6–8 lames aplaties, lame héroïque choisie par la géométrie, cœur 6–10 brins, chouchou,
`pulled` tuck sous le chouchou + grooves 12–16 + crown 0,88–0,92, frange courte 3–5 mèches `edge(2,2–2,5)`, pas de
mèches latérales, V de nuque, ≤ 13 ressorts). **[révise run1]** Nœud au **pôle, légèrement en avant** (sy 0,97–0,99,
az (rnd − 0,5)·0,6) au lieu de π ± 0,3 / sy 0,90–0,96 : cette zone est le bout haut de la fermeture et l'attache de la
queue haute. Garde-fou run1 conservé : aucune lame de devant sous la racine de la frange ; lame héroïque bornée par
`faceGuard`. Réécrire le commentaire de `tuft()`.

### Couettes — `pigtails()` (run1)

Plan run1 inchangé (attaches sy 0,4–0,7, az ±(π/2 + 0,25–0,40) ; `pulled` crown 0,97–0,99 + tuck ; frange droite 5/7
mèches `edge(2,2–2,45)` ; deux sideLock sous le menton ; ahoge 40 %). Queues : `bundle({ clumps: 5, hang: true, chain:
true })` une fois le second étage en place (B11), `bowKnot` sur chaque queue. Ressorts : 2×(1 + 6) + 5–7 + 2 + 0–1 ≤ 24.
Raie : la partie arrière doit tomber sur la fermeture (étape 14, `seam`).

### Queue de cheval haute — `ponytail()` (consigne README + fiche queue) **[révise run1 et la fiche]**

1. **Attache** : az π + (rnd − 0,5)·0,1, sy = top_fermeture + 0,02 + rnd·0,03 (≈ 0,95–0,98), au lieu de sy 0,35–0,7 (run1)
   ou 0,5–0,8 (fiche). Le lien couvre le bout haut de la fermeture.
2. **Tenus** : `pulled([tie], { tuck: (2,6 r + r)/R, nape: 0 })` — bord de nuque **fermé** (consigne : pas de pointes
   isolées) ; `pulledTo` (méridiens autour de l'attache) de la fiche **rejeté** : la brique implémentée donne déjà
   98–99 % (audit v2). Fermeture : `seam` à l'étape 14 (deux demi-zones visant la même attache).
3. **Trajectoire** (croquis) : colonne d'Hermite qui **monte puis se recourbe en arc vers l'arrière** :
   P0 = nœud, m0 = (UP + 0,4·BACK)·1,2 L ; P1 = nœud + BACK·R·(0,6–0,85) + DOWN·L·(0,55–0,75) ; m1 = (DOWN + 0,25·BACK)·0,9 L ;
   L = R·(1,1–1,5) ; sommet de l'arc 0,25–0,4 R au-dessus du nœud. Contraintes : pour t > 0,25, tout point de la colonne
   à ≥ 0,15 R de la surface du crâne (`clearHead`) ; pointe au-dessus de sy −0,3 : la queue ne se pose jamais sur la
   fermeture, elle rebondit derrière la tête.
4. **Faisceau** : `bundle({ clumps: 6, spine, depth: 0,72, bulge: W = r·(12–15), vTip: 0,2, grooves: 0,15, twist:
   hand·(0,4–0,9), hang: false, chain: true, step: 4 })` : 30–39 % de la largeur de la tête de dos, 20–29 % de profil,
   pointe en V, sillons encrés, pointes retroussées une mèche sur deux.
5. **Physique** : racine au nœud {0,06 ; 0,14 ; 0}, maxAngle 0,35, collider actif ; 7 mèches enfants {0,035–0,055 ;
   0,10–0,16 ; 0}, maxAngle 0,40 (0,30 si « ça vole trop ») ; gravité 0 partout (repos non vertical = géométrie). Tant
   que B11 n'est pas là : 7 ressorts à plat au nœud, free `smooth(0,03 ; 0,25 ; t)·(0,3 + 0,7t)`.
6. **Lien** : `scrunchie` ou `bowKnot` 50/50 (tiré toujours), teinte RIBBONS.
7. **Front** (run1) : dégagé, **mèche rebelle** (`sideLock` avec `across`, 6–8 brins, côté tiré) ; **pas d'épi**
   (la fiche proposait frange balayée + deux mèches latérales + épi 50 % : doublon des fronts de couettes et nattes).
8. **Tirages** : tous en tête, sous-graines par partie (fiche queue).
9. Ressorts : 8 + 1 = **9**. Coût visé ≤ 60 k (fiche : 55–61 k avec frange et mèches latérales ; sans elles et au pas 4 sur
   la queue, marge d'environ 10 k).

### Chignon — `bun()` (run1)

Plan run1 inchangé (pôle de la pelote sur la normale, hélice 6–9 tours un `yarn` par tour, ruban au pied avec
`ribbonColor` tiré, `pulled` tuck + grooves 16 + crown 0,95–0,98, frange rideau, deux mèches fines, pointes de chignon
50 % sur la pelote seule, ≤ 15 ressorts, corriger « Pas de physique »). **[révise run1]** Pelote seule : az π,
sy = top_fermeture + 0,02–0,05 au lieu de π ± 0,3 / 0,72–0,92 (sur la fermeture) : le ruban du pied recouvre le bout haut
de la fermeture. Macarons : inchangés (±(π/2 − 0,35), hors fermeture).

### Nattes — `braids()` (run1)

Plan run1 inchangé : attaches az ±(π/2 + 0,50–0,62), sy 0–0,2 ; `pulled` raie + tuck + crown ; `plait()` à trois brins
en huit (le mesh `braid` disparaît : 3 → 2 appels de rendu) ; longueur déduite des bras ; pinceau de 15 brins ; `bowKnot`
aplati 60 % ; frange de côté ; une mèche latérale ; ahoge 40 %. Physique : natte = racine au décollement, **pinceau =
enfant** (B11). La raie arrière tombe sur la fermeture : c'est la référence validée (`reference-fermeture-ok.webp`).

### Trois poils — `wisps()` (run1)

Plan run1 inchangé (toujours 3, crosse 45 % / ressort 35 % / pic 20 %, r0 = clamp(1,7·yarnR ; 0,03 R ; 0,055 R),
taper 0,85, ≥ 12 anneaux par tour, gravité 0, raideurs par poil, « boing » reporté). Racines az ±0,2, sy 0,90–0,95 : hors
fermeture.

### Grande frange — `bangs()` (référence)

Refactor pur par `fringeTufts` et `centerMover` (empreinte `1406201.063069` / 5 566 540 sommets). Étape 14 seulement :
les racines de la raie **arrière** (|az| > 2,3) s'écartent sur les lèvres de la fermeture — à faire valider par
l'utilisateur sur capture, puisque c'est la référence ; l'avant et la frange restent au bit près.

### Locks — `hair.tsx` (intouchable)

Rien dans ce lot. Étape 14 : écarter leurs racines du ruban **sans toucher `hair.tsx`** — à instruire (d'où viennent les
ancrages ?). S'ils sont calculés dans `hair.tsx`, demander l'accord de l'utilisateur avant toute chose.

---

## 3. Ordre d'implémentation

Étapes 1 à 3 de run1 faites (commit 52a1704). Suite :

0. **Récupérer la fermeture** : `coupes-anime` en fast-forward sur `claude/quirky-galileo-g4u9c5` (la branche cloud contient
   déjà cb715fc, `hairstyles.tsx` identique : aucun conflit) ; `zipMetrics` rend `top`/`bottom`. Sans effet sur les coupes.
   À faire avec l'accord de l'utilisateur (opération git).
4. **Bouclettes** (diff `proposition-boucles.diff`, épi déplacé au bout haut de la fermeture) : le plus gros déficit du
   retour 2 (40 % en moyenne) ; ajoute `rimOf` et les options `whorl`/`swirl`/`sections`/`puff` de `pulled`.
   Contrôle : empreinte des autres coupes identique ; mesures § 4.
5. **Mèches** (diff `proposition-meches-v3.diff`, épi déplacé) : deuxième déficit (82 %, sommet 82 %) ; options de `radiate`.
   Contrôle : empreinte de la grande frange identique.
   *(Ces deux étapes passent avant les briques, contrairement à run1 qui les laissait hors lot : leurs diffs sont prêts,
   compilés, prouvés neutres pour les autres coupes, et s'appliquent l'un après l'autre sans conflit.)*
6. **Briques** : `swirlAbout` (reprise dans 4 et 5), `faceSafe.gap` + `faceGuard` (remplacent `eyes` et `report`),
   `centerMover`, `fringeTufts` extraite de `bangs()` (preuve d'empreinte), `sideLock` (+ `across`), `ahoge`, `bundle`
   (à plat), `bowKnot`, `scrunchie`, `pulled.nape`.
7. **Houppette** : dernière coupe qui viole le retour 1 (gerbe mobile, 70–80 %).
8. **Second étage de ressort** (B11) : aucun changement visuel — toutes les empreintes identiques, aMover2 = −1 partout.
9. **Couettes** (bundle chaîné, nœud, frange droite, mèches latérales, épi).
10. **Queue haute** (consigne README).
11. **Chignon, style** (hélice, ruban, frange rideau, pelote au bout haut de la fermeture).
12. **Nattes** (plait, pinceau enfant, frange de côté ; suppression du mesh `braid`).
13. **Trois poils.**
14. **Fermeture sur toutes les coupes** (`zipSeam` dans `pulled` et `radiate` ; secteur arrière de la grande frange sur
    validation ; locks à instruire). Contrôle sur la référence `reference-fermeture-ok.webp`.
15. **Nettoyage + CLAUDE.md** : supprimer `sectorMovers`, `GOLDEN`, `bunch`, `Parts.braid`/prop `braid` si plus utilisés
    (la texture de tresse reste aux locks), le commentaire orphelin l. 386 ; réécrire les passages contredits (« cheveux
    tirés (léger mouvement) », « 0,5 pour les cheveux tirés », « 0,6 pour les bouclettes », « bouclettes (secteurs) »,
    « Mèches (8 secteurs) », « houppette qui retombe en fontaine », commentaire de `bun()`) ; ajouter les pièges (§ 5).
    Envisager de découper `hairstyles.tsx` (≈ 2 200 lignes après 4 et 5) en `hair/tools.ts`, `hair/pulled.ts`,
    `hair/cuts/*.ts` — déplacement pur, vérifiable par empreinte.

Après chaque étape : `npx tsc --noEmit`, rechargement **complet** (cache `'hairdo'`), deux captures (la première peut
montrer l'image précédente), audit par `window.__hairs` et `__advance` (jamais à l'œil avec le panneau masqué).

---

## 4. Mesures objectives de vérification

Un seul banc pour toutes les coupes (reprendre `scratchpad/synth/measure.mjs` et les bancs des fiches `meches_v3/`,
`b3/`, `queue/`) : copie de `hairstyles.tsx` sans le rendu, `buildHairParts` (tubes non fusionnés), `yarn` instrumenté.
Matrice : épaisseur {0,02 ; 0,03 ; 0,045} × R {0,36 ; 0,43 ; 0,55} × 5 graines, plus les six archétypes d'une planche
(bajoues jusqu'à +0,13, yeux hauts). Sur navigateur : `__hairs[style#seed]`, `__advance`, platine à 5 rad/s.

**4.1 Couverture du crâne (%).** 12 000 points de Fibonacci ; couvert si un axe de brin passe à moins de son rayon effilé
de la normale issue du point. Deux zones, pour qu'aucune coupe ne gagne en remontant sa lisière :
- **zone propre** : au-dessus de la lisière réelle de la coupe + 0,04, pied des attaches exclu ;
- **zone cible commune** (non-chauve) : au-dessus de `hairline(p, −0,25, 2,7)` + 0,04, nuque abaissée de
  0,2·max(0, −cos az)^1,5 (définition de la fiche boucles).
Zones angulaires : devant |az| < 0,6, tempes 0,6–1,25, côtés 1,25–2,2, arrière, sommet sy > 0,9. Les V voulus entre
pointes comptent comme des trous.

| Coupe | Aujourd'hui | Cible zone propre | Cible zone commune |
|---|---|---|---|
| couettes, queue, chignon, nattes | 96–99 % (audit v2) | ≥ 98 %, chaque zone ≥ 97 %, sommet ≥ 99 % (≥ 93 % sur une raie) | ≥ 95 % |
| houppette | 70–80 % | ≥ 98 % | ≥ 95 % |
| bouclettes | 26–57 % | ≥ 98,5 % | ≥ 98 % (fiche : 98,9–99,9) |
| mèches | 82 % (sommet 82) | ≥ 94,5 %, sommet ≥ 99, côtés mi-hauteur ≥ 97, corps de frange ≥ 99 | ≥ 90 % (V et effilage) |
| grande frange | 87–88 % | inchangée (référence) | — |
| trois poils | — | sans objet | sans objet |
| front sous frange (toutes) | — | ≥ 95 % entre racines et bord, encoches exclues | — |

**4.2 Mobilité par zone.** Borne du shader : |x − pivot|·maxAngle·aFree + 0,5·|hOut|·aFling (+ 0,12 vertical),
chaînage compris (somme des deux étages) ; puis réel pendant une rotation de platine à 5 rad/s, une course et des bonds.
- tirés, liens, nœuds, chouchous, calotte des bouclettes, pelote hors frémissement : **0,000 exactement**
  (aMover −1, aFree = aFling = 0) ; pelote ≤ 0,01 ;
- mèches : racines ≤ 0,015, t = 0,1 ≤ 0,015 et écartement 0 ; pointes 0,10–0,13 ;
- queue haute : pointes ≥ 0,25 en rotation (chaînée ; fiche 0,29–0,34), ≥ 0,2 en course, ≥ 0,01 aux bonds, nœud 0,000,
  désynchronisation des mèches visible (écart entre pointes ≥ 0,05) ;
- couettes : pointes ≥ 0,2, écartement ≥ 0,25 ;
- anglaises : pic 0,20–0,25 sans butée sur la platine, 3 rebonds, calme en ~1 s ; têtes ≤ 0,02 ;
- mèches latérales et crosses ≥ 0,1 ; racine de toute frange (t < 0,15) : 0.
**4.3 Aucun mouvement au repos.** 600 images de `__advance` sans entrée : |uAngle| < 1e-3 sur tous les ressorts ; la
gravité n'existe que sur les ressorts dont le repos est DOWN (couettes, nattes).

**4.4 Brins dans le crâne.** Pour chaque échantillon au-delà de la racine enfouie : |q| comparé au rayon d'`onHeadPolar`
dans sa direction, au repos puis à ±maxAngle sur 10 axes (et les deux étages à leur maximum) : 0 point à plus de 0,005
au repos hors calotte ; ≤ 0,05 % au débattement max (bouclettes : 0,02 %). Queues et nattes contre les bajoues sur les
archétypes dodus.

**4.5 Frange sur les yeux.** Tout sommet de frange, mèche latérale, mèche rebelle, crosse, anglaise de tempe, lame
héroïque, bol : `faceSafe.gap(q, r) ≥ 0` au repos **et** décalé de |q|·maxAngle·free dans la pire direction, aux bornes
hautes (écart ±12 %, taille +14 %). Cibles : 0 point dans un bouton ; dégagement mini ≥ 0,1 au repos (mèches 0,103) et
≥ 0,04 en pose. Pour information : sourcils surpris couverts (mèches 14/32 graines).

**4.6 Coût.** Triangles par coupe à 0,03 : **≤ 60 k** (bouclettes p95 56 k, mèches 40–48 k, queue à mesurer ≤ 60 k) ;
à 0,02, relevé et plafonné à 90 k (bouclettes montent à 65–101 k : réduire le plafond de 14 anglaises à 0,02 si besoin).
Appels de rendu ≤ 2 par coupe. Ressorts ≤ 32 (alerte de dev). Dans l'arène : `gl.info.render.calls`, triangles.

**4.7 Échantillonnage.** Spirales ≥ 12 anneaux par tour (bouclettes 12,0–14,5, trois poils) ; anneaux et rubans ≥ 16
segments ; hélice de pelote ≥ 16 par tour.

**4.8 Fermeture (après l'étape 14, et dès l'étape 0 pour les attaches).**
- 0 point de brin dans le couloir de la fermeture (|x| < width/2 + r, sy ∈ [bottom ; top], à moins de lift + 2 r de la
  surface), toutes coupes sauf locks ;
- au-dessus du bout haut : bande sy ∈ [top + 0,02 ; pôle] couverte ≥ 97 % (plus de trou au-dessus de la fermeture) ;
- queue haute : attache sy ≥ top + 0,02 ; distance mini queue ↔ ruban ≥ 0,1 R au repos **et** au débattement ; vue de
  dos orthographique : ≥ 60 % de la longueur de la fermeture visible ;
- épis des mèches et des bouclettes à az π, sy ∈ [top + 0,02 ; top + 0,05].

**4.9 Nuque sans pointes isolées** (queue). Le long de la lisière de nuque : 0 racine dont les deux voisines sont à plus
de 1,5 pas ; amplitude de dents de scie de la ligne d'émergence ≤ 1 r.

**4.10 Non-régression et graine.** Grande frange : `1406201.063069` / 5 566 540 sommets sur 50 graines × 3 épaisseurs après
chaque étape ; toute brique ajoutée : autres coupes identiques au bit près ; même graine → même géométrie ; épi forcé à 0
puis 1 : reste de la coupe identique (sous-graine).

**4.11 Planche.** 20 planches : jamais deux fois le même type de front ; ≤ 2 épis dans ≥ 95 % des cas (calcul exact : 97,3 %).

---

## 5. Contradictions entre fiches et arbitrages

1. **Densité de la queue : `pulledTo` (méridiens autour de l'attache, fiche queue) contre `pulled` (run1).** La fiche a
   mesuré 71–81 % sur l'arbre d'**avant** la refonte ; `pulled` refondue donne 98–99 % (audit v2 du README).
   → `pulled`, `pulledTo` rejeté.
2. **Attache de la queue : sy 0,2–0,65 (code), 0,35–0,7 (run1), 0,5–0,8 derrière (fiche) contre « au sommet, un peu en
   arrière, arc vers l'arrière, pas sur la fermeture » (consigne README).** → la consigne : az π, sy ≈ 0,95–0,98, au-dessus
   du bout haut de la fermeture ; colonne qui monte puis s'incurve ; gravité 0.
3. **Front et épi de la queue.** Fiche : frange balayée, deux mèches latérales, épi 50 %. run1 : dégagé + mèche rebelle
   + épi 50 %. Calcul exact : avec run1, 91,0 % des planches à ≤ 2 épis (cible 95 %). → dégagé + mèche rebelle,
   **sans épi** (la queue haute occupe le sommet) : 97,3 %. La fiche mèches a aussi retiré son épi pour cette raison.
4. **Physique de la queue : ressorts à plat (run1) contre chaînage au shader (fiche).** À plat, la cible run1 (pointe
   ≥ 0,2) n'est pas atteinte (0,11–0,16) ; chaîné 0,29–0,34 avec fouetté et réponse aux bonds. → chaînage retenu (B11),
   étape à part sans changement visuel, repli à plat documenté. **[révise run1]**, qui reportait tout changement du shader
   (le « boing » de trois poils reste reporté).
5. **Repos des faisceaux : DOWN + gravité (run1, couettes) contre dir vers la mèche + gravité 0 (fiche queue).** Les deux
   respectent « repos = géométrie ». → `bundle.hang` : couettes pendent (DOWN, gravité, poids visible quand la tête
   penche) ; queue haute dessinée (gravité 0).
6. **Débattement de frange : 0,12 fixe (fiche queue), `faceSafe.maxAngle(edge)` (run1), 0,9·gap/levier (mèches),
   0,8·min(écart/(|q|·free)) (bouclettes).** → `faceSafe.gap` (modèle des mèches) + `faceGuard` (agrégat des bouclettes,
   0,8) pour tout ce qui est neuf ; `maxAngle(edge)` en secours ; grande frange à 0,42 inchangée.
7. **Mèches : `radiate` intouchée (run1) contre une vingtaine d'options (v3).** → options acceptées, empreinte de la grande
   frange à chaque retouche ; une copie est exclue (CLAUDE.md).
8. **Mobilité des racines : calotte tenue à 0 (bouclettes, tirés) contre 0,12/0,08 (mèches).** Pas de contradiction avec
   le retour 1 : le bol n'est pas tiré, et un brin continu de l'épi à la pointe qui ne bouge qu'au bout se lit comme une
   calotte figée (piège CLAUDE.md). Les anglaises, elles, sont des objets distincts de la calotte. → les deux gardés ;
   racines des mèches ≤ 0,015.
9. **Hauteur de la frange au bol : f ≈ 1,45 (brouillon 1) contre f ≥ 2 (v3, règle run1).** → f ≥ 2 pour toutes les
   franges courtes. La vraie sortie « anime » (sourcils dessinés **par-dessus** les franges) touche le rendu du visage :
   hors lot, à proposer à l'utilisateur, jamais en douce.
10. **Bouclettes : correctif trivial hors lot (run1) contre refonte complète (fiche).** Mesuré 26–57 % : le retour 2
    l'impose. → refonte, identité « anglaises » à valider sur capture.
11. **Deux formules de tourbillon** (mèches `(1 − ρ/0,55)²`, bouclettes `clamp(1 − θ/1,1)²`) → `swirlAbout`, même loi,
    portée propre à chaque coupe.
12. **Épis libres, houppette, pelote sur la fermeture.** Épis des mèches (π ± 0,6, sy 0,80–0,92), des bouclettes
    (π ± 0,4, 0,86–0,94), nœud de houppette run1 (π ± 0,3, 0,90–0,96), pelote run1 (π ± 0,3, 0,72–0,92) : tous sur le
    méridien de la fermeture (sy ≤ 0,93). → épis, pelote et queue haute au bout haut de la fermeture (az π, sy top +
    0,02–0,05) ; houppette au pôle, un peu en avant. Les mesures des fiches mèches et bouclettes sont à rejouer après ce
    déplacement.
13. **Relèvement des tirés** : 1,2 r / + 0,9 r (fiche queue) contre `max(0,8 r, h − 0,9 r)` / + 0,9–1,2 r (run1,
    implémenté). → run1.
14. **Pas de tube** : step 6 en rayons de fil (run1, tirés) contre pas relatif au crâne `0,13·R/r` (mèches, coût borné
    quand le fil s'affine). → les deux : relatif au crâne pour les tracés à l'échelle du crâne dans le code neuf ; les
    tirés gardent step 6 tant que le coût à 0,02 tient (à mesurer, § 4.6).
15. **Coût de la queue** : 55–61 k (fiche) contre plafond 60 k. → sans frange ni mèches latérales, pas 4 sur la queue,
    `nO = périmètre/(1,9 r)` si besoin.
16. **Nuque** : V à −0,18 partout (run1) contre « pas de pointes isolées » (consigne queue). → `pulled.nape`, 0 pour la
    queue (bord fermé, émergence sur une même ligne), V ailleurs.
17. **Racines de frange** : raie en arc `part(az)` (fiche queue) contre `frontLine` rendue par `pulled` (run1). → run1 :
    même cote unique, déjà implémentée ; la queue n'a de toute façon plus de frange.

Pièges à ajouter à CLAUDE.md (étape 15), issus des fiches : un éventail réparti en azimut de pointe est lâche à 90° de
l'épi — répartir en angle autour de l'épi ; le **centre** des mèches de frange tombe sur le bord, pas la pointe la plus
longue ; un carré qui plonge dès le coin de l'œil passe sur les sourcils — plonger au-delà de sideAz ; une boucle debout
ne couvre pas (vue le long de la normale, c'est un trait) ; une torsion en fraction du brin fait perdre la couverture,
en fonction de la distance elle la conserve ; resserrer des mèches ouvre des jours, les bomber non ; un faisceau qui pend
à la verticale n'a aucune réponse aux bonds (la contrainte de longueur absorbe tout) — le chaînage la lui rend ; tout ce
qui borde les yeux se borne aussi en lacet ; un pas de tube en rayons de fil fait exploser le coût quand le fil s'affine ;
ce qui se pose au sommet doit se placer par rapport au bout haut de la fermeture.
