# Refonte Onboarding + Design System D-EDGE — Statut

## Contexte
Chantier décrit dans le "Prompt Codex" partagé en début de session.
Deux objectifs : refonte navigation Onboarding + application design system "Overnight Hotelier".

---

## FAIT ✅

### Design system
- Fichiers copiés depuis `node_modules/tailwindcss/lib/public/design-system/` vers `public/design-system/`
  - `colors_and_type.css` — tokens CSS + classes typo
  - `overnight-hotelier.css` — stylesheet FA Kit
  - `d-edge-logo.svg` — logo D-EDGE
- `app/layout.tsx` — ajout `<link rel="stylesheet" href="/design-system/colors_and_type.css" />` dans `<head>`
  → Les variables `--htl-*` et `--bg-canvas`, `--font-sans`, etc. sont disponibles globalement.

### Navigation
- `components/layout/Sidebar.tsx` — nav Onboarding mise à jour :
  - "Dashboard" → "Mes projets" (`/onboarding`)
  - "Charge" → "Pilotage" (`/onboarding/pilotage`)
  - Style actif D-EDGE pour items `/onboarding/*` : `bg-[#e8dbfa] text-[#59319f]`

### Redirects
- `next.config.mjs` — redirect 301 `/onboarding/charge` → `/onboarding/pilotage`
- `app/onboarding/charge/page.tsx` — remplacé par `redirect('/onboarding/pilotage')` (server-side)

### Nouvelle page Pilotage
- `app/onboarding/pilotage/page.tsx` — **CRÉÉ** ✅
  - Fusion de l'ancien Dashboard + Charge
  - KPIs · filtres owner + date · tableau par chargé · barres de charge · répartitions · satisfaction
  - Styling D-EDGE complet (canvas cream, cards border+shadow, buttons violets, badges, tokens)

---

## RESTE À FAIRE ❌

### 1. Page "Mes projets" — `app/onboarding/page.tsx`
Réécrire entièrement. Actuellement : ancien Dashboard (617 lignes).
Cible : vue liste filtrée sur l'utilisateur courant.

Spécifications :
- `useCurrentUser()` → filtre par défaut `ownerEmail === user.email`
- Pills : Mes projets | Tous | Implémentation | [onboarders individuels]
- Recherche locale (hotel name)
- Tableau : Hôtel · Produit · Statut · Progression (barre + %) · Prochaine action · Go-live cible
- Tri : bloqués > critical risk > high risk > overdue > medium > pending_client > in_progress > not_started > live
- Empty state : "Vous n'avez aucun projet en cours."
- Clic ligne → `/onboarding/[id]`
- Styling D-EDGE

Champs dispo sur `OnboardingProject` : `ownerEmail`, `percentComplete`, `isBlocked`, `isOverdue`, `riskLevel`

### 2. Board — `app/onboarding/board/page.tsx`
Restyler uniquement (kanban conservé). Appliquer tokens D-EDGE :
- Canvas `bg-[#faf9f5]`
- Cards : `border border-[#e2e2e2] shadow-[0_4px_8px_rgba(0,0,0,0.10)]`
- Pills actifs → violet `#59319f`
- Status badge couleurs D-EDGE (voir constantes dans pilotage/page.tsx)
- Product badge couleurs D-EDGE

### 3. Page projet header — `app/onboarding/[id]/page.tsx`
Restyler le header :
- Canvas `bg-[#faf9f5]`
- Badges produit/statut → couleurs D-EDGE
- "Voir dans Zoho" → lien texte violet (pas un bouton bordé)
- Bouton sync → outline button D-EDGE

### 4. ProjectDetailClient — `app/onboarding/[id]/ProjectDetailClient.tsx`
Restructurer onglet "Vue d'ensemble" en deux zones :

**Zone Informations** (consulter)
- `<ProjectProgress />` (progression)
- `<ExecutiveSummary />` (résumé + boutons Générer/Régénérer)
- MetricCards (Début / Go-live cible / Go-live réel / Dernière sync)

**Zone Actions** (agir)
- Section "Communications" : 5 boutons email (outline D-EDGE)
- Section "Rendez-vous" : `<AcuityAppointments />` + bouton Gem recap

Les deux zones : cartes distinctes avec titre de section.
Styling D-EDGE sur onglets (actif = border-bottom violet), boutons, etc.

---

## Vérifications finales (après todo ci-dessus)
- [ ] `npx tsc --noEmit` sans erreurs
- [ ] `npm run build` passe
- [ ] Canvas cream visible dans navigateur (pas blanc)
- [ ] Variables `--htl-*` dans DevTools → Elements → :root
- [ ] Navigation : Onboarding → atterrit sur "Mes projets" filtré
- [ ] `/onboarding/charge` redirige vers `/onboarding/pilotage`
- [ ] Boutons emails + Gem + Acuity fonctionnent sur page projet
- [ ] Timeline events créent toujours

---

## Fichiers modifiés/créés cette session
- `public/design-system/colors_and_type.css` (copié)
- `public/design-system/overnight-hotelier.css` (copié)
- `public/design-system/d-edge-logo.svg` (copié)
- `app/layout.tsx` (lien CSS ajouté)
- `components/layout/Sidebar.tsx` (labels + style actif)
- `next.config.mjs` (redirect)
- `app/onboarding/charge/page.tsx` (→ redirect server-side)
- `app/onboarding/pilotage/page.tsx` (NOUVEAU)

## Fichiers à modifier demain
- `app/onboarding/page.tsx` (réécriture complète → Mes projets)
- `app/onboarding/board/page.tsx` (restyle uniquement)
- `app/onboarding/[id]/page.tsx` (restyle header)
- `app/onboarding/[id]/ProjectDetailClient.tsx` (restructure + restyle)
