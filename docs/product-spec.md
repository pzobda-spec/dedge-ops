# D-EDGE Ops Cockpit — Product Specification

## What It Is

D-EDGE Ops Cockpit is an internal steering cockpit for the D-EDGE CRM Customer
Success and Support team. It centralizes analytics from Zoho Desk and Linear,
alongside onboarding, training and knowledge workflows. Ticket and bug handling
continues in the source tools rather than in the cockpit.

## Who It's For

- **Support agents** — analyzing ticket and bug trends before acting in source tools
- **CSMs (Customer Success Managers)** — tracking onboarding projects, client health, and trainings
- **Team leads** — monitoring workload, risk, and monthly performance

## Modules

### 1. Tableau de bord (Dashboard)
- Four numerical KPI cards with recent-activity sparklines
- Links to the analytical Tickets and Bugs dashboards
- Training and onboarding summaries without an individual ticket/issue list

### 2. Tickets
- Analytical Zoho Desk dashboard with five KPI and six Recharts visualizations
- Combinable, shareable URL filters for period, product, category,
  classification, client, status and priority
- Aggregated client × product table; no individual ticket detail or action
- Server-side aggregation and 15-minute source cache

### 3. Bugs
- Analytical Linear dashboard with five KPI and seven Recharts visualizations
- Period, label, priority, status, creator and keyword filters
- Resolution-time SLA distribution, frequent keywords and top creators
- Server-side aggregation and 15-minute source cache; no operational kanban

### 4. Formations (Trainings)
- Session table with expand/collapse for registration details
- Duplicate hotel detection (amber highlight)
- Statistics: by language, top themes, unique hotels

### 5. Onboarding
- Pipeline board by project status
- Alert badges: blocked, go-live overdue, Strategic delayed, 4+ iterations
- Owner workload table (Lan, Thuy, Dalia)

### 6. Base de connaissances (Knowledge)
- Article search and filter
- Full article view: symptoms, causes, checks (interactive checklist), solution, client reply template with copy button

### 7. Reporting
- Monthly metrics dashboard with comparison to previous month
- Product and channel breakdowns (bar charts using CSS)
- AI narrative analysis (for All Hands presentations)
- Markdown export

### 8. Assistant IA
- Free-form prompt interface
- 6 quick action chips
- Output panel with copy
- Last 5 actions history (localStorage)

### 9. Paramètres (Settings)
- API key status
- Integration status (all future integrations listed)
- UI preferences

## AI Actions (5 prompts via OpenAI GPT-4o mini)

These underlying capabilities remain available to other modules and APIs, but
are intentionally absent from the analytical Tickets and Bugs dashboards.

1. **Summarize ticket** — Structured analysis of a support ticket
2. **Generate client reply** — Professional email body
3. **Create escalation** — Formatted tech ticket for engineering
4. **Create KB article** — Internal knowledge base article
5. **Monthly analysis** — Narrative for All Hands presentation

## Risk Score Formula

| Factor | Points |
|--------|--------|
| Strategic segment | +40 |
| Gold segment | +30 |
| Silver segment | +15 |
| Response delay >48h | +25 |
| Response delay >24h | +15 |
| Response delay >8h | +8 |
| Negative sentiment | +20 |
| Problem type | +15 |
| Urgent priority | +20 |
| High priority | +10 |
| Reopened status | +10 |
| **Maximum** | **100** |
