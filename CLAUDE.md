# D-EDGE Ops

Stack: Next.js 14 App Router · TS · Tailwind · Supabase
Prod: https://dedge-ops-6zer.vercel.app

## Rules
- Zoho CRM = READ ONLY, never write
- UI français, dates DD/MM/YYYY
- Never call Zoho token endpoint outside app (kills server cache)

## Auth (Supabase magic link)
- middleware.ts protects all routes except /login /auth/* /api/auth/*
- Magic link flow: /login → /api/auth/login → OTP email → /auth/callback → /dashboard
- ADMIN_EMAIL env = Pablo, bypasses approval, shouldCreateUser:true
- Others: insert access_requests → admin approves in /settings → inviteUserByEmail
- Callback URL: uses NEXT_PUBLIC_APP_URL env (= https://dedge-ops-6zer.vercel.app). Fallback: host header
- Supabase: Site URL = https://dedge-ops-6zer.vercel.app, redirect = https://dedge-ops-6zer.vercel.app/auth/callback
- Table access_requests needs grant to anon role (PostgREST schema cache)
- Rate limit: ~3 emails/h free tier. Don't spam during debug

## Zoho Desk
- Org: 20063299426
- Dept Support: 5861000000007061 — CSM: 5861000019985859 (hidden in tickets)
- OAuth refresh token (accounts.zoho.eu) → ZOHO_REFRESH_TOKEN

## Zoho CRM
- ZOHO_CRM_REFRESH_TOKEN, read only
- MRR: Strategic >4000€, Gold ≥750€, Silver ≥200€, Bronze <200€
- Cache 1h: lib/zoho/accountCache.ts

## Linear
- Workspace loungeup, team BUGS
- URL: https://linear.app/loungeup/issue/{id}/{slug}

## Acuity
- Sessions grouped by classID, hotel = "Company Name" field

## Risk score (tickets)
0–100. Segment: Strategic+40 Gold+30 Silver+15 Bronze+0 unknown+10
Age (lastClientMessageAt): >48h+25 >24h+15 >8h+8
Negative sentiment+20, urgent/high prio+20/+10, reopened+10

## Cache
unstable_cache: tickets 2min, Linear 5min, Projects 5min, Acuity 10min
Invalidation by tag on mutations.
TODO: parallelize while-loop pagination (tickets + CRM accounts)

## Done / Todo
Done: tickets, risk score, detail+convos, reply, AI actions, Linear escalations, Acuity trainings, Zoho projects, onboarding board

Todo:
- Webhook RAG: app/api/webhooks/zoho-desk/route.ts, table ticket_chunks (pgvector text-embedding-3-small), lib/rag/ingest.ts — vars ZOHO_WEBHOOK_SECRET/ID — enable pgvector first
- Zoho Desk stats: 7d/30d volume, status breakdown, FCR, response/resolution time
