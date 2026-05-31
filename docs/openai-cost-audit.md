# OpenAI Cost Audit

Date: 2026-05-31

## Synthese urgente

- Incident signale: le 24 mai, la cle API `dedgecockpit` a genere 1142 requetes GPT-5 pour 12.30 USD.
- Recherche code: aucun literal `gpt-5` trouve dans `app/`, `lib/`, `scripts/` ou l'historique Git local (`git log -S "gpt-5"`).
- Risque identifie: le helper historique `lib/openai/json.ts` utilisait `gpt-4o` par defaut. Si la plateforme ou un alias externe a route vers GPT-5, le code ne le bloquait pas.
- Correctif applique: tous les appels OpenAI chat de l'app passent par `OPENAI_CHAT_MODEL = 'gpt-4o-mini'`, et `lib/openai/client.ts` refuse tout autre modele avant appel API.
- Cache applique: `lib/openai/client.ts` cache les chat completions identiques pendant 15 minutes. Le resume onboarding conserve en plus son cache DB 24h.
- Cron: aucun cron IA detecte. Le seul cron Vercel est `/api/cron/sync-onboarding` une fois par jour a 08:00 UTC, sans appel OpenAI.

## Garde-fous code

- Modele autorise unique: `gpt-4o-mini` dans `lib/openai/client.ts`.
- Tous les appels `openai.chat.completions.create(...)` via le wrapper partagent:
  - validation du modele;
  - cache in-memory 15 minutes par payload identique;
  - suppression du cache si l'appel OpenAI echoue.
- Les embeddings RAG restent separes: `lib/rag/ingest.ts` utilise `text-embedding-3-small`; ils ne sont pas inclus dans cet audit chat completions.

## Routes OpenAI chat

| Route | Fichier | Declencheur | Modele avant | Modele apres | Cache | Note |
|---|---|---|---|---|---|---|
| `POST /api/ai/summarize-ticket` | `app/api/ai/summarize-ticket/route.ts` | UI manuel: assistant + page ticket | `gpt-4o` via `createJsonCompletion` | `gpt-4o-mini` via `OPENAI_CHAT_MODEL` | 15 min wrapper | Route manuelle uniquement |
| `POST /api/ai/generate-client-reply` | `app/api/ai/generate-client-reply/route.ts` | UI manuel: pages tickets, draft reponse client | `gpt-4o` via `createJsonCompletion` | `gpt-4o-mini` via `OPENAI_CHAT_MODEL` | 15 min wrapper | RAG draft generation: pourrait rester `gpt-4o`, mais downgrade volontaire a mini pour cout |
| `POST /api/ai/create-escalation` | `app/api/ai/create-escalation/route.ts` | UI manuel: page ticket | `gpt-4o` via `createJsonCompletion` | `gpt-4o-mini` via `OPENAI_CHAT_MODEL` | 15 min wrapper | Route manuelle uniquement |
| `POST /api/ai/create-knowledge-article` | `app/api/ai/create-knowledge-article/route.ts` | UI manuel: page ticket | `gpt-4o` via `createJsonCompletion` | `gpt-4o-mini` via `OPENAI_CHAT_MODEL` | 15 min wrapper | Route manuelle uniquement |
| `POST /api/ai/find-similar-bug` | `app/api/ai/find-similar-bug/route.ts` | UI manuel: page ticket | `gpt-4o` via `createJsonCompletion` | `gpt-4o-mini` via `OPENAI_CHAT_MODEL` | 15 min wrapper | Route manuelle, contexte Zoho + Linear |
| `POST /api/ai/suggest-tickets` | `app/api/ai/suggest-tickets/route.ts` | UI manuel: page knowledge | `gpt-4o` via `createJsonCompletion` | `gpt-4o-mini` via `OPENAI_CHAT_MODEL` | 15 min wrapper | Fetch Zoho/Linear avant prompt; cache si prompt final identique |
| `POST /api/ai/monthly-analysis` | `app/api/ai/monthly-analysis/route.ts` | Aucun appel UI trouve dans le repo; endpoint manuel/futur | `gpt-4o` via `createJsonCompletion` | `gpt-4o-mini` via `OPENAI_CHAT_MODEL` | 15 min wrapper | A surveiller si branche sur reporting |
| `POST /api/ai/onboarding-summary` | `app/api/ai/onboarding-summary/route.ts` | UI manuel: `/onboarding/[id]`, bouton resume executif | Claude Haiku en Phase 2 initiale, puis `gpt-4o-mini` | `gpt-4o-mini` via `OPENAI_CHAT_MODEL` | 24h DB + 15 min wrapper | `force=true` bypass le cache DB, pas le cache wrapper si payload identique |
| `POST /api/admin/normalize-tickets` | `app/api/admin/normalize-tickets/route.ts` | UI manuel admin: dashboard | `gpt-4o-mini` hardcode | `gpt-4o-mini` via `OPENAI_CHAT_MODEL` | 15 min wrapper | Route batch, pas cron |
| `POST /api/admin/fix-undefined-tickets` | `app/api/admin/fix-undefined-tickets/route.ts` | UI manuel admin: dashboard | `gpt-4o-mini` hardcode | `gpt-4o-mini` via `OPENAI_CHAT_MODEL` | 15 min wrapper | Route batch, pas cron |

## Scripts locaux hors routes

Ces scripts ne sont pas exposes comme routes HTTP et ne sont pas appeles par Vercel cron:

| Script | Modele |
|---|---|
| `scripts/normalize-tickets.mjs` | `gpt-4o-mini` |
| `scripts/fix-undefined-tickets.mjs` | `gpt-4o-mini` |
| `scripts/batch-qualify.ts` | `gpt-4o-mini` |

## Cron

`vercel.json` contient uniquement:

```json
{
  "path": "/api/cron/sync-onboarding",
  "schedule": "0 8 * * *"
}
```

Cette route appelle `syncOnboardingProjects`, sans OpenAI. Aucun cron horaire IA n'a ete trouve.

## Estimation cout mensuel

Base observee fournie:

- 1142 requetes GPT-5 le 24 mai.
- Cout total: 12.30 USD.
- Cout moyen observe: 0.0108 USD par requete.

Projection si ce rythme se repetait tous les jours:

| Scenario | Hypothese | Cout jour | Cout mois 30j |
|---|---:|---:|---:|
| Avant incident | Cout observe GPT-5 du 24 mai | 12.30 USD | 369.00 USD |
| Apres switch modele | Meme volume, `gpt-4o-mini`, sans benefice cache chiffre | estimation a recalibrer avec usage tokens | cible < 36.90 USD |
| Apres switch + cache | Meme volume, moins les clics/requetes identiques <15 min | inferieur au scenario precedent | a mesurer apres 24h |

Limite importante: le repo ne contient pas les tokens input/output reels du 24 mai. L'estimation exacte apres migration doit etre refaite depuis le dashboard OpenAI apres 24h de prod avec `gpt-4o-mini`. La page officielle OpenAI facture les modeles par tokens input/output, pas seulement par requete: https://platform.openai.com/docs/pricing

## Recommandations

1. Garder `OPENAI_CHAT_MODEL` comme point unique de configuration et ne pas hardcoder de modele dans les routes.
2. Ne jamais utiliser de modele alias type `latest`, `chat-latest`, `gpt-5*` ou `gpt-4o` dans l'app sans validation explicite.
3. Exporter les usages OpenAI du 24 mai par endpoint si possible: le code local ne contient aucun `gpt-5`, donc une cause externe reste possible.
4. Ajouter une alerte budget OpenAI basse pour la cle `dedgecockpit`.
5. Revoir les routes admin batch avant usage massif: elles sont manuelles, mais peuvent traiter beaucoup de tickets par clic.
