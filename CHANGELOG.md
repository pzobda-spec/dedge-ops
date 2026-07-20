# Changelog

Les changements notables de D-EDGE Ops Cockpit sont consignés dans ce fichier.

Les entrées antérieures au 15 juillet 2026 ont été reconstituées à partir de
l’historique Git ; elles synthétisent les changements fonctionnels encore
pertinents plutôt que chaque correction intermédiaire.

## 2026-07-20 — Restauration fonctionnelle et fiabilisation des données

### Ajouté

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
