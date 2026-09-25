export const meta = {
  name: 'hair-anime-design',
  description: 'Propose une refonte anime des coupes en laine (physique tenue/libre, densité, style) puis synthétise les briques communes',
  phases: [
    { title: 'Conception', detail: 'un agent par coupe, lecture du code et proposition concrète' },
    { title: 'Synthèse', detail: 'briques communes et ordre d’implémentation' },
  ],
}

const CONTEXT = `
Projet : /Users/leogallus/Projets/DummyFaces (poupées vaudou en laine, three.js/R3F). Fichier principal : src/doll/hairstyles.tsx (coupes en laine fusionnées, physique au vertex shader via movers/aFree/aFling). Lis-le en entier, ainsi que les sections de CLAUDE.md sur les coupes.

Retour de l'utilisateur (à traiter impérativement) :
1. Sur les coupes à cheveux TIRÉS vers une attache (couettes, queue de cheval, chignon, nattes : fonction pulled()), la physique des cheveux à la racine (qui sont censés être MAINTENUS, tirés, serrés) est la même que celle des queues : ça n'a pas de sens. Les cheveux tirés doivent rester immobiles (tenus) ; seules les parties libres (queues, nattes pendantes, pelote peut-être très légèrement, mèches libres) bougent.
2. Certaines coupes paraissent beaucoup trop CLAIRSEMÉES : on voit le crâne (laine beige) entre des brins fins et espacés (captures : cheveux tirés bleus depuis une raie vers les côtés, cheveux tirés verts vers l'arrière vus de dessus). Il faut une couverture dense du crâne.
3. Certaines coupes ne font pas assez ANIME JAPONAIS, pas assez STYLÉES.

Contraintes fermes (demandes passées de l'utilisateur) :
- Les locks (hair.tsx) ne se touchent pas. La grande frange (bangs()) a déjà été retravaillée et plaît ; elle peut servir de référence/brique (mèches pointues clumps/pinch/flare, frange en tufts à deux rangées).
- Aucune « base » ou sous-couche couchée sous une coupe pour masquer le crâne : rejeté (« ça rend mal »). Chaque coupe couvre le crâne par ses propres brins.
- Seule « trois poils » (wisps/epars) a le droit d'être chauve.
- Pas de mouvement au repos ; la chevelure réagit quand on agite / déplace la poupée (ressorts + écartement centrifuge uFling).
- Style : laine (fil retors), rendu cel « laine, trait encre ». Anime = mèches pointues groupées, frange en pointes, mèches latérales qui encadrent le visage, épi (ahoge), silhouette lisible, volume, pointes effilées.
- Performances raisonnables (géométrie fusionnée par matière ; MAX_MOVERS = 32 ressorts par coupe).
`

const CUTS = [
  { id: 'couettes', fn: 'pigtails() + pulled() + bunch()' },
  { id: 'queue', fn: 'ponytail() + pulled() + bunch()' },
  { id: 'chignon', fn: 'bun() + pulled()' },
  { id: 'nattes', fn: 'braids() + pulled()' },
  { id: 'meches', fn: 'bowlCut() + radiate()' },
  { id: 'boucles', fn: 'curls()' },
  { id: 'houppette', fn: 'tuft()' },
  { id: 'epars', fn: 'wisps() (trois poils, le seul autorisé chauve)' },
]

const PROPOSAL = {
  type: 'object',
  properties: {
    cut: { type: 'string' },
    diagnosis: { type: 'string', description: 'Pourquoi c’est clairsemé / mal animé / peu stylé aujourd’hui, chiffres à l’appui (nombre de brins, rayon, espacement estimé à la lisière et près de l’attache, mobilité aFree des racines).' },
    physics: { type: 'string', description: 'Qui bouge, qui est tenu : valeurs de aFree/aFling proposées par partie, ressorts à garder/retirer.' },
    density: { type: 'string', description: 'Comment couvrir le crâne sans base : nombre de brins déduit de la géométrie, couches, rayon, formule concrète.' },
    anime: { type: 'string', description: 'Refonte stylistique concrète : éléments (frange en pointes, mèches latérales, épi, pointes des queues en mèches…), silhouette, paramètres.' },
    codeSketch: { type: 'string', description: 'Esquisse de code TypeScript précise, en s’appuyant sur les helpers existants (radiate, hairline, onHeadPolar, onDir, dirOf, yarn, sectorMovers, bunch…). Signatures exactes.' },
    risks: { type: 'string', description: 'Pièges de CLAUDE.md concernés, collisions possibles (brins dans le crâne, frange sur les boutons des yeux), coût.' },
  },
  required: ['cut', 'diagnosis', 'physics', 'density', 'anime', 'codeSketch', 'risks'],
}

phase('Conception')
const proposals = await parallel(CUTS.map((c) => () => agent(
  `${CONTEXT}

Ta coupe : « ${c.id} » — code : ${c.fn}. Lis précisément ces fonctions et les helpers qu'elles utilisent. Propose une refonte concrète qui traite les trois points du retour utilisateur pour CETTE coupe (si un point ne s'applique pas, dis-le). Sois quantitatif : estime l'espacement réel des brins (circonférence à la lisière / nombre de brins vs diamètre du fil, en fonction de p.hair.thickness et p.shape.headRadius), propose un compte déduit de la géométrie. Ne modifie AUCUN fichier : lecture seule, tu rends une proposition.`,
  { label: `design:${c.id}`, phase: 'Conception', schema: PROPOSAL },
)))

const ok = proposals.filter(Boolean)
log(`${ok.length}/${CUTS.length} propositions reçues`)

phase('Synthèse')
const SYNTH = {
  type: 'object',
  properties: {
    sharedBlocks: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, purpose: { type: 'string' }, signature: { type: 'string' }, sketch: { type: 'string' }, usedBy: { type: 'array', items: { type: 'string' } } }, required: ['name', 'purpose', 'signature', 'sketch', 'usedBy'] } },
    perCut: { type: 'array', items: { type: 'object', properties: { cut: { type: 'string' }, plan: { type: 'string' } }, required: ['cut', 'plan'] } },
    order: { type: 'string' },
    measurements: { type: 'string', description: 'Mesures objectives à faire après implémentation : couverture du crâne (%), mobilité par zone, brins dans le crâne, frange sur les yeux, compte de triangles.' },
    conflicts: { type: 'string', description: 'Contradictions entre propositions et arbitrage.' },
  },
  required: ['sharedBlocks', 'perCut', 'order', 'measurements', 'conflicts'],
}
const synthesis = await agent(
  `${CONTEXT}

Voici ${ok.length} propositions de refonte, une par coupe :
${JSON.stringify(ok, null, 1)}

Synthétise : (1) les briques communes à factoriser dans hairstyles.tsx (ex. frange en pointes paramétrable extraite de bangs(), mèches latérales encadrant le visage avec ressort, épi/ahoge, cheveux tirés denses et immobiles, pointes de queue en mèches), avec signature et esquisse ; (2) le plan par coupe ; (3) l'ordre d'implémentation ; (4) les mesures objectives de vérification ; (5) les contradictions entre propositions et ton arbitrage. Vérifie chaque affirmation chiffrée contre le code (lecture seule).`,
  { label: 'synthèse', phase: 'Synthèse', schema: SYNTH },
)

return { proposals: ok, synthesis }
