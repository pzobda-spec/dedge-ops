# Changelog

Les changements notables de D-EDGE Ops Cockpit sont consignés dans ce fichier.

Les entrées antérieures au 15 juillet 2026 ont été reconstituées à partir de
l’historique Git ; elles synthétisent les changements fonctionnels encore
pertinents plutôt que chaque correction intermédiaire.

## 2026-09-10 — Évolution mensuelle vs N-1

- Le reporting mensuel compare désormais chaque mois au même mois de l’année précédente, y compris pour les mois de 2025. Les volumes sont affichés en évolution relative ; les taux de conformité en points de pourcentage. Une référence absente ou nulle reste « — ».

## 2026-09-10 — Pilotage Support par conformité SLA

- Ajout des taux de conformité de première réponse et de résolution, cible 90 %, ventilés par priorité avec volumes mesurés, conformes, sans mesure et non classés. Le profil CRM et tous ses seuils sont centralisés dans `lib/reporting/slaProfiles.ts`.
- Étape 0 : sur les six derniers mois, la source contient Medium 2 032, Low 37, High 1 et aucun P1–P4/null ; le mapping Urgent→P1, High→P2, Medium→P3, Low→P4 est donc affiché comme approximation.
- Les temps sont calendaires. Les délais de résolution supérieurs à 90 jours restent exclus des moyennes mais sont non conformes dans les taux. P4 résolution est best effort et exclu du taux. Le palier CRM P1 de 4 h s’applique à toute la période faute de dates arbitrées pour les paliers historique 2 h et cible 6 h.

## 2026-09-10 — Conformité Support par première réponse et résolution

- Étape 0 exécutée sur Supabase avant le code : sur les six derniers mois, les priorités sont Medium 2 032, Low 37, High 1, sans null ; aucune valeur P1–P4 n’est présente. La répartition des durées de résolution et les 96 durées manquantes ont été conservées pour cadrer les limites.
- Reporting Support : ajout des taux de conformité première réponse et résolution par priorité, cible 90 %, détail mesuré/conforme/taux, sans mesure et non classés. Les seuils sont centralisés dans `lib/reporting/slaProfiles.ts`.
- Profil CRM actif : mapping Urgent→P1, High→P2, Medium→P3, Low→P4 explicitement approximatif ; P1 première réponse à 4 h sur toute la période faute de dates d’effet pour les paliers 2 h historique et 6 h cible ; P2–P4 première réponse et résolution provisoires depuis le profil groupe. Temps calendaires uniquement.
- Résolution : les délais supérieurs à 90 jours sont non conformes dans le taux, tout en restant exclus des moyennes existantes. P4 résolution « best effort » affiche son volume mais est exclu du taux.

## 2026-09-10 — Moyenne téléphonique conditionnée à la couverture

- Suppression de la moyenne mensuelle estimée lorsque la période contient des mois incomplets, non certifiés, atypiquement faibles ou traverse l’arrêt de la prise d’appels. La tuile affiche « — » avec la raison ; aucun chiffre mensuel n’est rebaptisé journalier.

## 2026-09-10 — Démarrages Zoho Projects et résolution L1 / L2

- Implémentation CRM : suppression des catégories Welcome / Setup et des dates planifiées comme mesure de démarrage. Nouveaux projets comptés sur les transitions Non démarré → In Progress uniquement, sans les reprises Pending/pause ; passages Live selon la date métier ou une transition observée. Déduplication par projet et limites du suivi quotidien affichées.
- Support : moyennes de résolution L1 sans lien Linear et L2 avec lien Linear, fondées sur le champ réel `cf_linear_issue_url`. Lectures non déterminées isolées, seuil de 90 jours et effectifs par groupe, copie des slides mise à jour. Chargement séparé et cache serveur compact de 15 minutes ; aucun changement de schéma ni de route Zoho.
- Résolution globale affichée en jours calendaires pour éviter l’ambiguïté du volume d’heures.

## 2026-09-09 — Résolution moyenne hors clôtures extrêmes

- La résolution moyenne mensuelle exclut les délais strictement supérieurs à 90 jours calendaires. Le seuil et les nombres de clôtures retenues, exclues et non documentées sont visibles dans la tuile et la copie pour les slides. Le volume de tickets clôturés et le FCR restent inchangés.

## 2026-09-09 — Reporting mensuel pour les slides

- Ajout d’une synthèse mensuelle Support CRM avec sélection du mois et copie des données : créations, clôtures indépendantes de la date de création, première réponse documentée, résolution calendaire, FCR explicitement estimé, principaux produits et jours de pic.
- Implémentation : dates de début et mises en production issues de Zoho Projects synchronisé, délai sur dates connues, couverture de saisie et portefeuille actuel agrégé. Les catégories Welcome / Setup, la qualité, les SLA et les commentaires projets sans source exploitable restent explicitement indisponibles.
- Historique de 24 mois par canal brut (`ticket_analytics.source`) : barres empilées, tableau mensuel, indicateurs Phone et rupture de mars–avril 2026. Les appels estimés utilisent un ratio centralisé non validé de 0,5 ; ils ne remplacent jamais les mesures réelles de téléphonie.
- Routes `/api/reporting/monthly` et `/api/reporting/channels` paginées par 1 000 lignes, agrégats uniquement, dates en Europe/Paris, couverture déclarée distinguée de l’exhaustivité. Les mois à volume atypiquement faible sont signalés sans modifier leurs compteurs.
- Vérification : TypeScript, lint, build, tests des bornes Paris et des cohortes ; lecture Supabase réelle et parcours navigateur local. Aucun changement de schéma, de product roll-up ni de route Zoho.

## 2026-09-09 — Cockpit décisionnel : fiabilité et parcours de pilotage

### Ajouté

- Support : stock Open/Pending historisé, toutes dates de création, séparé de la cohorte filtrée ; ancienneté, répartition par produit et avertissement de synchronisation ancienne. Uniquement des agrégats, aucune action de traitement ajoutée.
- Formations : vue « 4 semaines à venir », synthèse thème/langue des heures prévues, inscriptions, sessions vides et remplissage sur capacités connues. Une inscription à une session passée n’est plus présentée comme une présence confirmée.
- À traiter : recherche, filtre propriétaire, état vide filtré, suivi des prochaines actions projet échues/à sept jours/sans date, couverture de saisie et pauses par implémenteur.
- Plan de charge : dates de reprise arbitrables dans le cockpit, provenance explicite, comptes à dater/replanifier conservés hors prévision, tableau des charges/capacités effectives par CSM. Les pré-attributions ne sont pas des passations confirmées et ne modifient pas Zoho.

### Corrigé

- Compteurs de tickets CSM et hebdomadaires paginés : suppression du plafond silencieux de 1 000 lignes ; une erreur tardive ne renvoie pas de succès partiel.
- Compte déjà actif dans le pipeline : seuls les slots OB supplémentaires sont ajoutés à la base réelle. Les porteurs des projets déjà comptés restent ceux de Zoho ; les points CSM restent inchangés.
- Les dates manuelles enregistrées sont désormais relues et utilisées par la projection. Une date arbitrée échue ne disparaît pas silencieusement, même sans projet rattaché.
- La team lead modifie le CSM mais pas l’OB, côté API et interface ; le commercial reste en lecture seule. Les éditeurs d’équipe transmettent les champs requis par l’API, et les changements CSM ne renvoient plus les champs OB.
- Accès support aux API de la vue hebdomadaire et des snapshots ; lecture de la timeline pour le commercial. Protection admin ajoutée directement dans les deux handlers de normalisation des tickets.
- Snapshots : lecture paginée des dates historiques pour éviter les faux trous hors fenêtre ; provenance des rattrapages exposée, mesures rattrapées exclues de la courbe réelle.
- Les dates et motifs de pause des produits sont restitués au rechargement de la fiche projet. Les compteurs tickets sans rapprochement Desk affichent « — » dans la table des comptes CSM.
- Aucun état « tout va bien » lorsque la vue hebdomadaire signale une source incomplète. Aucun plafond commun trompeur lorsque les capacités individuelles diffèrent.

### Périmètre

- Publication via la branche de production `main`. Aucune migration, écriture Zoho, notification de passation ni activation du worker support.
- Recette et limites : `docs/recette-cockpit-decisionnel-2026-09-09.md`.

## 2026-09-08 — Correction du chargement de « À traiter »

### Corrigé

- La page plantait à réception des données : l’API omettait les diagnostics
  de rapprochement des comptes support, pourtant lus par l’écran. La réponse
  transmet désormais le résultat complet, avec un contrat TypeScript partagé
  entre l’API et la page. Une réponse ancienne sans diagnostics affiche une
  limite explicite au lieu de faire planter la vue.

## 2026-09-07 — Relances échues et bruit du support écartés

### Ajouté

- Les comptes dont la relance est échue depuis moins de quatorze jours
  remontent dans « À traiter cette semaine ». Au-delà, une relance n'est plus
  une action de la semaine : elle relève de la dette et n'encombre pas la vue.

### Corrigé

- Le support remontait parfois des adresses e-mail à la place d'un compte,
  y compris des boîtes internes, présentées comme des comptes clients en
  difficulté. Elles sont désormais écartées et comptées à part.

## 2026-09-07 — Une page « À traiter cette semaine »

### Ajouté

- Une page qui liste les dossiers demandant une décision, plutôt que l’état
  général du portefeuille. Elle est accessible à tous les rôles.
- Chaque ligne porte sa raison en toutes lettres, chiffrée : « 3 jalons en
  retard, le plus ancien depuis 47 jours », « 5 tickets support en 7 jours ».
  Plus besoin d’ouvrir Zoho pour comprendre pourquoi un dossier remonte.
- Le comptage porte sur les dossiers, pas sur les signaux : un projet portant
  trois jalons en retard est une seule ligne. Le nombre de signaux reste
  affiché à part, sans jamais être confondu avec le nombre de dossiers.
- Une semaine sans exception s’affiche comme une réussite explicite, pas comme
  une page vide.
- La page indique ce qu’elle ne couvre pas encore, et pourquoi : quatre des
  neuf règles prévues attendent une donnée absente ou un chantier en amont.

## 2026-09-07 — Correction d’une entrée du 21 juillet 2026

### Corrigé

- L’entrée du 21 juillet 2026 annonce, dans le pilotage onboarding, un
  « nombre de jours consécutifs au-dessus de 80 % de charge sur la période
  sélectionnée ». Cet indicateur **n’a jamais été livré** : il n’existe dans
  aucune page. L’entrée d’origine est conservée telle quelle, un journal des
  changements se corrige et ne se réécrit pas. L’indicateur est reporté au
  backlog, avec une condition d’entrée : trente jours de relevés réels. Le
  calculer sur deux jours d’historique produirait du bruit, et le calculer sur
  la partie estimée mélangerait deux natures de données qui ne se comparent
  pas. Détail et règle de calcul retenue dans
  `docs/plan-execution-journal.md` et `docs/snapshots-verification.md`.

## 2026-09-07 — L’historique de charge et de portefeuille commence à se constituer

### Ajouté

- Un relevé quotidien enregistre désormais, chaque matin, la charge de chaque
  implémenteur et le portefeuille de chaque chargé de succès client : nombre de
  comptes, comptes en ligne, revenu récurrent valorisé et comptes résiliés
  cumulés. Sans ce relevé, aucune tendance ni aucun délai réel n’était
  calculable, et chaque journée écoulée était perdue définitivement.
- Le graphique d’évolution de la charge affiche les relevés réels dès qu’ils
  existent, en trait plein, et conserve l’estimation reconstituée en pointillé
  grisé pour les périodes antérieures, avec le début de l’historique réel
  annoté. Les deux ne se comparent jamais terme à terme.
- Quand un implémenteur absent porte encore des dossiers, sa charge n’est pas
  calculable en pourcentage : la page le nomme explicitement sous le graphique,
  avec le nombre de dossiers à réattribuer, au lieu de laisser le cas disparaître
  des courbes.

## 2026-09-07 — La charge des implémenteurs ne compte plus les dossiers en pause

### Corrigé

- Un dossier bloqué, en attente client ou en standby ne pèse plus sur la charge
  de l’implémenteur qui le porte, ni sur son plafond de projets simultanés.
  Personne ne traite ces dossiers : les compter faisait apparaître des
  implémenteurs saturés à tort et détournait les nouvelles affectations vers
  d’autres personnes. Les indicateurs de charge, le pourcentage par
  implémenteur et la répartition automatique des comptes signés s’en trouvent
  tous corrigés.
- Les dossiers en pause restent visibles là où c’est leur place : les colonnes
  Bloqué, En attente client et Standby du board, et le périmètre « actifs » du
  répertoire clients, sont inchangés.

## 2026-09-05 — Tableau de bord CSM filtrable

### Corrigé

- Le churn était systématiquement affiché à zéro : les comptes résiliés passent
  au statut « ancien client » dans le CRM et étaient exclus du calcul. Ils sont
  désormais pris en compte.
- Le revenu récurrent par chargé de succès client additionnait les clients
  actifs et les anciens clients, ce qui gonflait le portefeuille. Seuls les
  clients actifs l’alimentent.

### Ajouté

- Filtres synchronisés avec l’adresse de la page : chargé de succès client, dont
  les comptes non attribués, statut, typologie, segment, millésime de
  résiliation, recherche par compte, et un filtre dédié aux comptes à
  réattribuer.
- Taux de résiliation, global et par chargé de succès client, en plus des
  volumes. Le dénominateur étant reconstitué faute d’historique de
  portefeuille, la limite est affichée.
- Distinction entre résiliation constatée et résiliation annoncée : un compte
  peut porter une étiquette de millésime tout en restant client.
- Quatre visualisations et deux tableaux triables et paginés, sur le modèle des
  tableaux de bord Tickets et Bugs.

## 2026-09-05 — Section CSM et tableau de bord de portefeuille

### Ajouté

- Section « CSM » de premier niveau, avec deux sous-sections, Pilotage et Plan
  de charge. L’espace Onboarding redevient strictement l’implémentation.
- Tableau de bord CSM : revenu récurrent total et par chargé de succès client,
  répartition groupe et individuel, churn par millésime, tickets support
  ouverts et volume sur six mois.
- Bandeau « Portefeuille à réattribuer » : les comptes encore rattachés à un
  ancien chargé de succès client sont isolés, avec leur nombre et leur revenu
  récurrent, pour être réaffectés.
- Classement des comptes aux plus forts volumes de tickets ouverts. Aucun seuil
  de bonne ou mauvaise santé n’est appliqué à ce stade, les compteurs sont
  exposés bruts.
- Les étiquettes de churn du CRM sont désormais lues et exploitées.

### Modifié

- Les anciennes adresses du plan de charge et du pilotage CSM redirigent vers
  la nouvelle section.

## 2026-09-05 — Charge d’implémentation réelle et pilotage CSM

### Corrigé

- La charge des implémenteurs partait de zéro et ne tenait compte que des
  comptes signés pas encore live. Un implémenteur déjà au-dessus de son plafond
  apparaissait disponible, et la répartition automatique continuait de lui
  confier des comptes. Elle démarre désormais des projets actifs réels, comptés
  comme sur la page de pilotage.
- Les libellés de la barre d’onglets de l’onboarding ne se cassent plus sur
  plusieurs lignes ; la barre défile quand la place manque.

### Modifié

- La page CSM devient un vrai pilotage : une ligne par chargé de succès client
  avec portefeuille, points à surveiller, reprises du mois et charge du mois,
  puis la courbe de montée en charge. L’édition de la capacité et des
  attributions passe en second plan, sous les indicateurs.
- Satisfaction et temps de mise en service restent affichés à « — » sur cette
  page : la satisfaction n’est pas rattachée au chargé de succès client dans la
  source, et le temps de mise en service mesure l’implémentation, pas la
  reprise.

## 2026-09-05 — Accès restreint pour la team lead CSM

### Ajouté

- Rôle « Team lead CSM », attribuable depuis l’administration des
  utilisateurs. Il donne accès à toute la section Onboarding et à rien d’autre
  du cockpit : tableau de bord, tickets, bugs, formations et reporting restent
  fermés.
- Page « Reprises et capacité CSM », page d’accueil de ce rôle : capacité et
  disponibilité de chaque chargé de succès client, reprises à venir avec
  attribution modifiable, projection mensuelle et barème.
- Le rôle peut modifier la capacité et la disponibilité de son équipe ainsi que
  les attributions de chargé de succès client. Les autres écritures de
  l’onboarding lui restent fermées.
- Sur la page CSM, l’implémenteur de chaque compte est visible en lecture seule,
  pour préparer la passation.

## 2026-09-05 — Page Plan de charge OB / CSM

### Ajouté

- Page « Plan de charge » dans l’espace onboarding : pré-attribution des
  comptes signés pas encore live à un implémenteur et à un chargé de succès
  client, et projection mensuelle de la montée en charge.
- Attribution éditable et persistée. Un choix manuel pose un verrou, prioritaire
  sur la continuité de groupe et sur la répartition automatique, et se lève
  depuis la même ligne.
- Édition du rôle, du plafond et de la disponibilité de chaque implémenteur et
  de chaque chargé de succès client. Quatre états, Dispo, Relâche qui divise la
  capacité par deux, Absent et STOP qui l’annulent.
- Deux projections mensuelles avec ligne de plafond et liste des dépassements :
  projets simultanés par implémenteur, points de reprise par chargé de succès
  client.
- Barème de pondération affiché en lecture seule, avec rappel qu’il se modifie
  en base.
- Les limites de données restent visibles : origine d’une date de signature ou
  d’un nombre d’hôtels déduits, chargé de succès client Zoho non résolu, liste
  d’opportunités tronquée.

## 2026-09-05 — Pipeline Zoho du plan de charge OB / CSM

Deuxième étape. Le moteur est désormais alimenté par les données réelles, mais
il n’est toujours pas exposé dans l’interface.

### Ajouté

- Construction du pipeline des comptes signés pas encore live à partir de Zoho
  CRM et Zoho Projects : un compte client dont la date de démarrage
  d’abonnement est future et qui n’a aucun projet en ligne.
- Résolution du nom du chargé de succès client renvoyé par Zoho, qui n’est pas
  normalisé, vers le nom utilisé par les règles de capacité. Une correspondance
  ambiguë est signalée comme non résolue plutôt que devinée.
- Lecture des opportunités gagnées, utilisée uniquement pour confirmer et dater
  une signature.
- Diagnostics de construction : comptes exclus, hôtels comptés par repli,
  signatures non datées, chargés de succès client non résolus, groupes sans
  continuité identifiable.

- Barème de pondération lu depuis les règles en base plutôt que depuis une
  constante du code.
- Ids utilisateurs Zoho des chargés de succès client et des implémenteurs, qui
  fiabilisent la résolution des noms. Deux chargées de succès client
  supplémentaires ajoutées au roster.

### Corrigé

- Un compte dont la date de signature est postérieure au go-live ne disparaît
  plus de la projection de charge.
- Un compte dont la date de démarrage tombe plus tard dans le mois courant
  n’est plus compté deux fois sur ce mois.
- Un compte n’est considéré comme « Dmbook seul » que si son offre est
  exactement Dmbook, et non dès qu’elle contient Dmbook.

## 2026-09-05 — Moteur d’attribution et anticipation de charge OB / CSM

Première étape, scaffolding. Le moteur existe et est testé, mais il n’est pas
encore alimenté par Zoho ni exposé dans l’interface. Voir
`docs/plan-charge-avancement.md` pour l’état d’avancement et la suite.

### Ajouté

- Roster des implémenteurs onboarding en base (`ob_capacity_rules`), avec rôle,
  plafond de projets simultanés et état de disponibilité.
- États de disponibilité communs aux implémenteurs et aux CSM : Dispo, Relâche
  (capacité divisée par deux), Absent et STOP (capacité nulle). L’ancien
  booléen `active` des CSM est migré vers ces états et conservé en lecture pour
  compatibilité.
- Table des pré-attributions et des overrides manuels par compte
  (`account_assignments`), avec verrous distincts côté implémenteur et côté
  CSM.
- Moteur d’attribution et de projection de charge : pré-attribution d’un
  implémenteur à la signature et d’un CSM au mois de go-live, répartition sur
  la capacité restante, éligibilité par séniorité, continuité de groupe et
  détection des dépassements de plafond. Priorité retenue, override manuel puis
  continuité de groupe puis répartition automatique.
- Barème de poids commun aux deux capacités, lu depuis les règles existantes en
  base plutôt que redéfini dans le code.
- Suite de tests unitaires du moteur, dont la redistribution sur un
  implémenteur absent, la continuité vers un CSM à l’arrêt et le déterminisme
  des attributions.

### Modifié

- Le groupe implémentation ne contient plus que Thuy-Tien, Dalia et Winli.

## 2026-07-21 — Traduction anglaise de l’onboarding et suivi de la charge

### Ajouté

- Version anglaise de l’espace onboarding (liste, board, fiche projet,
  pilotage) avec un sélecteur FR/EN par utilisateur, préférence persistée dans
  `user_settings.ui_language`.
- Snapshots quotidiens de la charge par chargé de projet
  (`onboarding_workload_snapshots`) et indicateur de régularité dans le
  pilotage : nombre de jours consécutifs au-dessus de 80 % de charge sur la
  période sélectionnée. Le suivi démarre à partir de cette date, sans
  historique reconstitué.

## 2026-07-20 — Restauration fonctionnelle et fiabilisation des données

### Ajouté

- Serveur MCP Onboarding connectable à Claude : lecture du contexte projet et
  enregistrement sécurisé de comptes rendus, décisions, actions, mises à jour
  produit et références Google Calendar.
- Authentification OAuth 2.1 du connecteur via Supabase et le magic link
  existant, avec droits d’écriture limités aux admins et onboarders.
- Statut produit « En pause » avec raison et date de reprise, visible dans le
  cockpit d’implémentation.
- Mécanisme de backfill Zoho Desk complet et reprenable pour reconstituer les
  données analytiques disponibles dans l’API.
- Snapshots quotidiens de chaque ticket, datés selon le jour métier
  `Europe/Paris`, pour conserver les changements de statut et de résolution à
  partir du 20 juillet 2026.
- Suivi quotidien des tickets anciens modifiés, y compris lorsqu’ils ont été
  créés il y a plus de douze mois.
- Synchronisation tournante des métriques officielles Zoho Desk, dont le temps
  de première réponse calculé selon les horaires et SLA Zoho.
- Reporting Support trimestriel fondé sur les données persistées : volumes,
  résolutions, FCR, première réponse, comparaisons trimestre précédent et N-1,
  récurrences, qualité et couverture des données.
- Cockpit d’implémentation Onboarding par projet : phase, jalons, ressources
  client, prochaine action, blocages, produits, options, assiduité aux
  formations et suggestion d’affectation CSM.
- Migrations Supabase versionnées pour le workspace projet, l’affectation CSM,
  les filtres personnels Tickets, l’état du backfill, le cockpit
  d’implémentation, les snapshots quotidiens et les métriques de première
  réponse (`014` à `023`).

### Modifié

- Le filtre Onboarding « Trimestre en cours » devient « 3 mois glissants » :
  du premier jour du mois M-2 jusqu’au jour courant.
- Les vues Formations `Sessions` et `Analytiques` utilisent une barre de filtres
  sticky harmonisée et une largeur de contenu commune.
- Dans les analytics Formations, « Formations par inscriptions actives » est
  affiché avant « Tendance mensuelle ».
- La navigation masque de nouveau les modules non finalisés `Knowledge Base` et
  `Assistant IA`.
- L’entrée Onboarding principale revient à la liste des projets et conserve un
  accès explicite à la vue Board.

### Corrigé

- Les anciens tickets Zoho sans objet de champs personnalisés n’interrompent
  plus le backfill.
- La pagination du backfill relit sa page de jonction afin de ne pas perdre de
  ticket lorsqu’une création décale les offsets Zoho entre deux lots.
- Le temps de première réponse ne dépend plus du champ vide du listing Tickets :
  il provient désormais de l’endpoint dédié `tickets/{id}/metrics`.
- La carte « Sans 1ère réponse » du tableau de bord ouvre directement la vue
  Zoho Desk des tickets concernés.
- L’ouverture d’un filtre du dashboard Tickets referme le menu de filtre déjà
  ouvert.
- Les changements récents du cockpit Onboarding sont restaurés après leur
  régression : écrans, API, synchronisation et droits associés.
- Le reporting par trimestre et ses contrôles de couverture sont restaurés
  après leur régression.

## 2026-07-18 — Retrait du module Acuity Enterprise expérimental

### Supprimé

- Le module expérimental de gestion Acuity Enterprise, son écran
  d’administration, ses routes et ses migrations ont été retirés car ils
  n’étaient pas utilisés.
- L’intégration Acuity standard nécessaire aux sessions, participants et
  statistiques Formations est conservée.

## 2026-07-17 — Persistance analytique, Formations et Onboarding

### Ajouté

- Tables Supabase dédiées aux données analytiques Zoho Desk et Linear, avec
  index métier et politiques RLS.
- Synchronisations quotidiennes Zoho Desk et Linear, routes d’agrégation basées
  sur les données persistées et déclenchement manuel réservé aux administrateurs
  depuis les paramètres.
- Dashboard Formations enrichi : sessions passées, inscriptions actives, hôtels
  représentés, moyenne par session, annulations, absences, tendances, langues,
  charge des animateurs, formations et hôtels les plus représentés.
- Comparaison des périodes Formations et filtres combinables par langue,
  formation et animateur.
- Refonte des vues Onboarding liste, Board, détail et Pilotage avec indicateurs
  de charge, risque, retard, TTV, cadence, statut et produit.
- Synchronisation et restitution de la satisfaction Onboarding issue de Zoho
  Forms, avec détail des réponses et agrégation par chargé de projet.

### Corrigé

- Les sessions Acuity sont dédupliquées et les limites de couverture remontées
  explicitement afin de ne pas présenter des statistiques partielles comme
  exhaustives.
- Les métriques Formations distinguent désormais sessions passées,
  inscriptions actives, annulations et absences.
- Le calcul Onboarding utilise les dates réelles disponibles pour les go-lives
  et le TTV, et signale les dimensions sources non renseignées.

## 2026-07-15 — Dashboards analytiques Support et Bugs

### Ajouté

- Dashboard Tickets avec 5 KPI, 6 visualisations Recharts, filtres combinables
  synchronisés dans l'URL et tableau agrégé client × produit.
- Dashboard Bugs avec 5 KPI, 7 visualisations Recharts, filtres Linear,
  recherche par mot-clé et filtre des membres du workspace.
- Routes agrégées `GET /api/zoho/tickets/analytics` et
  `GET /api/linear/issues/analytics`.
- Cache serveur de 15 minutes par page source et par agrégat, avec limites et
  avertissements de troncature explicites.
- Sparklines d'activité sur les quatre KPI du dashboard global.
- Navigation mobile et documentation de recette analytique.

### Modifié

- `/tickets` est désormais un cockpit de pilotage Zoho Desk, sans action sur les
  tickets.
- `/escalations` est renommé « Bugs » dans l'interface et devient un dashboard
  Linear analytique.
- La sidebar affiche directement `Tickets` et `Bugs`.
- Le dashboard global ne contient plus de liste individuelle de tickets ou
  d'issues.
- Les catégories Zoho sont regroupées dans une taxonomie analytique provisoire :
  Campaigns, Newsletters, Guest Profile, CRM Core, PMS, WhatsApp, Guest App,
  Hub de messagerie, Dmbook Pro, Loyalty Program, CSM et Autre.
- `LINEAR_API_KEY` devient le nom de variable de référence dans les réglages et
  le contrôle de santé.

### Supprimé de l'interface

- Détail opérationnel d'un ticket et actions « Résumer », « Répondre » et
  « Créer escalade » depuis la page Tickets.
- Kanban opérationnel des escalades.
- Composants devenus orphelins `AnalyticsPane` et `RiskScore`.

Les API opérationnelles sous-jacentes restent disponibles pour les autres
modules et les workflows RAG.

### Limites connues

- La FCR Zoho est une estimation lorsque l'historique de réouverture manque.
- Le temps de première réponse reste vide lorsque Zoho n'expose pas
  `responseTime` dans le listing.
- Les états quotidiens antérieurs au 20 juillet 2026 ne peuvent pas être
  reconstruits exactement ; les snapshots persistés commencent à cette date.
- La taxonomie Zoho doit être remise à plat avec le métier ; CSM et Autre servent
  notamment de points de revue.

## 2026-06-09 — Todoist et rapports de statut Onboarding

### Ajouté

- Intégration Todoist en lecture seule, avec synchronisation autorisée aux
  onboarders et nettoyage des caractères Unicode incompatibles avec l’API.
- Rapprochement des tâches Todoist avec les projets Zoho Projects.
- Génération assistée par IA de rapports de statut projet Onboarding.
- Persistance explicite du rôle administrateur du compte D-EDGE principal.

## 2026-06-01 — Refonte Onboarding, rôles et design system

### Ajouté

- Refonte des écrans Onboarding « Mes projets », Board, en-tête projet et vue
  d’ensemble.
- Permissions par rôle dans la navigation et le middleware pour les profils
  `admin`, `support`, `onboarder` et `commercial_readonly`.
- Application du design system D-EDGE aux principaux écrans de l’application.

### Corrigé

- Les projets Zoho non encore synchronisés n’aboutissent plus sur une page 404.

## 2026-05-31 — Timeline Onboarding et administration des accès

### Ajouté

- Timeline persistée des projets Onboarding, détection d’événements, résumé de
  projet et actions de suivi.
- Résumés Onboarding générés avec un modèle OpenAI à coût maîtrisé, avec cache,
  journalisation et gestion explicite des erreurs.
- Gestion des rôles utilisateurs et regroupement des demandes d’accès dans
  l’administration.
- Synchronisation Zoho Projects planifiée selon les contraintes des crons
  Vercel.

## 2026-05-22 au 2026-05-29 — Authentification, performance et qualité Tickets

### Ajouté

- Authentification Supabase par lien email, callback SSR avec cookie de session
  et workflow de demande puis validation d’accès.
- Table Supabase des demandes d’accès et écrans d’administration associés.
- Restrictions d’accès spécifiques aux modules Onboarding et Formations.
- Outils administratifs pour normaliser les tickets et résoudre les clients
  classés `Undefined`, avec pagination, reprise et limites par lot.
- Accès depuis les analytics à la revue des tickets classés `Autre`.

### Modifié

- Mise en cache des principales routes Zoho, Linear et Acuity afin de limiter
  les appels redondants et d’améliorer les temps de chargement.
- Les noms clients Tickets utilisent le compte du contact lorsque le compte du
  ticket n’est pas directement renseigné.
- Le Board Onboarding filtre par chargé de projet et ouvre les projets dans
  Zoho Projects avec le bon portail.

### Corrigé

- Plusieurs itérations du callback Supabase ont fiabilisé les liens magiques,
  le PKCE et les URL de retour en production.
- Les erreurs Zoho de première page, les limites de pagination et les réponses
  de satisfaction Onboarding absentes sont maintenant gérées explicitement.

## 2026-05-18 au 2026-05-21 — Première version du cockpit

### Ajouté

- Première version de D-EDGE Ops Cockpit connectée aux API réelles Zoho Desk,
  Linear et Acuity, sans données factices.
- Gestion opérationnelle des Tickets : vues liste, Board, Inbox et triage,
  conversations, changement de statut et liens vers Zoho Desk.
- Assistance IA sur les tickets : résumé, recherche de cas similaires,
  suggestion d’article de connaissance, proposition de réponse et boucle de
  régénération avec critique.
- Webhooks Zoho Desk et socle RAG pour alimenter la base de connaissances.
- Premiers dashboards Tickets, Bugs, Formations et Onboarding, ainsi que le
  reporting mensuel destiné aux All Hands.
- Filtres Onboarding par chargé de projet, groupe Implémentation, période,
  capacité et satisfaction.
- Tableau de bord principal orienté priorités avec tickets sans première
  réponse, escalades à relancer et raccourcis opérationnels.

### Modifié

- Les données factices initiales ont été supprimées au profit des sources API.
- Les routes API dynamiques et les lectures `no-store` ont été généralisées là
  où les caches Next.js pouvaient présenter des données périmées.
- Le reporting Support a successivement testé les comparaisons N-1 et mois
  précédent avant la refonte analytique ultérieure.

### Retiré

- Une première tentative de connexion Google OAuth a été annulée le 19 mai,
  faute d’identifiants Google disponibles. L’authentification conservée est le
  lien email Supabase.
