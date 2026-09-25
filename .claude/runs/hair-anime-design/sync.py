#!/usr/bin/env python3
"""Recopie les propositions terminées du run hair-anime-design vers ce dossier.

Lit le journal du workflow (hors projet, lié à la session) et écrit ici :
- results.json : { "cuts": {coupe: proposition}, "synthesis": ..., "pending": [...] }
- une fiche Markdown par coupe terminée.
Relançable sans risque : il réécrit tout à chaque passage.
"""
import json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
JOURNAL = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
    os.path.expanduser('~'),
    '.claude/projects/-Users-leogallus-Projets-DummyFaces/77236db1-43ec-45aa-9052-e59f7758ef81'
    '/subagents/workflows/wf_e5b47176-61c/journal.jsonl')
CUTS = ['couettes', 'queue', 'chignon', 'nattes', 'meches', 'boucles', 'houppette', 'epars']

labels, results = {}, {}
if os.path.exists(JOURNAL):
    for line in open(JOURNAL, encoding='utf-8'):
        try:
            e = json.loads(line)
        except Exception:
            continue
        if e.get('type') == 'started':
            labels[e.get('agentId')] = e.get('label', '')
        elif e.get('type') == 'result':
            results[e.get('agentId')] = e.get('result')

cuts, synthesis = {}, None
for aid, res in results.items():
    lab = labels.get(aid, '')
    if lab.startswith('design:'):
        cuts[lab.split(':', 1)[1]] = res
    elif lab == 'synthèse':
        synthesis = res

out = {'cuts': cuts, 'synthesis': synthesis, 'pending': [c for c in CUTS if c not in cuts],
       'synthesisDone': synthesis is not None}
json.dump(out, open(os.path.join(HERE, 'results.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

for cut, res in cuts.items():
    if not isinstance(res, dict):
        continue
    # Ne pas écraser une fiche écrite par un agent de la reprise.
    if os.path.exists(os.path.join(HERE, f'proposition-{cut}.md')) and cut not in {'epars', 'chignon', 'houppette', 'couettes', 'nattes'}:
        continue
    with open(os.path.join(HERE, f'proposition-{cut}.md'), 'w', encoding='utf-8') as f:
        f.write(f'# Proposition — {cut}\n\n')
        for k in ['cut', 'diagnosis', 'physics', 'density', 'anime', 'codeSketch', 'risks']:
            if k in res:
                f.write(f'## {k}\n\n{res[k]}\n\n')
if synthesis:
    # Synthèse du premier run (5 coupes) : fichier à part, la reprise écrit synthese.md.
    with open(os.path.join(HERE, 'synthese-run1.md'), 'w', encoding='utf-8') as f:
        f.write('# Synthèse\n\n```json\n' + json.dumps(synthesis, ensure_ascii=False, indent=1) + '\n```\n')
print(f"{len(cuts)}/8 coupes, synthèse: {'oui' if synthesis else 'non'}, en attente: {out['pending']}")
