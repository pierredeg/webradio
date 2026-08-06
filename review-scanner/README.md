# Scanner d'avis Google Maps

Estime la part des avis d'un établissement qui portent des **signaux d'inauthenticité**,
et montre lesquels et pourquoi.

```bash
npm install
npm test                                     # 25 tests
npm run scan src/fixtures/contaminated.json  # rapport en CLI
npm run dev                                  # interface
```

## Ce que l'outil mesure, et ce qu'il ne mesure pas

Il n'existe aucune vérité terrain publique sur les faux avis. Personne, en dehors de
Google, ne sait quels avis sont faux. Un outil qui affiche « 37 % de faux avis » ment
sur ce qu'il sait.

Celui-ci affiche : **« 37 % des avis portent des signaux d'inauthenticité, selon cette
méthode »**, avec l'intervalle, le détail par avis et les poids en clair. La différence
n'est pas cosmétique :

- **scientifiquement**, les poids du modèle sont des a priori d'expert, pas des
  coefficients ajustés sur des données étiquetées. Le *classement* des avis est
  informatif ; la valeur absolue est un indice, pas une probabilité ;
- **juridiquement**, affirmer qu'un établissement a de faux avis est diffamatoire ;
  décrire des observations statistiques factuelles ne l'est pas.

## Les signaux

| Signal | Poids | Force | Coût de collecte |
|---|---|---|---|
| Graphe de co-publication | 2,9 | la plus forte | élevé (crawl des profils) |
| Rafale temporelle anormale | 2,6 | forte | nul si dates exactes |
| Texte quasi identique | 2,4 | forte | nul |
| Compte à contribution unique | 1,7 | moyenne | moyen |
| Bourrage de mots-clés | 1,4 | moyenne | nul |
| Éloge court et générique | 0,85 | faible | nul |
| Compte à peu de contributions | 0,7 | faible | moyen |
| Tournures de texte généré | 0,55 | faible | nul |
| Langue inattendue | 0,45 | faible | nul |
| Profil sans photo | 0,35 | très faible | moyen |
| Note sans texte | 0,25 | très faible | nul |

Le tout est combiné par une régression logistique, plus un décalage d'a priori au niveau
de l'établissement quand la distribution des notes s'écarte de la référence de catégorie.

**Détection de rafales** : chaque fenêtre glissante de 7 jours est testée contre une loi
de Poisson, avec un seuil corrigé du nombre de fenêtres testées (Bonferroni). La ligne de
base est estimée en deux passes — d'abord sur toute la période, puis en excluant les jours
des rafales candidates — pour qu'une rafale ne gonfle pas la base contre laquelle on la
teste, sans pour autant s'effondrer à zéro sur un corpus creux. L'homogénéité des notes
dans la fenêtre module l'intensité : un pic médiatique est mixte, un pack acheté est
uniformément 5★.

## La collecte, c'est là que tout se joue

```bash
# Recommandé : dates exactes, tous les avis, profils auteurs
OUTSCRAPER_API_KEY=... node scripts/collect.mjs --source api \
  --query "Nom, adresse, ville" --category renovation --limit 500 --out data/place.json

# Gratuit, mais dégradé
node scripts/collect.mjs --source browser --url "https://maps.app.goo.gl/..." --out data/place.json
```

| Source | Avis | Dates | Profils auteurs |
|---|---|---|---|
| **Places API officielle (Google)** | **5 maximum** | exactes | non |
| **API tierce** (Outscraper, SerpApi, Apify) | tous | **exactes** | oui |
| **Scraping navigateur** | tous | **relatives** (« il y a 3 mois ») | partiels |

L'API officielle de Google est éliminatoire : 5 avis ne permettent aucune statistique.

Le point non évident : **le scraping navigateur ne donne que des dates relatives**, ce qui
détruit la résolution nécessaire à la détection de rafales — de loin le signal structurel
le plus utile. Un jeu de données collecté ainsi est marqué `datePrecision: "approximate"`
et le moteur **refuse** d'y chercher des rafales plutôt que d'en fabriquer par arrondi.
C'est la vraie raison de payer pour une API tierce.

Le scraping de Google Maps contrevient par ailleurs aux CGU de Google. Le script le fait
si vous le lui demandez ; la décision vous appartient.

## Limites connues, par ordre d'importance

1. **Les poids ne sont pas calibrés.** Voir [docs/calibration.md](docs/calibration.md)
   pour la procédure qui transformerait l'indice en probabilité — elle utilise les avis
   que Google supprime lui-même comme étiquettes faibles.
2. **Les distributions de référence sont des a priori**, pas des mesures. Les remplacer
   par des moyennes empiriques par catégorie et par ville est le gain de précision le
   moins cher disponible.
3. **Le graphe de co-publication est presque toujours éteint**, faute de crawl des
   profils. C'est le signal le plus discriminant ; sans lui l'estimation est
   structurellement basse. L'interface le signale explicitement.
4. **En dessous de 30 avis, aucun chiffre n'est affiché.** Sur un si petit corpus
   l'estimation est du bruit.
5. **Les signaux textuels ont un vrai taux de faux positifs.** Beaucoup de clients réels
   écrivent « super, je recommande ». D'où les poids faibles : ce qui compte, c'est la
   convergence de plusieurs signaux sur un même avis.
6. **Une couverture partielle biaise tout.** Analyser 100 avis sur 400 ne dit rien du
   reste ; le rapport affiche le taux de couverture.

## Données personnelles

Les noms d'auteurs sont des données personnelles au sens du RGPD. Le format canonique les
transporte parce que l'interface doit pouvoir montrer les preuves, mais pour tout usage
au-delà d'une analyse ponctuelle : hachez `author.name` et `author.id`, ne conservez pas
les jeux de données au-delà du besoin, et ne republiez pas les textes d'avis avec les noms.

## Structure

```
src/engine/          moteur pur, sans dépendances, exécutable en Node comme en navigateur
  features/          un extracteur par signal, indépendant et testable isolément
  weights.js         tous les poids, avec l'avertissement de calibration
  score.js           combinaison logistique + agrégation + intervalle bootstrap
src/ui/              interface React
scripts/collect.mjs  collecteur (API tierce ou navigateur)
scripts/scan.mjs     rapport en ligne de commande
test/                25 tests, dont deux de non-régression bout en bout
```

Les fixtures sont **synthétiques** et générées par `npm run fixtures`. Aucun avis réel
n'y figure et aucun établissement réel n'y est caractérisé. Le corpus contaminé contient
trois packs de 13 avis injectés ; le test de non-régression vérifie que le moteur retrouve
exactement ces 39 avis, sans attraper le moindre avis organique.
