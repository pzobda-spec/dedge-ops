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
PR 1 ouverte : https://github.com/pzobda-spec/dedge-ops/pull/19

## Découpage retenu

1. **PR 1, scaffolding** : migrations Supabase, moteur pur, tests unitaires.
   Aucune dépendance à Zoho, aucune route API, aucune page.
2. **PR 2, pipeline Zoho** : `lib/onboarding/pipeline.ts`, extension du mapping
   CRM, alimentation du moteur avec les comptes signés pas encore live.
3. **PR 3, API et page** : `/api/onboarding/plan-charge*` et
   `app/onboarding/plan-charge`.

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

## À confirmer avec le métier

- Faut-il ajouter des CSM à `csm_capacity_rules` (le prototype citait Harmony
  et Astrid, plafond 8) et quelle capacité CSM pour Winli ?
- Confirmation du module `Deals` pour la notion de « signé », du libellé du
  stage gagné et du lien Deal vers Account.
- Confirmation que `Sub_Start_date` est réellement renseigné sur les comptes
  signés récents, sinon repli sur la date du Deal.

## Reste à faire

- Étape 2 : `lib/onboarding/pipeline.ts`, ajout au mapping `CRMAccount` des
  champs `Sub_Start_date`, `Date_de_passation`, `Nombre_d_h_tels`,
  `Account_Type`, et construction du pipeline des comptes signés pas encore
  live.
- Étape 3 : routes `GET /api/onboarding/plan-charge`,
  `POST /api/onboarding/plan-charge/assignments`,
  `POST /api/onboarding/plan-charge/roster`, avec tag de cache dédié invalidé
  après mutation, puis la page `app/onboarding/plan-charge`.
- Étape 4, optionnelle : étendre le snapshot quotidien de la migration 026 pour
  historiser aussi la charge CSM projetée par mois.
