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
