# Humidex — Sainte-Maxime (Var)

Reconstitution d'une série historique de **humidex** pour la région de
Sainte-Maxime (43,309° N — 6,638° E), à partir des données horaires publiques de
Météo-France, et production d'un rapport HTML autonome.

Météo-France ne publie pas de humidex : il est ici recalculé heure par heure à
partir de la température et de l'humidité relative.

## Installation

```bash
pip install -r requirements.txt
```

Trois dépendances : `pandas`, `numpy`, `requests`. Les tests de tendance
(Mann-Kendall, pente de Sen, régression linéaire) sont implémentés dans le dépôt,
sans SciPy.

## Utilisation

```bash
# Chaîne complète : téléchargement (avec cache), analyse, rapport
python humidex_sainte_maxime.py

# Réutiliser le cache sans aucun accès réseau
python humidex_sainte_maxime.py --offline

# Forcer une station précise plutôt que le choix automatique
python humidex_sainte_maxime.py --station 83101001
```

| Option | Effet |
|---|---|
| `--departement` | Code département, `83` par défaut |
| `--cache-dir` | Cache des CSV.gz, `humidex/cache` par défaut |
| `--out-dir` | Dossier de sortie, `humidex/out` par défaut |
| `--offline` | N'utilise que les fichiers déjà présents dans le cache |
| `--min-good-years` | Années exploitables exigées d'une station (20 par défaut) |
| `--station` | Impose un `NUM_POSTE` au lieu du choix automatique |
| `--synthetic-banner` | Marque le rapport comme bâti sur des données de test |

### Sorties

Dans `--out-dir` :

- **`rapport.html`** — page autonome, un seul fichier, ouvrable directement dans
  un navigateur et transmissible par courriel ;
- **`synthese_annuelle.csv`** — synthèse annuelle (séparateur `;`, décimale `,`,
  UTF-8 avec BOM : s'ouvre tel quel dans Excel en français) ;
- `grille_mensuelle.csv` — détail mois × année.

## Le cache

Les fichiers `H_083_*.csv.gz` sont téléchargés une fois puis relus depuis
`--cache-dir`. Un fichier déjà présent, valide et de taille conforme au manifeste
n'est pas re-téléchargé. Avec `--offline`, aucune requête réseau n'est émise : il
suffit alors de déposer manuellement les fichiers dans le cache, ce qui permet de
travailler derrière un pare-feu.

Les fichiers sont récupérés depuis `meteo.data.gouv.fr`, jeu « Données
climatologiques de base — horaires ». Le script résout la liste des ressources
via l'API data.gouv.fr (par slug puis par identifiant) plutôt que par des URL
codées en dur, afin de survivre au redécoupage périodique des tranches d'années.

## Méthode

**Choix de la station.** Toutes les stations du département sont profilées
(position, historique, taux de remplissage de `T` et `U`). Sont éligibles celles
comptant au moins vingt années dont 80 % des heures portent simultanément une
température et une humidité. Parmi elles, la plus proche de Sainte-Maxime est
retenue. Les stations plus proches mais sans hygrométrie sont écartées : sans
humidité, pas de point de rosée, donc pas de humidex. Le classement complet
figure dans le rapport, avec le motif d'exclusion de chaque écartée.

**Point de rosée.** Repris des données quand Météo-France publie `TD` ; sinon
calculé par Magnus-Tetens. Une valeur publiée dépassant la température de plus de
0,5 °C est écartée au profit du calcul.

```
α  = 17,27·T / (237,7 + T) + ln(U/100)
Td = 237,7·α / (17,27 − α)
```

**Humidex**, convention Environnement Canada — non défini sous 20 °C :

```
e       = 6,11 · exp[ 5417,7530 · (1/273,16 − 1/(273,15 + Td)) ]
humidex = T + (5/9)·(e − 10)        si T ≥ 20 °C, sinon NA
```

**Fuseau horaire.** Les fichiers horodatent en UTC (`AAAAMMJJHH`). Tout est
converti en `Europe/Paris` avant découpage en années, mois et créneaux, de sorte
que le passage heure d'été / heure d'hiver est traité correctement.

**Créneaux.** Jour = 10h–18h, nuit = 22h–6h, heure locale, le créneau nocturne
enjambant minuit.

**Complétude.** Une heure compte comme disponible si `T` *et* `U` le sont. Une
année est retenue au-delà de 80 % des heures de l'année civile (8 760 h, 8 784 h
les années bissextiles). Les comptages par palier sont fournis bruts *et*
ramenés à une année complète, pour que les années partiellement lacunaires
restent comparables aux années pleines.

**Tendances.** Régression des moindres carrés, test de Mann-Kendall (approximation
normale, correction des ex æquo) et pente de Sen avec intervalle de confiance à
95 % selon Gilbert. La significativité affichée est celle de Mann-Kendall.

## Le rapport HTML

Un seul fichier, sans aucune dépendance externe : CSS et JS en ligne, données
injectées en JSON, **graphiques dessinés en SVG par du JavaScript sans
bibliothèque**. Aucun CDN, aucune requête réseau à l'ouverture — le fichier
fonctionne hors ligne, en pièce jointe, et derrière un proxy d'entreprise, tout
en restant interactif (survol, navigation au clavier, tri, bascule de métrique).

Chaque graphique est doublé d'un tableau dépliable : aucune valeur n'est
accessible uniquement au survol. Thème clair et sombre, mise en page responsive,
feuille d'impression.

## Jeu de test

`tests/make_fixture.py` fabrique un jeu **synthétique** au format exact des CSV
Météo-France (séparateur `;`, décimale `,` ou `.`, latin-1 ou utf-8, horodatage
UTC, station sans humidité, lacunes, points de rosée partiellement publiés). Il
sert à vérifier la chaîne de bout en bout sans accès réseau.

```bash
python tests/make_fixture.py
python humidex_sainte_maxime.py --offline --cache-dir tests/fixture_cache \
       --out-dir out --synthetic-banner
```

`exemple/rapport_demo.html` est le rapport produit à partir de ce jeu de test.
**Aucun de ses chiffres n'est une observation** — il ne montre que la mise en
forme et atteste que la chaîne tourne. Le rapport porte un bandeau d'avertissement
en tête.

## Limites

- Le humidex n'est pas défini sous 20 °C : la « moyenne annuelle » est une
  moyenne conditionnelle, qui mesure l'intensité de la chaleur humide lorsqu'elle
  survient et non la chaleur moyenne de l'année. Les comptages par palier et les
  maxima sont plus directement interprétables.
- La station n'est pas à Sainte-Maxime : distance, exposition littorale et effet
  de site créent un écart avec les conditions ressenties en ville.
- Les ruptures d'homogénéité des séries longues (changements d'instrument, de
  site, de protocole) ne sont pas corrigées : la tendance mesurée mêle signal
  climatique et historique instrumental.
- Les codes qualité `Q…` ne servent pas à filtrer par défaut.
- Le humidex ignore le vent et le rayonnement solaire, deux facteurs
  déterminants sur le littoral varois.

## Licence des données

Données © Météo-France, diffusées sous Licence Ouverte via meteo.data.gouv.fr.
