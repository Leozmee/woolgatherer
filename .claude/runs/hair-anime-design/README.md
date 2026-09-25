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
