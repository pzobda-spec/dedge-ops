# Changelog

Les changements notables de D-EDGE Ops Cockpit sont consignés dans ce fichier.

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
- Les résolutions Zoho historiques et les jours analytiques UTC nécessiteront
  des snapshots persistés pour une précision métier absolue.
- La taxonomie Zoho doit être remise à plat avec le métier ; CSM et Autre servent
  notamment de points de revue.
