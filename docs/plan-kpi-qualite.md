# Plan de mise en place des KPI qualité

## Objectif

Produire quatre indicateurs mensuels et trimestriels auditables pour le Support CRM :
CSAT, insatisfaction, taux de réponse à l’enquête et IQS. Chaque taux doit exposer
son numérateur, son dénominateur, la période, la couverture et la dernière
synchronisation. Support et onboarding restent deux populations séparées.

## État des sources au 12 septembre 2026

Zoho Analytics contient le champ catégoriel `Satisfaction` sur les tickets Support.
Sur les tickets créés depuis mars 2026 : 54 `Good`, 74 `Average`, 7 `Bad` et 2 014
sans valeur, soit 135 réponses documentées sur 2 149 tickets. Le ratio 135 / 2 149
n’est pas un taux de réponse : tous les tickets ne sont pas nécessairement éligibles
ou destinataires d’une enquête.

Le formulaire d’onboarding alimente `onboarding_satisfaction` et contient 25
réponses. Il stocke cinq notes sur 5 et un commentaire, mais aucun envoi,
destinataire, statut de livraison ou identifiant de projet. Les valeurs absentes
ou invalides sont actuellement converties en zéro lors de l’import ; elles doivent
être distinguées d’une vraie note avant d’utiliser cette source comme KPI officiel.

Aucune source IQS ni grille de contrôle interne versionnée n’est disponible.

## Définitions à arbitrer

| KPI | Définition recommandée | Données requises | État actuel |
|---|---|---|---|
| CSAT | Réponses satisfaites / réponses valides. Avec le barème Zoho actuel, `Good` est satisfait ; décider si `Average` l’est aussi. | Réponse, date de réponse, population et version du barème. | Calcul provisoire possible, barème à valider. |
| Insatisfaction | Réponses `Bad` / réponses valides. | Même population que le CSAT. | Calcul provisoire possible. |
| Taux de réponse | Réponses valides / enquêtes délivrées et éligibles. | Un événement par invitation : envoi, livraison, réponse, exclusion. | Impossible actuellement. |
| IQS | Points obtenus / points applicables sur une grille d’audit interne. | Échantillon, critères, poids, non-applicables, auditeur, version de grille. | Source à créer après validation métier. |

Les quatre dénominateurs doivent être approuvés avant publication. Une valeur vide
reste `—`; elle ne devient jamais zéro. Une question non applicable sort du
dénominateur IQS.

## Modèle de collecte cible

Créer un journal d’enquêtes sans texte de ticket dans le navigateur : identifiant
d’invitation, ticket ou projet, population (`support` ou `onboarding`), date
d’éligibilité, date d’envoi, date de livraison, date de réponse, réponse normalisée,
canal, motif d’exclusion et dates de synchronisation. L’identifiant de réponse
Zoho permet la déduplication.

Créer séparément les audits IQS : identifiant d’audit, période, équipe, objet audité,
version de grille et résultat agrégé. Les réponses par critère restent côté serveur ;
le dashboard ne reçoit que les volumes et scores agrégés.

## Étapes de livraison

1. Faire valider par le métier le barème CSAT, la définition d’insatisfaction, les
   événements comptés comme enquête délivrée et la grille IQS.
2. Corriger l’import onboarding pour stocker les absences en `NULL`, ajouter un
   rattachement stable au projet/compte et reprendre les 25 réponses existantes.
3. Identifier dans Zoho Desk ou l’outil d’envoi la source des invitations et de la
   livraison. Sans cette source, laisser le taux de réponse indisponible.
4. Synchroniser les réponses Support depuis Zoho Analytics avec leur date et leur
   catégorie brute, puis normaliser selon un barème versionné.
5. Construire une grille IQS versionnée et effectuer un pilote sur un échantillon
   fixe avant automatisation.
6. Exposer une route d’agrégats mensuels : volumes éligibles, envoyés, délivrés,
   répondus, satisfaits, insatisfaits, audits IQS et non-applicables.
7. Ajouter au Reporting les quatre KPI, le comparatif N-1, les volumes de base et
   une mention visible lorsqu’une couverture est partielle.
8. Réconcilier chaque mois le dashboard avec les rapports Zoho de référence et
   conserver un contrôle automatique sur l’égalité des numérateurs/dénominateurs.

## Critères d’acceptation

- Chaque pourcentage peut être recalculé à partir des volumes affichés.
- Deux réponses ou invitations identiques ne comptent qu’une fois.
- Une réponse hors période est attribuée selon la règle de cohorte validée : mois
  de réponse pour le score, mois d’envoi pour le taux de réponse.
- Les filtres Support, département et timezone Europe/Paris sont communs à Zoho
  Analytics et au cockpit.
- L’interface affiche la version du barème, la couverture et les limites.
- Une comparaison N-1 n’est affichée que si les deux périodes utilisent le même
  barème et une couverture comparable.
