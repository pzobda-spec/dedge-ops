# Vérification, scaffolding du moteur de plan de charge OB / CSM

## Périmètre

Cette étape couvre uniquement les migrations Supabase, la constante de roster
implémentation (`lib/onboarding/constants.ts`), le moteur pur et ses tests
unitaires. Hors périmètre explicite, à traiter dans une étape suivante : le
pipeline Zoho (`lib/onboarding/pipeline.ts`), les routes API
`/api/onboarding/plan-charge*` et la page UI (`app/onboarding/plan-charge`).

## Migration

Fichier `supabase/migrations/20260905120000_plan_charge_attribution.sql`.

Elle crée :

- `ob_capacity_rules` : roster OB (implémenteurs onboarding) avec rôle,
  plafond de projets simultanés et état de disponibilité. Seedée avec
  Thuy-Tien (senior), Dalia (junior) et Winli (junior), plafond 50 chacune.
- `account_assignments` : pré-attributions et overrides manuels OB/CSM par
  compte Zoho CRM, avec verrous `ob_locked` / `csm_locked`.

Et altère :

- `csm_capacity_rules` : ajout de la colonne `availability` (mêmes valeurs
  que côté OB), avec backfill de l'ancien booléen `active=false` vers
  `availability='stop'`.

Application : `supabase db push`. Les seeds du roster OB sont en
`ON CONFLICT (owner) DO NOTHING`, donc rejouables sans écraser une
disponibilité déjà éditée depuis l'UI.

## Moteur d'attribution

- `lib/onboarding/capacityModel.ts` : constantes et helpers purs, plafonds par
  rôle, facteur de relâche, capacité effective, éligibilité OB, barème de
  poids. `DEFAULT_WEIGHT_RULES` est le miroir exact du seed de la migration
  016 ; en production le barème est lu depuis `csm_assignment_rules`.
- `lib/onboarding/assignmentEngine.ts` : `runAssignmentEngine(input)`, qui
  renvoie les attributions OB et CSM, la charge OB par mois, les points CSM par
  mois et les dépassements de plafond.
- `tests/plan-charge-engine.test.ts` : 19 tests couvrant le barème,
  l'éligibilité, la répartition greedy, la redistribution sur un implémenteur
  absent ou en stop, la continuité de groupe, les overrides, les projections
  mensuelles, le mode d'équilibrage et le déterminisme.

Les deux modules sont volontairement purs, sans import Supabase, Zoho ou Next,
pour rester exécutables sous `tsx --test`.

### Écarts assumés par rapport au prototype

1. Éligibilité OB, un implémenteur en `stop` est exclu des candidats, alors que
   le prototype n'excluait que `absent`. La spec §4.6 dit « non Absent/STOP ».
2. Projection OB, un compte pèse sur la fenêtre
   `[mois de signature, mois de go-live]` incluse, alors que le prototype
   comptait dès que `go-live >= mois`, donc y compris avant la signature. La
   spec §4.7 dit « de la signature jusqu'au go-live ».
3. Détection de surcharge, un membre dont la capacité effective est nulle mais
   qui porte de la charge, via un override manuel ou la continuité de groupe,
   est signalé en surcharge. La formule naïve « plafond > 0 » l'aurait rendu
   invisible, ce qui contredit la spec §4.5 : « la surcharge résultante doit
   apparaître dans les indicateurs ».

### Priorité d'attribution

`override manuel` > `continuité de groupe` > `répartition automatique`. La
continuité s'applique même si le CSM est en `stop` ou `absent`, ou déjà
au-dessus de son plafond.

## Pipeline Zoho

- `supabase/migrations/20260905140000_csm_directory_aliases.sql` : ajoute
  `zoho_user_id` et `zoho_aliases` à `csm_capacity_rules`, et seede les alias
  connus (Rohaut, Exilie, Bonnaud, Aitkali, Acero, Benamar, Donnelly).
- `lib/zoho/crmClient.ts` : nouveaux champs `Account_Type`, `Sub_Start_date`,
  `Date_de_passation`, `Nombre_d_h_tels`, `Created_Time`, plus l'id utilisateur
  du CSM. Nouveau lecteur `fetchWonDeals()`.
- `lib/onboarding/csmDirectory.ts` : résolution du nom de CSM Zoho vers le nom
  canonique de `csm_capacity_rules`.
- `lib/onboarding/pipeline.ts` : `buildPlanChargePipeline`, pur, avec
  diagnostics complets.
- `lib/onboarding/planChargeSources.ts` : chargement réel. Seule brique à faire
  de l'I/O. Les appels Zoho sont mis en cache 15 minutes sous le tag
  `onboarding-plan-charge-zoho` ; les lectures Supabase ne le sont pas, pour
  qu'une édition de roster soit visible immédiatement.
- `tests/plan-charge-pipeline.test.ts`.

### Règles de sélection

Un compte entre au pipeline si `Account_Type = 'Client'`, si `Sub_Start_date`
est renseignée et postérieure à la date de référence, et s'il n'a aucun projet
Zoho au statut `live`. La date de go-live prévue est `Sub_Start_date`.

### Pièges Zoho, à ne pas redécouvrir

1. Les deals gagnés ont un `Account_Name` qui pointe vers un compte générique
   « D-EDGE » : aucun join Deal vers Account n'est possible. L'appariement se
   fait par similarité de texte sur `Deal_Name`, seuil `0.9`, et sert
   uniquement à dater la signature. Un compte non apparié retombe sur
   `Created_Time`.
2. Le lookup `CSM` de Zoho n'est pas normalisé. La résolution passe par
   `resolveCsmName`, dans l'ordre id utilisateur, nom exact, alias, jeton. Une
   correspondance ambiguë renvoie un non résolu : on ne devine jamais un
   rattachement, sous peine de fausser silencieusement la continuité de groupe.
3. `fetchAllCRMAccounts` filtre `mrr > 0` par défaut. Le plan de charge appelle
   donc `{ includeZeroMrr: true }`, sans quoi le comptage des hôtels d'un
   groupe sous-compte les enfants sans MRR.

## Vérifications

```bash
npx tsc --noEmit --pretty false   # aucune erreur
npm run lint                      # No ESLint warnings or errors
npm run build                     # build complet, aucune route cassée
npm test                          # 48 tests, 48 passent, 0 échec
```

Exécutées le 5 septembre 2026. Les deux migrations n'ont pas été appliquées en
base à ce stade.

## Limites connues

- Le roster OB ne contient que les 3 implémenteurs réels ; les futures
  recrues sont à ajouter en `availability='absent'`.
- `csm_capacity_rules.active` est conservé pour compatibilité, non dérivé
  automatiquement de `availability` ; les deux doivent être tenus cohérents
  tant que `csm-suggestion` filtre sur `active`.
- Aucun CSM n'a été ajouté ni retiré ; les capacités et disponibilités
  réelles restent à valider avec la team lead CSM.
- La règle de zone (Winli prioritaire sur les clients APAC) n'est pas
  implémentée.
- Il n'y a encore ni route API ni page : `loadPlanChargeSources` n'est appelée
  par aucun code applicatif tant que la PR suivante n'est pas livrée.
- Les ids utilisateurs Zoho des CSM (`csm_capacity_rules.zoho_user_id`) sont
  vides : la résolution repose donc sur les noms et alias, moins fiable.
- `dmbookOnly` est dérivé du champ `Plan` du compte, Zoho n'exposant pas de
  drapeau dédié. À valider avec le métier.
- Les points de départ du mois CSM sont lus sur `csm_assigned_at` du mois
  courant, avec des bornes comparées en UTC. À valider avec le métier.
- En pratique, peu de deals passeront le seuil d'appariement de `0.9` : la date
  de signature viendra le plus souvent de `Created_Time` du compte. Le compteur
  `dealsUnmatched` des diagnostics permet de le mesurer.
- L'horizon de projection est fourni par l'appelant. Le mois courant y est
  toujours ajouté, pour ne pas perdre les points déjà attribués sur le mois.
