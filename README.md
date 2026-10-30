# Le Comptoir — version 3.0.1

Application de cocktails en français et en anglais, pensée pour varier les recettes avec un bar maison au Québec. Site statique prêt pour GitHub Pages, sans compilation ni compte obligatoire.

## Contenu et fonctionnement

- Les **921 recettes d’origine sont conservées**, avec les mêmes noms pour préserver les notes et favoris.
- Quantités structurées en ml, conversion en oz US, service de 1 à 8 verres, estimation d’alcool par verre.
- **36 classiques comparés à leurs fiches IBA**, avec lien source et adaptations signalées. Les 885 autres recettes restent identifiées comme recettes de la collection : contrôle structurel et harmonisation des doses, sans prétendre à une vérification externe ou une dégustation de chacune.
- Les bases à 2 oz de nombreux long drinks maison ont été ramenées à 45 ml. Les recettes de référence gardent leurs proportions.
- **8 variantes complètes** : Moscow mule, Paloma, Whisky sour, Cosmopolitan, Bramble, Penicillin, Mai Tai et Tommy’s margarita. La formule, les ingrédients requis, les conseils et la force sont recalculés pour la variante; aucune substitution silencieuse.
- Trois niveaux distincts de la force : simple, moyen, complexe. Recherche français/anglais, filtres par saveur, ingrédients à prévoir, disponibilité et favoris.
- Suggestions favorisant les découvertes, historique local des propositions et recettes déjà faites.
- Liste de courses liée à la version choisie, export texte et repères d’achat en Beauce. Pas d’inventaire commercial en temps réel.
- Guide bilingue de **25 fiches** : termes, matériel, gestes, familles, dilution, sirops et équilibre. Les liens ↗ des étapes ouvrent la technique correspondante.
- Accueil illustré par une image générée; dessins de verres indicatifs sur les fiches. Ils ne constituent pas des photographies des recettes.
- Inventaire, marques, notes et étoiles conservés sous la clé historique `bar-cocktails-v1`. Export/import JSON; l’import télécharge une copie des données précédentes. La langue est mémorisée séparément. Les notes et noms de bouteilles personnels ne sont pas traduits.

## Mettre en ligne sur le site existant

1. Décompresser le ZIP.
2. Remplacer les fichiers à la racine du dépôt `mdulac86/Cocktails` par son contenu, en conservant le dossier `assets` et les noms de fichiers.
3. Garder le réglage GitHub Pages existant : branche `main`, dossier racine.
4. Après le déploiement GitHub Pages, rouvrir l’application. Si l’ancienne version apparaît encore, fermer puis rouvrir ou recharger pour activer le nouveau cache.

Le ZIP contient l’application complète. `index.html`, `app.js`, `data.js`, `i18n.js`, `upgrade.css`, `assets/`, le manifeste, les icônes et `sw.js` doivent être déployés ensemble. Les autres fichiers servent à la maintenance et aux tests. Aucune donnée personnelle de test n’est incluse.

Pour consulter sans publier : ouvrir `index.html` après extraction fonctionne pour l’interface. Le mode installable et le cache hors ligne nécessitent HTTP local ou HTTPS. Sur iPhone : Safari → Partager → Sur l’écran d’accueil.

## Maintenance

- `recipes.json` : catalogue lisible, métadonnées et variantes.
- `tools/catalog.json` : catégories d’ingrédients.
- `node tools/sync-data.cjs` : régénérer `data.js` après modification du catalogue.
- `node tests/recipes.cjs` : vérifier l’intégrité, la migration et les calculs.
- `node tests/i18n.cjs` : vérifier la traduction des consignes et fiches du guide.
- `tools/original.json` : archive du catalogue d’origine pour les contrôles de non-régression.

Les dosages de sirop simple supposent un ratio 1:1. Les degrés d’alcool sont des hypothèses typiques, pas ceux de toutes les marques; la dilution et les fruits modifient le résultat réel. Les recettes n’ont pas été dégustées physiquement. La vérification mobile a été faite dans une fenêtre de 390 px, pas sur un iPhone physique.
