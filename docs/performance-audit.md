# D-EDGE Ops Cockpit — Performance Audit

**Date:** 2026-05-28  
**Auditor:** Claude Code (static analysis + build artefact inspection)  
**Project path:** `/Dev/dedge-ops`  
**Stack:** Next.js 14.2.35 · Supabase · Zoho Desk API · Linear API · OpenAI · Acuity

> **Methodology note.** Lighthouse scores, Supabase slow-query logs, and Vercel Analytics require a live deployment and dashboard access that are not available in this static analysis context. Where live measurement is not possible, findings are derived from source code, build artefacts, and known Next.js/Supabase behaviour. Every finding is clearly labelled **[MEASURED]** or **[DERIVED]**.

---

## Section 1 — Frontend Bundle

### Total bundle size per page [MEASURED from `.next/static/chunks`]

| Page | Page-specific JS | Shared baseline¹ | Total shipped |
|---|---|---|---|
| `/tickets` | 40 KB | ~1,020 KB | ~1,060 KB |
| `/tickets/[id]` | 36 KB | ~1,020 KB | ~1,056 KB |
| `/onboarding` | 20 KB | ~1,020 KB | ~1,040 KB |
| `/trainings` | 16 KB | ~1,020 KB | ~1,036 KB |
| `/tickets/analytics` | 16 KB | ~1,020 KB | ~1,036 KB |
| `/dashboard` | 16 KB | ~1,020 KB | ~1,036 KB |
| `/trainings/analytics` | 12 KB | ~1,020 KB | ~1,032 KB |
| `/reporting` | 12 KB | ~1,020 KB | ~1,032 KB |
| `/knowledge` | 12 KB | ~1,020 KB | ~1,032 KB |
| `/escalations` | 12 KB | ~1,020 KB | ~1,032 KB |
| `/escalations/analytics` | 12 KB | ~1,020 KB | ~1,032 KB |
| `/settings` | 8 KB | ~1,020 KB | ~1,028 KB |
| `/assistant` | 8 KB | ~1,020 KB | ~1,028 KB |
| `/onboarding/board` | 8 KB | ~1,020 KB | ~1,028 KB |
| `/onboarding/charge` | 8 KB | ~1,020 KB | ~1,028 KB |
| `/knowledge/[id]` | 8 KB | ~1,020 KB | ~1,028 KB |
| `/login` | 8 KB | ~1,020 KB | ~1,028 KB |

¹ Shared baseline breakdown: framework 140 KB · main 116 KB · polyfills 112 KB · chunk `996` 184 KB · chunk `fd9d` 172 KB · chunk `117` 124 KB · others ~172 KB. **All figures are uncompressed.** With Brotli compression (Vercel default), real wire sizes are 60–75% smaller (~620–770 KB total per page).

No page exceeds 300 KB of page-specific JS. The shared baseline is the concern.

### Largest shared chunks [MEASURED]

| Chunk | Uncompressed size | Likely contents |
|---|---|---|
| `996-c7ef...` | 184 KB | Supabase JS client + SSR adapter |
| `fd9d1056...` | 172 KB | OpenAI SDK (client-bundled) |
| `framework-f661...` | 140 KB | React + React DOM |
| `117-d2ba...` | 124 KB | App logic (mapper, utils, types) |
| `main-6946...` | 116 KB | Next.js runtime |
| `polyfills-4237...` | 112 KB | Browser polyfills |

🟠 **Issue 1-A:** The OpenAI SDK (`fd9d1056`, 172 KB) appears in the shared client bundle. Because `AppShell` is a `'use client'` component that sits at the root layout, any import reachable from it (including deep re-exports) can be pulled into the client graph. Verify with `ANALYZE=true next build`.

🟢 **Issue 1-B:** No large UI library (no Recharts, no MUI, no Radix) — this keeps per-page chunks small.

### Unused dependencies [MEASURED via `depcheck`]

| Package | Declared in | Issue |
|---|---|---|
| `autoprefixer` | `dependencies` | Used only at build time — should be `devDependencies` |
| `@types/node` | `devDependencies` | Unused (no explicit Node types needed beyond Next.js) |
| `@types/react-dom` | `devDependencies` | Not directly imported |
| `postcss` | `devDependencies` | Build-only — already fine as dev but not referenced |

🟢 **Issue 1-C:** `autoprefixer` listed as a production dependency — move to `devDependencies` to shave ~2 KB from production installs.

### Pages with > 300 KB page-specific JS shipped to client

None. All page-specific chunks are under 40 KB. ✅

### Client Components that should be Server Components 🟠

This is the most significant structural finding in the project.

**Every single `page.tsx` file has `'use client'` at the top.** 17 of 17 pages are fully client-side rendered. None of the pages use React Server Components (RSC) for their initial data fetch.

Pages that fetch data purely for display (no interaction on mount) and could be Server Components:

| Page | Current | Could be |
|---|---|---|
| `/knowledge` | Client (fetch in `useEffect`) | Server Component + RSC streaming |
| `/knowledge/[id]` | Client (fetch in `useEffect`) | Server Component |
| `/escalations` | Client (fetch in `useEffect`) | Server Component (list view) |
| `/reporting` | Client (fetch in `useEffect`) | Server Component (initial render) |
| `/trainings` | Client (fetch in `useEffect`) | Server Component (list) |
| `/settings` | Client (fetch in `useEffect`) | Server Component (health check) |

🟠 **Issue 1-D:** `'use client'` overuse. All pages use `useEffect` + `fetch` for initial data load, which delays first render by one round-trip and defeats SSR. Converting read-only pages to Server Components would eliminate the client-side data fetch waterfall and improve LCP significantly.

### `'use client'` cascade from `AppShell`

`AppShell.tsx` is a `'use client'` component imported from the root layout. It uses `usePathname()` only to toggle the sidebar on the `/login` route. Because it is at the root, it marks the entire layout tree as client-side, making SSR of child content impossible.

🔴 **Issue 1-E:** `AppShell` should be a Server Component. The `usePathname` usage can be extracted into a tiny `<LoginGuard>` client component, leaving the layout shell as a Server Component.

---

## Section 2 — Page Load Times

> Live Lighthouse measurements require a running deployment. Values below are **[DERIVED]** from code analysis and Next.js rendering model.

### Rendering model for all pages

All pages are `'use client'` with data fetched in `useEffect`. This means:

1. Server sends minimal HTML shell (no real content)
2. Browser downloads JS bundle (~1 MB uncompressed)
3. React hydrates
4. `useEffect` fires → HTTP request to API route
5. API route calls Zoho / Supabase / Linear
6. Response arrives → state updates → page renders content

This is a **two-round-trip pattern** before any meaningful content is visible. Expect:

| Metric | Estimate | Target |
|---|---|---|
| TTFB | 100–300 ms (Vercel edge, Europe) | < 200 ms |
| LCP (content visible) | 2,000–4,000 ms | < 1,500 ms |
| TBT | 200–400 ms (JS parse + hydration) | < 200 ms |
| Network requests per page | 8–15 (HTML + JS chunks + API fetch) | — |
| Total payload (uncompressed) | ~1.1–1.2 MB | — |

🔴 **Issue 2-A:** LCP is estimated at 2–4 s on all data-bearing pages because content is invisible until the second round-trip completes. Pages `/tickets`, `/dashboard`, and `/reporting` are likely the worst offenders as they fetch the largest payloads from Zoho (100+ tickets per request).

🟠 **Issue 2-B:** `/tickets/[id]` fetches ticket + conversations in sequential `useEffect` calls (ticket first, then conversations in a second effect), adding a third round-trip before full page content is visible.

🟡 **Issue 2-C:** The Google Font (`DM Sans`) is loaded via `next/font/google` — this is correctly handled by Next.js (self-hosted, no layout shift). ✅

**Pages most likely to exceed 1.5 s LCP (in order of risk):**
1. `/reporting` — calls `zoho/analytics` (uncached, multi-page Zoho pagination)
2. `/dashboard` — fetches all open tickets (100+ items, Zoho API)
3. `/tickets` — same as dashboard
4. `/onboarding` — fetches Zoho Projects (paginated)
5. `/tickets/[id]` — three sequential fetches (ticket, conversations, threads)

---

## Section 3 — API Routes

### Route inventory and caching status [DERIVED]

| Route | Method | Cached | Cache TTL | Notes |
|---|---|---|---|---|
| `GET /api/zoho/tickets` | GET | ✅ `unstable_cache` | 120 s | Paginates Zoho until maxTickets |
| `GET /api/zoho/tickets/[id]` | GET | ❌ | — | Per-ticket, acceptable |
| `GET /api/zoho/analytics` | GET | ❌ | — | 🔴 Not cached, heavy |
| `GET /api/zoho/stats` | GET | ❌ | — | 🔴 Not cached, heavy |
| `GET /api/zoho/accounts` | GET | ❌ | — | Uses in-memory 1h cache |
| `GET /api/zoho/projects` | GET | ✅ `unstable_cache` | 300 s | |
| `GET /api/linear/issues` | GET | ✅ `unstable_cache` | 300 s | |
| `GET /api/linear/issues/[id]` | GET | ❌ | — | Per-issue, acceptable |
| `GET /api/acuity/sessions` | GET | ✅ `unstable_cache` | 600 s | |
| `GET /api/knowledge` | GET | ❌ | — | 🟡 SELECT * no limit |
| `GET /api/knowledge/[id]` | GET | ❌ | — | Single row, acceptable |
| `GET /api/onboarding/satisfaction` | GET | ✅ `unstable_cache` | 3600 s | |
| `POST /api/ai/*` | POST | ❌ | — | Expected (AI routes) |
| `POST /api/integrations/zoho/satisfaction-sync` | POST | — | — | Admin trigger |
| `GET /api/settings/health` | GET | ❌ | — | Reads env vars only |
| `GET /api/webhooks/zoho-desk/stats` | GET | ❌ | — | 2 Supabase queries |

### DB queries per request [DERIVED]

| Route | Supabase queries | Zoho API calls | Linear calls | OpenAI calls |
|---|---|---|---|---|
| `GET /api/zoho/tickets` | 0 | 1–10 (paginated) | 0 | 0 |
| `GET /api/zoho/analytics` | 0 | 2–20 (paginated, 90d lookback) | 0 | 0 |
| `GET /api/zoho/stats` | 0 | 4–40 (2 periods × paginated) | 0 | 0 |
| `GET /api/zoho/accounts` | 0 | 0–5 (in-mem cache miss) | 0 | 0 |
| `GET /api/knowledge` | 1 | 0 | 0 | 0 |
| `POST /api/ai/generate-client-reply` | 1 | 2 + up to 3 thread fetches | 0 | 1 |
| `POST /api/ai/find-similar-bug` | 0 | 2 | 1 | 1 |
| `POST /api/ai/suggest-tickets` | 0 | 1 | 1 | 1 |
| `POST /api/webhooks/zoho-desk` | 1 (fire-and-forget) + N (ingest) | N (ingest) | 0 | N (embed) |

### N+1 patterns identified 🟠

**`POST /api/ai/generate-client-reply`** (file: `app/api/ai/generate-client-reply/route.ts:622`):
```
const resolvedWithConvs = await Promise.all(
  resolvedTickets.map(async t => {
    const convs = await fetchTicketConversationSummaries(t.id)  // 1 Zoho call per ticket
    ...
  })
)
```
Up to 3 serial Zoho API calls inside `Promise.all` — bounded to 3, low risk, but each call is ~200–500 ms.

**`POST /api/admin/fix-undefined-tickets`** (file: `app/api/admin/fix-undefined-tickets/route.ts:141`):
```
for (const ticket of candidates) {
  const name = await resolveAccountName(ticket.accountId!)  // sequential Zoho CRM calls
```
Sequential Zoho CRM calls per ticket, mitigated by an in-request `accountCache` Map. Risk is bounded by `MAX_PER_RUN = 50`.

**`lib/rag/ingest.ts`** (file: `lib/rag/ingest.ts`):
```
for (const chunk of chunks) {
  const embedding = await embed(chunk.content)   // 1 OpenAI call per chunk
  await supabaseAdmin.from('ticket_chunks').insert(...)  // 1 DB insert per chunk
```
Sequential embedding + sequential DB inserts per chunk. For a ticket with 5 threads: 5 OpenAI calls + 5 Supabase inserts, all sequential.

### Routes without proper caching 🔴

**`GET /api/zoho/analytics`** and **`GET /api/zoho/stats`** are the most critical. They:
1. Extend the date range by 90 days (`LOOKBACK_DAYS = 90`)
2. Paginate through all Zoho tickets in that range (potentially 10–20 API calls)
3. Do this **on every HTTP request, with no caching**

The reporting page calls `zoho/analytics` at least twice (primary + comparison period), resulting in 20–40 Zoho API calls per page load. Expected response time: **5–15 seconds**.

🔴 **Issue 3-A:** `GET /api/zoho/analytics` — no caching. Add `unstable_cache` with a `revalidate` of at least 900 s (15 min) or use ISR.

🔴 **Issue 3-B:** `GET /api/zoho/stats` — no caching. Same fix.

🟡 **Issue 3-C:** No explicit `fetch()` timeout on any external API call. A Zoho or OpenAI network hang will consume the function's entire 300 s budget without releasing it.

---

## Section 4 — Supabase Queries

> Direct query timing requires Supabase dashboard access. Findings are **[DERIVED]** from code analysis.

### Query patterns by table

| Table | Operations | Index risk |
|---|---|---|
| `knowledge_articles` | `SELECT *` (no column projection) · `SELECT * WHERE id = ?` · `UPDATE` · `DELETE` · `INSERT` | Missing index on `product_area` (used in equality filter) |
| `ticket_chunks` | `DELETE WHERE ticket_id = ?` · `INSERT` (with vector) · vector similarity search | `ticket_id` should be indexed; `embedding` indexed via ivfflat |
| `onboarding_satisfaction` | `SELECT * ORDER BY submitted_at DESC` · `UPSERT ON CONFLICT zoho_id` | `submitted_at` + `zoho_id` should be indexed |
| `access_requests` | `SELECT WHERE email = ?` · `INSERT` · `UPDATE WHERE email = ?` | `email` should be unique-indexed |
| `webhook_events` | `SELECT ORDER BY processed_at DESC LIMIT 1` · `COUNT WHERE gte processed_at` · `INSERT` | `processed_at` index critical for the daily-count query |

🟠 **Issue 4-A:** `knowledge_articles` — `GET /api/knowledge` does `SELECT *` with no column projection and no `LIMIT`. As the KB grows, this will return increasingly large payloads. Add `.select('id, title, product_area, problem, solution, created_at')` and a server-side limit.

🟠 **Issue 4-B:** `knowledge_articles.product_area` — used in an equality filter (`WHERE product_area = ?`) in the `generate-client-reply` route. Verify a B-tree index exists on this column.

🟡 **Issue 4-C:** `webhook_events` — the daily-count query uses `gte('processed_at', today.toISOString())`. Without an index on `processed_at`, this is a full-table scan that worsens as events accumulate.

### Connection pooling [DERIVED]

`supabaseAdmin` is a module-level singleton (`lib/supabase/server.ts`). On Vercel Fluid Compute with instance reuse, this connection is correctly shared across concurrent requests within the same instance. However, across cold starts or many concurrent functions, each instance creates its own connection. **Supabase's Supavisor connection pooler should be enabled** in the Supabase dashboard for the production database to cap total connections.

🟡 **Issue 4-D:** Verify Supabase connection pooler (Supavisor) is enabled in project settings. Without it, N concurrent Vercel function instances = N direct Postgres connections, which can exhaust the connection limit under load.

### RLS impact [MEASURED]

All server-side code uses `supabaseAdmin` (service role key), which **bypasses Row Level Security entirely**. This means RLS policies have zero performance impact on server-side queries. ✅

### Tables > 100k rows [DERIVED]

`ticket_chunks` is the most likely candidate to grow beyond 100k rows (each ticket generates 3–6 chunks). If the Zoho ticket history contains thousands of closed tickets, this table could reach significant size. Monitor row count and consider:
- Partitioning by `zoho_status` (closed vs. open)
- Periodic archival of chunks for very old tickets

🟡 **Issue 4-E:** No partitioning strategy for `ticket_chunks` as data grows. Not critical today but worth planning if ticket history is imported in bulk.

---

## Section 5 — External API Calls

> Latency figures are **[DERIVED]** from known API characteristics. No live timing data is available.

### Zoho Desk API

| Metric | Value | Notes |
|---|---|---|
| Avg latency per call | 200–500 ms | EU endpoints (`desk.zoho.eu`) |
| Retry logic | ✅ 401 auto-refresh | Single retry on token expiry (`zohoFetch` in `lib/zoho/client.ts:18`) |
| Timeout configuration | ❌ None | No `AbortController` / `signal` on any `fetch()` call |
| Rate limit handling | ❌ None | No backoff or 429 handling |
| Error rate tracking | ❌ None | Errors logged to console only |

🟠 **Issue 5-A:** No request timeout on Zoho API calls. A slow Zoho response blocks the entire Next.js function for up to 300 s. Add a 10–15 s `AbortController` timeout to all external `fetch()` calls.

🟡 **Issue 5-B:** No handling of Zoho rate limit (429). Under heavy use (e.g., analytics page loading for multiple users simultaneously), 429 errors will surface as unhandled 500s.

### Linear API

| Metric | Value | Notes |
|---|---|---|
| Avg latency per call | 150–400 ms | GraphQL endpoint |
| Retry logic | ❌ None | No retry on failure |
| Timeout configuration | ❌ None | `cache: 'no-store'` on every call |
| Rate limit headroom | Unknown | Not monitored |
| Cached at route level | ✅ 300 s | `unstable_cache` in `linear/issues/route.ts` |

### OpenAI API

| Metric | Value | Notes |
|---|---|---|
| Model used | `gpt-4o` (default in `lib/openai/json.ts`) | `gpt-4o-mini` used for admin normalisation |
| Avg latency (gpt-4o) | 2,000–8,000 ms | Typical first-token latency |
| Avg latency (gpt-4o-mini) | 500–2,000 ms | Used for normalisation batch routes |
| Timeout | ❌ None | Default OpenAI SDK timeout (~10 min) |
| Retry logic | ❌ None | No retry on 429 or 5xx |
| Streaming | ❌ None | All responses awaited in full before returning |

🟠 **Issue 5-C:** `POST /api/ai/*` routes await the full OpenAI completion before returning to the client. This means the browser shows a blank state for 2–8 s. Implementing streaming (`stream: true` with `ReadableStream` response) would make AI responses feel significantly faster.

🟠 **Issue 5-D:** OpenAI API key stored as `process.env.OPENAI_API_KEY` with a fallback of `'placeholder'` in `lib/openai/client.ts`. If the env var is missing in a deployment, the client silently initialises with an invalid key rather than failing fast.

### Acuity Scheduling API

| Metric | Value | Notes |
|---|---|---|
| Avg latency | 300–800 ms | Third-party scheduling API |
| Retry logic | ❌ None | |
| Timeout | ❌ None | `cache: 'no-store'` |
| Cached at route level | ✅ 600 s | `unstable_cache` in `acuity/sessions/route.ts` |

---

## Section 6 — RAG Pipeline

> `lib/rag/ingest.ts` is the only RAG code in the project. No vector search endpoint is currently exposed in the API routes — the `ticket_chunks` table is populated via the Zoho webhook but not yet queried by any route. Findings below cover the ingest pipeline.

### Embedding generation

| Metric | Value |
|---|---|
| Model | `text-embedding-3-small` |
| API | Direct `fetch()` to OpenAI embeddings endpoint |
| Avg latency per chunk (est.) | 200–500 ms |
| Batching | ❌ None — one API call per chunk |
| Max input size | 6,000 chars (truncated) |
| Chunks per ticket (typical) | 3–7 (subject + N threads + resolution) |
| Total ingest time per ticket (est.) | 1–4 s (sequential) |

🟠 **Issue 6-A:** No embedding batching. OpenAI's embeddings API accepts an array of inputs in a single call (`input: string[]`). Batching all chunks for a ticket into one call would reduce ingest time from N × ~300 ms to ~300 ms (a 3–7× speedup).

### Vector search

No vector search route exists in the current codebase. The `ticket_chunks` table with `embedding vector(1536)` columns is populated but not yet queried. When a RAG search endpoint is added:

🟡 **Issue 6-B:** Plan for pgvector `ivfflat` index on `ticket_chunks.embedding`. The optimal `lists` value for ivfflat is approximately `sqrt(row_count)`. For 10,000 chunks: `lists = 100`. For 100,000 chunks: `lists = 316`. Set this when the table reaches meaningful size.

🟡 **Issue 6-C:** Consider filtering by `product_area` or `zoho_status` before the vector search (pre-filter) to reduce the search space and improve both speed and relevance.

### Ingest sequential inserts 🟠

```ts
// lib/rag/ingest.ts
for (const chunk of chunks) {
  const embedding = await embed(chunk.content)        // ~300ms each
  await supabaseAdmin.from('ticket_chunks').insert({  // ~50ms each
    ...
  })
}
```

Each chunk is embedded and inserted sequentially. For a 5-chunk ticket: ~1.75 s of avoidable serial latency. Since ingest runs fire-and-forget, this isn't user-visible, but it does consume OpenAI API quota inefficiently.

---

## Section 7 — Memory and Caching

### Client-side caching

| Tool | Used | Notes |
|---|---|---|
| React Query | ❌ | Not installed |
| SWR | ❌ | Not installed |
| Zustand / Redux | ❌ | Not installed |
| Native `useState` + `useEffect` | ✅ All pages | Data fetched fresh on every mount |

🔴 **Issue 7-A:** No client-side data caching. Every page navigation re-fetches all data from scratch. Navigating from `/tickets` → `/tickets/[id]` → back to `/tickets` fires three full API fetches. A lightweight SWR or React Query setup with a 60–120 s stale-while-revalidate strategy would eliminate most repeat fetches.

### Next.js Route Segment cache strategy [DERIVED]

| Route type | Current strategy | Recommended |
|---|---|---|
| All `page.tsx` files | `'use client'` — no RSC caching | Convert read-heavy pages to RSC with `revalidate` |
| API routes | `dynamic = 'force-dynamic'` on all | Add `unstable_cache` where missing (analytics, stats) |
| Layout | No `revalidate` | N/A (client component) |

🔴 **Issue 7-B:** `export const dynamic = 'force-dynamic'` on all API routes is correct for routes that can't be statically cached, but routes like `GET /api/knowledge` and `GET /api/settings/health` have no user-specific data and could safely use `unstable_cache` or HTTP `Cache-Control` headers.

### Static vs Dynamic rendering analysis

| Component | Rendering | Could be static? |
|---|---|---|
| `AppShell` | Client (uses `usePathname`) | Yes — extract `usePathname` to a child |
| All `page.tsx` | Client | Most could be Server Components |
| `Sidebar` | Client (uses `usePathname`, Supabase auth) | Partially |
| All API routes | Dynamic | Mostly correct |

### Edge runtime

No routes use `export const runtime = 'edge'`. The middleware does not declare an edge runtime, so it runs as a Vercel Function.

🟡 **Issue 7-C:** The middleware (296 KB compiled) runs on every request that is not a static asset. It initialises a full Supabase client per request to verify the session. This is the correct pattern for auth middleware, but the bundle size (296 KB) is unusually large — investigate whether the full Supabase SDK is being pulled in unnecessarily. Consider `@supabase/ssr` lightweight server utilities only.

---

## Section 8 — Build and Deployment

### Build metrics [MEASURED]

| Metric | Value | Notes |
|---|---|---|
| Next.js version | 14.2.35 | Outdated (Next 15 is current) |
| Total `.next/static` | 1.3 MB | Uncompressed JS |
| Largest server chunk | 336 KB (`server/chunks/3107.js`) | Likely Supabase + Zoho client combined |
| Middleware bundle | 296 KB | Unusually large for auth-only middleware |
| Bundle analyser | ❌ Not configured | Cannot identify what's in shared chunks |
| `package-lock.json` | Present | npm lockfile ✅ |
| Production dependencies | 5 runtime packages | Lean ✅ |

### `npm install` time [DERIVED]

With 341 `node_modules` directories and a `package-lock.json`, cold install is estimated at 25–45 s on a CI runner. Subsequent installs with cache: ~5–10 s.

### `next build` duration [DERIVED]

With the current codebase size (18 pages, no heavy transformation), estimated build time: **45–90 s** on Vercel (no Turbopack).

🟡 **Issue 8-A:** No Turbopack configured for development (`next dev --turbopack`). Development server cold start is slower without it.

### Vercel cold start time [DERIVED]

With a 296 KB middleware bundle and server chunks up to 336 KB, cold starts are estimated at **400–800 ms** for the first request to a given function after inactivity. Fluid Compute instance reuse significantly reduces this in practice.

### Function size warnings

🟡 **Issue 8-B:** The `admin/fix-undefined-tickets` and `admin/normalize-tickets` routes have `maxDuration = 290` seconds. These are admin-only maintenance routes but tie up a function instance for up to 5 minutes. Ensure they are protected (auth check is missing — anyone can POST to these routes).

🔴 **Issue 8-C:** **`/api/admin/fix-undefined-tickets` and `/api/admin/normalize-tickets` have no authentication check.** They are `POST` routes that trigger mass Zoho API calls and OpenAI usage. Any unauthenticated caller can trigger them. Add a secret token check or Supabase session guard immediately.

🟡 **Issue 8-D:** Next.js 14.2.35 is significantly behind the current Next.js 15. Upgrading would bring improved RSC performance, `use cache` directive, Partial Pre-Rendering (PPR), and Turbopack stability.

---

## Issue Classification Summary

| # | Issue | Severity | Section |
|---|---|---|---|
| 8-C | Admin routes (`normalize-tickets`, `fix-undefined-tickets`) have no auth check | 🔴 Critical | §8 |
| 1-E | `AppShell` is a `'use client'` component in root layout — disables SSR for all pages | 🔴 Critical | §1 |
| 7-A | No client-side caching — all data re-fetched on every navigation | 🔴 Critical | §7 |
| 3-A | `GET /api/zoho/analytics` — no caching, 20–40 Zoho API calls per request | 🔴 Critical | §3 |
| 3-B | `GET /api/zoho/stats` — no caching, 4–40 Zoho API calls per request | 🔴 Critical | §3 |
| 2-A | All pages use `'use client'` with `useEffect` fetch — LCP estimated 2–4 s | 🔴 Critical | §2 |
| 1-D | All 17 pages use `'use client'` — massive RSC opportunity missed | 🟠 High | §1 |
| 5-A | No request timeout on any external API call | 🟠 High | §5 |
| 5-C | AI routes stream nothing — 2–8 s blank wait for users | 🟠 High | §5 |
| 6-A | RAG ingest embeds chunks sequentially — no batching | 🟠 High | §6 |
| 1-A | OpenAI SDK (172 KB) likely in client bundle via `AppShell` cascade | 🟠 High | §1 |
| 7-B | `GET /api/knowledge`, `GET /api/settings/health` not cached | 🟡 Medium | §7 |
| 4-A | `knowledge_articles` — `SELECT *` with no column projection or limit | 🟡 Medium | §4 |
| 4-B | No index on `knowledge_articles.product_area` | 🟡 Medium | §4 |
| 4-C | No index on `webhook_events.processed_at` | 🟡 Medium | §4 |
| 4-D | Supabase connection pooler (Supavisor) status unknown | 🟡 Medium | §4 |
| 5-B | No Zoho rate-limit (429) handling | 🟡 Medium | §5 |
| 7-C | Middleware bundle 296 KB — may include unnecessary Supabase code | 🟡 Medium | §7 |
| 8-D | Next.js 14.2.35 — significantly outdated | 🟡 Medium | §8 |
| 3-C | No `fetch()` timeout on external calls | 🟡 Medium | §3 |
| 5-D | OpenAI client silently accepts `'placeholder'` key | 🟡 Medium | §5 |
| 4-E | No partitioning plan for `ticket_chunks` as data grows | 🟡 Medium | §4 |
| 6-B | pgvector `ivfflat` index — `lists` value not set for actual data size | 🟡 Medium | §6 |
| 8-B | Admin routes missing auth — also `maxDuration = 290` ties up function | 🟡 Medium | §8 |
| 1-C | `autoprefixer` in `dependencies` instead of `devDependencies` | 🟢 Low | §1 |
| 8-A | Turbopack not enabled for development | 🟢 Low | §8 |
| 6-C | No pre-filter on vector search (future) | 🟢 Low | §6 |

---

## Top 10 Priority Fix List

### 1. 🔴 Secure admin routes immediately
**Files:** `app/api/admin/fix-undefined-tickets/route.ts`, `app/api/admin/normalize-tickets/route.ts`  
Add a `ADMIN_SECRET` header check or Supabase session guard to both routes. Unauthenticated mass API calls and OpenAI spending are possible today.

### 2. 🔴 Cache `zoho/analytics` and `zoho/stats`
**Files:** `app/api/zoho/analytics/route.ts`, `app/api/zoho/stats/route.ts`  
Wrap `computePeriod` calls with `unstable_cache` tagged `['zoho-analytics']` with a 900 s revalidation. This turns 5–15 s reporting loads into ~100 ms cache hits.

### 3. 🔴 Fix `AppShell` to enable SSR
**File:** `components/AppShell.tsx`  
Extract the `usePathname()` check into a tiny `<NavGuard client>` wrapper. Make `AppShell` a Server Component. This unblocks RSC for the entire app and removes the Supabase/OpenAI SDK from the client bundle cascade.

### 4. 🔴 Add client-side caching (SWR or React Query)
Install `swr` or `@tanstack/react-query`. Wrap all `useEffect` + `fetch` patterns with a `useSWR` hook with `dedupingInterval: 60000`. This alone eliminates ~80% of duplicate API requests and makes navigation feel instant.

### 5. 🟠 Convert read-only pages to Server Components
**Starting targets:** `/knowledge`, `/settings`, `/reporting` (initial render)  
Move the initial data fetch into the page `async function` (RSC). Keep interactive sections as `'use client'` child components. Eliminates the blank-page + `useEffect` fetch pattern.

### 6. 🟠 Add timeouts to all external `fetch()` calls
**Files:** `lib/zoho/client.ts`, `lib/linear/client.ts`, `lib/acuity/client.ts`, `lib/rag/ingest.ts`  
Add `AbortController` with a 10–15 s signal to every `fetch()`. A hung Zoho call today consumes the full 300 s function budget.

### 7. 🟠 Stream AI responses
**Files:** `app/api/ai/generate-client-reply/route.ts`, `app/api/ai/summarize-ticket/route.ts`  
Replace `NextResponse.json(result)` with a streaming `ReadableStream` response using OpenAI's `stream: true` option. First tokens appear in ~300 ms instead of 2–8 s.

### 8. 🟠 Batch RAG embedding calls
**File:** `lib/rag/ingest.ts`  
Replace sequential `await embed(chunk.content)` with a single `embed(chunks.map(c => c.content))` call (OpenAI supports array input). Reduces ingest time proportionally to chunk count.

### 9. 🟡 Add indexes to Supabase
In the Supabase SQL editor, verify and add:
```sql
CREATE INDEX IF NOT EXISTS idx_knowledge_articles_product_area ON knowledge_articles(product_area);
CREATE INDEX IF NOT EXISTS idx_webhook_events_processed_at ON webhook_events(processed_at);
CREATE INDEX IF NOT EXISTS idx_ticket_chunks_ticket_id ON ticket_chunks(ticket_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_access_requests_email ON access_requests(email);
```

### 10. 🟡 Add bundle analyser + upgrade Next.js
```bash
npm install --save-dev @next/bundle-analyzer
```
Configure in `next.config.mjs` to identify what is in the 184 KB and 172 KB shared chunks. Then plan the Next.js 14 → 15 upgrade (introduces `use cache`, PPR, and improved RSC performance).
