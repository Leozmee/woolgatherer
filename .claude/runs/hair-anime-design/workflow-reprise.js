export const meta = {
  name: 'hair-anime-design-reprise',
  description: 'Reprise : conçoit seulement les coupes manquantes (args.todo), chaque agent sauvegarde sa fiche, puis synthèse depuis les fiches',
  phases: [
    { title: 'Conception', detail: 'coupes manquantes, une fiche sauvegardée par agent' },
    { title: 'Synthèse', detail: 'depuis toutes les fiches du dossier' },
  ],
}

const DIR = '/Users/leogallus/Projets/DummyFaces/.claude/runs/hair-anime-design'

const CONTEXT = `
Projet : /Users/leogallus/Projets/DummyFaces (poupées vaudou en laine, three.js/R3F). Fichier principal : src/doll/hairstyles.tsx (coupes en laine fusionnées, physique au vertex shader via movers/aFree/aFling). Lis-le en entier, ainsi que les sections de CLAUDE.md sur les coupes. ATTENTION : pulled() a déjà été modifié depuis le début du run — les cheveux tirés sont maintenant immobiles (aucun ressort) et leur densité est déduite de la géométrie sur deux couches (pitch = 3 r). Pars du code actuel.

Retour de l'utilisateur (à traiter impérativement) :
1. Sur les coupes à cheveux TIRÉS vers une attache (couettes, queue, chignon, nattes), les cheveux à la racine sont MAINTENUS : immobiles. Seules les parties libres (queues, nattes pendantes, pelote, mèches libres) bougent.
2. Certaines coupes paraissaient beaucoup trop CLAIRSEMÉES (crâne visible entre des brins fins et espacés). Couverture dense exigée.
3. Certaines coupes ne font pas assez ANIME JAPONAIS, pas assez STYLÉES. Et l'utilisateur veut améliorer la physique et l'aspect général des cheveux.

Contraintes fermes : locks (hair.tsx) intouchables ; grande frange (bangs()) déjà appréciée, référence possible ; aucune base/sous-couche sous une coupe ; seule « trois poils » peut être chauve ; pas de mouvement au repos (réaction aux gestes et déplacements) ; rendu laine + trait encre ; MAX_MOVERS = 32 ; perfs raisonnables.
`

const ALL = {
  couettes: 'pigtails() + pulled() + bunch()',
  queue: 'ponytail() + pulled() + bunch()',
  chignon: 'bun() + pulled()',
  nattes: 'braids() + pulled()',
  meches: 'bowlCut() + radiate()',
  boucles: 'curls()',
  houppette: 'tuft()',
  epars: 'wisps() (trois poils, le seul autorisé chauve)',
}
const todo = (args && args.todo) || []
log(`À concevoir : ${todo.join(', ') || 'rien'} — les autres fiches sont déjà dans ${DIR}`)

const PROPOSAL = {
  type: 'object',
  properties: {
    cut: { type: 'string' },
    diagnosis: { type: 'string' },
    physics: { type: 'string' },
    density: { type: 'string' },
    anime: { type: 'string' },
    codeSketch: { type: 'string' },
    risks: { type: 'string' },
    savedTo: { type: 'string', description: 'Chemin de la fiche Markdown écrite' },
  },
  required: ['cut', 'diagnosis', 'physics', 'density', 'anime', 'codeSketch', 'risks', 'savedTo'],
}

phase('Conception')
const fresh = await parallel(todo.map((id) => () => agent(
  `${CONTEXT}

Ta coupe : « ${id} » — code : ${ALL[id]}. Lis précisément ces fonctions et leurs helpers. Propose une refonte concrète qui traite les trois points pour CETTE coupe. Sois quantitatif (espacement réel des brins vs diamètre du fil, en fonction de p.hair.thickness et p.shape.headRadius ; compte déduit de la géométrie). Ne modifie AUCUN fichier du code source.

IMPORTANT — sauvegarde : dès que ta proposition est prête, ÉCRIS-LA d'abord dans ${DIR}/proposition-${id}.md (sections : diagnosis, physics, density, anime, codeSketch, risks), PUIS rends-la en sortie structurée avec savedTo = ce chemin. La limite d'usage peut couper la session : la fiche écrite est ce qui survit.`,
  { label: `design:${id}`, phase: 'Conception', schema: PROPOSAL },
)))
log(`${fresh.filter(Boolean).length}/${todo.length} nouvelles fiches`)

phase('Synthèse')
const SYNTH = {
  type: 'object',
  properties: {
    sharedBlocks: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, purpose: { type: 'string' }, signature: { type: 'string' }, sketch: { type: 'string' }, usedBy: { type: 'array', items: { type: 'string' } } }, required: ['name', 'purpose', 'signature', 'sketch', 'usedBy'] } },
    perCut: { type: 'array', items: { type: 'object', properties: { cut: { type: 'string' }, plan: { type: 'string' } }, required: ['cut', 'plan'] } },
    order: { type: 'string' },
    measurements: { type: 'string' },
    conflicts: { type: 'string' },
    savedTo: { type: 'string' },
  },
  required: ['sharedBlocks', 'perCut', 'order', 'measurements', 'conflicts', 'savedTo'],
}
const synthesis = await agent(
  `${CONTEXT}

Lis TOUTES les fiches ${DIR}/proposition-*.md (une par coupe ; certaines viennent d'un run précédent). Synthétise : (1) les briques communes à factoriser dans hairstyles.tsx (frange en pointes paramétrable extraite de bangs(), mèches latérales encadrant le visage avec ressort, épi/ahoge, pointes de queue en mèches, etc.) avec signature et esquisse ; (2) le plan par coupe ; (3) l'ordre d'implémentation ; (4) les mesures objectives de vérification (couverture du crâne %, mobilité par zone, brins dans le crâne, frange sur les yeux, triangles) ; (5) les contradictions entre fiches et ton arbitrage. Vérifie les affirmations chiffrées contre le code actuel (lecture seule).

IMPORTANT — sauvegarde : écris d'abord ta synthèse dans ${DIR}/synthese.md, PUIS rends-la en sortie structurée avec savedTo = ce chemin.`,
  { label: 'synthèse', phase: 'Synthèse', schema: SYNTH },
)

return { fresh: fresh.filter(Boolean).map((f) => f.cut), synthesis }
