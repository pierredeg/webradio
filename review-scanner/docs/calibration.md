# Calibrer les poids

Aujourd'hui les poids de `src/engine/weights.js` sont des a priori d'expert. Ils
ordonnent correctement les avis mais la valeur absolue de l'indice n'est pas une
probabilité. Voici comment y remédier sans jeu de données étiqueté — puisqu'il n'en
existe aucun de public.

## L'idée : Google est l'étiqueteur

Google supprime en continu les avis qu'il juge frauduleux. **Un avis présent lors d'une
collecte et absent lors de la suivante a, dans une bonne partie des cas, été supprimé par
Google.** C'est une étiquette faible « détecté comme faux par le premier détecteur
mondial », gratuite, et disponible en quantité.

Elle est bruitée, et il faut savoir de quoi :

- un auteur peut supprimer son propre avis (il n'y a aucun moyen de distinguer les deux
  cas depuis l'extérieur) ;
- Google supprime aussi pour des motifs sans rapport avec l'authenticité (propos
  injurieux, conflit d'intérêts déclaré, doublon technique) ;
- Google rate des faux avis : une étiquette « présent » ne veut pas dire « authentique ».
  C'est un problème de **PU learning** (positifs et non-étiquetés), pas une classification
  binaire propre.

Malgré ce bruit, un modèle entraîné là-dessus battra largement des poids devinés.

## Procédure

1. **Constituer un panel.** 2 000 à 5 000 établissements, plusieurs catégories et villes,
   choisis indépendamment de tout soupçon — sinon le jeu d'entraînement est biaisé dès le
   départ.

2. **Collecter à T0**, puis re-collecter tous les 30 jours pendant 3 à 6 mois. Stocker
   chaque instantané ; ne jamais écraser.

3. **Construire les étiquettes.** Pour chaque avis vu à T0 : `disparu ∈ {0,1}` à la
   dernière collecte. Écarter les établissements entièrement disparus (fermeture, fusion
   de fiches) : leur disparition n'apprend rien.

4. **Recalculer les features à T0** — jamais sur les instantanés ultérieurs, sous peine
   de fuite temporelle : les rafales sont mieux visibles a posteriori, et un modèle
   entraîné sur cette information n'aurait aucune valeur en production.

5. **Ajuster une régression logistique** sur ces features, avec régularisation L2 et
   validation croisée **groupée par établissement** — sinon deux avis du même pack acheté
   se retrouvent des deux côtés du découpage et les scores explosent artificiellement.

6. **Calibrer les probabilités** (Platt ou isotonique) sur un jeu de validation séparé,
   puis vérifier avec un diagramme de fiabilité : parmi les avis notés 0,3, environ 30 %
   doivent effectivement avoir disparu.

7. **Corriger le taux de base.** La proportion d'avis supprimés n'est pas la proportion de
   faux avis : Google en rate. Si vous disposez d'une estimation externe du taux de
   détection de Google, appliquez-la ; sinon, documentez que l'indice est un plancher.

## Ce qui change dans le code

Uniquement `weights.js` : mêmes clés, valeurs ajustées, plus une couche de calibration à
brancher dans `score.js`. Aucun extracteur n'a besoin d'être touché — c'est précisément
pour ça qu'ils sont indépendants du scoring.

Ajoutez, le jour où c'est fait, la date de calibration et la taille du panel dans
`weights.js`, et retirez l'avertissement en tête de fichier. Tant qu'il y est, il est vrai.

## Signaux à ajouter quand la calibration existe

Sans étiquettes, ajouter des signaux revient à deviner des poids supplémentaires. Avec
elles, ces pistes deviennent testables :

- délai entre la création du compte et le premier avis (non exposé publiquement, mais
  approchable par l'ancienneté du plus vieil avis du profil) ;
- incohérence géographique : avis publiés le même jour dans des villes éloignées ;
- ratio de réponses du propriétaire aux avis positifs contre négatifs ;
- corrélation entre les rafales d'avis et les campagnes publicitaires ou les dates de
  levée de fonds de l'établissement ;
- détection de texte généré par LLM par perplexité mesurée, plutôt que par la liste de
  tournures figées utilisée aujourd'hui.
