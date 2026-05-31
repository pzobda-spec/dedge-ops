# D-EDGE Ops Cockpit

Cockpit opérationnel interne pour l'équipe Customer Success & Support D-EDGE CRM.

## Stack technique

- **Framework :** Next.js 14 (App Router)
- **Language :** TypeScript
- **Styles :** Tailwind CSS
- **IA :** OpenAI GPT-4o
- **Base de données :** Supabase (Sprint 4)
- **Sprint 1 :** Mock data uniquement

## Installation locale

```bash
# 1. Cloner le repo et installer les dépendances
npm install

# 2. Configurer les variables d'environnement
cp .env.example .env.local
# Ajouter votre clé OPENAI_API_KEY dans .env.local

# 3. Lancer le serveur de développement
npm run dev
```

L'application est accessible sur [http://localhost:3000](http://localhost:3000).

## Variables d'environnement

| Variable | Description | Requis |
|----------|-------------|--------|
| `OPENAI_API_KEY` | Clé API OpenAI (GPT-4o) | Oui pour les fonctions IA |
| `NEXT_PUBLIC_SUPABASE_URL` | URL Supabase | Sprint 4 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clé publique Supabase | Sprint 4 |
| `SUPABASE_SERVICE_ROLE_KEY` | Clé service Supabase | Sprint 4 |

## Modules

| Module | URL | Description |
|--------|-----|-------------|
| Tableau de bord | `/dashboard` | Vue d'ensemble opérationnelle |
| Tickets | `/tickets` | Liste et détail des tickets |
| Escalades | `/escalations` | Kanban des escalades techniques |
| Formations | `/trainings` | Sessions et statistiques |
| Onboarding | `/onboarding` | Pipeline de mise en production |
| Base de connaissances | `/knowledge` | Articles de résolution |
| Reporting | `/reporting` | Métriques mensuelles |
| Assistant IA | `/assistant` | Interface IA libre |
| Paramètres | `/settings` | Configuration |

## Actions IA disponibles

1. **Résumer un ticket** — Analyse structurée (statut, bloqueur, action recommandée)
2. **Réponse client** — Email professionnel éditable
3. **Créer escalade tech** — Ticket structuré pour l'équipe ingénierie
4. **Créer fiche KB** — Article de base de connaissances
5. **Analyse mensuelle** — Narrative pour All Hands

## Roadmap Sprint

### Sprint 1 (actuel) — Fondations
- Scaffold Next.js 14 + TypeScript + Tailwind
- Mock data (10 clients, 20 tickets, 6 escalades, 8 formations, 8 projets, 6 articles KB)
- Toutes les pages navigables
- 5 routes API OpenAI GPT-4o
- Score de risque automatique

### Sprint 2 — Intégration Zoho Desk
- Synchronisation live des tickets
- Webhook pour mise à jour temps réel
- Réponse client directement depuis le cockpit

### Sprint 3 — Intégration Linear
- Création d'escalades bidirectionnelle
- Synchronisation des statuts
- Commentaires bidirectionnels

### Sprint 4 — Supabase
- Base de données réelle
- Persistance des données
- Historique des actions IA
- Métriques calculées automatiquement

### Sprint 5 — Slack
- Alertes tickets critiques
- Notifications d'escalades
- Résumé hebdomadaire automatique

### Sprint 6 — LearnWorlds & Acuity
- Import des sessions de formation
- Inscription depuis le cockpit
- Suivi des complétions

### Sprint 7 — Zoho Projects & Onboarding
- Synchronisation des projets
- Mise à jour automatique des statuts
- Alertes de blocage

### Sprint 8 — IA avancée
- Triage automatique des tickets
- Résumés hebdomadaires autonomes
- Bot Slack IA
- Analyse prédictive du risque client

## Développement

```bash
npm run dev      # Serveur de développement
npm run build    # Build de production
npm run lint     # Vérification ESLint
```

## Cron onboarding

La synchronisation des projets onboarding est planifiée côté Vercel via `vercel.json` :

```json
{
  "crons": [{ "path": "/api/cron/sync-onboarding", "schedule": "0 */2 * * *" }]
}
```

Configurer `CRON_SECRET` dans les variables d'environnement. Pour un test manuel, appeler
`/api/cron/sync-onboarding` avec `Authorization: Bearer $CRON_SECRET`,
`x-cron-secret: $CRON_SECRET`, ou `?secret=$CRON_SECRET`.

## Structure du projet

```
├── app/
│   ├── api/ai/          # Routes API OpenAI
│   ├── dashboard/       # Tableau de bord
│   ├── tickets/         # Liste + détail tickets
│   ├── escalations/     # Kanban escalades
│   ├── trainings/       # Formations
│   ├── onboarding/      # Pipeline onboarding
│   ├── knowledge/       # Base de connaissances
│   ├── reporting/       # Reporting mensuel
│   ├── assistant/       # Assistant IA
│   └── settings/        # Paramètres
├── components/
│   ├── layout/          # Sidebar, TopBar
│   ├── ui/              # Badge, Card, RiskScore, etc.
│   └── tickets/         # Composants tickets
├── lib/
│   ├── mockData.ts      # Données mock Sprint 1
│   ├── openai/          # Client OpenAI
│   ├── scoring/         # Calcul du score de risque
│   ├── trainings/       # Statistiques formations
│   └── utils/           # Dates, formatage
├── database/
│   ├── schema.sql        # Schéma PostgreSQL
│   └── seed.sql          # Données de test
└── docs/
    ├── product-spec.md   # Spécification produit
    ├── api-integrations.md # Documentation intégrations
    └── prompts.md        # Documentation prompts IA
```
