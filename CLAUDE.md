# DEDGE OPS

Next.js 14 App Router · TypeScript · Tailwind · Supabase · Recharts
Prod: https://dedge-ops-6zer.vercel.app

## PURPOSE

Cockpit interne de pilotage D-EDGE CRM. Les pages Tickets et Bugs sont
strictement analytiques : Pablo traite les tickets dans Zoho Desk et les issues
dans Linear. Ne pas réintroduire de réponse client, création d'escalade, détail
ticket ou kanban opérationnel dans ces deux pages.

## NEVER

- Write to Zoho CRM (read only)
- Call a Zoho token endpoint outside the shared app provider (kills token cache)
- Reintroduce operational actions in `/tickets` or `/escalations`
- Change the product roll-up without business validation
- Invent missing analytics values; display `—` or an explicit limitation
- Use English UI copy, except intentional source labels such as Linear statuses

## AUTH

Magic link, no password. `middleware.ts` blocks everything except `/login`,
`/auth/*` and `/api/auth/*`.

- `ADMIN_EMAIL`: bypass approval, `shouldCreateUser: true`
- Others: `access_requests` → approve in `/settings` → invite by email
- Local login callback: `http://localhost:3000/auth/callback`
- Supabase Redirect URLs must include `http://localhost:3000/**`
- Non-local login callback: production URL
- Invite/approval routes use `NEXT_PUBLIC_APP_URL`
- Rate limit: 3 emails/hour; do not spam magic links

## TICKETS ANALYTICS

- Page: `/tickets`
- API: `GET /api/zoho/tickets/analytics`
- Filters: `from`, `to`, `product`, `category`, `classification`, `status`,
  `priority`, `client`
- UI: 5 KPI, 6 Recharts visualizations, URL-synchronized filters, aggregated
  client × product table; never return individual ticket data to the browser
- Server source: Zoho Support department, paginated and aggregated server-side
- Cache: each ticket page 15 minutes; Desk accounts 1 hour
- Limit: 10,000 source tickets, with a visible truncation warning
- FCR is explicitly an estimate; first-response time is `—` when Zoho omits
  `responseTime`

Current provisional product roll-up:

- Campaigns: campaign labels
- Newsletters: newsletter labels and explicit DNS/SPF/DKIM/DMARC subjects
- Guest Profile: profiles, segmentation, CSV imports/exports
- CRM Core: administration, access, 2FA
- PMS: integrations/connectors/synchronization
- WhatsApp, Hub de messagerie, Dmbook Pro, Loyalty Program: standalone
- Guest App: Pages, Forms, Check-in, Orders, Kiosk, Wifi, app statistics
- CSM: keep visible and untouched for weekly business review
- Autre: Email delivery/Mailinblack and unmapped values

The Zoho category model is incomplete and inconsistently used. This roll-up is
an analytics layer only; it does not rewrite Zoho categories.

## LINEAR ANALYTICS

- Page: `/escalations`, labelled “Bugs” in the UI
- API: `GET /api/linear/issues/analytics`
- Workspace `loungeup`, team `BUGS`, credential `LINEAR_API_KEY`
- Filters: `from`, `to`, `label`, `priority`, `status`, `creator`, `keyword`
- UI: 5 KPI and 7 Recharts visualizations
- Cache: compact cursor pages and aggregates 15 minutes; members 1 hour
- Limit: 5,000 issues, with `truncated: true` and a visible warning
- Keyword filtering runs server-side over the cached compact source
- Issue URL: `https://linear.app/loungeup/issue/{id}/{slug}`

## LEGACY ROUTES

These routes redirect to the analytical dashboards:

- `/tickets/[id]`, `/tickets/analytics`, `/tickets/analytics/other` → `/tickets`
- `/escalations/analytics` → `/escalations`

Keep the underlying Zoho/Linear read and action API routes: other modules and
RAG workflows can still depend on them.

## GLOBAL DASHBOARD

`/dashboard` keeps four numerical KPI cards with 30-day activity sparklines.
There is no individual “Tickets à traiter” or Bugs list. Ticket/Bug links point
to the analytical dashboards.

## ZOHO

Desk org `20063299426`.

- Support department: `5861000000007061`
- CSM department: `5861000019985859` (excluded from the Support source)
- A `CSM` category inside the Support department remains visible for review
- Desk OAuth: `ZOHO_REFRESH_TOKEN` via `accounts.zoho.eu`
- CRM: `ZOHO_CRM_REFRESH_TOKEN`, read only
- MRR: Strategic >4k, Gold ≥750, Silver ≥200, Bronze <200
- CRM account cache: 1 hour in `lib/zoho/accountCache.ts`

## OTHER INTEGRATIONS

- Acuity: sessions by `classID`; hotel field is `Company Name`
- Projects cache: 5 minutes
- Acuity cache: 10 minutes
- Raw operational sources: tickets 2 minutes, Linear 5 minutes
- Invalidate relevant cache tags after mutations

## RISK SCORE 0–100

Strategic +40, Gold +30, Silver +15, Bronze +0, unknown +10.
Age >48h +25, >24h +15, >8h +8; negative +20; urgent +20; high +10;
reopened +10. Used by the global dashboard, not the analytical ticket KPI.

## VERIFY

```bash
npx tsc --noEmit --pretty false
npm run lint
npm run build
```

Detailed recipe and known data limitations:
`docs/analytics-dashboards-verification.md`.

Release history: `CHANGELOG.md`.

## TODO

- Rework the Zoho category model with the business team; many values are stale,
  missing or inconsistently used
- Add persisted daily snapshots for exact historical status/resolution metrics
- RAG webhook: `app/api/webhooks/zoho-desk`, table `ticket_chunks` (pgvector),
  `lib/rag/ingest.ts`; enable pgvector first
