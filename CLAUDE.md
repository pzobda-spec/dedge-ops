# DEDGE OPS

Next14 AppRouter · TS · Tailwind · Supabase
Prod: https://dedge-ops-6zer.vercel.app

## NEVER
- Write Zoho CRM
- Call Zoho token endpoint outside app (kills cache)
- UI english / dates non-DD/MM/YYYY

## AUTH
Magic link. No password.
middleware.ts blocks all except /login /auth/* /api/auth/*
ADMIN_EMAIL = Pablo, skip approval, shouldCreateUser:true
Others: access_requests table → approve in /settings → inviteUserByEmail
Callback URL = NEXT_PUBLIC_APP_URL env (https://dedge-ops-6zer.vercel.app). Fallback: host header.
Supabase site URL + redirect must match prod URL.
access_requests needs `grant all to anon` (PostgREST cache).
Rate limit 3 emails/h. Don't spam.

## ZOHO DESK
Org 20063299426
Support dept 5861000000007061 · CSM 5861000019985859 (hide from UI)
OAuth → ZOHO_REFRESH_TOKEN (accounts.zoho.eu)

## ZOHO CRM
ZOHO_CRM_REFRESH_TOKEN · read only
MRR: Strategic>4k Gold≥750 Silver≥200 Bronze<200
Cache 1h: lib/zoho/accountCache.ts

## LINEAR
Dashboard Bugs · workspace loungeup · team BUGS
https://linear.app/loungeup/issue/{id}/{slug}

## ACUITY
Sessions by classID · hotel = "Company Name"

## RISK SCORE 0-100
Strategic+40 Gold+30 Silver+15 Bronze+0 unknown+10
age>48h+25 >24h+15 >8h+8 · negative+20 · urgent+20 high+10 · reopened+10

## CACHE
tickets 2min · linear 5min · projects 5min · acuity 10min
invalidate by tag on mutations
TODO: parallelize while-loop pagination (tickets + CRM)

## TODO
- RAG webhook: app/api/webhooks/zoho-desk · table ticket_chunks (pgvector) · lib/rag/ingest.ts · enable pgvector first
- Desk stats: 7d/30d volume, status split, FCR, response/resolution time
