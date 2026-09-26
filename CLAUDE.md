# DummyFaces — contexte projet

Générateur de **poupées vaudou en laine tricotée**, rendues en 3D temps réel. Chaque poupée est entièrement procédurale : géométrie, textures de tricot, ornements et signes distinctifs dérivent tous d'une seule graine.

Objectif final : une galerie de poupées uniques, dans l'esprit de « all my friends are made of javascript », mais en volume et avec une matière de peluche crédible.

## Stack

| Couche | Techno |
|--------|--------|
| Build | Vite 6 + TypeScript |
| 3D | three.js 0.171 via React Three Fiber 8 |
| Helpers | @react-three/drei (Environment, Lightformer, ContactShadows, Html) |
| Panneau de réglages | leva |
| Textures | 100 % canvas procédural — **aucun asset externe** |

```bash
npm run dev      # http://localhost:5173
npm run build
npx tsc --noEmit
```

## Architecture

```
src/
├── core/
│   ├── rand.ts         mulberry32 (PRNG seedé) + bruit de valeur / fbm
│   ├── knit.ts         cartes de laine tricotée : couleur, normales, rugosité, côtes
│   ├── cord.ts         tresse 3 brins entrelacés (locks, nattes) + fil retors (autres coupes)
│   ├── springBone.ts   spring bone façon VRM + colliders sphériques
│   ├── cloth.ts        nappe de tissu en Verlet — grille de particules, boucle optionnelle
│   ├── turntable.ts    état de la platine tournante, hors React
│   ├── batch.tsx       fusion des petites pièces fixes par matière (<Batched>)
│   └── useDisposable.ts mémoïsation + libération des ressources GPU
├── doll/
│   ├── params.ts       TOUS les réglages leva → objet DollParams typé (dont `scarf`)
│   ├── surface.ts      profil du crâne et du torse — source unique (profil + colliders)
│   ├── geometry.ts     volumes rembourrés (tête, torse, membres)
│   ├── layout.ts       ancrages dérivés des proportions
│   ├── morph.ts        morphologie par poupée : facteurs latents autour du panneau, planche à écart maximal
│   ├── fuzz.ts         duvet volumétrique par shell texturing + trous sous les pièces
│   ├── hair.tsx        locks tressés articulés (chaînes de spring bones)
│   ├── hairstyles.tsx  neuf autres coupes en laine, fusionnées, physique au vertex shader
│   ├── face.tsx        visage : humeur, point de bouche, boutons, détail — planche sans répétition
│   ├── patch.ts        pièces de tissu cousues + poche
│   ├── ribbon.ts       bande de tissu balayée le long d'un tracé
│   ├── sheet.ts        maillage deux couches d'une nappe simulée
│   ├── fringe.ts       mèches de frange dérivées du bout d'une nappe
│   ├── scarf.tsx       écharpe : nappe simulée d'un bout à l'autre + franges
│   ├── wood.ts         veinage de bois (boutons, perles, breloques)
│   ├── rig.ts          squelette : os (dont coudes/genoux), cotes, suivi des membres, FrameCarry, sol local
│   ├── fighter.ts      combattant : contrôle, gestes pose à pose, cycle de pas, saut/double saut, dash, glissade, K.O.
│   ├── limbs.ts        pieds (Stepper : cycle / réactif / glissade), pli coude-genou (jointShader), IK de jambe
│   ├── traits.tsx      signes distinctifs par emplacement nommé
│   ├── parts.tsx       primitives : fil, point de croix, bouton, épingle
│   ├── zip.tsx         fermeture éclair au dos du crâne, languette sur ressort
│   └── Doll.tsx        assemblage + boucle d'animation (IK, ressorts, colliders du corps, silhouette)
├── scene/
│   ├── Lights.tsx      studio local (Lightformer, pas de HDRI réseau), dosé par rendu
│   ├── toon.ts         cel shading dans le chunk d'éclairage + catalogue des rendus
│   ├── Outline.tsx     encre anime : passe plein écran sur la profondeur
│   ├── Rig.tsx         caméra + platine
│   ├── KeepPrograms.tsx garde les shaders compilés en vie
│   ├── Arena.tsx       traînée de l'arme, poussière, tapis cousu, images rémanentes, cercle du double saut
│   └── BlobShadow.tsx  ombre approchée pour la planche
└── App.tsx             planche (choisir) → présentation (jouer) → arène de combat
```

## Décisions structurantes

**Le tricot est une texture, pas de la géométrie.** Trois cartes générées au canvas (couleur, normales, rugosité), ~100 ms en 1024². La couleur est **dérivée du champ de hauteur** plutôt que peinte séparément : peindre les deux indépendamment les faisait diverger, la carte de couleur finissait plate.

**Le duvet est de la géométrie, pas une texture.** Une normal map ne change ni la silhouette ni le contour, or c'est le bord pelucheux qui dit « laine ». D'où le *shell texturing* : N copies du maillage repoussées le long des normales, percées d'un masque de fibres de plus en plus sélectif.

**`surface.ts` est la source unique des profils.** Yeux, bouche, épingles, locks, pièces de tissu passent tous par `onHead` / `onHeadPolar` / `onTorso`. Toute copie de ces formules finit par diverger, et les éléments posés dessus flottent ou s'enfoncent dès qu'une proportion change.

**Tout l'aléatoire dérive de `params.seed`.** Le bouton *Générer* ne fait que tirer une nouvelle graine.

## Pièges rencontrés — à ne pas réintroduire

**Le jersey n'a pas de quinconce.** Décaler une rangée sur deux d'une demi-cellule fabrique un réseau de losanges, pas du tricot. Les colonnes de mailles sont verticales, et chaque maille doit être peinte **entièrement** avant la suivante, du bas vers le haut — peindre palier par palier sur toute la grille remet la crête par-dessus tout le monde et supprime le tressage.

**`CapsuleGeometry` (three r171) n'a aucun segment le long du fût.** Toute la longueur d'un membre est couverte par un seul pas de `v` : la texture s'y étire en traînées. `limbGeometry` réattribue `v` depuis la hauteur du sommet.

**Le rayon du collider des locks a une seule bonne valeur.** Plus grand que les ancrages, il repousse chaque mèche depuis son point d'attache et les locks partent en épis ; plus petit, elles s'enfoncent dans le crâne. Il est déduit des ancrages, jamais réglé à la main.

**Une racine posée sur le scalp lit comme une perruque.** Pour qu'un lock *sorte* du crâne, sa racine est enfouie **sous** la surface et le collider placé juste au-dessus : le premier segment doit alors traverser le scalp. L'écart (enfouissement + dégagement) doit rester petit devant la longueur d'un segment, sinon la contrainte n'a plus de solution oblique.

**Raideur forte + amortissement faible = ressort.** Pour du tissu qui tombe c'est l'inverse : raideur quasi nulle, amortissement élevé, gravité dominante. Et la rampe le long de la chaîne doit rester plate — une transition marquée concentre toute la flexion sur un joint et la mèche casse en coude.

**Les pièces de tissu sont des éventails projetés sur la surface**, pas des calottes de sphère plaquées : elles passent par la même fonction que leurs coutures, donc ne peuvent pas s'en désolidariser.

**Aucune hauteur de relèvement ne sauve une pièce posée sur du duvet : il faut retirer la laine dessous.** Le duvet est de la géométrie, et il monte plus haut que ce qu'on coud dessus. Trop bas, la pièce reste **sous les fibres** : elles la traversent, des éclats de laine parsèment sa face et son bord disparaît dans le poil. Assez haut pour les dominer, elle est posée au sommet du duvet, plus rien ne mord sur son bord, elle décolle. Les deux défauts se touchent — il n'y a pas de fenêtre entre eux. La seule sortie est celle d'un vrai morceau de tissu cousu à plat : **percer le duvet sous la pièce** (`patchHoles` + `holeShader`). Le relèvement ne compense alors plus que les bosses du rembourrage, plus un tiers de fibre pour que le bord ressorte.

**Un relèvement constant fait un couvercle, pas une pièce cousue.** `onTorso` décale chaque sommet le long de la normale : à relèvement constant, la pièce est la **surface parallèle** du torse — et le contour d'une surface parallèle, vu de profil, est celui du corps dilaté d'autant. Son bord sort donc du corps, en l'air, quelle que soit la valeur choisie, et c'est ce qu'on lit comme « décollé » même quand la face est propre. Un tissu cousu à plat a le profil inverse : dégagé au milieu, là où le rembourrage bombe, et **pincé sous la peau** sur son pourtour, là où le surjet le rabat. D'où un profil de relèvement — plateau, puis jupe qui plonge sous le creux du bosselage — et les anneaux qu'il faut pour le porter : un contour unique ne peut porter aucun profil. La jupe se termine là où le duvet revient (`HOLE_SHRINK`), donc les fibres restantes referment justement dessus.

**Un point de couture se définit par le fait d'entrer dans le tissu.** Une passe posée à altitude constante s'arrête en l'air à ses deux bouts ; le duvet est un halo troué — sur la coque externe l'`alphaTest` ne laisse passer qu'un dixième des fibres — donc il ne les cache pas, et le fil lit comme un bâtonnet couché sur la laine. C'est le **plongeon**, pas la passe, qui dit « cousu ». Les brins portent donc un `dip` : une Bézier quadratique dont les deux bouts sont sous la peau et dont le point de contrôle, à la même distance au-dessus, ramène le sommet exactement là où était l'axe du cylindre — on enfonce les bouts, on ne relève rien. Vaut pour la bouche et la couture intégrale autant que pour le surjet des pièces. Le même symptôme se voyait sur les trois, et pour la même raison.

**Mais le bout intérieur du surjet s'ancre sur le plateau, pas sur la jupe.** Posé sur la jupe il descend avec elle, la passe entière disparaît dans la laine, et la pièce perd la seule chose qui dise qu'elle est cousue — le fil. Il faut le prendre en deçà du rabat.

**Ce trou se taille au fragment, pas dans la topologie.** Le torse est une sphère 48×36 : une pièce ne couvre que six mailles en travers, et un trou fait de triangles supprimés serait un polygone grossier là où le contour est déchiqueté. On rastérise donc le contour dans le **repère local de la pièce** — celui où il n'est qu'un polygone de rayons — et le shader des coques y échantillonne un masque de quatre tuiles. Le repère lu par le shader est l'ellipsoïde **idéale** (`aSmooth`, posée avant le bosselage) : lu sur la surface bosselée, le trou dériverait de la pièce de toute l'amplitude des bosses. Le contour du trou est rentré de quelques centièmes — c'est cette frange de laine restante qui raccroche le bord à la peluche. Pas de cordon continu sur le bord non plus : ça lit comme une corde autour d'un trou.

**Aucun élément cousu n'a d'emplacement en dur.** Pièces et poche passent toutes par `samplePlacement` : tirage libre avec rejet des chevauchements. Une liste de créneaux fixes légèrement bruités ramène les mêmes éléments au même endroit à chaque génération — c'est ce qui donne l'impression que la régénération ne fait rien.

**Un tube ne peut pas faire une écharpe.** Aplati comme on veut, il garde une section constante et lit comme un boudin. Une bande a une largeur et une épaisseur distinctes, et sa largeur doit s'orienter seule : `sweptBand` la calcule en chaque point comme `tangente × radiale`, ce qui la met à plat contre le corps pendant le tour de cou et de face quand elle retombe — une règle unique, sans transition à écrire.

**L'écharpe est simulée d'un bout à l'autre, tour de cou compris.** Les spring bones conviennent à ce qui **pend** depuis un point fixe (mèche, pan) : chaque os y est rigidement attaché au précédent et suit une pose de repos. Ils ne conviennent pas à ce qui **repose** sur un corps — un tour de cou en spring bones reste un anneau rigide qui traverse les épaules. Le Verlet donne des particules libres, reliées par des contraintes de distance et repoussées hors des sphères du corps : le tissu s'y drape par-dessus. Le champ `pin` retient chaque particule vers sa pose de repos, fort autour du cou — sans quoi l'écharpe glisse au sol — nul sur les pans.

**Une chaîne de particules est une corde, pas du tissu.** Avec une seule ligne simulée, la largeur est reconstruite après coup par balayage : elle est donc parfaitement rigide, le pan ne peut ni se vriller, ni onduler en travers, ni ouvrir un pli, et il lit comme un ruban de carton quelle que soit la physique. `ClothSheet` simule une **grille** — structure en long et en large, cisaillement en diagonale, pliage à un rang d'écart. Plis, vrille et drapé sur les épaules en sortent tout seuls.

**Un pan qui pend à la verticale est déjà à l'équilibre.** La gravité tire dans l'axe où il pend : rien ne le fait plier, et aucune souplesse ne le sauve — il reste une planche. Il faut lui donner de quoi flamber : un surplus de largeur (`slack`), et surtout une **vrille et un roulé des bords inscrits dans la pose de repos**, donc dans les longueurs au repos des contraintes. La gravité n'agit pas en travers du pan, elle ne peut donc pas les défaire.

**Le roulé des bords est une puissance élevée de la distance au milieu.** Un profil doux sur toute la largeur ne roule pas les bords, il gonfle le pan en boudin. `edge³` retourne les bords en laissant le milieu plat. Et il faut assez de colonnes : à six, la courbe se lit comme un pli net au milieu du pan.

**La rampe de vrille et de roulé ne suit pas la rampe de retenue.** Calquée dessus, elle s'installe sur quatre rangs : la section change d'un coup et le changement se voit comme une cassure. Sa propre rampe, longue d'une douzaine de rangs, répartit la transition.

**Un pan raccordé au tour de cou par un segment droit fait un coude.** Il repart dans une autre direction que celle où le tissu tournait, et la simulation ne défait pas ce coude — on lui demande justement d'y retenir le tissu. Une courbe d'Hermite quitte le tour **avec sa tangente** puis s'infléchit vers le bas : la continuité est géométrique, il n'y a plus d'angle à lisser.

**Un tour complet ramène au point de départ.** Avec un tour pile, les deux pans partent du même endroit et celui de devant traverse la poitrine en diagonale, comme une bandoulière. Et dans ce repère l'angle 0 pointe vers le **côté** (cos → x, sin → z), pas vers l'avant : à un tour et quart le tour de cou finit sur le flanc. Il faut un demi-tour de plus qu'un compte entier — un tour et demi, deux et demi — pour relier l'avant à l'arrière. C'est le **demi-tour** qui compte, pas le nombre de tours.

**Un tour de cou qui descend régulièrement n'est symétrique qu'en apparence.** La couche qui recouvre la racine du bas se trouve **au-dessus** d'elle : le pan s'en éloigne en tombant, il sort proprement de dessous. Celle qui recouvre la racine du haut est **en dessous** : le pan doit la traverser en descendant, et il ressort par-dessus au moindre écart de rayon. D'où un devant qui refuse obstinément de se comporter comme l'arrière, quoi qu'on règle. La boucle **monte puis redescend** (`sin(πt)`) : les deux racines sont alors en bas, la partie qui les recouvre au-dessus, et les deux bouts pendent depuis le bord bas — ce que fait une vraie écharpe, dont les tours s'empilent à peu près à la même hauteur.

**Basculer `side` fait tourner la configuration, ça ne la reflète pas.** Une rotation n'inverse pas une torsion : sans signe explicite, les deux écharpes se vrillent dans le même sens au lieu d'être des miroirs, et le bord de la bande part vers le bras d'un côté et vers le vide de l'autre. Même piège pour le roulé des bords, dont la direction (`across × tan`) suit la main du produit vectoriel et bascule avec le sens d'enroulement — on la ramène sur la radiale, toujours vers l'extérieur. Tout ce qui a une **chiralité** doit porter le signe, pas seulement les positions. (Le miroir a été retiré depuis, mais les signes sont restés : ils ne coûtent rien et ils documentent le piège.)

**Multiplier à la fois le décalage angulaire et l'incrément par `side`** est ce qui donnait le miroir exact — les deux bouts restant en diagonale, séparés d'un demi-tour. À conserver si le miroir revient.

**Le sens d'enroulement est fixe, et c'est un choix.** `side` reste une constante dans les métriques plutôt qu'un `1` semé dans les formules : les signes de chiralité restent ainsi lisibles là où ils comptent, et le miroir se réactiverait en changeant une ligne. Ce qu'il fallait pour l'obtenir est resté écrit ci-dessous.

**Le rayon du tour de cou croît le long de l'enroulement.** À rayon constant les deux couches sont au même endroit et s'interpénètrent : le pan avant ressort alors **par-dessus** la couche qui devrait le recouvrir, et on se demande ce qui le retient. Avec la croissance, chaque tour se pose sur le précédent. Corollaire : le pan qu'on veut voir devant doit être attaché au **début** du tour, sur la couche intérieure — c'est l'ordre d'enroulement, pas la géométrie, qui décide lequel passe dessous.

**Une nappe s'arrête sur une arête franche, une écharpe non.** Un bout coupé net lit comme un ruban de tissu ; ce sont les **franges** que l'œil cherche. Elles sont dérivées du dernier rang à chaque frame (`fringe.ts`), pas simulées — racine sur le rang, direction qui s'infléchit du sens du tissu vers le poids. Deux pièges : une mèche par colonne donne des brins jointifs qui se soudent en plaque (une frange se lit aux **vides** autant qu'aux mèches), et une dérive latérale appliquée une seule fois au départ est aussitôt absorbée par le rappel vers le poids — toutes les mèches redeviennent parallèles. Il faut la réappliquer à chaque pas.

**Un vecteur qui sert de direction doit être normalisé, même quand personne ne s'en plaint.** `end.across` est la **corde** du dernier rang : sa norme vaut la largeur de la bande. Ajouté tel quel à une direction unitaire, il divisait par six l'écart latéral demandé — la frange sortait en peigne de brins rigoureusement parallèles quel que soit le réglage, et le symptôme ne ressemblait pas du tout à sa cause. L'indice était dans le code : le même vecteur était normalisé **en copie** un peu plus loin, donc l'intention était bien une direction. Après correction, l'écart et la dérive se retaillent, ils étaient calibrés pour l'ancienne échelle.

**L'épaisseur d'un brin de frange est une demi-maille, pas une fraction de la largeur de bande.** Déduite du nombre de mèches, elle valait les trois quarts d'une maille entière : chaque brin était aussi gros que le fil qui a tricoté le tissu tout entier, les brins se touchaient presque, et une frange se lit aux **vides** autant qu'aux mèches. L'étalon est le fil, donc `knitUnit / cols`.

**Les UV d'un brin suivent la même loi que la nappe : longueur sur `v`.** Dans l'autre sens le brin traverse près de trois périodes de côte dans sa longueur et sort zébré en travers, comme une chenille, au lieu de montrer les rangs empilés d'un fil retors. Un décalage par mèche évite en plus qu'elles prélèvent toutes le même liseré de la tuile.

**Une ondulation a besoin de sections pour exister, et de deux composantes pour ne pas être un pli.** À six sections un brin ne peut pas porter plus d'une vague. Et une oscillation dans le seul plan du brin le plie comme une tôle : il faut aussi une composante en travers pour obtenir la torsade d'un fil de laine.

**Les UV figées au premier passage doivent être réarmées quand ce qu'elles décrivent change.** Le drapeau qui les fige n'était jamais remis à zéro, alors que les longueurs et l'épaisseur des mèches sont retirées à chaque graine : toutes les poupées suivantes gardaient l'échelle de tricot de la première.

**Les deux couches d'une nappe ne peuvent pas porter les mêmes UV.** Chaque quad de la tranche devient alors dégénéré en UV : toute l'épaisseur échantillonne une seule ligne de texels, étirée, et le bord lit comme un aplat. On décale la couche du dessous de l'épaisseur réelle, sur `v` — sur `u` le décalage désaccorderait les côtes peintes de la face arrière de ses côtes géométriques.

**La bande est un ruban unique réécrit à chaque frame**, jamais une file de boîtes montées sur des os : on voyait les blocs. L'allocation est séparée de l'écriture (`bandGeometry` / `writeBand`) pour ne rien réallouer par frame.

**La peluche n'a pratiquement pas de cou** : le sommet des bras arrive plus haut que le bas du crâne. Tout accessoire de cou se place donc sous le menton.

**C'est le haut de la bande qu'on cale au menton, pas sa ligne médiane.** Sa largeur décide du reste : plus haut elle monte sur la courbure du crâne, plus bas elle glisse sous l'aisselle. Ainsi calée, elle part du menton et couvre le haut des épaules, qui la portent.

**Le ruban doit vivre dans le repère de l'axe du corps.** C'est ce repère qui donne la direction « vers l'extérieur » qui oriente la largeur de la bande. Placé sous l'ancrage du pan, décalé de l'axe, cette direction est fausse et la bande se vrille.

**Un corps allongé n'est pas approchable par une sphère.** Les colliders sont une liste : buste et bassin. Avec une seule sphère centrée sur le torse, les pans — plus longs qu'elle — ressortaient dans les jambes.

**Les rayons des colliders s'échantillonnent sur le profil réel (`surface.ts`), jamais sur une cote nominale.** Une sphère au rayon du torse ignore l'effilement des épaules — près d'un tiers — et tient le tissu à quatre centimètres du corps : on voit le jour entre la peluche et son écharpe. Une chaîne serrée de petites sphères prises sur le profil suit la silhouette au millimètre.

**Une sphère au rayon local du corps déborde près d'un pôle.** Le profil y retombe bien plus vite qu'un cercle de ce rayon. Or l'écharpe se pose sous le menton, au pôle bas du crâne : les colliders y gonflaient et le tissu prenait la forme d'un cône. La sphère **inscrite** — la distance minimale du centre à la surface — ne peut pas déborder.

**Les pans épousent le corps, le tour de cou non.** C'est la règle qui a coûté le plus de tâtonnements, et elle n'est pas symétrique. Un pan qui pend au large est en porte-à-faux : rien ne le ramène, on voit le jour derrière lui et il croise les jambes de biais — il faut donc le ramener **point par point** sur le rayon du corps à sa hauteur, car sa largeur le fait passer par des hauteurs où le corps n'a plus le même rayon. Le tour, lui, est un rouleau de tissu : il a son propre volume, et le plaquer sur la silhouette lui donne l'air peint dessus. Il se contente de dégager le corps — une constante prise au plus large sur toute la hauteur **balayée par la bande**, bords compris, faute de quoi ses bords se retrouvent dans le crâne, le collider les repousse contre le rappel, et le tissu retenu se fripe.

**Devant une épaule, on relâche la retenue au lieu d'élargir la boucle.** Le rayon du tour se déduit du corps de **révolution** — crâne et torse — donc les bras n'y sont pas et le tour leur passe au ras, puis s'y enfonce en luttant contre le collider. Élargir le rayon pour les dégager fait enfler la boucle **partout**, pour une gêne qui n'existe que sur deux azimuts : elle décolle du cou et lit comme un tonneau. Baisser le `pin` là où une épaule dépasse laisse le collider pousser le tissu par-dessus, et il y reste. La retenue est un levier local ; le rayon ne l'est pas.

**Passer de l'un à l'autre demande une rampe.** Le pan sort du tour au rayon du tour et vient se plaquer sur quelques rangs : sans ça il y a une marche à la jonction.

**Les deux leviers de tuck et d'épaule se dosent bas.** Un enfoncement marqué creuse une gorge à la sortie du tour : le pan y prend une bosse et paraît détaché de l'écharpe au lieu d'en être la continuation. Une retenue trop relâchée devant l'épaule ne fait pas céder le tissu, elle le fait **gondoler** — les plis virent au froissé. Dans les deux cas l'effet cherché s'obtient à un tiers de l'amplitude qui paraît nécessaire.

**Mais la rampe ne suffit pas à faire le tuck.** Le pan finit bien à l'intérieur, seulement il *commence* au ras et frôle la couche de recouvrement au lieu de passer franchement dessous. Raccourcir la rampe pour le faire plonger plus vite refait le coude à la jonction. L'enfoncement est donc une quantité **à part** : nulle à la jonction — sinon le pan décolle du tour — maximale juste après, puis résorbée.

**Un pan lâché au large du corps y reste.** Rien ne le ramène — la gravité tire vers le bas, pas vers l'axe — donc il garde le rayon de sa pose de repos. Un seul mauvais réglage du bout d'un pan produit alors les trois symptômes à la fois : le jour entre le dos et l'écharpe, le pan qui frôle par l'extérieur la couche censée le recouvrir, et celui qui croise les jambes de biais. Le rayon des bouts se prend sur le profil, exactement comme celui du tour, avec un plancher pour le bas du corps où ce sont les jambes qui portent.

**Le dégagement entre deux couches se compte en demi-épaisseurs de crête.** La nappe est renflée par ses côtes (`RIB_BUMP`) : deux couches face à face occupent `2 · ht · (1 + RIB_BUMP)`, pas deux épaisseurs nominales. En dessous elles s'interpénètrent aux crêtes et le pan ne passe pas proprement dessous.

**Les mèches de frange doivent être confrontées au corps elles aussi.** Elles ne sont pas simulées — pratique, mais elles ne connaissent alors rien du corps, et les brins du bout d'un pan traversaient la jambe de part en part. Une simple poussée hors des sphères à chaque échantillon suffit.

**Les jambes ont besoin de colliders autant que les bras, et pour la même raison.** Le corps de révolution s'arrête au bassin : un pan qui descend plus bas n'y rencontre plus rien et traverse la cuisse de part en part. Un plancher de rayon sur la pose de repos ne suffit pas — à l'écartement par défaut, le bord extérieur d'une cuisse est deux fois plus loin de l'axe que ce plancher. `legSpheres` rejoue donc la formule du rendu, hanche puis descente le long de l'axe incliné, pied compris. Mesuré à pans maximaux : sans elles, onze particules jusqu'à 0,022 dans la jambe ; avec, zéro.

**Le jeu des colliders vaut l'épaisseur du tissu, pas zéro.** La nappe est un volume : sa face intérieure descend d'une demi-épaisseur sous la médiane simulée, davantage sur les crêtes des côtes, et le corps porte son duvet qui déborde du maillage. À jeu nul les pans s'enfoncent visiblement dans la peluche ; trop généreux, il rouvre le jour entre le corps et l'écharpe. Une seule constante (`CLEAR`) sert au jeu des colliders et au rayon du tour, sinon les deux dérivent.

**Une pose de repos enfoncée dans un collider fripe le tissu.** Le rappel tire dedans, la collision pousse dehors, et la partie retenue n'atteint jamais d'équilibre. La bonne réponse n'est pas de corriger la pose après coup : lisser puis reprojeter, c'est un shrink-wrap, la spirale du tour de cou s'écrase sur la silhouette et l'écharpe devient un cône — et les bouts, remontés au même rayon que la couche qui devait les couvrir, cessent de passer dessous. C'est le **rayon de la spirale** qui doit partir du profil du corps : `bodyRadius(y) + jeu`, et la croissance des couches par-dessus. Il n'y a alors rien à corriger.

**Les colliders des bras se déduisent de `armSpread`, jamais de l'aplomb de l'épaule.** L'écartement par défaut approche le radian : une chaîne de sphères descendue verticalement sous l'épaule rate le bras de plusieurs centimètres, et l'écharpe le traverse. On rejoue la formule du rendu — épaule, puis descente le long de l'axe incliné, main comprise.

**Un pan ramené près de l'axe se referme en cordon.** La sphère du buste pousse chaque particule radialement : une nappe posée à l'intérieur s'enroule autour d'elle au lieu de pendre à plat. Les pans pendent donc **au large** du torse ; c'est la croissance du rayon du tour, pas la position des pans, qui décide lequel passe dessous.

**Un pan arrière ne tombe pas comme un pan avant.** La direction de chute porte le signe de la profondeur : réutiliser telle quelle celle du pan avant rabat le pan arrière contre le dos au lieu de le laisser pendre.

**Les UV d'un ornement se calculent en unités monde**, jamais en répétitions arbitraires. `knitUnit()` donne le nombre d'unités couvertes par une tuile de tricot ; sans lui la maille n'a aucun rapport avec celle du corps et la pièce cesse de lire comme du tissu. Pour l'écharpe, l'étalon n'est pas le corps mais **la largeur de la bande** : c'est la seule cote que l'œil compare, puisqu'il voit les nervures courir d'un bord à l'autre. Le nombre de côtes fixe donc l'échelle du tricot — et il se juge avec la largeur, pas seul : peu de côtes sur une bande large donnent des aplats trop grands pour qu'on y voie du tricot, les mêmes sur une bande étroite donnent une côte franche.

**L'orientation des UV compte autant que leur échelle.** La largeur de l'écharpe va sur `u` et sa longueur sur `v`, pour que les rangs de mailles s'empilent le long du tissu comme sur une écharpe tricotée bout à bout. L'inverse couche les mailles sur le flanc et la nappe lit comme de la toile de jute.

**Une écharpe ne se tricote pas en jersey mais en côtes.** Les nervures sont bien plus lisibles de loin que la maille, et elles disent « vêtement » là où le jersey dit « peau de la peluche ». On les creuse dans le **champ de hauteur** (`rib`), jamais en repeignant des mailles : couleur, occlusion et normales en découlent toutes, donc elles ne peuvent pas se désaligner du relief. Deux détails font la différence entre une côte et une rayure en relief : la crête garde **tout** le détail de la maille — écraser la hauteur dans le creux efface le tricot et il ne reste qu'un dégradé peint — et le creux montre les **bosses des rangs de l'envers**, pas des V.

**Sur une bande animée, les UV s'écrivent au premier passage puis se figent.** Les recalculer chaque frame fait glisser la texture ; ne jamais les écrire — le piège dans lequel je suis tombé — laisse le tableau à zéro, toute la bande échantillonne un seul texel, et le pan devient un aplat.

**Une teinte sombre plus un sheen fort effacent la carte.** Le multiplicateur assombrit la maille pendant que le reflet la blanchit : il ne reste qu'un voile uni. Les tissus posés sur de la laine se teintent dans des valeurs **moyennes** (`SCARF_TINTS`) et avec un sheen modéré. Quand une texture ne sort pas, dépouiller le matériau — couleur blanche, sheen nul — dit en une capture si le problème vient de la géométrie ou de l'éclairage.

**Une chaîne se lit à l'entrelacement, pas à la boucle.** Tous les plans de maillons contiennent la **tangente** du tracé — sinon ils ne peuvent pas s'enfiler — et deux voisins sont à quatre-vingt-dix degrés l'un de l'autre. Tous dans le même plan, ils lisent comme une file de rondelles côte à côte.

**Mais l'alternance se pose à ±45° de la radiale, pas à 0 et 90.** À 0/90 un maillon sur deux se retrouve à plat dans le plan horizontal : vu de face il est sur la tranche, il disparaît, et il ne reste que les maillons plats qui se chevauchent — enlacés pour de vrai, illisibles à l'œil. À ±45° les deux familles montrent leur trou sous n'importe quel angle.

**Enlacés ne suffit pas : il faut que ça se voie.** Le pas doit rester entre une et deux demi-longueurs de maillon. Au-delà de deux ils ne se traversent plus et la chaîne se disloque en perles ; en dessous d'un, chaque trou est bouché par ses voisins et il ne reste qu'un boudin — mathématiquement enlacé, visuellement muet. Et un maillon rond ne dit pas « chaîne » : il est **allongé** le long du tracé.

**Un maillon allongé demande un repère complet, pas un axe.** `setFromUnitVectors` laisse le roulis libre : l'allongement part alors en travers de la chaîne. Il faut poser les trois axes (`makeBasis`), tangente en X.

**Une chaîne réglée reste une frise.** Maillons tous exactement à ±45°, tous parfaitement espacés, tous alignés sur la tangente : le motif se répète et l'œil y voit un ornement, pas une chaîne. Chacun a donc son écart au ±45° théorique, sa propre inclinaison et son jeu dans le maillon voisin. Assez retenu pour que l'entrelacement tienne — au-delà d'une vingtaine de degrés les plans voisins ne sont plus assez perpendiculaires et les maillons se traversent.

**Un collier se simule, sinon il reste un anneau posé.** La même grille Verlet que l'écharpe, en une seule colonne — c'est alors une chaîne — et **refermée sur elle-même**, sans quoi la boucle se fend à sa couture. La retenue ne tient que les **épaules** : c'est là qu'un collier repose. Devant et derrière il pend librement, et la courbe de chaînette qui en sort est ce qui donne l'impression de poids. Retenu partout, il redevient un cerceau et la physique ne se voit pas.

**L'orientation des maillons se relit sur les voisins simulés, pas sur le tracé de repos.** Sans ça la chaîne se déplace mais ses maillons gardent l'orientation de leur pose initiale, et l'ensemble glisse au lieu de pendre.

**Entre le bas du crâne et le sommet des bras il y a une encoche, et c'est du vide.** Une chaîne qui monte pour éviter les bras la traverse : rien ne la porte, et elle a beau être bien placée, elle a l'air de flotter. Il faut au contraire qu'elle vienne s'appuyer **sur** la boule d'épaule — c'est ce contact qui se lit comme « posé ». Son rayon prend donc le maximum entre le corps de révolution et le dégagement des bras : sur les flancs les bras l'emportent largement et la chaîne s'y écarte, devant et derrière ils ne comptent plus et elle revient contre la poitrine. Une boucle en amande, comme un vrai collier sur des épaules larges.

**Le compte de maillons se déduit du périmètre réel du tracé.** Posé à la main, il laisse un trou ou un recouvrement à la fermeture dès qu'une proportion change.

**Un bandage n'est pas une pile d'anneaux**, ça lit comme des spires de corde. C'est un manchon continu, plus la ligne de recouvrement en spirale et le nœud de serrage.

**Les laines d'une planche se choisissent pour la planche, pas poupée par poupée.** Tirées indépendamment, deux d'une même génération tombent sur la même teinte ou sur deux voisines de la palette, et la planche perd sa lecture de nuancier — même avec quinze laines disponibles, le problème est le tirage, pas la palette. `boardTones` tire la première au sort puis prend à chaque fois **celle qui maximise l'écart minimal** avec les précédentes.

**La teinte d'un lock est un multiplicateur, pas une couleur.** Le matériau multiplie sa `color` par la carte de tresse, qui va de 0,40 à 1,00 : une palette déjà sombre y perd encore un tiers de sa clarté, sa moitié foncée s'effondre vers le noir, et il ne reste sur la planche que six têtes sombres. Même piège que pour les teintes de membre, transposé. La palette est donc **plus claire et plus saturée que le rendu voulu**.

**Et la saturation n'y est pas décorative.** `toneGap` pondère l'écart de teinte par la saturation **minimale** des deux laines : sur une palette grisâtre, ce terme s'annule et la sélection de planche cesse de trier les teintes pour ne plus trier que la clarté — six nuances du même brun, alors que l'algorithme est censé les écarter. Une palette de multiplicateurs doit donc être saturée pour que sa propre sélection fonctionne.

**Une amplitude de plus ou moins quinze pour cent sur la densité ne se voit pas.** Ce que l'œil lit à la taille d'une planche, c'est le rapport entre cuir chevelu couvert et cuir chevelu nu ; il faut aller du simple au triple pour qu'il change de nature — touffu d'un côté, parsemé de l'autre. Le couplage épaisseur/densité tient à cette amplitude-là : c'est lui qui empêche les deux bornes d'être des accidents.

**Un bout de mèche décoloré a besoin d'un écart absolu, pas d'un facteur.** Un facteur sur la clarté bute contre le plafond sur une laine déjà claire, et l'effet disparaît précisément là où on l'attend. On garantit un écart minimal en valeur, pour qu'il existe sur n'importe quelle laine de la palette. Le dégradé se pose segment par segment — un lock est déjà une chaîne de meshes — et part du **tiers** de la mèche : commencé au cuir chevelu, il lit comme une autre laine et non comme un bout éclairci.

**L'épaisseur d'un lock et leur densité s'appairent, comme la teinte et la rugosité d'un métal.** Tirées indépendamment, elles produisent les deux seules combinaisons qui ne ressemblent à rien : le maximum des deux donne des mèches épaisses qui se chevauchent au cuir chevelu, le minimum des mèches fines qui le laissent nu. Une **seule** quantité — la grosseur du fil — dont l'épaisseur monte et la densité descend : les deux extrêmes restent alors des coupes plausibles, gros et clairsemé ou fin et fourni. Vérifié aux bornes, pas supposé.

**La laine des locks se choisit pour la planche, comme celle du corps.** Même symptôme et même remède : tirées indépendamment, deux poupées d'une génération tombent sur la même tignasse. `boardHair` réutilise la sélection à écart maximal de `boardTones` — extraite dans `spreadPicks`, puisqu'elles ne pouvaient pas diverger sans que l'une des deux perde sa propriété.

**Mais sa palette est plus sombre que celle du corps, et c'est structurel.** Les laines du corps sont pâles et poudrées ; une tignasse de la même clarté s'y fond, et sur une planche entière il ne reste que des crânes. Ce qui sépare les cheveux du corps, c'est la **valeur** ; ce qui les sépare entre eux, c'est la teinte. Les deux palettes couvrent donc la même roue, à deux étages de luminosité différents.

**Un glouton qui prend toujours le meilleur candidat n'a qu'une seule variable : son point de départ.** La sélection à écart maximal d'une planche était donc **entièrement déterminée par le premier tirage** — mesuré sur les deux palettes de quinze : onze assortiments de cheveux possibles et dix de laine de corps, sur 5005 combinaisons. La palette avait beau être large, on revoyait les mêmes planches, et ça se lit comme un manque de variété alors que c'est un manque d'aléatoire. On tire donc au sort parmi les candidats qui gardent au moins 80 % de l'écart du meilleur : environ 400 assortiments, pour un dixième d'étalement perdu.

**Ce qui doit rester sous la longueur d'un segment, c'est la somme enfouissement + dégagement, pas l'enfouissement seul.** Le premier segment part de la racine enfouie et doit ressortir du collider : au-delà d'une longueur de segment, la sphère qu'il peut atteindre est tout entière dans le collider et toutes les racines se dressent en épis. Or seul l'enfouissement était borné, tandis que le dégagement se déduit de l'épaisseur — à mèche courte et fil gros il débordait tout seul. Mesuré sur toute la plage de la graine : **22 % des combinaisons** franchissaient le seuil, jusqu'à un rapport de 1,29. Le plafond porte maintenant sur la somme, et il ne mord que dans ce coin : au réglage courant la valeur est inchangée au millième.

**Un jitter par mèche plus large que la marge par poupée noie le signal.** L'écart de longueur d'une mèche à l'autre valait un facteur 1,73 quand la marge d'une poupée à l'autre n'en valait que 1,62 : il y avait plus de différence entre deux mèches d'une même tête qu'entre deux têtes. Les six coiffures paraissaient de la même longueur alors qu'elles ne l'étaient pas. Le bruit interne doit rester en deçà du signal qu'il décore.

**L'écart entre deux laines n'est pas une distance RVB.** Deux beiges séparés d'un ton de luminosité se ressemblent moins que deux gris de même clarté aux teintes opposées. La teinte compte, mais **pondérée par la saturation** : entre deux laines quasi grises elle ne veut plus rien dire et la mesurer ajoute du bruit.

**Sur un métal, la couleur et la rugosité s'appairent dans la palette.** Un laiton poli et une fonte brute ne se distinguent pas par leur seule teinte — c'est le contraste entre reflet net et reflet diffus qui les sépare. Les tirer séparément produit des combinaisons qui ne ressemblent à rien, comme un fer noirci brillant comme un miroir. `CHAIN_METALS` liste donc des paires.

**Les couleurs viennent de palettes curées, pas d'un décalage de teinte.** Un décalage libre autour d'une couleur traverse forcément la zone jaune-vert, et le brider assez pour l'éviter supprime toute variété. `WOOLS`, `LIMB_TINTS` et `SCARF_TINTS` listent des laines qui existent ; la graine choisit dedans, et n'applique qu'un micro-décalage.

**Une palette pastel supporte mal le décalage.** Le tirage assombrit autant qu'il éclaircit, et un cran suffit à faire sortir la teinte du pastel — la palette perd alors sa cohérence. Les pastels de l'écharpe ne prennent que la moitié du décalage des laines du corps. Ils restent aussi en deçà du blanc : la carte de tricot est teintée **à la génération**, le fil de maille se déduisant du fond par un cran de luminosité, et un fond trop clair n'a plus de place au-dessus — la maille s'efface.

**Dans `jitterColor`, les trois canaux doivent suivre `amount`.** La luminosité ne le faisait pas : elle variait de 0,55 à 1,5× même pour un décalage censé être discret, et la laine du corps virait au jaune délavé.

**Les teintes de membre sont des multiplicateurs, pas des couleurs.** Le matériau multiplie sa `color` par la carte de laine : une luminosité < 1 garantit donc mécaniquement un membre plus sombre que le corps, quelle que soit la laine de base. Une couleur absolue ne peut pas l'assurer.

**Ce qui penche un nœud papillon, c'est la bascule de ses ailes, pas sa rotation d'ensemble.** Et cette bascule portait un signe **fixe** : l'aile droite montait toujours, la gauche descendait toujours. Le nœud ne pouvait donc pencher que d'un seul côté quelle que soit l'inclinaison ajoutée par-dessus — et une fois sur deux les deux s'additionnaient jusqu'à le faire paraître décroché. Même leçon que la vrille de l'écharpe : **tout ce qui a une chiralité doit porter le signe**, et l'inclinaison doit être une quantité unique dont tout le reste dérive, sinon deux sources se contredisent ou se cumulent au hasard.

**Le centre d'un nœud papillon s'assombrit, il ne se re-tire pas.** Deux tirages libres autour de la même base donnent une fois sur deux un centre plus **clair** que les ailes, et le nœud disparaît au lieu de se détacher — c'est ce que faisaient deux `jitterColor` d'amplitudes différentes, dont les noms laissaient croire le contraire. Ce qui distingue le nœud serré des ailes est sa **valeur**, pas sa couleur : même teinte, luminosité rabattue.

**Un ornement en relief se place sur le profil réel, pas sur une fraction du rayon nominal.** Le nœud papillon était posé à 92 % du rayon de torse ; là où le torse se resserre, sa face arrière se retrouvait à quelques millièmes de la peau et les fibres du duvet ressortaient au travers. Il prend maintenant sa cote sur `onTorso`, en dégageant toute la hauteur de fibre plus l'amplitude des bosses — et c'est sa **face arrière**, pas son centre, qu'on cale sur ce dégagement.

**Un tirage conditionnel se fait quand même.** Quand une variante impose une valeur — bandage au bout du membre pour le collier, nœud droit une fois sur trois — le `rnd()` correspondant est appelé dans tous les cas et son résultat ignoré. Sauté, il décale toute la suite de la graine, et l'ensemble des autres éléments change avec lui.

**Une cote partagée entre un ornement et la zone qu'il interdit doit être unique.** La ceinture décide de sa hauteur **et** de ce que les pièces ne peuvent pas occuper : deux copies du même chiffre finissent par diverger, et il ressort une pièce sous la boucle. `beltMetrics()` sert les deux, comme `bowMetrics()` pour le nœud.

**Mais son emprise n'est pas un anneau uniforme.** La boucle est deux fois plus haute que le cordon, et seulement devant. Prise partout sur la boucle, l'interdiction mange la moitié du torse pour une gêne qui n'existe qu'à un azimut ; prise partout sur le cordon, une pièce vient buter contre la boucle. L'emprise s'élargit donc devant, et pas ailleurs.

**Une pièce imposée ne doit pas devenir une pièce posée.** La couronne d'épingles n'a rien d'autre sur le buste, il lui faut donc une pièce de face à coup sûr — mais ce qu'on contraint est la **zone** de tirage, jamais l'emplacement. Un point fixe légèrement bruité ramène la même pièce au même endroit à chaque génération, et c'est ce qui donne l'impression que la régénération ne fait rien.

**La bouche se coud plus bas que les yeux.** Un bouton est un objet **posé** sur la laine, une passe de fil y est **enfoncée** : leur relèvement ne peut pas être le même. Avec la marge qui met les boutons en avant, le sommet du fil passait au-dessus de la pointe des fibres et la bouche restait décollée quoi qu'on fasse à ses bouts. Elle ne prend que le dégagement des bosses.

**Un élément dont la position dépend de la tête doit la calculer depuis la tête.** Le nœud papillon, placé en fraction du torse, s'enfonçait dans le crâne dès que les proportions changeaient. `bowMetrics()` dérive sa hauteur du bas réel du crâne, et sert aussi à déclarer la zone qu'il interdit aux pièces — une seule source pour les deux.

**Le trackpad distingue pincer et glisser par `ctrlKey`.** C'est le seul signal que le navigateur donne : un pincement à deux doigts arrive comme un `wheel` avec `ctrlKey`, un glissement sans. Pincer zoome donc, glisser recadre. Le zoom est **multiplicatif** — en additif chaque cran vaut la même distance absolue, dérisoire de loin et brutal de près, et il faut recommencer le geste cinq fois pour approcher.

**Le recadrage se stocke en unités monde, pas en pixels.** Retraduit à chaque frame avec la distance du moment, un recadrage en pixels enfle en dézoomant et le sujet part hors champ. Le rig republie le barème (`worldPerPixel`) à chaque frame, seul endroit qui connaisse l'ouverture de la caméra et la hauteur du viewport.

**Une raie qui s'arrête doit se refermer, pas seulement cesser de s'ouvrir.** Au-delà du bout haut de la fermeture, des racines posées au ras de la ligne mais **enfouies** laissent quand même un sillon nu : chaque brin sort de la laine en biais, sur toute la longueur de sa sortie. Sur la partie refermée, les racines passent d'un cheveu de l'autre côté et ne sont pas enfouies.

**Contourner un obstacle par un point de passage fixe sépare deux familles de brins.** Les brins qui croisaient la fermeture passaient tous par un même point au-dessus de son bout, les autres allaient droit à l'attache : entre les deux, un sillon. Le point de passage se prend sur le plus court chemin, **relevé** juste ce qu'il faut — continu d'un brin à l'autre.

**Un tissu retenu et un obstacle qui le traverse se battent.** Un bras levé dans le tour de cou : la collision pousse dehors, la retenue ramène, les liens s'étirent de moitié à chaque coup. Ce qui est retenu ignore les obstacles `loose` ; seuls les pans libres les évitent.

**Les contraintes de distance ne bornent pas l'étirement, elles le résorbent.** Au démarrage ou au saut, la partie retenue suit, le pan libre reste en arrière, et le lien qui les joint s'étirait à ×2,7. Une borne d'étirement résolue en entier (`MAX_STRAIN`), **après** les collisions, donne le dernier mot à la longueur : frôler l'intérieur d'un bras une image se voit moins qu'un ruban étiré au triple.

**Une boucle autour du cou doit rester autour du cou.** Au saut écrasé, l'arc avant du collier traversait le cou et se repliait dans le dos, où les obstacles le retenaient. L'azimut de chaque maillon est borné autour du sien (`keepAround`) : une contrainte de topologie, pas de physique.

**Ce qui bouge ne peut pas vivre dans un `<Batched>`, sauf marqué `noBatch`.** Posé dans un slot fusionné, un ressort anime un maillage caché. Les pièces animées (épingles de couronne, languette) sont marquées avant la fusion (effet de l'enfant, qui passe avant celui du parent) ; les rubans simulés vont dans le slot du cou, jamais fusionné.

**Un détail cousu près de la bouche se mesure contre toutes les bouches.** La cicatrice, tracée depuis sous l'œil, mordait le coin d'une bouche large — et son départ lui-même tombait parfois à côté du coin, sous un gros bouton. `scarPath` la recule (les deux bouts) jusqu'à une demi-croix de cicatrice + une demi-croix de bouche + deux fils de toute bouche que la poupée peut faire, expressions du combat comprises. Mesuré : 0 sur 4 800 visages trop près.

**Pas de `StrictMode`.** Son double montage en dev libère les géométries et textures que R3F utilise encore.

**Ce que la graine tire, le panneau le multiplie ; le reste est en valeur absolue.** Largeur, pans et frange sont des multiplicateurs — un curseur absolu écraserait la variété d'une poupée à l'autre. Épaisseur, côtes, poids, raideurs sont absolus : ce sont des propriétés du tissu, pas de l'exemplaire.

**Un maillage ne peut pas changer de taille quand on bouge un curseur.** Colonnes de rendu et mèches de frange se dimensionnent donc sur la **borne haute** du réglage (`RCOLS`, `FRINGE_MAX`), pas sur sa valeur courante ; les mèches en trop sont repliées sur un point — dégénérées, donc invisibles — et non laissées à zéro, où elles dessineraient des triangles jusqu'à l'origine.

**Le nombre de tours s'expose en entier, le demi-tour est ajouté dans le code.** Un curseur à 1,5 cale sur la grille de son pas et retombe sur un compte entier — qui ramène les deux bouts au même endroit, et l'écharpe passe en bandoulière.

**leva injecte ~24 hooks par `useControls`.** Tous les appels sont regroupés dans `useDollParams` : les répartir entre plusieurs composants rendait l'ordre des hooks fragile.

**Le panneau de prévisualisation masqué suspend `requestAnimationFrame`.** Un document caché ne reçoit pas de frames : `useFrame` ne tourne pas, rien n'est animé. Ce n'est **pas** un bug de l'app — ne pas partir en chasse au fantôme là-dessus. Corollaire pour qui inspecte l'écharpe ou le collier depuis un outil : chaque capture n'avance que d'une frame, donc la simulation qu'on regarde n'est **pas** stabilisée. Pour juger un drapé, il faut pomper les pas à la main (`cloth.step` en boucle) avant de capturer.

**La morphologie se tire en types de corps, pas cote par cote.** Tirées indépendamment, les cotes donnent une grosse tête sur un corps long et maigre, des membres de lutteur sur un torse fluet. Et la sélection de planche à écart maximal aggrave tout : les combinaisons les plus contradictoires sont aussi les plus éloignées des autres, c'est donc elles qu'elle retient — première version, jugée « proportions pas cohérentes ». `morph.ts` ne tire librement que **deux axes** : corpulence (dodu = torse large, membres courts et épais, joues pleines, crâne en poire, bras écartés ; fluet = l'inverse) et âge (poupon = grosse tête, torse et membres courts, yeux écartés ; adulte = petite tête sur corps allongé). Toutes les cotes en dérivent ensemble, avec un résidu individuel en cloche nettement plus petit que la part commune. L'écart de planche se mesure **sur ces deux axes seulement** — mesuré sur toutes les cotes, il récompensait les résidus qui contredisent le type. Les cotes du visage, absolues, suivent le crâne. Tout reste relatif au panneau. Effet de bord bienvenu : grosse tête et membres courts se compensent, la hauteur totale reste à ±2 % d'une poupée à l'autre et la planche lit comme une même série. Chaque poupée étant recentrée sur sa hauteur, `App` recale la rangée sur une ligne de sol commune.

**Une planche distribue six archétypes, un par poupée.** L'écart maximal dans le plan corpulence × âge laissait encore deux poupées tomber dans la même région — deux poupons dodus — et la planche perdait sa lecture de « six personnages ». `ARCHETYPES` pose six patrons nommés, à peu près en hexagone autour du patron du panneau : bouboule (poupon dodu), crevette (poupon fluet), costaud (épaules carrées), échalas (grand et maigre), poire (tout dans le bas), dégingandé (bras ballants). Deux voisins de l'hexagone ne diffèrent que d'un cran par axe, ce qui ne suffit pas toujours à l'œil : chacun porte une **signature** sur les cotes secondaires, toujours dans le sens de sa corpulence. Chaque génération retire le type **dans** la zone de l'archétype (±0,2 par axe, plus le résidu) : il varie légèrement sans déborder sur son voisin. L'ordre est mélangé à chaque graine, sinon la couture intégrale serait toujours la bouboule. Le nom s'affiche sous le libellé de la poupée.

**La tête reste bouffie sur tous les archétypes, et bouffi n'est pas rond.** Bouffi, ce sont des bajoues **basses et latérales** plus un bas de crâne plein ; une tête simplement agrandie ou arrondie ne le dit pas. Dérivées librement de la corpulence, les bajoues des fluets retombaient sous le 0,09 du patron et leur tête se lisait comme une boule ; l'ovale négatif du costaud et le crâne allongé du dégingandé la dégonflaient aussi. Bajoues et ovale ne peuvent donc que **gagner** sur le panneau, avec un plancher visible (+0,05 de bajoues, +0,04 d'ovale ; les dodus jusqu'à +0,13 / +0,12), elles restent basses et se resserrent en gonflant, et le crâne ne s'allonge que d'un cran.

**Les visages d'une planche se distribuent, comme les laines.** Deux boutons et une rangée de croix rendaient six têtes interchangeables. `face.tsx` compose chaque visage de quatre choix, tous **cousus** : une humeur (courbe de bouche et sourcils ensemble — tirés séparément, un sourire sous des sourcils froncés lit comme une erreur), un point de bouche (croix, avant, suture, zigzag), des boutons (2 ou 4 trous, fil en croix, parallèle, barre ou absent, parfois dépareillés) et un détail (bouton arraché, œil recousu, cicatrice, joues brodées, rousseur, bouton-nez, larme). Sur une planche : six humeurs, six détails, point de bouche au plus deux fois.

**Le plongeon d'un point se mesure, il ne se suppose pas.** Un brin droit posé sur un crâne courbe s'en écarte à ses bouts d'autant plus qu'il est long : à plongeon fixe, la grande croix d'un œil recousu finissait 0,025 au-dessus de la peau — plus haut que le duvet. `place()` mesure la hauteur réelle de chaque bout et plonge d'autant, plus le rayon du fil. Vérifié sur 150 planches : tous les bouts piqués à au moins 0,005 sous la peau, sommets dans le duvet. Le fil couché d'une suture, lui, **affleure** à chaque jonction — plongeant à chaque maillon il ferait une guirlande.

**Un bouton plat sur un crâne courbe ne touche qu'en son centre.** Son bord reste en l'air de la flèche de l'arc et, de profil, il lit comme une assiette posée. Il est enfoncé de la moitié de sa flèche — pas plus : sa face passerait sous la pointe des fibres.

**Ce qui se brode sur une joue se pose sur la pommette, jamais à distance fixe sous l'œil.** Sur un petit visage, « deux tailles de bouton sous l'œil » tombait à hauteur de bouche : larme collée à la bouche, rousseur mêlée aux points. `cheekSpot` se prend sur le bouton de ce côté **et** sur la largeur de la bouche. La rousseur est un **amas** serré tiré avec rejet (distance minimale), pas un semis sur toute la joue ; la larme est un **passé plat** (rangs parallèles qui remplissent la goutte) — en contour pointillé elle lisait comme un « o ».

**Tout élément dont le chemin dépend du crâne suit le crâne point par point.** Un bout de fil tendu dans le plan tangent à l'orbite partait en l'air devant la joue ; tracé sur la surface, il retombe contre la laine. Même règle pour toutes les coupes.

**Un nœud papillon plan décolle sur les côtés.** Le buste fuit vers l'arrière : ses ailes sont repliées d'un angle mesuré sur le profil réel sous leur pointe (`bowMetrics().fold`), et sa marge ramenée à son épaisseur réelle.

**L'écharpe a un duvet, plus court que celui du corps.** Nue, elle lisait comme du plastique côtelé à côté d'une peluche au contour pelucheux. La nappe étant réécrite à chaque frame, les coques partagent sa géométrie et se repoussent au **vertex shader** (un seul programme, `customProgramCacheKey`). Seuil relevé et teinte rabattue : au seuil du corps, le halo noyait les côtes, qui sont ce qui dit « écharpe ».

**Dix coupes, une par poupée ; les locks ne se touchent pas.** Les locks restent tels quels, regroupés au sommet — choix explicite. Les neuf autres (`hairstyles.tsx`) : bouclettes, mèches (coupe au bol), chignon, houppette, trois poils, couettes, queue de cheval, nattes, grande frange. Tous les brins d'une coupe sont fusionnés en une géométrie par matière (fil retors, tresse, ruban). Sur une planche : six coupes différentes.

**Seule « trois poils » a le droit d'être presque chauve — aucune poupée n'est jamais sans rien** (Leo, 26 sept.). Une fusion de géométries ratée (`mergeGeometries` rend `null` quand un morceau n'a pas les mêmes attributs) faisait disparaître toute la coupe sans erreur : `merged` le signale désormais en atelier, et tout ce qui entre dans une coupe passe par `yarn` ou `still`, qui posent les mêmes attributs. Toute autre coupe couvre le crâne **par elle-même** — une base couchée sous les locks ou le plumet a été essayée et rejetée (deux coiffures superposées, ça se voit). D'où : une houppette qui retombe en fontaine sur le crâne, une coupe au bol qui descend au moins aux oreilles, une lisière de nuque basse pour les cheveux tirés (la peluche n'a pas de cou : sa nuque est le bas du crâne), et une **raie au milieu** dès que deux attaches sont de part et d'autre — sinon aucun brin ne passe par le sommet.

**Une queue attachée est un faisceau, pas un éventail.** Chaque brin couché depuis l'attache faisait une queue plate contre la tête. Les brins sortent serrés du ruban, le faisceau se **détache** de la tête avant de tomber, et ne s'évase qu'en bas.

**Physique des coupes fusionnées : un spring bone par pivot, appliqué au vertex shader.** On ne peut pas accrocher d'os à une géométrie fusionnée. Chaque sommet porte son pivot (`aMover`) et sa mobilité (`aFree`, 0 à la racine) ; il tourne autour du pivot de l'angle du ressort fois sa mobilité — normale comprise, sinon la lumière glisse sur la laine. Pour ce qui est posé sur le crâne, le pivot est le **centre** : une rotation autour du centre garde la distance au centre, le brin glisse sans s'enfoncer. Pour une frange, un pivot au haut du front et un bas décollé : pivotant autour du centre, elle glisserait jusqu'aux yeux. Débattement plafonné par coupe.

**Grande frange : raie au milieu, mèches pointues, longueurs pendantes.** Rayonnant d'un épi derrière le sommet, les brins des côtés traversaient la tête en diagonale ; ils partent désormais d'une **raie**, et tombent droit. 100 brins laissaient le crâne visible en bandes : 240, sur plusieurs épaisseurs, avec un gonflement au milieu de leur longueur (`volume`). Une lisière commune — même effilée brin à brin — dessinait une ligne horizontale, l'effet **coupé au carré** : les brins sont groupés en **mèches** (`clumps`) de longueurs propres, qui convergent vers leur pointe, bords plus courts. Au-delà du crâne, `extend` prolonge chaque brin à la verticale. La frange a deux rangées de mèches décalées d'une demi-mèche : une seule laissait le front à nu entre deux pointes. **Frange et longueurs forment une seule coupe** : la frange s'allonge vers les tempes jusqu'à la longueur des mèches latérales, et les longueurs prennent le relais là où elle s'arrête (même raie, même fil). Remontant vers les tempes, elle laissait un creux à la jonction — deux coiffures juxtaposées. Mèches fermées à 55 % seulement (à 80 %, le crâne se voyait entre elles) ; longueurs arrêtées un peu sous la mâchoire. Les longueurs trop courtes pour exister (sous la frange) ne sont pas posées : elles hérissaient le sommet.

**Une hauteur de pointe doit rester bornée à [−0,9 ; 0,9].** Poussée sous −1 (arrière plus long), `dirOf` renvoyait « droit vers le bas depuis le centre » : un brin traversait cou et torse comme un pic.

**Repos d'une mèche pendante = la verticale.** Un repos penché (frange « vers le bas et l'avant », couette « vers le bas et l'extérieur ») met ressort et gravité en désaccord : la mèche pivote **au repos**, jusqu'à rentrer à moitié dans la tête.

**Pas de collider crânien pour ce qui repose contre le crâne.** Le bout du ressort d'une frange est, au repos, dans la sphère du crâne : le collider l'en chassait à chaque frame. Mesuré : les quatre ressorts de frange collés à leur débattement maximal, frange soulevée et presque invisible de face. Le collider ne vaut que pour une pose de repos hors de la sphère.

**Grande frange, allure de héros d'anime.** Une longueur égale tout autour faisait un casque, puis une coupe « ridicule » : c'est le **contraste** qui donne l'allure — longues mèches qui encadrent le visage, arrière court, et des pointes **évasées tout autour** (`flare`, un peu plus derrière), en grandes mèches fermées (`clumps` 20, `pinch` 0,68). Frange en 5-6 grosses mèches, **décollée aux tempes** (`FRINGE_OVER`) : plaquée, elle passait sous le volume des longueurs.

**Un ressort dont le bout est sur l'axe de rotation ne ressent rien.** Pivot au centre du crâne, bout à l'aplomb : ce point est sur l'axe vertical autour duquel la poupée tourne — il ne bouge pas, et la coupe « n'avait pas de physique ». Le bout se place **vers la mèche** (en bas et vers l'extérieur, à son azimut), et ces ressorts sont **sans gravité** : la géométrie pend déjà, et une gravité en désaccord avec le repos fait glisser la mèche au repos. Idem pour la coupe au bol (8 secteurs).

**Une mèche ne se referme que sur son dernier tiers.** Convergeant depuis la racine, les brins se groupaient en faisceaux dès le milieu, crâne visible entre deux mèches. Et les racines de frange se prennent sur la raie **à la même place que les longueurs voisines** : parties de derrière le sommet, les mèches de tempe traversaient la tête en biais et croisaient les longueurs.

**Toutes les coupes ont une physique, sur toute leur longueur.** Bouclettes (secteurs, raides : elles sautillent), pelote du chignon (oscille sur sa base), cheveux tirés (léger mouvement, retenu : ils sont attachés) — elles n'en avaient pas. Et la **mobilité** d'un brin est presque linéaire de la racine à la pointe, jamais moins de moitié pour une mèche courte : en t^1,6 × portée, seules les pointes des mèches longues bougeaient.

**Pas de mouvement au repos ; la chevelure réagit quand on agite la poupée.** Un souffle permanent a été essayé puis retiré à la demande : ce qui compte, c'est la réaction au geste. Agiter la poupée de gauche à droite la fait **tourner sur elle-même** — la tête tourne sur place. Les ressorts n'y voient qu'un retard de rotation qui fait **glisser** les brins autour du crâne, invisible sur ceux qui sont posés contre lui : seules les mèches pendantes des côtés bougeaient, la frange pas du tout. D'où l'**écartement centrifuge** (`uFling`) : la vitesse de rotation de la tête est lue sur son orientation monde à chaque frame, et chaque sommet est poussé vers l'extérieur en proportion de sa distance à l'axe et de sa mobilité — plein à 5 rad/s, montée rapide, retombée douce. Amplitude retenue : trop forte, la chevelure s'étalait à plat en chapeau.

**Mobilité et écartement sont deux attributs** (`aFree`, `aFling`). Une mobilité nulle à la racine laissait le dessus du crâne figé sous des pointes qui balancent — « seule une partie de la coupe bouge ». Un brin posé sur le crâne tourne autour de son centre et y **glisse** sans s'enfoncer : il peut bouger dès la racine (0,4 pour les longueurs et la frange, 0,5 pour les cheveux tirés, 0,6 pour les bouclettes ; la gerbe de la houppette passe sur des secteurs au centre, sauf à la sortie du nœud). L'écartement centrifuge, lui, **décolle** : il reste nul à la racine, sinon le brin quitte le crâne.

**Un shader de coiffure modifié ne se voit qu'après rechargement complet.** Les matériaux partagent la clé `customProgramCacheKey: 'hairdo'` : le cache de three garde l'ancien programme au rechargement à chaud.

**Le mouvement se mesure par zone, il ne se juge pas à l'œil sur un panneau masqué.** « La moitié de la coupe est statique » : en reproduisant le calcul du shader sur la géométrie et les uniformes pendant une rotation, le déplacement moyen valait 0,011 à l'avant contre 0,095 sur les côtés. La frange pivotait au ras du front — bras de levier minuscule. Elle pivote désormais autour du **centre du crâne**, comme les longueurs, bouge sur toute sa longueur et a le même débattement : avant 0,098, côtés 0,12, arrière 0,074.

**Physique : un ressort par mèche** (`MAX_MOVERS` 32). En blocs — 3 pour les longueurs, 4 pour la frange — la chevelure balançait d'un seul mouvement, comme une perruque. Chaque mèche a son ressort, avec raideur, amortissement et poids tirés au sort : vingt ressorts identiques bougeraient comme un seul.

**Une pointe de brin s'effile.** Une calotte sphérique au bout de chaque brin lisait, à la taille d'une planche, comme une rangée de points sur le front.

**La planche est la page de sélection du jeu.** Épurée : panneau leva masqué (touche P), sous chaque poupée son nom, « archétype · coiffure » et un bouton *Choisir*. *Choisir* ouvre l'**arène d'essai** : la même poupée seule, en qualité pleine — `buildBoard` est une fonction pure de la graine et des réglages, rappelée sans `lightened()` ; la qualité n'entre dans aucun tirage, c'est donc exactement la poupée de la planche. Échap ou *← Sélection* ramène à la planche ; *Générer* aussi, une poupée choisie d'une génération disparue n'ayant plus de sens.

**Les boutons sont des pièces de feutre cousues**, dans la matière des poupées : tissu tramé en CSS, bordure en points avant (pointillé rentré), coins inégaux, posés de travers ; au survol le feutre fonce et le fil passe au rouge vaudou. Tout en CSS, aucun asset. Piège : `.label .choose` fixe `--felt` avec une spécificité supérieure à `.pill:hover` — sans règle `:hover` dédiée, le texte passait en clair sur un feutre resté clair.

**Un bouton dans un `<Html>` doit arrêter `pointerdown`.** La platine capture le pointeur sur `#stage` dès l'appui : le relâchement ne revient jamais au bouton et le clic est perdu.

**Le cel shading se pose dans le chunk d'éclairage, pas matériau par matériau.** `toon.ts` réécrit `lights_physical_pars_fragment` : la lumière directe `dot(N, L)` est découpée en paliers, pour **tous** les matériaux standard et physiques d'un coup — laine, locks, coiffures, écharpe, bois, métal — sans rien perdre de leurs cartes. Le chunk est lu à la compilation et le cache de programmes de three ignore son texte : changer de rendu remonte le `Canvas` (`key`).

**Les reflets du sheen sont noirs, sur tous les rendus.** Le sheen est une lumière ajoutée en bordure : blanc, il cernait chaque poupée — et surtout chaque mèche — d'un halo, et les paliers du cel shading ne l'atteignent pas. Le teindre en noir reviendrait à n'ajouter rien : `toon.ts` réécrit la composition finale du matériau physique (`ShaderLib.physical`, lu lui aussi à la compilation) pour que le sheen **assombrisse** au lieu d'éclairer — même forme, fort là où la surface fuit, plafonné. Chaque rendu peut repasser en `reflets: 'blancs'` (l'original) ou `'aucun'`.

**Les paliers ne s'appliquent qu'à la lumière diffuse.** Posés sur `dotNL` lui-même, ils passaient dans le spéculaire et le sheen, dont les formules divisent par un terme qui s'annule en rasant — compensé d'ordinaire par `dotNL` qui tend lui aussi vers zéro. Un palier qui reste à 0,45 en rasant supprime la compensation : pixels mesurés à **183** en linéaire au bord de chaque mèche, liseré blanc sur tous les rendus. Symptôme trompeur : on a d'abord accusé le sheen, puis le Fresnel. Lire la cible hors écran (`readRenderTargetPixels`) a tranché en une mesure.

**Pas de reflet rasant sur ce qui n'est pas métal.** three fixe `specularF90` à 1 pour les non-métaux : juste pour du plastique, faux pour de la laine, et l'environnement étant fait de panneaux blancs, chaque bord de volume s'en cernait. `toon.ts` le ramène à 6 % hors métal (`lights_physical_fragment`), sur tous les rendus ; chaîne et épingles gardent le leur.

**Le fond se pose par couverture, pas par un test de profondeur.** La scène est rendue sans fond, sur transparent ; la passe finale tonemappe la couleur (dé-prémultipliée) et la pose sur le fond selon l'alpha. Décider « fond ou pas » à la profondeur laissait les pixels de bord — mêlés d'objet mais de profondeur « fond » — hors du tone mapping.

**Le trait est coloré, fin, sur tous les rendus** (colored lineart) : la couleur de ce qu'il cerne, assombrie et un peu saturée, mêlée à l'encre du rendu selon `tint`. Les couleurs de trait varient donc d'elles-mêmes d'un personnage et d'une pièce à l'autre.

**Un rendu en aplats n'a qu'une lumière qui décide.** Découpées chacune de leur côté, trois directionnelles superposent leurs marches en taches, et le contre-jour du rendu laine (fort exprès, pour le duvet) inondait le dos d'un aplat clair. Chaque rendu dose donc aussi l'éclairage — clé, remplissage, contre-jour, ambiance, environnement (qui éclaire en dégradé continu, hors d'atteinte des paliers) — et leurs **teintes** (ombres bleutées, lumière chaude…). Un plancher d'ombre relevé impose de baisser l'ambiance, sinon la laine vire au blanc.

**L'encre est une passe plein écran sur la profondeur, pas une coque inversée.** Coût d'une image quel que soit le nombre de pièces, et elle suit ce qui bouge au vertex shader (coiffures). Critère : **dérivée seconde** de la profondeur, relative — la première encrait en aplat les surfaces vues en biais. Le duvet (coques du corps et de l'écharpe) est en `depthWrite: false`, sinon chaque fibre aurait son trait. La cible est linéaire : la passe finale tonemappe, **sauf le fond**, qui dans le rendu direct de three n'est pas tonemappé (il virait au gris).

**Boutons agrandis (`EYE_SCALE` 1,2).** Sourcils, pommettes, larme et lisière des franges se prennent sur la taille réelle des boutons, agrandissement compris.

**Rendu retenu : laine, trait encre** (`RENDER_LOOK`), après une quarantaine d'essais comparés à l'écran (pastel, anime, manga, ghibli, laine en variantes). Le sélecteur temporaire est retiré ; les briques — paliers, cheveux, trait complémentaire — restent dans `toon.ts`.

**Le bord sombre se dose bas sur la laine.** À 75 % d'assombrissement (plafond du sheen noir), avec une ambiance à 0,18, toute la planche paraissait plus foncée que ses laines : c'était le rendu, pas la palette. Plafond 0,4 hors cheveux, ambiance 0,4, exposition 0,9. Les cheveux gardent 0,75 : c'est leur contraste qui les détache du corps.

**Les cheveux ont leur propre cel shading** (`TOON_HAIR`). Sans lui, sheen passé au sombre et reflet rasant retiré, la chevelure était une masse mate. Paliers plus francs que la laine (en cel shading), bord sombre plus léger, et un **reflet anime** — disponible aussi sans paliers, sur le rendu laine : une tache nette sur N·H, bornée — elle ne peut pas exploser en rasant comme le spéculaire physique sous les paliers. La marque est posée sur les matériaux des coiffures en laine, et sur ceux des locks **depuis `Doll.tsx`** (parcours après montage) : `hair.tsx` ne se touche pas.

**Délai d'affichage apparent = panneau masqué.** Avec le panneau de prévisualisation caché, `visibilityState` vaut `hidden` et le navigateur suspend `requestAnimationFrame` : chaque capture n'avance que d'une image, et une recompilation paraît prendre dix secondes. Mesurer avant de chercher un problème de performance.

**Squelette : des os rigides, pas de peau.** Une peluche est faite de pièces cousues d'un seul tenant ; un squelette à skinning plierait des coudes qu'elle n'a pas. Os (`rig.ts`) : bassin (toute la poupée), tête, deux bras, deux jambes, emboîture de main pour l'arme. Chaque articulation a **deux étages** : l'os de pose que l'animation oriente, puis l'os à ressort qui le suit avec retard — le coup porte, puis le bras ballotte. Pendant un geste les ressorts des membres se raidissent (`firm`), sinon le bras traînait si loin derrière la pose que l'attaque ne se lisait plus.

**L'os de pose d'un membre se place avant l'écartement, pas après.** Après, « en avant » tournait autour d'un axe incliné de l'angle d'écartement (près d'un radian) : bras levé pour frapper, il passait en travers de la poitrine. Les angles des clips sont donc dans le repère du corps, et ils se ramènent vers l'axe (`z`) pour frapper ou parer devant soi.

**Pas de clips rejoués : des poses clés tirées par des ressorts** (`fighter.ts`). Des courbes par geste fondues l'une dans l'autre faisaient « jeu basique » : tout part et arrive à l'heure, rien ne pèse. Chaque geste ne donne que ses poses (armé, frappe, retour) ; chaque partie du corps les rejoint par une **dynamique du second ordre** (`Dyn` : fréquence, amortissement, réponse), avec ses propres réglages — la frappe plus vive que l'armé. Un geste interrompu repart de là où le corps **est** : c'est ce qui rend un combo souple sous les doigts. Les cotes des gestes se prennent sur la poupée (`rigMetrics`), un même geste va aux six silhouettes.

**Mou n'est ni élastique ni lent.** Trois réglages successifs. Peu amorti : le bassin dépassait sa pose de près du double, le corps tremblotait — « trop de rebond ». Très amorti et vif : tout arrivait à l'heure — « trop rigide ». Retenu : fréquences basses (du poids, du retard), amortissements de 0,5 à 0,7, dépassement de quelques pour cent. Mais les ressorts seuls ne suffisent pas : la rigidité venait surtout de ce qui suit.

**La racine obéit, le corps exprime l'inertie.** Démarrage en 3 images, arrêt en 9 (22 avant : savonneux) — mais à l'arrêt le haut du corps continue, la tête pique en avant ; au démarrage il reste en arrière. Penché d'inertie (−accélération, pas +), tête qui exagère avec retard.

**Une peluche ploie, elle ne pivote pas** (`fighter.shear`). Cisaillement du corps entier, pieds fixes : le haut reste en arrière à l'accélération, continue au freinage, se pose sur le pied d'appui. Une rotation lit comme un objet rigide qui penche ; mesuré avant lui, un penché de course constant à 0,01 près — les pas (7 par seconde) étaient lissés par le ressort du bassin. Appliqué en matrice sur le groupe d'écrasement (`matrixAutoUpdate` coupé), borné à 0,15.

**Les pieds se posent** (`limbs.ts`, `Stepper`). Des jambes qui pivotent en bloc glissent et flottent. Chaque pied reste planté **en repère monde** pendant l'appui (glissement mesuré : 0), puis fait un pas ; la jambe vise son pied (rotation minimale de son axe au repos), s'étire (jusqu'à 1,35 : le tissu s'étire) ou se tasse et **plie** alors vers l'avant. Pièges, tous mesurés : (1) des pas au seuil de distance — jambes à 1,8× leur longueur, une peluche a de toutes petites jambes : en course, pas **à la cadence**, alternés strictement, vifs et courts, corps un peu plus bas ; (2) une cible figée au départ du pas — le corps avançait encore pendant le pas et les pieds se posaient derrière la hanche : cible **recalculée à chaque image**, une demi-course d'appui devant ; (3) une place prise sous la racine — une fente ou un penché déplacent les hanches, pas la racine : place prise sous les **hanches réelles** ; (4) une poussée brutale (fente, coup reçu) laisse un pied loin : **pas de rattrapage** même si l'autre est en l'air. Chaque pied posé tasse un peu le corps et fixe la phase de la foulée : bras et torsion suivent les vrais pas, pas une horloge. Le temps des pas est celui du combattant (gel d'impact compris).

**Les membres sont des boudins qui se courbent** (`bowShader`, laine **et** duvet) : décalage du milieu en sin(πt), bouts fixes. Jambe tassée → genou de tissu ; bras en retard sur son ressort → cambré comme une corde qu'on tire. Butées articulaires (`LIMITS`) : sous des appuis en rafale un ressort emmenait un bras à 3,7 rad, à travers la tête.

**Contrôle :** déplacement relatif à la caméra, démarrage vif et arrêt un peu glissé, cap qui suit le stick, corps penché dans l'accélération et dans les virages ; course en petits bonds (une peluche n'a pas de genoux), foulée réglée sur la **distance** parcourue. Combo en trois coups (fauche, revers, écrasement sauté avec gel d'impact et secousse), appuis **mis en file** (0,28 s) ; l'esquive (roulade) annule la fin d'un coup ; une attaque part dans la direction du stick. Étirement/écrasement du corps entier à volume constant, pivot aux pieds.

**L'arme est trop grande, et lourde.** Une épingle de vaudou presque de la taille de la poupée ; sa direction vient du geste, mais sa **pointe** suit en repère monde avec inertie : elle traîne en course, fouette à la frappe, et ne passe jamais sous le sol, où elle frotte. Plantée devant, du côté de l'arme, au repos — derrière la poupée on ne la voyait pas. Traînée pendant les coups (`WeaponTrail`), gris-bleu d'encre : sur fond blanc une traînée claire disparaît.

**Audits — mesurer le ressenti, ne pas le deviner.** En dev, `window.__advance(t)` fait avancer le jeu d'une image (panneau masqué compris, où le navigateur n'en donne plus : une boucle attente-active de 16,6 ms + `__advance` = un vrai pas de temps). Exposés : `__fighter`, `__stepper`, `__doll` (tête, bassin, courbures), `__legK` (étirement des jambes), `__turntable`, `__camera` (la vraie caméra : celle trouvée dans la scène est une caméra d'ombre), `__gl`. Piège : `import('/src/…')` depuis la console charge **une autre instance** du module après un rechargement à chaud — passer par ces variables. Et une capture d'écran peut montrer l'image précédente : en prendre deux. Valeurs de référence (3 scénarios × 700 images d'appuis au hasard) : 0 valeur invalide, 0 pied ou pointe sous le sol, jambes à 0,93 en médiane et 1,29–1,34 au 99ᵉ centile, retour au repos ; 2 ms de CPU et 160 appels de rendu par image d'arène.

**Les tissus sentent les déplacements.** Écharpe et collier sont simulés en local : sans l'accélération du repère (`Inertia`, passée à `ClothSheet.step`), la poupée qui court emportait son écharpe comme un décor collé.

**La rotation de la tête se mesure en axe-angle, projetée sur la verticale.** Lue sur le cap du regard, elle s'affolait quand la tête piquait vers le sol (écrasement, roulade) — plus de cap stable — et la chevelure s'ouvrait en corolle.

**Trois écrans : planche → présentation → arène.** *Choisir* montre la poupée seule sur la platine, avec son arme ; *Jouer* entre dans l'arène de combat — un **espace blanc vierge** (ombre douce seule), caméra de jeu plongeante qui suit avec un léger retard et que le glissé fait tourner, barre de vie en feutre cousu, légende des commandes. Clavier (ZQSD/WASD/flèches, J ou clic attaque, L ou Espace esquive, K parade ; H coup reçu et X K.O. pour les essais), manette (stick, X, A, RB/LB). Échap remonte d'un écran. Le combattant vit hors React, comme la platine.

**Ce qui s'appuie sur un membre relit sa pose animée.** Écharpe et collier évitaient des bras calculés au repos : bras levé, le tissu le traversait. `followLimbs` recale leurs sphères sur les os à ressort à chaque image. Ordre des `useFrame` : platine −2, poupée −1, puis tissus — sinon ils suivent les bras avec une image de retard.

**La dérive de la platine est nulle dans l'arène.** Tant qu'on n'a rien touché, la vitesse **est** la dérive : la planche en posait une juste avant d'entrer dans l'arène, rien ne l'amortissait tant que `idle`, et la poupée tournait sans fin.

**Allègement, mesuré** (planche, `gl.info`) : 1 434 appels de rendu → 475 ; arène 146.
- **Duvet : un dessin par volume** (`shellInstances`). Les coques sont des instances de la géométrie source repoussées au vertex shader ; seuil et teinte se lisent sur le rang d'instance. 304 appels → 61. Attributs partagés avec la source : la nappe de l'écharpe, réécrite à chaque image, entraîne ses coques.
- **Petites pièces fixes fusionnées par matière** (`<Batched>` sur visage, torse, membres) : points de couture, surjets, boutons, épingles, perles. Écrites une par une comme avant, fusionnées après montage, originaux masqués. Seulement ce qui est immobile dans son groupe, jamais une matière à `onBeforeCompile`.
- **Ombres portées réservées aux volumes** : sous un septième du crâne, une pièce ne projette plus d'ombre (583 → ~210). Les locks gardent les leurs.
- **Tubes des coiffures** : un anneau tous les trois rayons, six côtés — un tiers de triangles en moins, invisible sous le trait.
- **Shaders gardés en vie** (`KeepPrograms`) : sans poupée à locks sur une planche, three libérait leur programme et la planche suivante le recompilait — une image figée d'une seconde. Une vingtaine de programmes en tout.
- **Tricot en 512 sur la planche** (`wool.mapSize`, via `lightened`), 1024 dans l'arène : dix-huit cartes de 1024² à peindre et envoyer au GPU par génération.
- **Une poupée par image** à la génération : chacune remplace l'ancienne de gauche à droite. Un blocage d'une seconde devient six tâches d'environ 100 ms (mesuré par `PerformanceObserver('longtask')`, fiable même panneau masqué).
- Pas touché : les locks (≈ 1 appel par segment, jusqu'à 180 sur une poupée) — `hair.tsx` ne se touche pas.

## État actuel

| Composant | Statut |
|-----------|--------|
| Laine tricotée (couleur / normales / rugosité) | ✅ |
| Duvet volumétrique (shells) | ✅ |
| Crâne « hamster » paramétrique | ✅ |
| Locks tressés articulés + collision crâne | ✅ |
| Boutons et perles en bois veiné | ✅ |
| Pièces de tissu cousues, formes et motifs variés | ✅ |
| Planche 2×3 + bouton Générer | ✅ |
| Placement aléatoire de tous les éléments cousus | ✅ |
| Bouton « Générer » + sélecteur de variante seule | ✅ |
| Visages variés + coiffures variées (sélecteur de coiffure en mode seul) | ✅ |
| Page de sélection + arène d'essai | ✅ |
| Rendu retenu (laine, trait encre) + cheveux | ✅ |
| Squelette + combattant (pose à pose, ressorts, combo, esquive, parade) | ✅ |
| Arène de combat jouable, sans boss (clavier, souris, manette) | ✅ |
| Boss, phase 2D de réflexe | ⬜ à faire |
| Allègement (appels de rendu, ombres, shaders, génération étalée) | ✅ |
| Expressions réactives | ⬜ à faire |
| Galerie à grande échelle | ⬜ à faire |

**Fond commun à toutes les poupées** : pièces rapportées, bracelet de perles à un poignet — droite, gauche ou aucun —, bandage (une chance sur deux environ, n'importe quel membre), de zéro à quatre membres dépareillés, épingle plantée sur le côté du crâne.

**Six signes distinctifs** : couture intégrale (tour du corps), écharpe, couronne d'épingles, collier de chaîne, ceinture, nœud papillon.

**Ce qui varie d'une génération à l'autre** — tout dérive de la graine :

| Élément | Variation |
|---------|-----------|
| Pièces de tissu | nombre (2–4), forme (4 familles), motif (11), teintes, emplacement libre |
| Collier | taille et allongement des maillons, métal (10 paires teinte/rugosité : argent, acier, étain, or, or rose, laiton, bronze, cuivre), désordre ; le compte se déduit du périmètre réel |
| Bracelet | poignet gauche, droit ou aucun, nombre de perles (5–9), forme de perle (5), palette, cordon |
| Bandage | présence, membre (4), hauteur (extrémité ou mi-membre) |
| Ceinture | forme de boucle (cercle, carré, triangle, losange, étoile) |
| Nœud papillon | teinte (6 tissus, décalée), nœud central assombri, asymétrie des deux ailes, droit ou légèrement penché |
| Écharpe | largeur, longueur des deux pans, teinte (10 pastels), longueur et écart des mèches de frange. Le **sens d'enroulement est fixe** : pas d'inversion d'une génération à l'autre. |
| Boutons des yeux | taille, écartement et teinte, autour des valeurs du panneau |
| Membres dépareillés | nombre (0–4), membres concernés, teinte (palette de 10) |
| Laine du corps | tirée dans une palette de 15 laines, **sans répétition sur une planche** et en maximisant l'écart perçu ; micro-décalage |
| Locks | laine (15 fils, **sans répétition sur une planche**), longueur, grosseur de fil dont l'épaisseur et la densité dérivent en sens inverse (9 à 30 mèches), bouts décolorés sur 0, 1, 2, 4, 5 ou toutes les mèches |
| Épingles | côté du crâne, teinte tirée dans la roue HSL |
| Morphologie | type de corps sur deux axes — corpulence (fluet ↔ dodu) et âge (adulte ↔ poupon) — dont dérivent tête, torse, membres, crâne, écartement et visage, plus un petit résidu individuel. **Six archétypes nommés, un par poupée** (bouboule, crevette, costaud, échalas, poire, dégingandé), ordre mélangé, chacun retiré légèrement à chaque génération. Curseur *variation morpho* (0 = patron du panneau) |
| Couture intégrale | orientation et inclinaison de l'anneau |
| Visage | humeur (6), point de bouche (4), boutons (2/4 trous, 4 fils, dépareillés), détail (7) — **sans répétition sur une planche** |
| Coiffure | 10 coupes, **toutes différentes sur une planche** ; taille, densité, grosseur de fil, ondulation, rubans ; physique pour mèches, frange, houppette, tire-bouchons, couettes, queue, nattes |

**Contraintes de cohabitation**, toutes vérifiées à la génération :
- aucune pièce sur le trajet de la couture intégrale ;
- la couture intégrale ne passe pas par le nombril ;
- bracelet et bandage ne partagent jamais un membre ;
- une poupée couronnée d'épingles n'en porte pas d'isolée en plus ;
- la ceinture est à hauteur fixe, à la taille — laissée libre elle descendait sur les hanches ;
- aucune pièce sur le trajet de la ceinture : le cordon interdit tout le tour, la boucle seulement le devant ;
- une poupée couronnée d'épingles a toujours au moins une pièce sur le devant du buste ;
- aucune pièce sous un accessoire de cou (nœud papillon, pan avant de l'écharpe) ;
- bandage et bracelet ne partagent jamais un membre ;
- sur la poupée au collier, le bandage se porte toujours au **bout** du membre ;
- un bracelet ne se porte qu'au poignet.

Bandage et bracelet sont les **seuls** accessoires portés sur un membre.

## Prochaine étape

**Voir d'abord « Passation — au prochain Claude » ci-dessous** : demandes de Leo en cours et branches non fusionnées. Ce qui suit est l'objectif de plus long terme.

Passage à la galerie. Le poste de coût est connu : à réglage plein une poupée tient ~300 appels de rendu (14 coques × 8 volumes + 16 locks × 11 segments). `App.lightened()` rabote déjà ces deux postes pour la planche. À 20 poupées il faudra de l'instanciation, ou partager les cartes de laine par couleur. L'écharpe ajoute en plus **sa propre tuile de tricot** (768², 75–240 ms) sur la poupée qui la porte : à l'échelle de la galerie il faudra la mettre en cache par teinte.

## Passation — au prochain Claude qui reprend ce projet

Bonjour. Tu reprends le travail d'une longue session cloud (25 sept. 2026) sur
la jouabilité et l'animation des poupées. Lis ceci en entier avant de toucher
au code : il y a du travail fini, du travail **en cours sur des branches non
fusionnées**, et des demandes de Leo pas encore traitées.

### Qui est Leo et comment il travaille

- Il écrit en français (souvent vite, avec des fautes) ; réponds en français,
  commits et commentaires de code en français aussi.
- Il veut des **pushs réguliers** et que ce `CLAUDE.md` soit **tenu à jour**
  à chaque étape (section « Journal » plus bas).
- Il teste **en local sur sa machine** (`~/Projets/DummyFaces`) : donne-lui
  toujours les commandes git exactes pour récupérer la branche (il a déjà créé
  par erreur une branche locale depuis `peluches-jouables` avec
  `git checkout -b`, et testait l'ancien code). Commandes qui marchent :
  `git fetch origin && git checkout -B <branche> origin/<branche> &&
  git branch --set-upstream-to=origin/<branche> && npm install && npm run dev`.
- Il a un **budget limité** (il l'a signalé : ~18 $ restants sur 100 à la fin
  de la session). Évite de lancer beaucoup d'agents en parallèle ; mesure en
  Node plutôt qu'en captures headless (lentes) ; va à l'essentiel.
- Il a demandé explicitement des **agents spécialisés par tâche** quand c'est
  utile : worktree isolé par agent, consignes autonomes, pas d'édition de
  `CLAUDE.md` par les agents (c'est toi qui consolides).
- Il ne veut rien perdre : si tu arrêtes un agent, pousse son travail sur une
  branche `claude/wip-*` (voir « Travaux en cours sauvegardés »).

### Où en est le code

Branche de travail : **`claude/quirky-galileo-g4u9c5`** (partie de
`peluches-jouables`, qui en a fusionné une première version). Elle contient
tout ce qui est fini et vérifié. Le journal détaillé est plus bas ; en bref :

- **Locomotion** (`fighter.ts` : `advanceCycle`, `rhythm` ; `limbs.ts` :
  `Stepper`) : cycle de pas à phase continue. Trot par défaut (2,4 u/s, 5,2
  pas/s, appui 41 %, 18 % de vol) ; course sur Maj (5,4 u/s, 6,7 pas/s, 43 % de
  vol). Pied fixe en appui, vol en courbes à vitesse nulle aux deux bouts,
  pose compensée du temps écoulé. Le rythme (rebond, bascule, balancier des
  bras) est ajouté **après** les ressorts de pose. Le `Stepper` a trois modes :
  cycle (en mouvement), réactif (arrêt, demi-tour sur place), glissade.
- **Squelette** : coude et genou à mi-membre (`JOINT`), pli fondu dans le
  vertex shader (`jointShader`, duvet compris), IK de jambe à deux segments
  (`solveLeg`), ressorts d'avant-bras/tibia, butées (bassin compris : torsion
  ±1,4, bascule ±0,9, avant libre pour le salto).
- **Gestes** : combo de 3 coups, parade, coup reçu (côté aléatoire), K.O.
  physique (`toppleStep`) et relevée (`rise`), saut à hauteur variable,
  **double saut** avec salto (`flip`) et **cercle rituel holographique**
  (`Sigil`), plongeon en l'air (`plunge` → `slam`), **dash d'esquive** (L,
  garde le cap) avec **images rémanentes** (`Ghosts`), **glissade**
  (seulement en course : Maj + L tenus ; carve sans perdre de vitesse ; fin
  dès qu'on lâche L ou Maj). Arène de rayon 10, tapis cousu, poussière.
- **Physique** : `SpringBone` à pas fixe de 1/60 s (même comportement à
  30/60/144 Hz) ; `ClothSheet` avec `carry` (inertie « monde », rotations
  comprises) et `floor` ; colliders du corps pour les mains et la lame.
- **Silhouettes** (version de base) : écharpe à pan arrière ×2,7, collier ×1,75
  instancié avec chaîne pendante et cadenas. **Leo trouve l'écharpe
  « foireuse » en jeu** — voir plus bas.
- **Fermeture éclair** au dos du crâne de toutes les poupées (`zip.tsx`).

### Ce qui reste à faire, par ordre de priorité

1. **Écharpe en jeu** (plainte directe de Leo : « l'écharpe est foireuse,
   améliore sa physique et son aspect in game »). Un agent y travaillait :
   son état est sur **`claude/wip-silhouettes`** (base `fa6158a`, touche
   `cloth.ts`, `rig.ts`, `scarf.tsx`, `fringe.ts`, `traits.tsx`). Relis ce
   diff, teste-le **dans l'arène aux vitesses réelles** (trot, course, dash
   7 u/s, glissade 8,5 u/s, salto, K.O.), puis fusionne ce qui est bon.
   Suspect principal côté tissu : `CARRY = 0.92` laisse le pan quasi immobile
   dans le monde, donc à grande vitesse il s'étire d'un coup par image ;
   borner la part transportée selon la vitesse, borner l'étirement par lien,
   plus d'itérations seulement quand ça bouge vite. Mesure l'étirement max et
   la pénétration dans les colliders sur une séquence scriptée.
2. **Collier** : chaîne pendante et cadenas à vérifier de face (le cadenas ne
   doit ni traverser le ventre ni descendre trop bas ; `HANG = 0.42` de la
   hauteur du torse) et il doit balancer franchement pendant les coups.
3. **Silhouettes des 4 autres variantes** (demande de Leo : « un élément de
   silhouette extrêmement identifiable » par personnage, qui participe à
   l'animation) : couronne d'épingles, ceinture, nœud papillon, couture
   intégrale. Peut-être entamé sur `claude/wip-silhouettes`.
4. **Visages et expressions** (demande de Leo, même thème : boutons, points
   cousus, broderies). Travail d'agent sur **`claude/wip-visages`** (nouveau
   `src/doll/expression.tsx`, modifs de `face.tsx` et d'une prop dans
   `Doll.tsx`) : expressions réactives à `fighter.current` / `fighter.hp`.
   Relire, tester, fusionner. Attention : `Face` est dans un `<Batched>`
   (géométrie fusionnée, figée) — ce qui bouge doit en sortir.
5. **Fermeture éclair dans les coiffures** : la plupart des coupes la
   recouvrent. Il faut une raie arrière / exclusion de bande
   (`zipHole(p)` donne la bande) dans `hairstyles.tsx` (pas dans `hair.tsx`,
   intouchable ; les locks s'écartent déjà en partie). Vérifier aussi que la
   languette balance bien dans l'arène.
6. **Refonte des coupes** (demande de Leo : « reprends l'aspect / les coupes
   pour encore les améliorer ») : plan dans `.claude/runs/hair-anime-design/`
   (branche `coupes-anime`). Un agent a été **arrêté faute de budget** :
   commit propre sur `claude/coupes-wip` (frange en pointes en brique
   partagée), travail non commité en plus sur `claude/wip-coupes` (queue de
   cheval, chouchou…). Rien n'est vérifié.
7. **Audit de fluidité** : un agent en lecture seule préparait un rapport
   classé (allocations par image, coût CPU des simulations, appels de rendu).
   S'il n'est pas arrivé dans ce fichier, refais un audit rapide : allocations
   dans les `useFrame` de `Doll.tsx` (objets `{...cfg}` par image, `.slice()`
   dans `aimWeapon`), coût de l'écharpe (74 rangs × 10 colonnes × 9
   itérations), appels de rendu arène/planche (`window.__gl.info.render`).

### Comment vérifier sans te ruiner

- **Mécanique en Node** : copie un script dans `src/__x.ts`, bundle avec
  `npx esbuild src/__x.ts --bundle --platform=node --format=esm --outfile=/tmp/x.mjs`,
  exécute, **supprime** `src/__x.ts`. Exemples prêts sur
  `claude/wip-outils` (`tools/audit/jerk.ts` : à-coups des pieds et du
  bassin, portée des jambes, vol ; `sim.ts` : IK, ressorts à 30/60/144 Hz,
  saut, dash…). Le test d'endurance (une minute d'appuis au hasard, pas de
  1/144 à 1/20 s) a trouvé deux vrais bugs : refais-le après toute
  modification de `fighter.ts` / `limbs.ts`.
- **Navigateur headless** : Chromium swiftshader, ~2 images/s. Utile pour
  des captures de contrôle, inutile pour juger un mouvement. Pièges :
  - le composant `Controls` **réécrit `fighter.input` à chaque image** : pilote
    avec le clavier Playwright (ZQSD, Maj, L, espace, J), pas en écrivant
    `input` ;
  - clique via le DOM (`document.querySelector('#play').click()`) : le clic
    Playwright attend une stabilité que le rendu lent n'offre pas ;
  - attends en **temps de jeu** (`fighter.time`) et fige avec
    `window.__fighter.speed = 0.005` avant une capture ;
  - une simulation de tissu n'est pas stabilisée en quelques images : pompe
    les pas avant de juger un drapé.
- **Serveur de dev** : si plusieurs serveurs Vite tournent (agents en
  worktree avec `node_modules` en symlink), ils partagent `node_modules/.vite`
  et l'app casse (« Invalid hook call », deux React). Chaque serveur doit
  avoir son `cacheDir`, via une config **dans** le dépôt, non commitée
  (`vite.local.config.mjs`, exclue par `.git/info/exclude`) — hors du dépôt,
  `react-refresh` ne se résout plus. Et ne fais pas `pkill -f vite…` dans la
  même commande que le motif : le shell se tue lui-même.
- Les worktrees d'agents vivent dans `.claude/worktrees/` **à l'intérieur**
  du dépôt : ajoute `.claude/worktrees/` à `.git/info/exclude` avant tout
  `git add -A`.

### Accès atelier (dev)

`window.__fighter` (état : `current`, `pos`, `vel`, `cycle`, `gliding`,
`speed` pour un ralenti, `press('attack'|'jump'|'dodge'|'hit'|'ko')`),
`window.__stepper`, `window.__legK`, `window.__doll` (`joints`, tête,
bassin), `window.__scene`, `window.__gl`, `window.__turntable` (yaw, pitch,
distance, panY), `window.__advance`, `window.__hairs`.

### Conventions à respecter (rappel des principes du projet)

- Tout est procédural et dérive de la graine ; aucun asset externe.
- `surface.ts` est la source unique des profils (`onHeadPolar`, `onTorso`…).
- Commentaires en français qui expliquent **pourquoi**, et chiffrent ce qui a
  été mesuré ; un piège trouvé s'écrit dans « Pièges rencontrés ».
- Pas d'allocation par image, instanciation / `<Batched>` pour les petites
  pièces fixes, surveiller les appels de rendu.
- `hair.tsx` (locks) ne se touche pas.
- Le cercle du double saut est un dessin original façon vévé : Leo avait
  montré le sceau de Baphomet en exemple, qui est un symbole déposé — ne le
  reproduis pas tel quel.

## Journal des avancées (session cloud)

Journal des avancées, tenu à jour à chaque étape (demande de Leo). Le plus récent
en haut. Branche de travail : `claude/quirky-galileo-g4u9c5`, partie de
`peluches-jouables`.

### Tester soi-même

```bash
git fetch origin
git checkout claude/quirky-galileo-g4u9c5
npm install
npm run dev          # http://localhost:5173
```

Choisir une peluche → **Jouer**. Arène :

| Geste | Clavier | Manette |
|---|---|---|
| Se déplacer | ZQSD / WASD / flèches | stick gauche |
| Courir | Maj (tenue) | gâchettes basses LT/RT, ou stick cliqué |
| Sauter (tenir = plus haut) · en l'air : double saut | Espace | A |
| Attaquer (×3) · en l'air : plongeon | J / clic | X |
| Esquive (dash) · tenir : glissade | L | B |
| Parer | K | LB / RB |
| Tester : coup reçu / K.O. (X à nouveau : se relever) | H / X | Y / Select |

Atelier (dev) : `window.__fighter` (état du combattant : `current`, `pos`, `vel`,
`speed` pour un ralenti), `window.__stepper`, `window.__legK`, `window.__doll`.

### Vérifier sans navigateur

Le rendu headless (swiftshader) tourne à ~2 i/s : inutilisable pour juger du
mouvement. La mécanique se mesure en Node : un petit fichier `src/__sim.ts`
qui importe `Fighter`, `SpringBone`, `solveLeg`, bundlé par esbuild
(`npx esbuild src/__sim.ts --bundle --platform=node --format=esm --outfile=/tmp/sim.mjs`),
puis supprimé. Mesures de référence ci-dessous.

### Travaux en cours sauvegardés (non fusionnés)

Instantanés poussés pour ne rien perdre si le conteneur disparaît — fichiers
non commités compris, **non vérifiés** : à relire, tester et fusionner.

| Branche | Contenu | Base |
|---|---|---|
| `claude/wip-silhouettes` | Écharpe en jeu (physique et aspect aux vitesses réelles), collier, silhouettes signature des 4 autres variantes — agent en cours | `fa6158a` |
| `claude/wip-visages` | Visages plus riches, expressions réactives (`expression.tsx`) — agent en cours | `fa6158a` |
| `claude/coupes-wip` | Premier pas de la refonte des coupes : frange en pointes en brique partagée (commit propre) | `fa6158a` |
| `claude/wip-coupes` | Même agent, travail non commité en plus (queue de cheval, chouchou…) — arrêté faute de budget | `70d1049` |
| `claude/wip-outils` | Simulations Node, scripts de capture, bancs de l'audit (`tools/audit/`) | branche principale |

Les deux premiers seront remplacés par la fusion de leur rapport final s'il
arrive ; sinon, reprendre depuis ces branches.

### Journal

#### 2026-09-26 — fermeture dans les coiffures, queue haute, écharpe (session locale, branche `coupes-anime`)

- **Fermeture éclair dans toutes les coupes** (`hairstyles.tsx`, source unique
  `zipHole` via `zipBand`) : cheveux tirés partagés exactement sur le ruban et
  raie **refermée** au-delà de son bout haut (racines croisées non enfouies) ;
  brins vers une attache de l'autre côté franchissant le méridien au-dessus du
  bout, par relèvement continu (`zipPath` — un détour binaire séparait deux
  familles de brins et ouvrait un sillon) ; racines de bord sous le ruban.
  Coupes rayonnantes : épi au bout haut de la fermeture, brins tenus de leur
  côté (`keepOffZip`). Bouclettes rangées au bord du ruban. Leo : les
  **queues** (parties libres) peuvent passer dessus.
- **Queue haute** à droite (croquis de Leo) : Bézier qui monte puis s'arque,
  ressort sans gravité, faisceau épais. Chignon seul au sommet.
- **Mèches** : deux longues mèches devant, une par côté (`sideLocks`), pointes
  éclaircies (attribut `aTint`, teinte `uTip` = clarté +0,45 en absolu).
- **Bouclettes** plus denses (pas 1,2 diamètre, ≤ 50 k triangles).
- **Écharpe** : retour à la version d'avant le pan ×2,7 (il traînait au sol et
  pendait en cordon) ; borne d'étirement des liens (`MAX_STRAIN` 1,12, après
  les collisions) et bras `loose` ignorés par le tour de cou retenu. Mesuré
  dans l'arène : étirement max 1,1–1,3 au lieu de 1,5–2,7.
- Serveur de la copie de travail : `vite.local.config.ts` (cache séparé),
  port 5174.
- **Collier** (reprise de `claude/wip-silhouettes`, vérifiée) : cadenas
  particule, tour installé avant d'accrocher la chaîne pendante et tenu aux
  épaules (0,6), azimut des maillons borné (`keepAround`) — il traversait le
  cou au 3e coup. Cadenas au repos à −0,27 demi-torse, pénétration nulle.
- **Silhouettes** (brique `Streamer`, ruban ClothSheet dans le repère du cou) :
  nœud papillon ×1,35 avec deux pans en V ; ceinture à grande boucle et deux
  bouts de cordon pendants ; couronne de grandes épingles dressées sur ressorts
  (`noBatch` pour sortir du `<Batched>`) ; couture intégrale avec une grosse
  aiguille plantée dans la suture et son fil qui pend du chas.
- **Expressions réactives** (reprise de `claude/wip-visages`, `expression.tsx`) :
  fils du visage à cibles de morphing, paupières de feutre ; mesuré dans
  l'arène : concentration 0,92 au coup, grimace 0,84 au coup reçu, croix 1 au
  K.O. Le combattant passé est celui de la poupée (`fighter`), planche comprise.
- **Paupières toujours visibles au repos** (demande de Leo) : plancher tiré par
  poupée (0,2–0,4, écart d'un œil à l'autre), l'humeur plus lourde l'emporte.
- **Houppette** refaite : cheveux tirés tenus vers un nœud au sommet, plumet de
  lames aplaties en palmier, un ressort par lame. **Couettes** : queues en
  mèches pointues (`bunch` `clumps`) et deux mèches latérales.
- **Nattes** : frange balayée en mèches pointues (`sweptFringe`), tresses plus
  épaisses et longues. **Trois poils** : toujours trois, crosse / ressort / pic.
- **Couronne d'épingles** : plus un signe, un accessoire (épingles fixes
  d'origine) tiré par une ou deux poupées de chaque planche (`boardCrowns`) ;
  la 6e poupée est « sans signe » (pièce imposée sur le devant).
- Mèches latérales parties de la racine (épi, raie) ; grande frange : 0, 1 ou
  2 mèches des côtés aux pointes éclaircies (`tintedClumps`).
- **Trois poils** gardée (Leo ne veut pas de poupée *sans rien*) : plus
  courts, trois formes distinctes tirées parmi six (ressort, crosse, pic,
  vague, zigzag, boucle), longueur, épaisseur, écart et inclinaison propres.
- Non fait, volontairement : refonte « anglaises » des bouclettes (Leo les a
  validées, il a seulement demandé plus de densité).


#### 2026-09-25 — fermeture éclair, endurance

- **Fermeture éclair** au dos du crâne, sur toutes les poupées (`zip.tsx`) :
  ruban sombre sur le méridien arrière (`onHeadPolar`, azimut π), deux
  rangées de dents qui s'engrènent, arrêts, points de couture sur les
  bords, curseur, languette percée sur `SpringBone` (poids, collider du
  crâne) qui balance. Fixe fusionné (`<Batched>`), duvet retiré sous le
  ruban (`zipFuzzShader`, lu sur la position de base du sommet). Métal à
  0,65 : **un métal pur sort noir dans le rendu en aplats** (il ne reflète
  que l'environnement, que les paliers écrasent). Reste : la dégager dans
  les coiffures (raie arrière).
- **Endurance** (une minute d'appuis au hasard, pas de 1/144 à 1/20 s) :
  bassin sans butée → torsion jusqu'à 2,9 rad sur des attaques en rafale
  (ressorts « fouet » qui cumulent) ; bornes ajoutées (torsion ±1,4, bascule
  ±0,9, avant libre pour le salto). Pied d'appui laissé à 2× la portée sur
  un demi-tour brusque en cycle ; il glisse maintenant juste assez pour
  rester à portée (≤ 1,21×). 0 NaN.

#### 2026-09-25 — physique et animations des personnages (3)

- **Vrai cycle de marche et de course** (`Fighter.advanceCycle`, `Stepper`
  mode cycle) : phase continue, 5,2 pas/s à la marche (2,4 u/s), 6,7 à la
  course (5,4 u/s) — avant 8 et 13 micro-pas qui grésillaient (« deux
  bâtons »). Part d'appui tirée de la portée de jambe (`duty = portée ·
  cadence / vitesse`) : appuis chevauchés à la marche, 38 % de vol à la
  course. Pied fixe au sol pendant l'appui (glissement mesuré : 0), vol en arc
  vers l'appui suivant recalculé à chaque image, talon relevé à la course.
  Jambe ≤ 1,09 × portée à la marche, 1,14 à la course. Le mode réactif ne
  sert plus qu'à l'arrêt et aux demi-tours sur place.
- **Rythme après les ressorts** (`rhythm`) : rebond du bassin, bascule,
  torsion des épaules, balancier des bras, ajoutés à la pose *après* les
  ressorts de pose. À 5–6 Hz, passés par des ressorts à ~3 Hz, ils étaient
  écrasés et décalés : le corps restait raide pendant que les jambes
  moulinaient. Plus aucun à-coup par appui (`land` ne fait plus que la
  poussière).
- **Esquive = dash** (7 u/s, bond bas de 0,13 s, ~1,9 u) : garde le cap,
  couchée et écrasée dans le mouvement, **images rémanentes** (`Ghosts` :
  silhouette de 14 ellipsoïdes écrite par la poupée à la demande, un seul
  dessin instancié, liseré plus dense sur les bords).
- **Glissade** (touche d'esquive tenue) : le dash enchaîne sans freiner,
  la poupée se tourne vers sa direction de glissade, file à 8,5 u/s ; cap
  limité à 2,2 rad/s (contrôle rigide), grosse inertie, pieds au sol l'un
  devant l'autre (`Stepper` mode glissade), penchée dans les virages,
  poussière continue, fantômes espacés. Relâchée : ~0,7 u de freinage.
- **Double saut** : second appui en l'air, impulsion 0,85 × celle du saut
  (sommet 0,70 → 1,23 u), salto avant groupé, tour ramené à zéro (`unwind`)
  à la fin, à l'atterrissage ou si un plongeon l'interrompt.
- **Silhouettes** : écharpe à pan arrière ×2,7, collier ×1,75 instancié avec
  chaîne pendante et cadenas ; inertie « monde » des tissus et chaînes
  (`FrameCarry`, rotations comprises) et sol dans la simulation.
- Arène 6 → 8 u de rayon (croix du tapis à densité constante).

**Piège d'outillage** : des worktrees d'agents qui lient `node_modules` par
symlink partagent `node_modules/.vite` ; leurs serveurs Vite réécrivent le
cache de dépendances du serveur principal → « Invalid hook call » (deux
React). Chaque serveur doit avoir son `cacheDir`, via une config **dans** le
dépôt (non commitée) — hors du dépôt, `react-refresh` ne se résout plus.

#### 2026-09-25 — physique et animations des personnages (2)

- **K.O. physique** (`fighter.ts`, `fall` / `toppleStep`) : le corps bascule en
  arrière autour des pieds (`θ'' = g/h · sin θ`, gravité réduite de peluche),
  touche le sol du dos à ~0,75 s, rebondit (vitesse × −0,3), bouffée,
  secousse, puis se balance sur son dos rond jusqu'à 1,5 rad. Bras et tête
  restent sur ressorts, mous.
- **Relevée** (X à nouveau, geste `rise`, ~1,1 s) : assise en poussant sur les
  bras, accroupie mains sur les genoux (IK des genoux active), debout d'une
  détente, tête qui secoue, sonnée. Les ressorts repartent de la pose au sol.
- **Collisions avec son propre corps** (`Doll.tsx`) : tête, poitrine et ventre
  en sphères monde relues chaque image (rayons pris sur l'ellipsoïde du
  torse). Les mains (ressorts d'avant-bras) ne rentrent plus dans le corps ;
  la lame de l'épingle pivote autour de la main pour contourner tête et torse
  (`avoidSphere`), le sol gardant le dernier mot.
- Bouffées de laine plus fines (elles lisaient comme des boules de neige).

#### 2026-09-25 — physique et animations des personnages (1)

Demandes : marche qui tangue moins, sprint rapide, saut, genoux/coudes (membres
moins raides, plus de vie), esquive en pas de côté au lieu de la roulade.

- **Marche calmée** (`fighter.ts`, `locomotion`) : dandinement 0,1 → 0,035 rad,
  torsion de foulée 0,16 → 0,06, report du dandinement dans le cisaillement
  0,6 → 0,35. Mesuré sur 1,5 s de marche : roulis du bassin 0,073 → 0,022 rad,
  cisaillement 0,079 → 0,014, torsion 0,167 → 0,063, déplacement latéral de la
  tête ≈ 0,061 → 0,003 u.
- **Sprint** : Maj / gâchettes. 5 u/s (course : 2), pleine vitesse en ~0,5 s,
  glissade de ~0,55 u à l'arrêt. Buste penché (≈ 0,5 rad), tête relevée, bras
  en équerre qui pompent (fréquence des ressorts du bras libre relevée), arme
  couchée derrière, virages plus larges et plus penchés, presque plus de roulis.
  Pas plus courts et plus vifs (jusqu'à 13/s, `Stepper`), genoux hauts.
  Bouffées de laine sous chaque pas, en glissade, à la réception (`Dust`).
- **Saut** : Espace / A. Appel accroupi de 0,06 s puis poussée ; gravité 20 à
  la montée tant que le bouton est tenu, 34 sinon et à la descente (sommet
  flottant, chute franche). Tenu : sommet 0,70 u (≈ 0,36 × la hauteur),
  0,47 s en l'air ; bref : 0,43 u, 0,32 s. Poses de vol (genoux repliés à la
  montée, jambes tendues et bras qui moulinent à la descente), réception
  écrasée proportionnelle à la vitesse de chute. Élan du sprint conservé en
  l'air. Appui de saut en l'air mis en file : rebond immédiat à l'atterrissage.
- **Plongeon** : attaque en l'air → suspension, épingle levée, chute droite
  pointe en bas, impact (`slam`) avec gel d'image et secousse.
- **Pas de côté** (remplace la roulade) : la poupée garde son cap, petit bond
  bas (≈ 0,09 u, 0,16 s de vol) de ~1,2 u dans la direction du stick (en
  arrière sans direction). Buste penché dans le mouvement, jambe de tête
  écartée, l'autre repliée, bras à l'opposé, tête qui compense, freinage à
  l'atterrissage.
- **Genoux et coudes** (`limbs.ts`, `rig.ts`, `Doll.tsx`) : chaque membre plie à
  mi-longueur. Le boudin reste d'une pièce ; sa moitié basse suit un second os
  (`lowerPose` : angle du geste, puis `lowerSpring` : ressort). Pli fondu sur
  un quart du membre dans le vertex shader (`jointShader`, remplace l'ancienne
  courbure en sinus `bowShader`), duvet compris. Nouveaux os de pose
  `elbow±1`, `knee±1` avec ressorts et butées ; tous les gestes les
  renseignent (coude armé puis déplié en fouet sur les frappes, bras pliés en
  course, repliés en parade…). Avant-bras/tibias sur ressort plus mou : ils
  arrivent en dernier.
- **IK des jambes à deux segments** (`solveLeg`) : au sol, la jambe rejoint son
  pied planté par hanche + genou, dans le repère de la hanche (écrasement
  compris). Le genou part devant ; quand le corps se tasse (course,
  réception, appel), le genou plie au lieu que la jambe rapetisse. Étirement
  du tissu seulement au-delà de la portée tendue (≤ 1,15). Genoux souples à
  l'arrêt (bassin −4 % de jambe). Erreur de pied mesurée : ~1e-15.
- **Ornements de membres** (`traits.tsx`) : `limbEnds` pour ce qui vit sous le
  pli (bracelet, bandage au bout) ; le bandage à mi-membre remonte au-dessus.
- **Ressorts à pas fixe** (`springBone.ts`) : 1/60 s par sous-pas, cible
  interpolée, bout extrapolé à l'affichage. Identique à l'ancien calcul à
  60 i/s ; écart max à 30/120/144 Hz : 0,124/0,060/0,070 rad → 0,011/0/0,032.
  Concerne aussi locks et coiffures.
- **Coups reçus variés** : côté tiré au sort (`hitSide`), torsion et tête de ce côté.
- **Attente vivante** : après ~1,4 s immobile, regards ailleurs (tête puis
  buste), report de poids ; aussi sur la planche, déphasé par poupée.
- **Arène** : rayon 2,3 → 6 ; tapis en points de couture + croix semées
  (`ArenaFloor`) pour lire la vitesse sur le blanc ; lumière porteuse d'ombre et
  ombres de contact qui suivent la poupée ; caméra avec un peu d'avance dans
  le sens de la course, qui recule au sprint et suit le saut à moitié.

