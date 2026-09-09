# Audit d’utilité du cockpit — 8 septembre 2026

## Verdict

Le cockpit possède un socle analytique utile : consolidation de sources, filtres partageables, analyse du support et des bugs, suivi de l’implémentation, programmation et analyse des formations. Les changements récents ont corrigé des définitions métier importantes. Ce travail mérite d’être conservé.

Sa valeur de pilotage est inégale. Il aide davantage à comprendre l’activité qu’à décider d’un changement, suivre son exécution et vérifier son effet. Le prochain investissement doit porter sur quelques décisions récurrentes, leur périmètre de données et leur suivi. Le nombre de graphiques ou de fonctions livrées ne mesure pas cette valeur.

Le volet CSM est un moteur de pré-attribution et de capacité de **reprise mensuelle**. Il ne mesure pas la charge totale d’entretien du portefeuille. Il peut préparer une discussion d’affectation ; son périmètre actuel ne justifie pas à lui seul une conclusion sur le dimensionnement de l’équipe.

## Périmètre et méthode

- Code du dépôt après le correctif `54d64ca`, changelog, spécification produit, plan d’exécution, journal, arbitrages et spécification du plan de charge.
- Lectures de compteurs et de métadonnées dans la base configurée pour l’application ; calcul existant du plan de charge exécuté sur les sources réelles Zoho et Supabase, sans enregistrer d’attribution. Pour ce calcul hors Next.js, seul le cache du framework a été neutralisé.
- Vérification de la configuration des crons du déploiement de production `dpl_AWGV3msP7CVz2htezLtAND7AwRKV`.
- Une lecture déléguée des parcours secondaires à un scout. Sa relance a échoué à cause de l’indisponibilité de son modèle ; le complément formations a été effectué par le main.
- Aucun changement applicatif ni métier pendant cet audit. Ce document est une proposition, pas une nouvelle spécification validée.
- Pas d’observation d’une réunion réelle, d’entretien avec la team lead, ni de parcours de production authentifié avec chacun des rôles. Les conclusions sur l’usage sont donc des hypothèses étayées, pas une mesure d’adoption. Les tests du correctif précédent ne valent pas recette complète du produit.

## Les décisions que le cockpit doit servir

| Domaine | Décisions de pilotage | Ce qui existe et mérite d’être gardé | Manque principal |
| --- | --- | --- | --- |
| Support et bugs | Où renforcer le traitement ? Quel irritant réduire ? Quel sujet remonter au produit ? | Volumes, créés/résolus, filtres client/produit, comparaisons, analyses Linear, liens vers les sources | Stock restant et ancienneté clairement distingués de l’activité ; impact client des irritants ; suivi des décisions |
| Implémentation | Quel dossier débloquer ? Quelle promesse replanifier ? Qui peut reprendre du travail ? | Charge active corrigée, dossiers en pause conservés, jalons, fiches projet, prochaines actions et carnet de bord existants | Revue des pauses, engagements fiables, remontée des actions échues et alimentation effective des champs |
| Formations | Quelle session ouvrir, adapter ou regrouper ? Qui doit encore être formé ? | Sessions, places, inscriptions, langues, thèmes, animateurs, annulations, lien depuis la fiche projet | Besoin non couvert, présence effectivement confirmée et résultats de formation |
| CSM | Qui reprend quel compte et quand ? Quels transferts doivent être préparés ou déplacés ? | Barème, disponibilités, continuité de groupe, verrous manuels, projection et portefeuille | Reprises en retard ou non datées, distinction prévision/confirmation, impact d’un arbitrage et lien avec la passation réelle |

## Mesures réalisées pendant l’audit

Ces chiffres décrivent l’état observé le 8 septembre, pas une série historique.

| Mesure | Résultat | Lecture correcte |
| --- | --- | --- |
| Tickets créés depuis le 8 mars | 2 060 en base ; 1 000 retournés par la lecture sans pagination | Défaut confirmé dans les compteurs CSM sur six mois |
| Tickets Open/Pending dans cette base | 91, tous retournés par cette lecture | Pas de troncature observée aujourd’hui sur cette requête |
| Ancienneté de ces tickets ouverts | 72 créés avant le 1er septembre ; 35 avant le 9 août | Une vue des créations récentes ne représente pas tout le travail restant |
| Tickets depuis le 1er septembre | 61, tous retournés | Le défaut de pagination n’a pas tronqué ce petit échantillon hebdomadaire |
| Dernière synchronisation de ticket observée | 8 septembre, 08:29 UTC | Horodatage de collecte ; une date de référence du jour ne garantit pas une source en temps réel |
| Relevés de charge / portefeuille | 12 lignes OB et 10 lignes CSM, uniquement le 8 septembre | Un premier jour existe ; les deux jours consécutifs de la définition de fini ne sont pas encore établis |
| Projets synchronisés en base | 739 | Périmètre de la base, distinct de la lecture courante du portail Zoho |
| Projets avec prochaine action / responsable / échéance | 0 / 0 / 0 | Champs livrés, mais non alimentés dans cette base |
| Événements onboarding | 1 343 | Il existe déjà un historique ; ce total ne distingue pas les actions humaines des événements de synchronisation |
| Décisions / actions / événements calendrier des tables MCP | 0 / 0 / 0 | Ne pas reprendre comme fait actuel la phrase du plan disant que ces tables sont alimentées |
| Suivis produits / overrides du plan de charge | 0 / 0 | Aucune utilisation persistée observée de ces fonctions ; cela ne mesure pas la consultation des pages |
| Préqualification support | 830 jobs `queued`, 0 évaluation | La chaîne ne produit actuellement aucun résultat exploitable |
| Sources du calcul de charge | 13 642 comptes, dont 1 685 clients ; 712 projets | Ne pas confondre tous les comptes CRM, les clients et les projets |
| Charge selon la règle actuelle | 133 projets actifs, 46 en pause ; 12 propriétaires actifs pour 3 personnes au roster OB | Le périmètre des propriétaires doit être réconcilié avant une conclusion sur la capacité de l’équipe actuelle |
| Pipeline du moteur | 7 comptes ; aucun non-attribuable, aucune surcharge calculée | Résultat sur le pipeline sélectionné, pas preuve d’une capacité globale suffisante |
| Points CSM projetés, septembre → février | 8, 2, 2, 2, 2, 0 | Prévision très peu chargée avec les entrées actuelles |
| Comptes clients avec date de passation | 73 / 1 685, soit environ 4,3 % | Le moteur dépend largement de dates de remplacement |
| Clients avec MRR positif selon le mapping de l’application | 1 000 / 1 685, soit environ 59,3 % | Ce n’est pas une mesure du seul champ brut `MRR_Total` ; le mapper utilise aussi le MRR manuel |
| Formations du 9 septembre au 6 octobre, lecture Acuity réelle | 24 sessions non brouillon/non annulées ; 18 heures planifiées ; 20 inscriptions actives ; 12 sessions sans inscrit ; 24 capacités connues | État des réservations au moment de la lecture, pas prévision de participation finale |
| Langues de ces prochaines sessions | 9 FR, 7 EN, 8 ES | L’offre future est mesurable ; la collecte ne signale ni dégradation ni troncature |

## Support et bugs : transformer l’analyse en arbitrages

### Ce qui est déjà exploitable

La page Tickets permet de localiser les volumes par produit, catégorie et client, puis d’examiner une période. Les filtres partageables et les vues personnelles sont utiles en réunion. Les séries créés/résolus et les vues Linear apportent une lecture commune entre support et produit. Le traitement dans Zoho Desk et Linear est un choix cohérent : il n’est pas nécessaire de reconstruire un outil de tickets ici.

### Ce qui limite les décisions

1. **Le stock à traiter n’est pas suffisamment explicite.** Le KPI « Tickets ouverts » compte les Open/Pending parmi les tickets créés dans la période. Un vieux ticket encore ouvert sort du chiffre lorsque sa création sort de la fenêtre. C’est une cohorte valide, mais ce n’est pas le backlog total. Sources : `lib/zoho/ticketDashboardAnalytics.ts:238`, `:269`, `components/analytics/TicketsAnalyticsDashboard.tsx:371`.

   Contrôle concret dans la base synchronisée : 72 des 91 tickets ouverts sont antérieurs au 1er septembre. Ces tickets n’entrent pas dans un compteur limité aux créations depuis cette date. Les données du dashboard Zoho peuvent être plus fraîches que cette base ; ce contrôle établit le problème de périmètre, pas l’égalité instantanée de leurs compteurs.
2. **Le SLA interne n’est pas opérationnel aujourd’hui.** Son KPI provient de `ticket_urgency_assessments`, vide lors de la mesure. Les 830 jobs en attente confirment qu’un module présent dans le code ne suffit pas. Le diagnostic de la chaîne reste à faire. Une migration prévoit un déclenchement Supabase : l’absence de cron Vercel ne prouve donc pas à elle seule l’absence de planification. Conserver l’arbitrage existant de ne pas activer le worker sans décision explicite. Sources : `app/api/support/cockpit/route.ts:29`, `components/analytics/TicketsAnalyticsDashboard.tsx:380`, migration `20260829092141_support_urgency_shadow_mode.sql`.
3. **Le volume ne hiérarchise pas l’impact.** Le top clients indique où arrivent les demandes ; il ne dit pas quels incidents bloquent une mise en service, combien de clients distincts sont touchés, ni si les demandes répétées relèvent d’un bug ou d’un besoin de formation. Un grand client ne doit pas être classé en mauvaise santé par le seul nombre de tickets.
4. **Les bugs sont surtout analysés après résolution.** Temps moyen et SLA des issues résolues éclairent le débit passé. Pour arbitrer avec le produit, il faut aussi les problèmes encore ouverts, leur ancienneté et leur impact client attesté. Sources : `app/escalations/LinearAnalyticsDashboard.tsx:368`, `:437`.

### Proposition

Une revue support compacte : backlog total et vieillissement ; entrées/sorties ; trois irritants à examiner avec tickets et clients concernés ; décision de la semaine et date de revue. Des liens filtrés vers les écrans existants fournissent le détail. Le rapprochement ticket–bug–client commence par des liens vérifiés, pas une classification IA présentée comme certaine.

Critère d’utilité : la réunion choisit un renforcement de traitement ou une action sur une cause récurrente, et peut retrouver la décision et son résultat à la revue suivante.

## Implémentation : rendre le suivi existant utilisable

### Ce qui est déjà exploitable

La distinction charge active / dossiers en pause est pertinente. Les fiches disposent déjà d’une prochaine action, d’un responsable, d’une échéance, de notes, de ressources attendues et d’une durée cible par plan. Il faut réutiliser ces éléments. Sources : `components/onboarding/ProjectWorkspace.tsx:205`, `lib/onboarding/workspace.ts:59`, `app/api/onboarding/projects/[id]/implementation/route.ts`.

### Ce qui manque

- **Une règle d’usage minimale.** Zéro prochaine action renseignée sur 739 fiches suggère un problème d’alimentation ou d’appropriation, pas seulement un manque de formulaire. Tester ce champ sur les dossiers réellement arbitrés avant de rendre sa saisie obligatoire partout.
- **La continuité entre fiche et revue.** « À traiter » calcule ses exceptions à partir des sources Zoho et ne consomme pas les prochaines actions du cockpit. Une échéance renseignée dans la fiche ne devient donc pas automatiquement un engagement suivi dans cette revue.
- **Le pilotage des pauses.** Les 46 pauses observées doivent avoir une raison, un responsable du relais et une date de revue. Les champs de pause existent à la maille produit ; il manque la consolidation au niveau projet et les vues « sans revue » / « revue dépassée ». Ne pas réintroduire ces pauses dans la charge active.
- **Le promis, le prévu et le réel.** Les cibles par plan et les dates existent partiellement ; il reste à définir précisément le départ du délai (kick-off, réception des documents ou début effectif), puis à montrer les engagements à risque et les délais constatés avec couverture. Une moyenne globale masque le mélange des plans et les dossiers encore ouverts.
- **Une prévision de capacité avec sorties.** Le moteur prolonge les projets actifs actuels sur tous les mois, sans modéliser leur libération. Il ajoute aussi les comptes du pipeline : trois projets déjà actifs sont rattachés à des comptes de ce pipeline dans la mesure. Il faut réconcilier les deux périmètres pour éviter un double comptage OB. Source : `lib/onboarding/assignmentEngine.ts:302` et `:316`.

Critère d’utilité : pour les dossiers prioritaires, le responsable peut dire qui fait quoi, avant quand, et quelle conséquence un décalage a sur les autres engagements.

## Formations : piloter l’offre et les besoins clients

### Ce qui est déjà exploitable

Les sessions exposent les capacités et places restantes. Les analytiques distinguent inscriptions, annulations et no-shows, ventilent thèmes/langues, estiment les heures d’animation et permettent des comparaisons et un rapport copiable. Ce sont de vrais moyens de préparer la programmation, pas des fonctions décoratives. Sources : `app/trainings/page.tsx:300`, `app/trainings/analytics/page.tsx:369`, `:469`.

### Ce qui manque

1. **Une vue synthétique de programmation.** Les places sont visibles session par session ; agréger à court terme les sessions sous-remplies/saturées, les langues, les thèmes et les heures d’animation aiderait à ouvrir, déplacer ou regrouper une session. Les seuils doivent être décidés avec la personne qui organise les formations.

   Mesure sur les quatre prochaines semaines : 24 sessions, 18 heures planifiées, 20 inscriptions actuellement et 12 sessions sans inscription. Ce n’est **pas** un motif pour en annuler douze : une session dans quatre semaines ne se juge pas comme une session demain. La décision demande le délai avant la session, les inscriptions habituelles à ce délai, la langue et les besoins des clients concernés. Ces données rendent néanmoins le chantier immédiatement concret.
2. **Le besoin non couvert.** Le top des hôtels inscrits ne montre pas les hôtels qui devraient être formés mais ne se sont jamais inscrits. Relier les produits souscrits et la phase d’implémentation aux formations pertinentes, puis signaler les écarts identifiables.
3. **Une présence réellement confirmée.** Le statut participant est `registered`, `cancelled` ou `no_show`. La fiche « Formations suivies » compte les inscriptions non annulées aux sessions passées ; cela ne prouve pas la présence. Sources : `lib/acuity/client.ts:281`, `app/api/onboarding/projects/[id]/training-attendance/route.ts:28`, `components/onboarding/TrainingAttendance.tsx:19`.
4. **Un résultat de formation.** Une confirmation simple du besoin couvert ou de l’autonomie acquise serait plus utile qu’un graphique supplémentaire. Un rapprochement ultérieur avec les demandes support peut aider à explorer des tendances, mais une baisse après formation ne prouve pas à elle seule un effet causal.

Critère d’utilité : la personne responsable peut justifier la prochaine session à ouvrir et identifier les clients dont la formation attendue manque. La présence inconnue reste affichée comme inconnue.

## CSM : un moteur à conserver, une promesse à préciser

### Ce que la team lead peut déjà faire

Voir les reprises sélectionnées, leurs poids, les pré-attributions automatiques ou par continuité de groupe ; poser un choix manuel persistant ; ajuster capacité et disponibilité ; consulter le portefeuille. Le modèle en points mensuels est légitime pour organiser le flux de reprises. Il n’est pas nécessaire de le convertir arbitrairement en heures.

### Pourquoi « zéro surcharge » est aujourd’hui insuffisant

**Sélection étroite.** Le pipeline exige un compte Client, une date de début d’abonnement strictement future et aucun projet Live rattaché. Le 8 septembre, cela donne sept comptes. Une date atteinte ou dépassée fait sortir le compte de cette sélection, même si la reprise reste à organiser. Sources : `lib/onboarding/pipeline.ts:294`, `:410`.

Cas exécuté avec le vrai calcul et un compte fictif sans CSM, sans projet Live et sans date de passation, début d’abonnement le 10 septembre : présent au pipeline le 9 septembre, absent le 10 et le 11. La fonction de repli de date le rattache malgré tout au mois de septembre. Ce comportement est conforme au filtre codé, mais il ne représente pas un report de reprise ; un test de comportement métier doit couvrir ce cas avant de présenter la courbe comme une prévision complète.

La mesure retrouve aussi 692 clients à date d’abonnement passée ou du jour, et 743 sans cette date, sans projet Live rattaché dans cet index. **Ces nombres ne sont pas des reprises en retard prouvées** : ils mélangent potentiellement des clients historiques, des défauts de rattachement et des dossiers effectivement non terminés. Ils démontrent qu’il faut qualifier le périmètre, pas ajouter aveuglément 1 435 dossiers à la prévision.

**Date de passation rare.** Seulement 73 clients sur 1 685 portent une date de passation. Le modèle emploie sinon le go-live puis le début d’abonnement. Il faut montrer la provenance et la confiance de la date. Une date commerciale n’est pas une confirmation que le CSM recevra le dossier ce jour-là. Source : `lib/onboarding/pipeline.ts:588`.

**Prévision et édition déconnectées sur la date.** L’API d’attribution sait enregistrer `expected_go_live`, mais le chargeur des overrides ne le relit pas et le pipeline utilise toujours `Sub_Start_date`. Ce champ ne constitue donc pas actuellement une replanification effective du moteur. Sources : `app/api/csm/plan-charge/assignments/route.ts:62`, `lib/onboarding/planChargeSources.ts:193`, `lib/onboarding/pipeline.ts:410`.

**Portefeuille et reprises répondent à deux questions.** Le moteur équilibre le flux mensuel ; il ne déduit pas la disponibilité opérationnelle du portefeuille déjà suivi. Garder le portefeuille comme contexte visible et permettre une capacité de reprise ajustée par la team lead, sans inventer un score composite de charge.

**La décision locale ne vaut pas passation confirmée.** Les overrides sont dans Supabase, le portefeuille effectif reste lu dans Zoho CRM. Il manque une lecture claire : proposé, validé, communiqué, puis reprise réellement effectuée. Une synchronisation automatique vers Zoho n’est pas nécessaire pour commencer ; l’écart entre la décision et la source doit être visible.

**Calendrier et lecture des plafonds.** La disponibilité actuelle s’applique à tous les mois. Un congé futur ou une arrivée n’est pas daté. Le graphique montre une seule ligne de plafond, le minimum de plusieurs capacités ; côté CSM il utilise la capacité nominale plutôt que la capacité effective en relâche. Les dépassements calculés utilisent, eux, la capacité effective. La lecture visuelle peut donc contredire l’arbitrage individuel. Source : `app/csm/plan-charge/page.tsx:727`.

### Écran recommandé pour la team lead

Une table à six mois, par CSM : capacité de reprise du mois, reprises confirmées, reprises prévues, dossiers à dater, reports non repris et marge restante. Chaque cellule mène aux comptes qui l’expliquent. En regard : portefeuille actuel et dossiers demandant un arbitrage, sans prétendre convertir ce contexte en disponibilité automatique.

La team lead doit pouvoir examiner un changement d’attribution ou de mois et son effet avant de le valider. Les choix de continuité de groupe restent visibles, y compris quand ils produisent une surcharge. Une décision confirmée porte auteur, date et raison ; son exécution est vérifiable.

Critère d’utilité : elle peut répondre « qui reprend ces comptes, quel mois, avec quelle marge et quelles inconnues ? », puis constater la semaine suivante ce qui a changé. Le modèle actuel ne doit pas servir seul à conclure qu’un recrutement est inutile ou qu’une personne dispose de temps libre.

## Socle de confiance à corriger avant d’étendre

| Priorité | Constat confirmé | Action proposée et preuve de fin |
| --- | --- | --- |
| Immédiate | Lecture tickets CSM tronquée à 1 000 / 2 060 | Pagination stable ou agrégation en base ; total réconcilié avec le comptage exact, test au-delà de 1 000 |
| Immédiate | Support autorisé sur `/a-traiter`, refusé sur `/api/onboarding/weekly-exceptions` par le middleware | Même contrat de droits sur menu, page et API ; parcours testé pour les cinq rôles (`middleware.ts:37`, `:47`) |
| Immédiate | Les API CSM d’attributions et de roster autorisent `csm_lead` à écrire aussi les champs OB | Revenir au périmètre annoncé : CSM éditable, OB en lecture seule pour ce rôle ; vérifier côté serveur, pas seulement masquer les contrôles |
| Prochaine livraison | Zéro exception peut encore produire un message de réussite malgré des sources partielles | Distinguer « aucun signal sur sources complètes » et « analyse incomplète » ; fraîcheur et couverture explicites |
| Prochaine livraison | `is_backfilled` et `captured_at` ne sont pas transmis au graphique de charge | Distinguer mesure directe, rattrapage et estimation ; test d’une journée rattrapée (`app/api/onboarding/workload-snapshots/route.ts:21`) |
| Prochaine livraison | Réconciliation des snapshots : le chargeur ne lit que la fenêtre récente, mais le calcul cherche aussi les trous antérieurs | Ne pas déclarer les anciennes dates manquantes faute de les avoir chargées ; test après plus de sept jours d’historique (`lib/onboarding/snapshots.ts:111`, `:143`) |
| Prochaine livraison | Routes admin de normalisation protégées par middleware mais sans `requireRole` local | Défense au niveau du handler et tests des refus ; ne pas qualifier ces routes de publiques sans preuve de contournement |

Le cron de snapshots est bien déclaré dans le déploiement actuel. La base ne contient encore qu’un jour : ne pas annoncer une tendance historique ni le lot entièrement validé avant les passages suivants. Les 30 jours de mesures réelles exigés pour le compteur de saturation prolongée restent une condition pertinente.

## Ordre d’investissement proposé

### 1. Fiabiliser les décisions actuelles

Corriger la pagination et les droits ; expliciter périmètre, fraîcheur, dates de remplacement et sources non alimentées. Réconcilier la population du plan de charge et les doublons OB. Maintenir la préqualification support en observation tant que son activation n’est pas arbitrée.

### 2. Équiper les trois revues métier et la team lead

- Support : backlog et ancienneté, flux, irritants à arbitrer avec preuve d’impact.
- Implémentation : engagements à risque, pauses à revoir, prochaines actions issues des fiches existantes.
- Formations : besoin identifié face à l’offre et au remplissage, inscriptions distinguées des présences.
- CSM : tableau de reprises avec dates confirmées/prévues/inconnues, reports et marge par mois.

Ce sont des vues de travail ciblées qui réutilisent les données et écrans existants. Elles ne nécessitent pas une nouvelle page d’accueil universelle ni la duplication de Zoho/Linear.

### 3. Fermer la boucle de décision

Conserver un petit journal d’arbitrage : sujet, décision, responsable, date de revue et lien vers l’exécution. Pour les projets, réutiliser les champs et événements existants, et clarifier leur articulation avec les tables MCP. Pour le support et les bugs, les opérations restent dans les sources ; le cockpit conserve le contexte de la décision et permet d’en suivre l’effet.

Une alerte sortie de sa fenêtre de 14 ou 90 jours ne doit pas être assimilée à une résolution. La dette ancienne reste accessible dans une revue distincte, conformément aux arbitrages déjà pris.

### 4. Mesurer l’utilité avant une nouvelle extension

Proposition de pilote sur deux revues hebdomadaires, en respectant la condition déjà posée des deux mardis avant tout changement d’accueil :

- Une décision réelle de chaque domaine préparée depuis le cockpit.
- Un échantillon de dossiers d’implémentation avec prochaine action effectivement maintenue.
- Une affectation ou replanification CSM décidée à partir des comptes expliquant la charge.
- Une adaptation de programme de formation justifiée par un besoin ou un remplissage observé.
- À la revue suivante : vérifier l’exécution, les erreurs de données, le bruit des alertes et les recherches manuelles encore nécessaires.

Mesurer le temps de préparation, la part des chiffres recopiés à la main, les décisions retrouvables et les alertes jugées utiles. Des ouvertures de page seules ne prouvent pas la valeur. Les critères numériques précis se fixent avec les utilisateurs après une première mesure.

### Quatre scénarios de recette métier

| Scénario | Question à laquelle l’écran doit répondre | Résultat attendu après la décision |
| --- | --- | --- |
| Le backlog ancien grossit alors que les créations baissent | Quels dossiers anciens persistent, dans quelle catégorie, et quel renforcement est nécessaire ? | Une action de traitement ou d’escalade sourcée ; à la revue suivante, son effet sur le stock ancien est mesurable |
| Un projet attend le client et menace une mise en ligne | Quelle dépendance bloque, qui prend le relais et quand revoit-on l’engagement ? | Prochaine action maintenue, date de revue et effet sur la prévision OB/CSM visibles |
| Une session proche a peu d’inscrits | Quels clients ont ce besoin, sont-ils invités/inscrits et faut-il promouvoir, déplacer ou regrouper ? | Une décision de programmation explicable ; aucune assimilation automatique inscription = présence |
| Une reprise CSM prévue cette semaine n’a pas eu lieu | Reste-t-elle à reprendre, qui la porte et quel mois absorbe le report ? | Le compte reste visible avec son état réel ; déplacement explicite et effet sur la marge, sans disparition silencieuse |

Ces scénarios doivent guider la recette avant les tests de présence de boutons ou de graphiques. L’outil est utile s’il permet de les résoudre avec moins de recherches et une meilleure traçabilité.

## Ce que je conserverais en retrait

L’assistant et la base de connaissances sont déjà masqués dans la navigation. L’assistant reste lié à un ticket échantillon et ne mérite pas de passer avant les usages centraux. Les aides de copie, rapports et ouvertures de calendrier sont utiles si elles économisent du travail ; leur absence d’écriture automatique n’est pas un défaut en soi.

Je ne recommande ni un score de santé composite, ni de nouveaux graphiques génériques, ni une migration des opérations support dans le cockpit. Les premières améliorations doivent montrer qu’une décision précise devient plus facile et mieux suivie.

## Points à valider avec les utilisateurs, sans bloquer les corrections factuelles

1. Qui porte la programmation et la qualité des formations, et quelle preuve de présence est réaliste à collecter ?
2. Quel événement confirme réellement une reprise CSM, et qui maintient sa date ? Le canal de passation reste un arbitrage ouvert.
3. Quelle source fait foi pour une prochaine action projet : cockpit, compte rendu/MCP ou autre ? Éviter la double saisie.
4. Quelle décision la team lead ne peut-elle pas prendre aujourd’hui sans son fichier de suivi ? Faire de ce cas le premier scénario de recette.

Le travail existant a une valeur réutilisable importante. La prochaine étape consiste à prouver cette valeur sur ces décisions, plutôt qu’à ajouter une nouvelle couche de fonctionnalités avant d’avoir observé leur usage.
