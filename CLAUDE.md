# D-EDGE Ops Cockpit — CLAUDE.md

## Contexte

Cockpit opérationnel pour Pablo Zobda (Support/Education/Onboarding manager, D-EDGE CRM).
Stack : Next.js 14 App Router · TypeScript · Tailwind · Supabase

---

## Règles absolues

- **Ne jamais écrire dans Zoho CRM** (lecture seule)
- UI en **français**, dates en **DD/MM/YYYY**
- Pas d'authentification

---

## Architecture

### Zoho Desk
- Org ID : `20063299426`
- Dept Support : `5861000000007061` — Dept CSM `5861000019985859` (ne pas afficher dans tickets)
- Auth : OAuth refresh token (`accounts.zoho.eu`) · Token : `ZOHO_REFRESH_TOKEN`
- ⚠️ Ne jamais appeler l'endpoint token hors de l'app (invalide le cache serveur)

### Zoho CRM
- Token : `ZOHO_CRM_REFRESH_TOKEN` — lecture seule
- Segment MRR : Strategic >4000€, Gold ≥750€, Silver ≥200€, Bronze <200€
- Cache 1h : `lib/zoho/accountCache.ts`

### Linear
- Workspace `loungeup`, team `BUGS`
- URL : `https://linear.app/loungeup/issue/{identifier}/{slug}`

### Acuity
- Sessions groupées par `classID`, hôtel via champ "Company Name"

---

## Score de risque (tickets)

Score 0–100 · Segment : Strategic +40, Gold +30, Silver +15, Bronze +0, inconnu +10
· Âge (`lastClientMessageAt`) : >48h +25, >24h +15, >8h +8 · Sentiment négatif +20
· Priorité urgent/haute +20/+10 · Statut réouvert +10

---

## Performance

API routes cachées via `unstable_cache` (Next.js Data Cache, partagé inter-instances Vercel) :
- Tickets 2 min · Linear 5 min · Projects 5 min · Acuity 10 min
- Invalidation par tag aux mutations (reply, update, create, normalize)
- **TODO perf** : paralléliser la pagination while-loop des tickets et CRM accounts (cold start)

---

## Fait / À faire

**Fait** : tickets Support, score risque, détail + conversations, réponse directe, actions IA, escalades Linear, formations Acuity, projets Zoho, liens externes, board Onboarding (filtre owner + lien projet)

**À faire** :
- Webhook RAG : `app/api/webhooks/zoho-desk/route.ts`, table `ticket_chunks` (Supabase pgvector `text-embedding-3-small`), `lib/rag/ingest.ts` — vars `ZOHO_WEBHOOK_SECRET/ID`, `NEXT_PUBLIC_APP_URL` — activer pgvector d'abord
- Stats Zoho Desk : volume 7j/30j, répartition statuts, FCR, temps réponse/résolution
