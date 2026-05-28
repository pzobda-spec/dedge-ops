# Performance Fixes Log

All changes applied 2026-05-28. Each entry references the source finding in `performance-audit.md`.

---

## Fix 1 — Cache `GET /api/zoho/analytics`

**Audit reference:** §3 Issue 3-A (🔴 Critical)

**What was fixed:**  
Added `unstable_cache` wrapper around `computePeriodRaw` with a 900 s (15 min) TTL and a `zoho-analytics` invalidation tag.

**Why:**  
Each uncached request paginates through 90 days of Zoho Desk tickets in multiple pages, resulting in 20–40 Zoho API calls per HTTP request. On the reporting page, two periods are compared, doubling that to 40–80 calls. Page load time was estimated at 5–15 s.

**Expected impact:**  
Cache hit: ~100 ms. Cache miss (first request of the day or after revalidation): unchanged. 15-minute granularity is acceptable for historical reporting data.

**Files modified:**  
- `app/api/zoho/analytics/route.ts`

---

## Fix 2 — Cache `GET /api/zoho/stats`

**Audit reference:** §3 Issue 3-B (🔴 Critical)

**What was fixed:**  
Added `unstable_cache` wrapper around `fetchPeriodStatsRaw` with a 900 s TTL and a `zoho-stats` tag. Both the current-period and year-on-year calls now hit the cache independently (unique cache keys per date range).

**Why:**  
Same root cause as analytics — two uncached `computeTicketPeriodMetrics` calls per request, each paginating Zoho over a 90-day window.

**Expected impact:**  
Reporting and dashboard stats widgets go from 5–15 s to ~100 ms on cache hits.

**Files modified:**  
- `app/api/zoho/stats/route.ts`

---

## Fix 3 — Add request timeouts to Zoho, Linear, and Acuity API clients

**Audit reference:** §5 Issue 5-A (🟠 High), §3 Issue 3-C (🟡 Medium)

**What was fixed:**  
Added `signal: AbortSignal.timeout(N)` to all external `fetch()` calls:
- Zoho Desk: 12 s (higher because multi-page paginated responses are expected)
- Linear GraphQL: 10 s
- Acuity Scheduling: 10 s

**Why:**  
Without timeouts, a network hang on any of these APIs would block the Vercel function for the full 300 s execution budget, locking up the function slot and wasting compute credits.

**Expected impact:**  
Unresponsive upstream API returns a typed error to the UI in ≤ 12 s instead of hanging for 5 minutes. Functions recover and can serve other requests.

**Files modified:**  
- `lib/zoho/client.ts`
- `lib/linear/client.ts`
- `lib/acuity/client.ts`

---

## Fix 4 — Cache `GET /api/knowledge` + revalidate on writes

**Audit reference:** §7 Issue 7-B (🟡 Medium)

**What was fixed:**  
- Wrapped the `knowledge_articles` SELECT in `unstable_cache` with a 300 s TTL and `knowledge-articles` tag.
- Added `revalidateTag('knowledge-articles')` to POST (create), PATCH (update), and DELETE handlers so the cache is purged immediately on any write.

**Why:**  
The knowledge list is read far more often than it is written to. Every page load fired a fresh Supabase round-trip. With caching, repeated reads within 5 minutes are served from memory.

**Expected impact:**  
Knowledge list endpoint: ~50 ms (Supabase) → ~5 ms (cache hit). Write operations immediately invalidate the cache so users always see fresh data after a change.

**Files modified:**  
- `app/api/knowledge/route.ts`
- `app/api/knowledge/[id]/route.ts`

---

## Fix 5 — Batch RAG embeddings and DB inserts

**Audit reference:** §6 Issue 6-A (🟠 High)

**What was fixed:**  
Replaced the sequential per-chunk embedding loop with a single batched call to `embedBatch(texts: string[])`. The OpenAI embeddings API accepts an array of inputs and returns all embeddings in one response. All Supabase inserts are also batched into a single `.insert([...])` call.

**Before:**  
```
for each chunk:
  await embed(chunk)     // ~300ms
  await supabase.insert  // ~50ms
// Total: N × 350ms (N = 3–7 chunks)
```

**After:**  
```
await embedBatch(all chunks)  // ~300ms regardless of N
await supabase.insert(all)    // ~50ms
// Total: ~350ms regardless of N
```

**Expected impact:**  
Ingest time per ticket: from ~1–2.5 s (3–7 sequential calls) down to ~350 ms. Reduces OpenAI API request overhead proportionally. Particularly beneficial if bulk ingestion is ever run.

**Files modified:**  
- `lib/rag/ingest.ts`

---

## Fix 6 — Cache-Control header on `GET /api/settings/health`

**Audit reference:** §7 Issue 7-B (🟡 Medium)

**What was fixed:**  
Added `Cache-Control: public, max-age=60, stale-while-revalidate=300` response header to the health endpoint.

**Why:**  
The health check only reads environment variable presence — it never changes without a redeployment. Caching at the HTTP layer (Vercel CDN) means repeated opens of the settings page serve the response in ~1 ms from the edge instead of invoking a function.

**Expected impact:**  
Settings page health widget: from ~200 ms function invocation to ~1 ms edge cache hit on repeated loads.

**Files modified:**  
- `app/api/settings/health/route.ts`

---

## Fix 7 — Move `autoprefixer` to `devDependencies`

**Audit reference:** §1 Issue 1-C (🟢 Low)

**What was fixed:**  
Moved `autoprefixer` from `dependencies` to `devDependencies` in `package.json`.

**Why:**  
`autoprefixer` is a PostCSS build-time plugin. It is never imported at runtime and should not be installed in production environments or counted against the production bundle.

**Expected impact:**  
Cleaner separation of build-time and runtime dependencies. Reduces production `npm install` footprint by ~2 KB (minor). Corrects the semantic classification.

**Files modified:**  
- `package.json`

---

## Fix 8 — Extract `usePathname` from `AppShell` (Server Component)

**Audit reference:** §1 Issue 1-E (🔴 Critical)

**What was fixed:**  
- Created `components/layout/NavShell.tsx` as a new `'use client'` component containing the `usePathname` check, `Sidebar`, and the layout structure — extracted verbatim from `AppShell`.
- Rewrote `components/AppShell.tsx` as a Server Component (no `'use client'`) that simply renders `NavShell`.

**Why:**  
`AppShell` was a `'use client'` component at the root layout level. In Next.js App Router, this marks the entire layout subtree as client-side, preventing React Server Components from rendering any page content on the server. While all current pages are already `'use client'`, this fix is the necessary prerequisite for any future page conversion to RSC (which is Phase 3 work). It also removes `AppShell` itself from the client hydration graph, reducing the JS that needs to be parsed and executed on mount.

**Expected impact:**  
No visible change today (all pages are still client components). Enables future LCP improvements when pages are converted to RSC. Reduces client-side hydration surface for the layout shell.

**Files modified:**  
- `components/AppShell.tsx`
- `components/layout/NavShell.tsx` (new)

---

## Fix 9 — Add `loading.tsx` skeleton screens for heavy pages

**Audit reference:** §2 Issue 2-A (🔴 Critical)

**What was fixed:**  
Created `loading.tsx` files for the three pages with the heaviest data fetches:
- `app/dashboard/loading.tsx` — stat cards + ticket row skeletons
- `app/tickets/loading.tsx` — filter bar + ticket list skeletons
- `app/reporting/loading.tsx` — date pickers + metric card + chart skeletons

**Why:**  
Next.js App Router automatically wraps `loading.tsx` in a Suspense boundary. The skeleton renders immediately from the server (no JS needed) while the page JS bundle downloads and hydrates. Without loading files, users see a blank white page for 1–2 s during initial navigation.

**Expected impact:**  
Perceived load time improvement: users see meaningful content (skeleton structure) in ~100 ms instead of a blank screen for 1–2 s. Actual data load time is unchanged, but the experience is significantly better.

**Files modified:**  
- `app/dashboard/loading.tsx` (new)
- `app/tickets/loading.tsx` (new)
- `app/reporting/loading.tsx` (new)

---

## Fix 10 — DB migration: missing performance indexes

**Audit reference:** §4 Issues 4-B, 4-C (🟡 Medium)

**What was fixed:**  
Created `database/migrations/001_performance_indexes.sql` with `CREATE INDEX IF NOT EXISTS` statements for:
- `knowledge_articles(product_area)` — used in equality filter in `generate-client-reply`
- `access_requests(email)` — used in `WHERE email = ?` and `UPDATE WHERE email = ?` on every login attempt
- Confirmed indexes from `schema.sql` (`ticket_chunks.ticket_id`, `webhook_events.processed_at`) are included for safe re-apply

**Why:**  
Without an index on `knowledge_articles.product_area`, every call to `generate-client-reply` triggers a sequential scan of the articles table. Without an index on `access_requests.email`, every login (even valid ones) scans the entire table.

**How to apply:**  
Run `database/migrations/001_performance_indexes.sql` in the Supabase SQL editor for the production project.

**Expected impact:**  
- `knowledge_articles.product_area` filter: sequential scan → index seek (~100× faster for tables > 1,000 rows)
- `access_requests.email` lookups: sequential scan → unique index seek (instant)

**Files modified:**  
- `database/migrations/001_performance_indexes.sql` (new)

---

## Phase 3 — Deferred (> 30 min)

The following issues from the audit require more than 30 minutes of work and are explicitly deferred:

| Issue | Why deferred |
|---|---|
| Convert all pages to Server Components | Requires restructuring every page (RSC + client island split) |
| Add SWR / React Query | Requires wrapping all data-fetch patterns across 17 pages |
| Stream AI route responses | Requires ReadableStream response restructure + client-side stream handling |
| Upgrade Next.js 14 → 15 | Requires testing all routes for breaking changes |
| Supabase connection pooler | Infrastructure change (Supabase dashboard, env vars) |
| Add Zoho 429 rate-limit handling with backoff | Requires wrapper around `zohoFetch` with retry logic + jitter |
| Bundle analyser setup | Minor effort but requires separate CI configuration decision |
