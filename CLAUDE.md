# D-EDGE Ops Cockpit — CLAUDE.md

## Contexte projet

Cockpit opérationnel personnel pour Pablo Zobda (Support/Education/Onboarding manager, D-EDGE CRM).
Couche applicative au-dessus de Zoho Desk, Linear, Acuity, Zoho Projects, Zoho CRM.

Stack : Next.js 14 App Router · TypeScript · Tailwind CSS · Supabase

---

## Règles absolues

- **Ne jamais écrire dans Zoho CRM** (lecture seule — "Non n'écris rien dans zoho stp")
- Toutes les pages et labels UI en **français**
- Dates affichées au format **DD/MM/YYYY**
- Pas d'authentification dans l'app

---

## Architecture clé

### Zoho Desk
- Org ID : `20063299426`
- Département Support : `5861000000007061` (LOUNGEUP Support team)
- Département CSM : `5861000019985859` (LoungeUp CSM Team) — NE PAS afficher dans la vue tickets
- Auth : OAuth refresh token (`accounts.zoho.eu`), scope actuel : `Desk.tickets.ALL Desk.contacts.READ Desk.search.READ Desk.settings.READ`
- Token Desk : `ZOHO_REFRESH_TOKEN` dans `.env.local`
- ⚠️ Ne jamais appeler l'endpoint token directement en dehors de l'app — ça invalide le token en cache du serveur

### Zoho CRM
- Token séparé : `ZOHO_CRM_REFRESH_TOKEN`
- Lecture seule — segment calculé depuis MRR : Strategic >4000€, Gold ≥750€, Silver ≥200€, Bronze <200€
- Cache 1h côté serveur (`lib/zoho/accountCache.ts`)

### Linear
- Workspace : `loungeup`, team : `BUGS`
- URL issues : `https://linear.app/loungeup/issue/{identifier}/{slug}`

### Acuity
- Sessions groupées par `classID`, hôtel depuis le champ formulaire "Company Name"

---

## Segmentation risque (tickets)

Score 0–100 :
- Segment : Strategic +40, Gold +30, Silver +15, Bronze +0, inconnu +10
- Âge basé sur `lastClientMessageAt` : >48h +25, >24h +15, >8h +8
- Sentiment négatif : +20
- Priorité urgent/haute : +20/+10
- Statut réouvert : +10

---

## Roadmap

### En cours / fait
- [x] Vue tickets Support (Zoho Desk, dept `5861000000007061`, filtre Open)
- [x] Score de risque par ticket
- [x] Détail ticket + conversations lazy-loaded
- [x] Réponse directe depuis l'app (Zoho Desk)
- [x] Actions IA : résumé, réponse client, escalade, fiche KB
- [x] Création escalade Linear depuis ticket
- [x] Vue Escalades (kanban Linear team BUGS)
- [x] Vue Formations (Acuity) + lien Google Calendar
- [x] Vue Projets (Zoho Projects)
- [x] Liens externes (icône ↗) vers Zoho Desk et Linear

### À faire

- [ ] **Page Stats Zoho Desk**
  - Volume tickets : créés vs fermés sur 7j / 30j
  - Répartition par statut (Open, Pending, Escalated…)
  - Top produits/catégories impactés
  - FCR approché : (total – réouverts) / total
  - Temps de réponse et résolution moyens (rapports `responseTime` / `resolutionTime`)
  - Source : endpoint `/tickets` avec filtres date + rapports Zoho Desk (IDs connus)
