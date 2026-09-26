# Run « hair-anime-design » — refonte anime des coupes en laine

Conception lancée le 25/09/2026 (run `wf_e5b47176-61c`, session `77236db1…`).
Un agent par coupe propose une refonte (cheveux tirés immobiles, crâne couvert
sans base, allure anime), puis un agent synthétise les briques communes.

## État (voir `results.json`, régénéré par `sync.py`)

- Terminées et sauvegardées : voir `proposition-*.md`.
- Échouées sur la **limite d'usage** (réinitialisation 1 h 40, heure de Paris) :
  queue, mèches, boucles ; nattes interrompue.
- Synthèse : pas encore produite.

## Reprendre

1. Mettre à jour les résultats : `python3 .claude/runs/hair-anime-design/sync.py`
2. Relancer seulement ce qui manque, puis la synthèse :
   `Workflow({ scriptPath: ".claude/runs/hair-anime-design/workflow-reprise.js",
   args: { todo: ["queue", "meches", "boucles"] } })` (mettre les coupes du
   champ `pending` de results.json). Chaque agent écrit sa fiche
   `proposition-<coupe>.md` avant de rendre la main, et la synthèse relit
   toutes les fiches du dossier puis écrit `synthese.md` : ce qui est fini
   survit à une coupure.
3. Dans la même session seulement, la reprise native marche aussi :
   `resumeFromRunId: "wf_e5b47176-61c"` avec le script d'origine
   (`workflow-original.js`).

## Déjà fait dans le code (non commité au moment du run)

- `fighter.ts` : poupées droites sur la planche (penché d'arme réservé à l'arène).
- `hairstyles.tsx` : cheveux tirés **immobiles** (plus de ressorts), densité
  déduite de la géométrie sur deux couches (queue : côtés 64 → 81 % couverts ;
  nattes : 87 → 94 %) ; accès d'audit `window.__hairs` en dev.

## Reprise lancée

Run `wf_0db51f18-5b0` (queue, mèches, boucles, puis synthèse finale → `synthese.md`). Journal : `~/.claude/projects/-Users-leogallus-Projets-DummyFaces/77236db1-43ec-45aa-9052-e59f7758ef81/subagents/workflows/wf_0db51f18-5b0/journal.jsonl`. Même session : `resumeFromRunId: "wf_0db51f18-5b0"`.

## Implémentation — état au 25/09 au soir

Branche **`coupes-anime`** (poussée sur GitHub), copie de travail
`/Users/leogallus/Projets/DummyFaces-coupes` (worktree, `node_modules` en lien
symbolique, serveur de dev : config `coupes` du `.claude/launch.json`, port 5174).
Base : `peluches-jouables` @ 08a4a57 (poussée aussi).

Fait (commit 52a1704), étapes 1 à 3 de `synthese-run1.md` :
- outils : yarn step/segs/taper, tubes fermés ≥ 16 segments, onDir(cap)+POLE,
  still(fling), smooth/after/faceSafe (exportés en attendant leur emploi),
  alerte > 32 ressorts, `buildHairParts` exporté pour les audits ;
- pulled() refondue (racines au pas réel, 1,8 r, deux couches, crown/tuck/grooves,
  rend frontLine) — tenue, sans ressort ;
- pelote du chignon tenue.

Audit de couverture v2 (distance à l'axe des tubes, 3 épaisseurs × 3 graines) :
queue 98–99 %, chignon 97–99 %, couettes 96–98 %, nattes 96–98 % ; tempes 90–95 %.
Attention : la mesure v1 (proximité des sommets) sous-estime quand step = 6.

Reste, dans l'ordre de `synthese-run1.md` : étape 4 (fringeTufts extraite de
bangs() avec preuve d'empreinte — signature de référence de la grande frange,
50 graines × 3 épaisseurs : `1406201.063069`, 5 566 540 sommets —, sideLock,
ahoge, bundle, bowKnot), puis houppette, couettes, queue, chignon, nattes, trois
poils, et queue/mèches/boucles selon leurs fiches ; enfin CLAUDE.md.

À faire aussi : fusionner les nouveaux commits de la session cloud
(`origin/claude/quirky-galileo-g4u9c5` @ 9a46343) dans `peluches-jouables`.

## Reprise du 26/09 (08 h 45)

Run `wf_dbae583e-169` : mèches (fiche partielle à compléter), boucles, puis synthèse finale → `synthese.md`. Les agents lisent la copie de travail `DummyFaces-coupes` (le dossier principal est sur la branche cloud `claude/quirky-galileo-g4u9c5`). Même session : `resumeFromRunId: "wf_dbae583e-169"`, args `{"todo": ["meches", "boucles"]}`.

## À faire après la refonte (demande du 26/09)

**Adapter la fermeture éclair à chaque coupe** (`zip.tsx`, branche cloud). Défauts vus : des brins passent **devant** la fermeture ; la raie/rainure **continue** au-delà du bout de la fermeture, crâne nu là où il faut des cheveux. Plan : une seule source pour l’étendue de la fermeture (`zipMetrics` : haut et bas sur le méridien arrière, largeur du ruban), lue par `zip.tsx` et par les coiffures. Le long de la fermeture, les brins s’écartent et s’arrêtent de part et d’autre du ruban ; au-delà de ses bouts, la raie se referme et les cheveux couvrent. Toutes les coupes, locks compris (sans toucher `hair.tsx` : écarter leurs racines du ruban). À faire après la fusion de `coupes-anime` avec `claude/quirky-galileo-g4u9c5`.

**Référence validée par l’utilisateur** (`reference-fermeture-ok.webp`, nattes vues de dos) : la raie des cheveux tirés tombe exactement sur la fermeture, brins partant de chaque côté du ruban, aucun devant ; sous la lisière la fermeture continue seule sur la laine. C’est le modèle à reproduire sur toutes les coupes.

**Contre-exemple refusé** (`contre-exemple-fermeture-meches.webp`, coupe au bol / mèches vue de dos) : les brins passent **par-dessus** la fermeture, visible à travers les interstices ; elle ne ressort que sous la lisière, sans raie. Pour les coupes rayonnantes (mèches, bouclettes, grande frange, houppette) : ouvrir une raie exactement sur la fermeture sur toute sa hauteur couverte, brins partant de chaque côté du ruban.

**Défaut à corriger** (`defaut-trou-haut-fermeture.png`, cheveux tirés vus de dos) : le long de la fermeture c’est bien, mais **au-dessus de son bout haut la raie continue** vers le sommet, crâne nu. Au-delà du bout haut, la raie doit se refermer : les brins des deux côtés se rejoignent et couvrent (dans `pulled()`, la raie ne s’ouvre que sur l’étendue de la fermeture ; ailleurs, brins jointifs au pas normal).

## Consigne utilisateur — queue de cheval (26/09)

`defaut-queue-sur-fermeture.webp` rend mal : la queue pend dans le dos **en plein sur la fermeture** (qu’elle masque) et la lisière de nuque est hérissée de pointes isolées (bord effiloché). **À faire, selon `croquis-queue-haute.png`** : attache **au sommet du crâne** (un peu en arrière), la queue **monte puis se recourbe en arc vers l’arrière** — queue haute d’anime qui rebondit —, sans retomber sur la fermeture. Prime sur la proposition d’agent (`proposition-queue.md`, attache sy 0,35–0,7 derrière) : garder ses briques (bundle en mèches, pulled tenu), changer l’attache et la trajectoire (axe qui s’élève puis s’incurve, ressort pivot au nœud, repos non vertical donc gravité faible ou nulle et courbure dessinée). Lisière de nuque : pas de pointes isolées — bord fermé ou mèches groupées.
