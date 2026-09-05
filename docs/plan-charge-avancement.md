# Plan de charge OB / CSM, journal d'avancement

Journal de reprise. Il doit permettre de reprendre le chantier dans une autre
session ou avec un autre assistant sans relire tout l'historique de
conversation. Mis à jour à chaque étape clé.

Spec de référence : `docs/plan-charge-attribution-spec.md`.
Prototype exécutable de référence : `docs/plan-charge-prototype-reference.html`
(bloc `<script>`, fonctions `poids`, `obEligible`, `effCapOB`, `effCapCSM`,
`run`, `renderProj`).
Note de vérification : `docs/plan-charge-verification.md`.

Branche de travail : `agent/plan-charge-scaffolding`, partie de `origin/main`.
PR 1, scaffolding : https://github.com/pzobda-spec/dedge-ops/pull/19
PR 2, pipeline Zoho : https://github.com/pzobda-spec/dedge-ops/pull/20
(branche `agent/plan-charge-pipeline`, empilée sur celle de la PR 1)
PR 3, API et page : https://github.com/pzobda-spec/dedge-ops/pull/21
(branche `agent/plan-charge-ui`, empilée sur celle de la PR 2)

Ordre de fusion : 19, puis 20, puis 21. GitHub recible chaque PR automatiquement
à la fusion de la précédente.

## Découpage retenu

1. **PR 1, scaffolding** : migrations Supabase, moteur pur, tests unitaires.
   Aucune dépendance à Zoho, aucune route API, aucune page.
2. **PR 2, pipeline Zoho** : `lib/onboarding/pipeline.ts`, extension du mapping
   CRM, alimentation du moteur avec les comptes signés pas encore live.
3. **PR 3, API et page** : `/api/onboarding/plan-charge*` et
   `app/onboarding/plan-charge`. Livrée.

## État

### Étape 1.a, base de données et roster — FAIT

- `supabase/migrations/20260905120000_plan_charge_attribution.sql`
  - crée `ob_capacity_rules` (owner, role, max_projects, availability),
    seedée avec Thuy-Tien senior 50, Dalia junior 50, Winli junior 50 ;
  - ajoute `csm_capacity_rules.availability` et migre `active=false` vers
    `availability='stop'` ;
  - crée `account_assignments` (pré-attributions et overrides verrouillables).
  - Non appliquée en base à ce stade : lancer `supabase db push`.
- `lib/onboarding/constants.ts` : `IMPLEMENTATION_GROUP` réduit à
  `['Thuy-Tien', 'Dalia', 'Winli']`.
- `docs/plan-charge-verification.md` créé.

Nom de fichier de migration au format horodaté, et non `027_` : la dernière
migration appliquée est `20260829092141_support_urgency_shadow_mode.sql`, un
préfixe numérique se trierait avant elle et casserait `supabase db push`.

### Étape 1.b, moteur et tests — FAIT

Fichiers :

- `lib/onboarding/capacityModel.ts`, constantes et helpers purs
  (`ROLE_CAP`, `RELACHE_FACTOR`, `effectiveCapacity`, `obEligible`,
  `weightForAccount`, `tierFromSegment`, `DEFAULT_WEIGHT_RULES` miroir du seed
  de la migration 016).
- `lib/onboarding/assignmentEngine.ts`, `runAssignmentEngine(input)`.
- `tests/plan-charge-engine.test.ts`, lancé par `npm test`
  (`node:test` + `tsx`).

Les deux modules du moteur sont volontairement purs, sans import Supabase,
Zoho ou Next, pour rester exécutables sous `tsx --test`.

Vérifications passées le 5 septembre 2026 : `npx tsc --noEmit --pretty false`
sans erreur, `npm run lint` sans avertissement, `npm run build` complet,
`npm test` à 30 tests verts dont 19 nouveaux.

### Étape 2, pipeline Zoho — FAIT

- `supabase/migrations/20260905140000_csm_directory_aliases.sql` : ajoute
  `zoho_user_id` et `zoho_aliases` à `csm_capacity_rules`, seedés avec les noms
  de famille observés côté Zoho.
- `lib/zoho/crmClient.ts` : champs `Account_Type`, `Sub_Start_date`,
  `Date_de_passation`, `Nombre_d_h_tels`, `Created_Time` ajoutés à la requête et
  au type `CRMAccount`, plus `csmUserId`. Nouveau lecteur `fetchWonDeals()` sur
  `/Deals/search?criteria=(Stage:equals:Won)`.
- `lib/onboarding/csmDirectory.ts` : `resolveCsmName`, résolution par id
  utilisateur Zoho, puis nom exact, puis alias, puis jeton. Ambiguïté et échec
  renvoient un non résolu, jamais une supposition.
- `lib/onboarding/pipeline.ts` : `buildPlanChargePipeline`, pur, construit le
  pipeline des comptes signés pas encore live et la table de continuité de
  groupe, avec des diagnostics détaillés.
- `lib/onboarding/planChargeSources.ts` : chargement réel Zoho et Supabase,
  barème inclus, lu depuis `csm_assignment_rules`.
- `lib/onboarding/planCharge.ts` : `computePlanCharge`, enchaîne pipeline,
  points de départ et moteur. C'est le point d'entrée de la route API.
- `tests/plan-charge-pipeline.test.ts`.

### Étape 3, API et page — FAIT

- `app/api/onboarding/plan-charge/route.ts`, GET agrégé. Aplatit pipeline et
  attributions en une seule liste de comptes, pour que l'interface n'ait pas à
  recoller deux tableaux.
- `app/api/onboarding/plan-charge/assignments/route.ts`, POST d'override
  manuel. Écriture par FUSION avec la ligne existante : champ absent =
  inchangé, `null` explicite = effacé. Un `upsert` direct aurait effacé un
  verrou CSM en posant un override OB.
- `app/api/onboarding/plan-charge/roster/route.ts`, POST de mise à jour du
  rôle, du plafond et de la disponibilité. Tient `csm_capacity_rules.active`
  cohérent avec `availability`.
- `app/onboarding/plan-charge/page.tsx`, page en français, cinq blocs : KPI,
  attribution éditable, équipes et disponibilité, projection, barème en
  lecture seule.
- Lien « Plan de charge » ajouté à la navigation des quatre pages onboarding
  existantes.

Aucun `revalidateTag` sur les mutations, volontairement : les lectures Supabase
ne sont pas mises en cache et la route GET est `force-dynamic`, donc une
écriture est visible immédiatement. Invalider le tag Zoho forcerait un
rechargement complet du CRM à chaque édition de roster.

### Étape 4, rôle team lead CSM et page dédiée — FAIT

Rôle applicatif `csm_lead`, pour donner un accès restreint à la team lead CSM
sans lui ouvrir tout le cockpit.

- `supabase/migrations/20260905180000_csm_lead_role.sql` : remplace la
  contrainte CHECK sur `users.role`. Elle est REMPLACÉE et non doublée, deux
  CHECK cumulatifs auraient rejeté tous les rôles.
- `lib/auth/roles.ts` : type `Role`, `ROLE_LABELS`, `isRole`.
- `middleware.ts` : `csm_lead` ajouté au seul groupe onboarding, absent des
  groupes `/dashboard`, `/tickets`, `/escalations`, `/trainings`, `/reporting`
  et `/admin`. `homePathForRole` le renvoie vers `/onboarding/csm`.
- Sept routes API : le rôle est ajouté aux lectures onboarding et aux deux
  écritures du plan de charge. Le middleware seul n'aurait PAS suffi, chaque
  route rappelle `requireRole` avec sa propre liste et aurait renvoyé 403.
- Sur `workspace` et `implementation`, seul le `GET` s'ouvre, pas le `PATCH`.
  Les écritures sensibles (fiche projet, produits, passation CSM,
  synchronisations Zoho) restent en `admin` / `onboarder`.
- `app/onboarding/csm/page.tsx` : page de travail, équipe CSM éditable,
  reprises à venir avec attribution CSM éditable et implémenteur en lecture
  seule, projection CSM, barème. Entrée « CSM » ajoutée à la barre d'onglets
  des cinq pages onboarding et à la barre latérale.

Périmètre du rôle, tranché avec Pablo : il voit TOUTE la section Onboarding
sans restriction, et rien du reste du cockpit. Il écrit uniquement sur le
roster CSM et les attributions CSM du plan de charge.

### Étape 5, charge OB réelle et pilotage CSM — FAIT

**Correctif de charge OB.** Le moteur partait d'une charge nulle et ne comptait
que le pipeline. Un implémenteur déjà à 51 projets actifs apparaissait vide, et
le greedy continuait de lui attribuer des comptes. `countActiveProjectsByOwner`
(`lib/onboarding/workload.ts`) compte désormais les projets actifs réels, avec
exactement les règles de `/onboarding/pilotage` : `isActiveProject`, exclusion
des owners hors périmètre, normalisation du nom dont les alias de Winli, un
projet Zoho par hôtel. `computePlanCharge` amorce `obLoad` avec ce comptage.

Deux choix assumés :
- Les projets actifs pèsent sur TOUS les mois de l'horizon. Leur date de sortie
  du stock n'est pas modélisée, l'approximation surestime plutôt qu'elle ne
  masque une surcharge. Piste d'amélioration, utiliser l'`endDate` des projets
  Zoho comme date de libération du slot.
- Les projets actifs portés par une personne absente du roster OB ne sont
  comptés dans aucune capacité, et un avertissement les nomme.

**Analytique CSM.** `lib/onboarding/csmAnalytics.ts`, `computeCsmPortfolios`,
produit une ligne par CSM : portefeuille live, comptes totaux, projets à
surveiller, reprises du mois. Exposé par la route sous `csmPortfolios`.

Deux factorisations au passage, pour éviter des divergences silencieuses :
`indexProjectsByAccount` (l'appariement projet vers compte était écrit trois
fois) et `effectiveMonthForAccount` (la cascade passation, go-live,
`Sub_Start_date` de la spec §9.2 était écrite deux fois).

**Page CSM** refondue sur le modèle de `/onboarding/pilotage` : KPI, charge par
CSM, montée en charge, puis édition du roster et attributions en secondaire.
Satisfaction et TTV restent à `—` avec la limitation affichée : la satisfaction
n'est pas rattachée au CSM dans la source, et le TTV mesure l'implémentation et
non la reprise.

**Barre d'onglets** : libellés en `whitespace-nowrap`, conteneur en
`max-w-full overflow-x-auto`. Sans la contrainte de largeur, un `inline-flex` se
dimensionne sur son contenu et ne défile jamais.

### Étape 6, section CSM autonome et dashboard — FAIT

**Architecture d'information.** L'onboarding redevient strictement l'OB. Section
CSM de premier niveau avec `/csm/pilotage` et `/csm/plan-charge`, redirections
depuis les anciennes URL, routes API déplacées sous `/api/csm/plan-charge`.

**Diagnostic des « comptes non rattachés ».** Ce n'était pas un défaut du
resolver. Les comptes concernés sont encore portés par Grégoire Tiers, ancien
Head of CSM, dont la réattribution n'a jamais été faite. Confirmé sur données
réelles, avec des comptes Best Western dedans, dont BEST WESTERN FRANCE à
71 884 € de MRR. Traité comme une action à faire, via un bandeau « Portefeuille
à réattribuer » en tête de page, et non comme un avertissement technique.
La liste des porteurs concernés est dans `UNMANAGED_OWNER_IDS`
(`lib/csm/dashboard.ts`), éditable.

Découvert au passage, non traité : des comptes portent un CSM dont le nom
revient `null` de l'API, avec l'id `93025000149940001`, soit Aizzaty Sultan,
absente de `csm_capacity_rules`. Ses comptes ne sont rattachés à personne.

**Churn.** Source trouvée, ce sont les tags du module Accounts, `churn`,
`churn25`, `churn26`, `churn27`. Le champ `Tag` a été ajouté au mapping CRM.
Les millésimes sont affichés séparément et non agrégés en un taux unique : les
tags mélangent churn constaté et churn annoncé, `churn27` étant déjà alimenté.
Les tags `downgrade*` sont volontairement exclus, un downgrade n'est pas une
perte de compte.

**Santé de compte.** Tickets Desk ouverts à l'instant T et volume sur 6 mois,
lus depuis `ticket_analytics` (12 mois d'historique, la fenêtre est couverte).
Le rattachement ticket vers compte se fait par égalité STRICTE de nom
normalisé, jamais via `matchAccountByName` de `accountCache` : son appariement
partiel attribuerait les tickets d'un compte à un autre. Les comptes sans
correspondance sont comptés et affichés.

Aucun seuil de bonne ou mauvaise santé n'est défini, aucun score composite : la
page expose les compteurs bruts et un classement. La qualification viendra du
métier une fois les ordres de grandeur observés.

## Décisions tranchées

- Priorité d'attribution : `override manuel` > `continuité de groupe` >
  `répartition automatique`.
- Répartition par capacité restante en valeur absolue, comme le prototype, avec
  un point de configuration `balanceMode: 'absolute' | 'utilization'` pour
  basculer plus tard sur un équilibrage en taux d'utilisation.
- Deux écarts assumés par rapport au prototype, tranchés au profit de la spec :
  1. Un implémenteur en `stop` est exclu des éligibles OB (spec §4.6). Le
     prototype n'excluait que `absent`.
  2. La projection de charge OB compte un compte sur la fenêtre
     `[mois de signature, mois de go-live]` (spec §4.7). Le prototype utilisait
     `go-live >= mois`, ce qui comptait la charge avant même la signature.
  3. Une capacité effective nulle qui porte tout de même de la charge, via un
     override ou la continuité de groupe, est signalée en surcharge. Sans cela
     un CSM en `stop` imposé par la continuité serait resté invisible, ce que
     la spec §4.5 interdit explicitement.
- Roster OB seedé avec les seuls implémenteurs réels, pas de lignes fantômes
  « Alternant / Stagiaire / CDI ». Seeds en `ON CONFLICT DO NOTHING` pour ne
  jamais écraser une disponibilité éditée depuis l'UI.
- `csm_capacity_rules.active` conservé tel quel, sans dérivation automatique,
  pour ne pas modifier le comportement de `csm-suggestion`.
- Table optionnelle `assignment_group_csm` non créée : la continuité de groupe
  se lit depuis Zoho CRM (`Parent_Account` et champ `CSM` des comptes frères).

### Décisions propres au pipeline Zoho

- Source de vérité du pipeline, ce sont les **Accounts**, pas les Deals :
  `Account_Type = 'Client'`, `Sub_Start_date` renseignée et future, et aucun
  projet en statut `live`. Les deals gagnés ne servent qu'à confirmer la
  signature et à la dater.
- Aucun join Deal vers Account : sur un deal `Won`, `Account_Name` pointe vers
  un compte générique « D-EDGE ». L'appariement passe donc par une similarité
  de texte entre `Deal_Name` et le nom du compte, seuil `DEAL_MATCH_THRESHOLD`
  fixé à `0.9` et volontairement conservateur. En pratique beaucoup de deals ne
  seront pas appariés, et la date de signature retombera sur `Created_Time` du
  compte. C'est assumé, et compté dans les diagnostics.
- Le comptage des hôtels d'un groupe impose `fetchAllCRMAccounts({
  includeZeroMrr: true })`. Le filtre `mrr > 0` par défaut écarterait des
  comptes enfants et sous-compterait les groupes.
- L'appariement projet live vers compte se fait par id, puis par nom
  strictement égal après normalisation. On n'utilise pas
  `matchAccountByName` de `clientResolver`, dont l'appariement partiel par
  `includes` ferait disparaître des comptes du pipeline sans laisser de trace.
- `dmbookOnly` est dérivé du champ `Plan` du compte, faute de drapeau dédié
  côté Zoho. À valider avec le métier.
- Les points de départ du mois CSM sont dérivés de `onboarding_projects`, via
  `csm_assigned_at` dans le mois courant. À valider avec le métier.

### Arbitrages métier du 05/09, vérifiés dans Zoho (spec §9)

- `dmbookOnly` est vrai si et seulement si `Plan` vaut exactement
  `["Dmbook"]`. La valeur métier est `"Dmbook"`, pas `"Dmbook Pro"`.
- Les points de départ du mois CSM s'indexent sur `Date_de_passation`, à défaut
  le go-live réel du projet, à défaut `Sub_Start_date`. On n'utilise PAS
  `onboarding_projects.csm_assigned_at` : le barème compte les points à la
  passation et la projection est indexée sur le go-live, mélanger les deux axes
  placerait mal un compte attribué ce mois mais live le mois suivant.
- Les ids utilisateurs Zoho sont posés par
  `20260905160000_csm_zoho_user_ids.sql`, qui insère aussi Harmony (15) et
  Astrid (8), absents du seed de la migration 016.
- Piège de résolution : une « Anne-Sophie Paillard » existe côté Zoho, à ne
  jamais confondre avec Anne-Charlotte. Couvert par un test.
- `computePlanCharge` calcule les points de départ APRÈS le pipeline, en
  excluant ses comptes. Sans cette exclusion, un compte dont la date de
  démarrage tombe plus tard dans le mois courant pèserait deux fois sur ce
  mois.

## À confirmer avec le métier

- Faut-il ajouter des CSM à `csm_capacity_rules` (le prototype citait Harmony
  et Astrid, plafond 8) et quelle capacité CSM pour Winli ?
- Les plafonds de Harmony (15) et Astrid (8) viennent du prototype de
  référence : à confirmer avec la team lead CSM. Ils sont éditables depuis le
  roster.
- Capacité CSM de Winli, toujours à définir. Elle n'est pas encore dans
  `csm_capacity_rules`, elle n'apparaît donc pas au roster CSM.
- Appliquer les trois migrations en base (`supabase db push`) avant d'ouvrir la
  page : sans elles, le roster OB et les overrides ressortent vides, avec un
  avertissement visible plutôt qu'une erreur.

## Reste à faire

- Étape 4, optionnelle : étendre le snapshot quotidien de la migration 026 pour
  historiser aussi la charge CSM projetée par mois.
