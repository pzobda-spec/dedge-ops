# Handoff — Agrégation par client (Groupe / Individuel) — 21 juillet 2026

## État

Implémenté le 21 juillet 2026 dans le commit `8073a55`. Ce document conserve les décisions,
les limites connues et le plan technique ayant servi à l'implémentation.

## Demande

Aujourd'hui chaque "projet" Zoho = une **propriété × un produit** (ex. `eVORA : LoungeUp`).
Les vues onboarding comptent les clients via `hotelName` (la propriété), donc les 6 sites
d'ART AND SOUL comptent comme 6 clients distincts, et il n'existe aucune vue rassemblant
tous les projets d'un même client. Pablo a besoin de : (1) compter groupes vs individuels
en implémentation et voir la part de chacun, (2) filtrer par typologie, (3) une **vue Client**
listant toutes les propriétés × produits d'un client.

## Données vérifiées (via MCP Zoho CRM / Zoho Projects sur données réelles)

- Le CRM a une hiérarchie native fiable `Parent_Account` / `Child_Accounts` (100 % cohérente
  sur un échantillon de 200 comptes ; les 6 propriétés ART AND SOUL pointent bien vers le
  compte `ART AND SOUL GROUP`).
- Le champ picklist `Subdomain` (Group/Independant/Chain…) est **écarté** : incohérent
  (39 comptes tagués "Independant" ont pourtant un `Parent_Account` renseigné).
- **Risque de rattachement** : sur 200 projets Zoho Projects échantillonnés, ~100 pointent
  vers le compte CRM placeholder « D-EDGE » (lien jamais renseigné) et 18 vers rien ; seuls
  ~82 ont un vrai compte CRM. Les mal-rattachés sont surtout des projets **Live** ; les
  **In Progress** (le périmètre implémentation actif) sont majoritairement bien rattachés.
  → Une catégorie **« Non rattaché »** doit rester visible partout dans l'UI, jamais un
  comptage qui fait semblant d'être complet.
- Notre endpoint REST actuel (`lib/zoho/projectsClient.ts`, base
  `https://projectsapi.zoho.eu/restapi`) ne lit **que le champ custom "Account"**
  (format `"ID - Nom"`) pour en tirer `accountCRMName` — `RawProject` ne déclare pas de lien
  natif `account.record_id`. Le lien natif par ID vu pendant l'investigation (ex.
  `account.record_id: "93025000184489088"`) venait de l'API Zoho Projects v3 interrogée via
  MCP, pas de notre endpoint legacy. **À vérifier en premier (Phase 0)** : logguer une réponse
  brute de `fetchProjects()` pour confirmer si un champ `account` natif existe réellement dans
  ce que Zoho renvoie à cet endpoint precis. Si oui → l'utiliser en priorité (match exact par
  ID, plus robuste). Sinon → repli sur le matching par nom existant
  (`lib/zoho/accountCache.ts` → `matchAccountByName()`, déjà exact + partiel).

## Décisions produit validées avec Pablo

- **Groupe** = client CRM (racine de hiérarchie) avec **≥2 propriétés distinctes onboardées**
  dans le périmètre. Un ACCOR avec 1 seul hôtel onboardé = **Individuel**. La hiérarchie CRM
  sert à *regrouper* ; le label Groupe/Individuel vient du **nombre de propriétés réelles**,
  pas de la simple présence d'un `Parent_Account`.
- **Vue Client** = pages dédiées `/onboarding/clients` (liste) + `/onboarding/clients/[id]`
  (fiche détail), pas un simple bouton "grouper par client" dans la liste existante.
- **Typologie** (KPI + filtre Groupe/Individuel/Non rattaché) présente **partout** : pilotage,
  liste, board, ET la nouvelle vue client (pas seulement pilotage).

## Architecture

Toutes les pages analytiques (`app/onboarding/page.tsx`, `board/page.tsx`, `pilotage/page.tsx`)
tapent en live `fetch('/api/zoho/projects')`. → **Enrichir une seule fois, côté serveur, dans
cette route**, en joignant le cache CRM. Toutes les pages consommatrices reçoivent ensuite des
projets déjà porteurs de leur client — pas de logique dupliquée par page.

### Résolution projet → client

1. Match du projet vers un compte CRM :
   - Priorité au lien natif par ID si la vérification Phase 0 confirme sa présence dans le
     payload REST → match exact par ID.
   - Sinon repli sur `accountCRMName` (déjà extrait) via `matchAccountByName()` (existant).
2. Remontée hiérarchie : suivre `parentId` jusqu'à la racine (garde anti-cycle, profondeur
   max 5) via une map complète id→compte → le compte racine EST le client.
3. Aucun match → `clientId = null` → bucket **« Non rattaché »** (clé synthétique
   `hotel:<hotelName>` pour ne pas perdre le projet).
4. Deuxième passe globale : regrouper par `clientId`, compter les **propriétés distinctes**
   (`hotelName`) → `clientIsGroup = count ≥ 2` ; `clientTypology ∈ {group, individual, unlinked}`.

## Fichiers à toucher

**Phase 0 — Fondation données**
- `lib/zoho/crmClient.ts` : ajouter `Parent_Account` à la constante `FIELDS` (ligne ~63) ;
  champ `Parent_Account` dans `RawCRMAccount` ; `parentId`/`parentName` dans `CRMAccount` et
  dans `mapRaw()`.
  ⚠️ **Vérifier le filtre `mrr > 0`** dans `fetchAllCRMAccounts()` : les comptes-mères/holdings
  (type "ART AND SOUL GROUP") peuvent avoir un MRR à 0 — s'ils sont exclus par ce filtre, la
  remontée de hiérarchie casse silencieusement. S'assurer que tous les comptes nécessaires à la
  hiérarchie sont dans la map (retirer le filtre pour cette map, ou récupérer les parents
  manquants par id en complément).
- `lib/onboarding/clientResolver.ts` (nouveau fichier) : construit une `Map<id, CRMAccount>` ;
  `resolveClientRoot(account, map)` (remontée récursive par `parentId`) ;
  `enrichProjectsWithClients(projects, crmMap)` qui pose `clientId/clientName/clientIsGroup/
  clientTypology` sur chaque projet et renvoie un objet `meta` de couverture
  `{ matched, unlinked, byId, byName }` pour diagnostic.
- `lib/zoho/projectsClient.ts` : ajouter au type `OnboardingProject` : `clientId: string | null`,
  `clientName: string | null`, `clientIsGroup: boolean`,
  `clientTypology: 'group' | 'individual' | 'unlinked'`. `mapProject()` pose des valeurs par
  défaut neutres ; l'enrichissement réel se fait dans la route API (pas dans `mapProject`, qui
  n'a pas accès au cache CRM). Ne pas toucher au champ `clientType` existant (custom field Zoho
  Projects "Type"/"Groupe", peu fiable mais déjà utilisé ailleurs — le laisser tel quel).
- `app/api/zoho/projects/route.ts` : après `fetchProjects()`, charger le cache CRM
  (`getCRMAccountsMap()`, déjà caché 1h dans `lib/zoho/accountCache.ts`), appeler
  `enrichProjectsWithClients()`, renvoyer `{ projects, meta: { clientLinkage } }`. Garder la
  rétrocompatibilité : les consommateurs actuels lisent seulement `data.projects`, donc ajouter
  `meta` ne casse rien.

**Phase 1 — Typologie dans pilotage + filtre partout**
- `app/onboarding/pilotage/page.tsx` : remplacer la `BreakdownCard` "Typologie client"
  actuelle (basée sur `clientType`, peu fiable) par une répartition Groupe / Individuel /
  Non rattaché basée sur `clientTypology` ; recalculer le KPI "Comptes uniques" sur les
  **clients distincts** (`clientId` ou clé synthétique) au lieu de `hotelName` (corrige le
  double comptage eVORA + da bolsa) ; ajouter le filtre typologie à la barre de filtres
  existante ; afficher discrètement la couverture (`meta.clientLinkage`, ex. "12 projets non
  rattachés à un client CRM").
- `app/onboarding/page.tsx` et `app/onboarding/board/page.tsx` : ajouter un filtre typologie
  (Tous / Groupe / Individuel / Non rattaché) en `useState`, même pattern que les filtres
  existants (pas de synchronisation URL dans ces pages).

**Phase 2 — Vue Client dédiée**
- `app/onboarding/clients/page.tsx` (nouveau, `'use client'`, hook `useLocale()`) : liste des
  clients (racines de groupe + individuels + bucket non-rattaché), une ligne par client : nom,
  badge typologie, nombre de propriétés, nombre de projets, produits présents, avancement
  agrégé, owner(s). Filtres typologie + recherche + scope (mêmes conventions que les autres
  pages). En-tête KPI : nb groupes / nb individuels / nb propriétés / non rattachés. Source de
  données : `fetch('/api/zoho/projects')` puis agrégation côté page par `clientId`.
- `app/onboarding/clients/[id]/page.tsx` (nouveau) : fiche client — en-tête (nom, typologie,
  segment/MRR CRM si disponible via le cache), puis liste des propriétés, chacune avec ses
  produits (= ses projets), lien vers `/onboarding/[id]` pour chaque projet. Gérer la clé
  synthétique `hotel:<hotelName>` pour les clients non rattachés à un compte CRM.
- Navigation : ajouter une entrée "Clients" au sélecteur Liste/Board/Pilotage dans les en-têtes
  de `app/onboarding/page.tsx`, `board/page.tsx`, `pilotage/page.tsx` (même pattern que le
  toggle Liste/Board existant).
- `lib/i18n/translations.ts` : ajouter toutes les nouvelles chaînes FR→EN (dictionnaire plat
  `{ 'texte français': 'English text' }`, voir les ~470 lignes existantes pour le style).

## Utilitaires existants à réutiliser (ne pas recréer)

- `lib/zoho/accountCache.ts` : `getCRMAccountsMap()`, `matchAccountByName()` (match nom exact
  puis partiel).
- `lib/onboarding/constants.ts` : `IMPLEMENTATION_GROUP`, `isExcludedOnboardingOwner`,
  `resolveOwnerName`.
- `lib/onboarding/workload.ts` : `isActiveProject`, `CAPACITY_THRESHOLD`.
- Composants inline déjà présents (pas de fichier séparé, à copier/adapter) : `KpiCard`,
  `BreakdownCard`, `StatusBadge`/`RiskBadge`, `ProgressBar` dans `app/onboarding/page.tsx` et
  `app/onboarding/pilotage/page.tsx` ; pattern responsive table `.hidden lg:block` + cartes
  `.grid.lg:hidden`.
- i18n : `useLocale()` / `t()` côté client (`lib/i18n/LocaleContext.tsx`), `translate()` /
  `getServerLocale()` côté serveur (`lib/i18n/translate.ts`, `lib/i18n/serverLocale.ts`).
- Redirect minimal : modèle `app/onboarding/charge/page.tsx` (une ligne `redirect(...)`).

## Vérification

1. `npx tsc --noEmit --pretty false`, `npm run lint`, `npm run build`.
2. **Couverture d'abord** (dès la Phase 0) : via le `meta.clientLinkage` exposé par
   `/api/zoho/projects`, confirmer sur données réelles le taux de rattachement
   (matched/unlinked, byId/byName) **avant** de se fier aux répartitions Groupe/Individuel
   affichées à l'écran. Ajuster le repli de matching si le taux de non-rattaché est trop élevé.
3. Contrôle métier (via MCP Zoho CRM si accessible, sinon manuellement dans Zoho) : ART AND
   SOUL doit apparaître comme 1 seul client "Groupe" regroupant ses 6 propriétés ; un client
   individuel connu doit apparaître seul, typologie "Individuel".
4. Dev server : `/onboarding/clients` montre ART AND SOUL en Groupe avec ses propriétés ×
   produits ; le KPI pilotage "Comptes uniques" dédoublonne bien les propriétés d'un même
   groupe ; le filtre typologie fonctionne sur pilotage + liste + board + clients ; le bucket
   "Non rattaché" est visible et son volume est plausible (pas 0, pas 100 %).
5. Pas de migration Supabase nécessaire — tout est enrichissement live + UI, rien à appliquer
   côté base de données.

## Contraintes du dépôt (à respecter, cf. CLAUDE.md)

- Ne rien committer/pousser sans validation explicite de Pablo — vérifier `git status --short`
  et n'ajouter que les fichiers listés ci-dessus avant tout commit.
- Ne jamais appeler un endpoint de token Zoho en dehors du provider partagé existant
  (`createZohoTokenProvider` dans `lib/zoho/oauth.ts`) — le cache CRM et les projets l'utilisent
  déjà, ne pas dupliquer.
- Respecter le style de code existant (pas de commentaires superflus, pas de sur-abstraction).
- UI en français par défaut, toutes les nouvelles chaînes ajoutées au dictionnaire i18n existant
  pour la traduction anglaise (déjà en place sur tout l'espace onboarding).
