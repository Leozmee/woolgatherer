# woolgatherer

Générateur de **poupées vaudou en laine tricotée**, rendues en 3D temps réel.

Chaque poupée est entièrement procédurale : géométrie, textures de tricot, ornements
et signes distinctifs dérivent tous d'une seule graine. Aucun asset externe — les
cartes de laine, de tresse et de bois sont peintes au canvas au chargement.

Dans l'esprit de « all my friends are made of javascript », mais en volume et avec
une matière de peluche crédible.

## Ce qui est simulé

- **Laine tricotée** — trois cartes générées au canvas (couleur, normales, rugosité),
  la couleur dérivée du champ de hauteur plutôt que peinte à part.
- **Duvet volumétrique** — *shell texturing* : des copies du maillage repoussées le
  long des normales, percées d'un masque de fibres de plus en plus sélectif. C'est
  de la géométrie, pas une normal map : le bord pelucheux fait partie de la silhouette.
- **Locks tressés** — chaînes de *spring bones* avec collision du crâne.
- **Écharpe** — nappe de tissu en Verlet, simulée d'un bout à l'autre, tour de cou
  compris, drapée sur des colliders échantillonnés sur le profil réel du corps.
- **Collier** — chaîne de maillons entrelacés, simulée, qui repose sur les épaules.

## Signes distinctifs

Six variantes : couture intégrale, écharpe, couronne d'épingles, collier de chaîne,
ceinture, nœud papillon. Tout le reste — pièces rapportées, bracelet, bandage,
membres dépareillés, coupe et couleur des locks — varie avec la graine.

## Lancer

```bash
npm install
npm run dev      # http://localhost:5173
```

```bash
npm run build
npx tsc --noEmit
```

## Pile

Vite 6 · TypeScript · React Three Fiber 8 · three.js 0.171 · drei · leva
