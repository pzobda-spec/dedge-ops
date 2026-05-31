# Audit cible - Etat du code avant chantier Project Timeline

Date d'audit: 2026-05-31

## Section 1 - Modele de donnees Onboarding actuel

### Table `onboarding_projects`

Declaree dans `database/schema.sql`.

| Colonne | Type | Contraintes / remarques |
|---|---|---|
| `id` | `TEXT` | Primary key |
| `client_id` | `TEXT` | `NOT NULL`, FK vers `clients(id) ON DELETE CASCADE` |
| `owner` | `TEXT` | `NOT NULL` |
| `plan` | `TEXT` | Nullable, texte libre |
| `status` | `TEXT` | `NOT NULL`, check enum local |
| `start_date` | `DATE` | Nullable |
| `target_go_live` | `DATE` | Nullable |
| `actual_go_live` | `DATE` | Nullable |
| `blockers` | `TEXT` | Nullable |
| `iteration_count` | `INTEGER` | `NOT NULL DEFAULT 0` |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` |

Valeurs possibles de `status` dans le schema local:
`kickoff`, `credentials_pending`, `documents_pending`, `build`, `client_review`, `adjustments`, `ready`, `live`, `blocked`.

⚠️ Partiel: les pages onboarding actuelles ne lisent pas cette table. Elles chargent les projets depuis Zoho Projects via `/api/zoho/projects`.

### Tables liees

- `clients`: liee via `onboarding_projects.client_id`.
- `onboarding_satisfaction`: table separee pour les reponses de satisfaction, sans FK vers `onboarding_projects`.
- ❌ Manquant: aucune table `onboarding_tasks`, `onboarding_events`, `onboarding_milestones`, `onboarding_timeline`, `project_timeline` trouvee dans les schemas locaux.

### Indexes existants

- `idx_onboarding_client_id` sur `onboarding_projects(client_id)`.
- `idx_onboarding_satisfaction_submitted_at` sur `onboarding_satisfaction(submitted_at DESC)`.
- `idx_onboarding_satisfaction_owner` sur `onboarding_satisfaction(owner)`.

### Foreign keys

- `onboarding_projects.client_id` -> `clients(id) ON DELETE CASCADE`.
- ❌ Manquant: pas de FK vers `users` ou `auth.users`.
- ❌ Manquant: pas de FK depuis `onboarding_satisfaction` vers projet/client.

### Champs `status`, `step`, `stage`

- DB locale `onboarding_projects.status`: `kickoff`, `credentials_pending`, `documents_pending`, `build`, `client_review`, `adjustments`, `ready`, `live`, `blocked`.
- Type mock `lib/mockData.ts`: meme enum que le schema local.
- Zoho Projects runtime `lib/zoho/projectsClient.ts`: `not_started`, `in_progress`, `pending_client`, `live`, `blocked`, `other`.
- Pages `/onboarding` et `/onboarding/board`: colonnes `not_started`, `in_progress`, `pending_client`, `live`, `blocked`, `other`.
- ❌ Manquant: aucun champ `step` ou `stage` trouve.

### Type de plan

- DB locale: `onboarding_projects.plan TEXT`, texte libre nullable.
- Mocks: `plan: string`.
- Runtime Zoho: pas de champ `plan`; le produit est expose via `group_name` mappe en `product`.

## Section 2 - Boutons et actions du module Onboarding

### `/onboarding` - `app/onboarding/page.tsx`

| Bouton / action | Fichier source | Effet actuel | Trace en base |
|---|---|---|---|
| Pills owner (`Tous`, `Implementation`, owners) | `app/onboarding/page.tsx` | Change `activeOwner` cote client | Non |
| Pills date (`Tous`, `Mois precedent`, `Mois en cours`, `Trimestre en cours`, `Personnalise`) | `app/onboarding/page.tsx` | Change `datePreset` cote client | Non |
| Inputs date custom | `app/onboarding/page.tsx` | Change `customFrom` / `customTo` cote client | Non |
| `x Reinitialiser` | `app/onboarding/page.tsx` | Reset filtres owner/date cote client | Non |
| `Synchroniser` satisfaction | `app/onboarding/page.tsx` | `POST /api/integrations/zoho/satisfaction-sync`, puis refresh `GET /api/onboarding/satisfaction` | Oui, upsert dans `onboarding_satisfaction` |
| `Prec.` / `Suiv.` satisfaction | `app/onboarding/page.tsx` | Pagination locale du tableau satisfaction | Non |

Données chargees au mount:
- `GET /api/zoho/projects` -> projets Zoho Projects.
- `GET /api/onboarding/satisfaction` -> table `onboarding_satisfaction`.

### `/onboarding/board` - `app/onboarding/board/page.tsx`

| Bouton / action | Fichier source | Effet actuel | Trace en base |
|---|---|---|---|
| Pills owner | `app/onboarding/board/page.tsx` | Change `ownerFilter` cote client | Non |
| Carte projet | `app/onboarding/board/page.tsx` | Lien externe `target="_blank"` vers Zoho Projects `projectUrl` | Non |

Données chargees au mount:
- `GET /api/zoho/projects`.

### `/onboarding/charge` - `app/onboarding/charge/page.tsx`

- Aucun bouton/action cliquable metier observe.
- Données chargees au mount: `GET /api/zoho/projects`.

### `/onboarding/[id]`

❌ Manquant: aucune page `app/onboarding/[id]/page.tsx` ou route detail projet locale trouvee.

## Section 3 - Boutons emails existants

- ❌ Manquant: pas de bouton "Generer email" sur une page projet onboarding, car il n'existe pas de page projet onboarding locale.
- Templates emails actuels:
  - `knowledge_articles.client_reply_template` dans `database/schema.sql`.
  - Utilises par `app/api/ai/generate-client-reply/route.ts` pour les tickets support.
  - Email Meet formation hardcode dans `lib/google/calendarClient.ts` (`sendMeetEmail`).
- Logging emails envoyes:
  - ❌ Manquant: pas de table `email_logs`, `sent_emails` ou equivalente.
  - Envoi reponse ticket via Zoho Desk: `app/api/zoho/tickets/[id]/reply/route.ts` appelle Zoho `sendReply`, sans insertion locale.
  - Envoi email Meet via Gmail API: `sendMeetEmail`, sans insertion locale.
- Integration Gmail / SMTP:
  - Gmail API presente dans `lib/google/calendarClient.ts` (`gmail.googleapis.com/gmail/v1/users/me/messages/send`).
  - Google OAuth refresh token dans `lib/google/auth.ts`.
  - ❌ Manquant: aucune integration SMTP applicative trouvee.

## Section 4 - Integration Acuity actuelle

### Fichiers

- `lib/acuity/client.ts`: client Acuity REST Basic Auth.
- `app/api/acuity/sessions/route.ts`: route GET cachee via `unstable_cache`.

### API routes utilisant Acuity

- `GET /api/acuity/sessions`
  - Params: `period` (`recent`, `upcoming`, `all`), `months`, `minDate`, `maxDate`.
  - Appelle `fetchSessions`, `fetchUpcomingSessions`, `fetchRecentSessions`.

### Tables Supabase liees

- Schema local contient `trainings` et `training_registrations`.
- ⚠️ Partiel: les pages formations utilisent Acuity live via API, pas ces tables.
- ❌ Manquant: aucune table `acuity_appointments` trouvee.

### Types de RDV fetches

- Acuity fetch global `/appointments?max=500`, puis filtre local.
- Filtre inclusif: categories contenant `formation` ou `training`.
- Exclusions: `meeting with`, `customer support`, `salons`, `reunion con`.
- Conclusion factuelle: aujourd'hui l'integration est orientee formations uniquement; les RDV onboarding ne sont pas explicitement inclus sauf si leur categorie matche `formation`/`training`.

### Champs recuperes depuis Acuity

Champs raw typés dans `AcuityRawAppointment`:
`id`, `firstName`, `lastName`, `email`, `datetime`, `date`, `time`, `endTime`, `type`, `appointmentTypeID`, `classID`, `category`, `duration`, `calendar`, `calendarID`, `canceled`, `forms`.

Champs exposes dans `AcuitySession`:
`classID`, `title`, `theme`, `language`, `datetime`, `date`, `time`, `duration`, `calendar`, `calendarID`, `category`, `participants`, `totalRegistered`, `totalCancelled`, `uniqueHotels`, `duplicateHotels`, `status`.

## Section 5 - Systeme d'authentification et de roles

### Table users actuelle

❌ Manquant: aucune table `users` applicative dans `database/schema.sql`.

Tables auth applicatives:
- `access_requests`
  - `id BIGSERIAL PRIMARY KEY`
  - `email TEXT NOT NULL UNIQUE`
  - `status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected'))`
  - `requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
  - `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`

### Systeme d'auth utilise

- Supabase Auth via `@supabase/ssr`.
- Login magic link / OTP: `app/api/auth/login/route.ts` appelle `supabase.auth.signInWithOtp`.
- Callback: `app/auth/callback/route.ts` appelle `exchangeCodeForSession`.
- Approbation admin: `app/api/auth/approve/route.ts` appelle `supabaseAdmin.auth.admin.inviteUserByEmail`.

### Gestion des roles / permissions

- Pas de roles en base.
- Acces restreint hardcode par email dans `lib/auth/access.ts`.
- `middleware.ts` bloque les chemins restreints si `canAccessRestrictedOps(user.email)` est faux.
- `components/layout/Sidebar.tsx` masque les sections `restricted` avec la meme fonction cote client.
- Routes restreintes dans middleware: `/onboarding`, `/trainings`, `/api/onboarding`, `/api/integrations/zoho/satisfaction-sync`, `/api/zoho/projects`, `/api/acuity`, `/api/google/meet`.

### RLS / lecture seule

- ⚠️ Partiel: les clients backend utilisent `supabaseAdmin` service role, donc bypass RLS.
- ❌ Manquant: aucun `CREATE POLICY`, `ENABLE ROW LEVEL SECURITY`, role `readonly`, role `commercial` ou permissions differenciees trouve.
- ❌ Manquant: pas de concept de "lecture seule" applicatif. Il existe seulement "acces restreint oui/non" hardcode.

## Section 6 - Pages existantes potentiellement impactees

Pages de la sidebar dans `components/layout/Sidebar.tsx`.

| Page | Client/server | API routes consommees | Donnees chargees au mount |
|---|---|---|---|
| `/dashboard` | Client (`'use client'`) | `/api/zoho/tickets`, `/api/linear/issues`, `/api/acuity/sessions?period=upcoming` si acces restreint, `/api/zoho/projects` si acces restreint, `/api/admin/normalize-tickets`, `/api/admin/fix-undefined-tickets` sur boutons admin | Tickets Zoho, issues Linear, sessions Acuity, projets Zoho selon droit |
| `/tickets` | Client | `/api/zoho/tickets`, `/api/zoho/tickets/[id]/conversations`, `/api/ai/generate-client-reply`, liens `/tickets/[id]` | Tickets Zoho; conversations seulement quand un ticket inbox est selectionne |
| `/tickets/analytics` | Client | Via `app/tickets/AnalyticsPane.tsx`: `/api/zoho/analytics`, liens vers `/tickets/analytics/other` | Analytics Zoho selon periode |
| `/escalations` | Client | `/api/linear/issues`, `/api/linear/issues/create` | Issues Linear |
| `/escalations/analytics` | Client | `/api/linear/issues` | Issues Linear |
| `/trainings` | Client | `/api/acuity/sessions`, liens Google Calendar generes cote client | Sessions Acuity |
| `/trainings/analytics` | Client | `/api/acuity/sessions?minDate=...&maxDate=...` | Sessions Acuity du mois selectionne |
| `/onboarding` | Client | `/api/zoho/projects`, `/api/onboarding/satisfaction`, `/api/integrations/zoho/satisfaction-sync` sur bouton | Projets Zoho, satisfaction Supabase |
| `/onboarding/board` | Client | `/api/zoho/projects` | Projets Zoho |
| `/onboarding/charge` | Client | `/api/zoho/projects` | Projets Zoho |
| `/settings` | Client | `/api/settings/health`, `/api/auth/pending`, `/api/auth/approve` | Statut integrations, demandes d'acces |

Autres pages existantes non dans sidebar mais potentiellement impactees:
- `/knowledge`: client, consomme `/api/knowledge`, `/api/ai/suggest-tickets`; recherche locale sur articles.
- `/assistant`: client, interface IA autonome.
- `/reporting`: page existante.

## Section 7 - Generation de recap RDV

- ❌ Manquant: aucun bouton "Recap RDV" ou similaire trouve.
- ❌ Manquant: aucune table `meeting_recaps`, `recap_logs` ou equivalente trouvee.
- ❌ Manquant: aucune integration Gemini trouvee.
- IA actuelle: OpenAI uniquement (`lib/openai/*`, routes `/api/ai/*`), modele par defaut `gpt-4o`.

## Section 8 - Recherche globale

- ❌ Manquant: pas de barre de recherche globale dans le cockpit (`Sidebar`, `TopBar`, `NavShell`).
- Recherches locales existantes:
  - `/tickets`: filtre client-side sur `subject` et `clientName`.
  - `/knowledge`: filtre client-side sur `title` et `problem`.
  - Zoho Desk KB: `searchKBArticles` utilise `/search?searchStr=...&type=Article`.
  - Zoho CRM: `Accounts/search` dans `lib/zoho/crmClient.ts`.
- Entites indexees:
  - `ticket_chunks` existe avec `embedding vector(1536)` pour RAG.
  - `knowledge_articles` existe.
  - Aucune recherche globale tickets/projets/clients exposee en UI.
- Mecanisme:
  - Client-side pour listes locales.
  - Zoho native search pour KB/CRM.
  - ⚠️ Partiel: `ticket_chunks` suggere un index vectoriel, mais pas de route de recherche globale trouvee.
  - ❌ Manquant: pas d'Algolia, pas de full-text Supabase global trouve.

## Section 9 - Points de risque identifies

- `onboarding_projects` local n'est pas la source de verite UI actuelle: les pages onboarding lisent Zoho Projects. Une Timeline locale ne serait pas automatiquement reliee aux projets affiches sans strategie d'identifiant/source.
- Incoherence de statuts:
  - DB/mocks: `kickoff`, `credentials_pending`, `documents_pending`, `build`, `client_review`, `adjustments`, `ready`, `live`, `blocked`.
  - Runtime Zoho/UI: `not_started`, `in_progress`, `pending_client`, `live`, `blocked`, `other`.
- Historique d'actions onboarding absent: pas de table events/tasks/milestones/timeline.
- Historique emails absent: les emails/reponses envoyes via Zoho ou Gmail ne sont pas loggues localement.
- Acuity filtre aujourd'hui les categories formation/training; pas de support explicite des RDV onboarding.
- Auth roles absents: permissions hardcodees par email, pas de role commercial readonly.
- RLS absente ou non utilisee dans le code local; le backend utilise `supabaseAdmin`.
- Mocks onboarding encore presents dans `lib/mockData.ts`, avec un modele different de Zoho runtime.
- Tables `trainings` / `training_registrations` existent dans le schema mais les pages formations consomment Acuity live.
- `ai_actions` existe dans le schema, mais aucune insertion applicative trouvee dans les routes IA.
- TODO/FIXME pertinents: aucun `TODO`/`FIXME` explicite trouve dans les zones onboarding/auth/acuity/email auditees.

## Section 10 - Recommandation

1. La table `onboarding_projects` n'est pas prete telle quelle a recevoir une Timeline exploitable par l'UI actuelle. Elle a des colonnes de base et une FK client, mais elle n'est pas utilisee par les pages onboarding, ne porte pas les statuts Zoho runtime, et n'a aucune table d'evenements/historique.

2. Les boutons existants ne logguent pas leurs actions onboarding. Les filtres et navigations ne laissent aucune trace. Seul le bouton `Synchroniser` ecrit indirectement dans `onboarding_satisfaction` via un upsert de reponses Zoho Forms, pas dans un journal d'actions projet.

3. Acuity n'est pas utilisable tel quel pour les RDV onboarding si ceux-ci ne sont pas categorises comme `formation`/`training`. L'integration actuelle recupere des appointments, mais filtre explicitement vers les sessions de formation et expose des `AcuitySession` groupees par `classID`.

4. Le systeme d'auth ne peut pas gerer proprement un role "commercial readonly" en l'etat. Il peut etre etendu rapidement de facon hardcodee par email, mais il n'y a ni table users, ni roles, ni permissions differenciees, ni RLS applicative.
