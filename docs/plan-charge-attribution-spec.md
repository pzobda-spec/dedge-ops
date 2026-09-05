# Spec, moteur d'attribution et anticipation de charge OB / CSM

Brief d'implémentation pour Claude Code dans le repo `dedge-ops`. Objectif, ajouter un moteur qui pré-attribue les comptes (implémenteur OB + CSM) dès la signature, applique des règles de capacité et d'éligibilité, et projette la montée en charge OB et CSM à partir des ventes Zoho. Prototype de référence validé, `docs/plan-charge-prototype-reference.html` (logique et UI de test).

## 1. Contexte et objectif

La team lead CSM et le management veulent évaluer la montée en charge en temps réel et anticiper. Aujourd'hui le CSM est attribué en fin d'implé, à la main, dans le Google Sheet "SUIVI Passation OB > CSM". On veut, supprimer la saisie manuelle au maximum, anticiper les attributions dès la signature, voir venir la surcharge OB au regard des ventes, et la montée en charge CSM.

Principe de modèle tranché avec Pablo, deux capacités, un seul barème :
- OB (équipe implé) est limitée par le nombre de projets menés en parallèle (stock). Contrainte dure en projets.
- CSM est limitée par le rythme de reprises par mois (flux). Contrainte en points/mois.
- Le barème de poids par compte est commun aux deux, ce qui assure la cohérence.

## 2. Ce qui existe déjà, NE PAS dupliquer

Base de données (`supabase/migrations`) :
- `onboarding_projects` a déjà `csm_assignment_points`, `commercial_plan`, `customer_tier`, `customer_type`, `dmbook_only` (migrations 015, 016).
- `csm_assignment_rules(tier, customer_type, dmbook_only, points)`, seedée avec le barème exact du SUIVI (Bronze DMB 1, Bronze 2, Silver Individuel 3, Silver Groupe 4, Gold Individuel 5, Gold Groupe 8, Key 10). C'est LE barème de référence, réutiliser tel quel.
- `csm_capacity_rules(csm_name, monthly_capacity_points, active)`, seedée avec les 7 CSM (Aika active=false). C'est la capacité CSM.
- `onboarding_workload_snapshots(snapshot_date, owner, active_projects, charge_pct)` (migration 026), snapshots quotidiens de charge OB par owner via cron.

Code :
- `app/onboarding/pilotage/page.tsx`, page de charge OB existante (Recharts, statuts, charge par owner, seuil). `app/onboarding/charge` redirige vers `pilotage`.
- `lib/onboarding/workload.ts`, `CAPACITY_THRESHOLD = 50` et `isActiveProject`.
- `lib/onboarding/constants.ts`, `IMPLEMENTATION_GROUP = [Lan, Thuy-Tien, Dalia, Winli, Deydra]`, normalisation du owner Winli, exclusions.
- `lib/zoho/crmClient.ts`, `segmentFromMRR` (tier depuis MRR), `fetchAllCRMAccounts`.
- `lib/zoho/projectsClient.ts`, `fetchAllZohoProjects`, types `OnboardingProject` / `ProjectStatus`, `buildZohoProjectUrl`.

Contraintes repo (rappel `CLAUDE.md`), Zoho en lecture seule, UI en français, ne jamais rappeler un token hors du provider partagé, invalider les tags de cache après mutation, pas d'action opérationnelle dans les pages analytiques existantes. Vérif finale, `npx tsc --noEmit --pretty false`, `npm run lint`, `npm run build`.

## 3. Ce qu'il manque à construire

1. Roster OB avec rôle, plafond et disponibilité (aujourd'hui seulement une liste de noms).
2. États de disponibilité, `Dispo / Relâche / Absent / STOP`, côté OB et CSM. Relâche divise la capacité par 2, Absent et STOP la mettent à 0. Remplace le simple booléen `active` côté CSM.
3. Règles d'éligibilité OB par séniorité.
4. Continuité de groupe, un compte rattaché à un groupe déjà suivi revient au même CSM, même s'il est en STOP ou Absent, et le dépassement doit rester visible.
5. Moteur d'attribution, pré-attribue OB (à la signature) et CSM (au go-live prévu), greedy sur la capacité restante, éligibilité respectée, overrides manuels prioritaires et persistés.
6. Anticipation, alimenter le pipeline des signatures depuis Zoho (comptes signés pas encore live, avec date de go-live estimée) et projeter la charge OB et CSM par mois.
7. Stockage des pré-attributions et overrides (Supabase), source de vérité éditable.

## 4. Modèle validé

### 4.1 Barème (déjà en base, `csm_assignment_rules`)
Bronze Dmbook seul 1, Bronze 2, Silver Individuel 3, Silver Groupe 4, Gold Individuel 5, Gold Groupe 8, Key 10. Un groupe de N hôtels consomme N projets côté OB, mais compte comme une seule passation pondérée côté CSM.

### 4.2 Plafonds OB (à ajouter)
Rôle -> plafond de projets simultanés, senior 50, junior 50, alternant 30, stagiaire 5 (ajustables).
Éligibilité par rôle :
- senior, tout (indiv et groupes, toute taille).
- junior, indiv et groupes de moins de 5 hôtels.
- alternant, indiv seulement, pas de groupe (sauf exception ponctuelle).
- stagiaire, indiv seulement.

### 4.3 Capacité CSM (déjà en base, `csm_capacity_rules`)
Plafond en points par mois (15 par défaut). Ajouter la disponibilité (voir 4.4). Les points de départ du mois courant, c'est la charge déjà attribuée ce mois.

### 4.4 États de disponibilité (à ajouter, OB et CSM)
`full` (Dispo) capacité pleine, `relache` (Relâche) capacité x 0.5, `absent` (Absent) capacité 0, `stop` (STOP) capacité 0. Ne jamais figer un statut en dur dans le code ou les libellés, tout passe par cet état, éditable.

### 4.5 Continuité de groupe
Si le compte appartient à un groupe déjà suivi par un CSM, ce CSM est imposé pour ses nouveaux hôtels, priorité sur la répartition auto. Source, le champ CSM du compte parent / des comptes frères du groupe dans Zoho CRM. La continuité prime même sur un plafond dépassé ou un état STOP / Absent, mais la surcharge résultante doit apparaître dans les indicateurs. Un override manuel reste prioritaire sur la continuité.

### 4.6 Algorithme d'attribution (voir prototype pour la version exécutable)
Pour chaque compte du pipeline, traité par date de go-live puis date de signature :
- OB, parmi les implémenteurs éligibles au type et à la taille et non Absent/STOP, choisir celui qui a le plus de capacité restante (plafond effectif moins charge courante). La charge ajoute N projets (N hôtels).
- CSM, au mois de go-live. Ordre de priorité, override manuel, puis continuité de groupe, puis greedy (plus de capacité restante ce mois-là). La charge ajoute le poids du compte au mois de go-live.
Priorité générale, `override manuel (locked)` > `continuité de groupe` > `répartition auto`.

### 4.7 Anticipation
Chaque signature porte une date de go-live estimée. Un compte consomme un slot projet OB de la signature jusqu'au go-live, puis bascule en intake de points CSM au mois du go-live. Deux projections mensuelles, charge OB par implémenteur (projets simultanés vs plafond), points CSM par mois et par CSM (vs plafond). Flag de surcharge dès qu'une courbe dépasse le plafond.

## 5. Plan d'implémentation

### 5.1 Migrations Supabase
- `ob_capacity_rules(owner TEXT PK, role TEXT CHECK in (senior,junior,alternant,stagiaire), max_projects INT, availability TEXT CHECK in (full,relache,absent,stop) DEFAULT 'full', updated_at)`. Seed, Thuy-Tien senior 50, Dalia junior 50, Winli junior 50. Alternant / Stagiaire / CDI, à créer inactifs (availability 'absent') quand les recrutements arrivent. Mettre à jour `lib/onboarding/constants.ts`, `IMPLEMENTATION_GROUP` doit devenir `[Thuy-Tien, Dalia, Winli]` (Lan est partie, Deydra bascule CSM). Deydra et Sherazade sont CSM et sortent de l'implé, ne pas les mettre dans le roster OB.
- Étendre `csm_capacity_rules`, ajouter `availability TEXT CHECK in (full,relache,absent,stop) DEFAULT 'full'`. Migrer l'ancien `active=false` vers `availability='stop'` (Aika). Garder `active` en lecture pour compat, ou le dériver de availability.
- `account_assignments(account_id TEXT PK, account_name TEXT, group_id TEXT NULL, ob_owner TEXT NULL, ob_locked BOOLEAN DEFAULT FALSE, csm_name TEXT NULL, csm_locked BOOLEAN DEFAULT FALSE, expected_go_live DATE NULL, source TEXT, updated_at)`. Stocke les pré-attributions et les overrides.
- Optionnel, `assignment_group_csm(group_id TEXT PK, csm_name TEXT)` si la continuité ne peut pas être lue directement depuis Zoho.

### 5.2 Lib
- `lib/onboarding/capacityModel.ts`, constantes et helpers purs, `ROLE_CAP`, `RELACHE_FACTOR = 0.5`, `effectiveCapacity(rule)`, `weightForAccount(tier, type, dmbookOnly)` (lit `csm_assignment_rules`), `obEligible(role, account)`. Réutiliser le barème DB, ne pas le redéfinir en dur.
- `lib/onboarding/assignmentEngine.ts`, la fonction `run(pipeline, obRoster, csmRoster, groupContinuity, overrides)` qui renvoie les attributions OB et CSM, les charges OB, les charges CSM par mois, et les flags. Porter la logique du prototype (`run()` dans `docs/plan-charge-prototype-reference.html`), testée sous node.
- `lib/onboarding/pipeline.ts`, construit le pipeline depuis Zoho, comptes signés pas encore live, avec tier via `segmentFromMRR` (mapper Key = Strategic), type indiv/groupe et nombre d'hôtels, date de go-live estimée. Voir section 7 pour les champs Zoho.

### 5.3 API
- `GET /api/onboarding/plan-charge`, renvoie roster OB, roster CSM, pipeline, attributions calculées, projections. Agrégé côté serveur, cache avec un tag dédié, invalidé après mutation. Respecter les caches existants (Projects 5 min, comptes CRM 1 h).
- `POST /api/onboarding/plan-charge/assignments`, écrit un override (ob_owner/csm_name + locked) dans `account_assignments`, invalide le tag. Zoho reste en lecture seule, on écrit seulement dans Supabase.
- `POST /api/onboarding/plan-charge/roster`, met à jour rôle, plafond, disponibilité d'un OB ou CSM.

### 5.4 Page
- `app/onboarding/plan-charge/page.tsx`, ou enrichir `pilotage`. Quatre blocs alignés sur le prototype, attribution (pipeline avec pré-attribution et overrides), équipes et dispo (édition rôle/plafond/état), projection (deux courbes Recharts avec ligne de plafond et flags), barème (lecture, éventuellement édition admin). UI en français, couleurs D-EDGE (`#59319f` violet, `#00B5AD` teal). Réutiliser les composants Recharts et le style de `pilotage`.

### 5.5 Cron (optionnel, cohérent avec l'existant)
Étendre le snapshot quotidien (migration 026) pour stocker aussi la charge CSM projetée par mois, afin d'historiser la montée en charge.

## 6. Arbitrages tranchés (défauts)
- Règle de répartition, capacité restante en ABSOLU (comme le prototype). Alternative possible plus tard, équilibrage en pourcentage d'utilisation. Laisser un point de configuration pour switcher.
- Poids Key groupe, 10 (valeur DB actuelle, pas de variante groupe). À rediscuter si besoin d'un poids supérieur.

## 7. Mapping Zoho résolu (recherche du 05/09, compte Kopster Colombes 93025000075507010)

Champs confirmés sur le module `Accounts` de Zoho CRM, et déjà en partie mappés dans `lib/zoho/crmClient.ts` (`CRMAccount`) :
- `CSM` (lookup user), le CSM du compte. Ex Kopster Colombes, CSM = Aika Aitkali. Déjà exposé, `CRMAccount.csm`.
- `Parent_Account` (lookup), LE groupe. Ex Kopster Colombes, parent = LAVOREL HOTELS. Déjà exposé, `CRMAccount.parentId` / `parentName`. C'est la clé de la continuité de groupe.
- `Account_Type` (picklist, ex "Prospect"), statut client vs prospect.
- `Sub_Start_date` (date), date de démarrage d'abonnement, proxy de la date de go-live prévue pour l'anticipation. À ajouter au mapping.
- `Date_de_passation` (date), date de passation OB vers CSM. Sert à savoir si la passation est déjà faite.
- `Nombre_d_h_tels` (number), nombre d'hôtels. Souvent vide (null sur Kopster), fallback, compter les comptes enfants partageant le même `Parent_Account`.
- `Subdomain` (ex "Independant"), indice indiv vs groupe, secondaire. `Parent_Account` non nul est le signal fiable de groupe.
- MRR, `MRR_CSM_manual1 || MRR_Total`, tier via `segmentFromMRR` (Strategic, Gold, Silver, Bronze). Mapper `Key = Strategic` pour le barème.
- `Plan` (multiselect), le produit (Enterprise, Insight, etc.).

Côté Zoho Projects (`lib/zoho/projectsClient.ts`) :
- Statut `live` = go-live effectif (`mapStatus`), `actualGoLiveDate` vient du champ custom "Live date", plus `startDate` / `endDate`. Un compte "pas encore live" = pas de projet en statut `live`.

Continuité de groupe, implémentation, pour un compte dont `Parent_Account` = X, chercher les comptes frères (même `Parent_Account`) ayant déjà un `CSM`, prendre ce CSM. À défaut, le CSM du compte parent lui-même.

Type et nombre d'hôtels, un compte avec `Parent_Account` non nul est un membre de groupe. Nombre d'hôtels du groupe = `Nombre_d_h_tels` si rempli, sinon compter les comptes du même `Parent_Account`.

### Pipeline "signé pas encore live", résolu (recherche COQL du 05/09)

Module `Deals`, stages observés, `Presentation`, `Evaluation`, `Negociation`, `Verbal`, `Won`, `Lost`. Signé = `Stage = 'Won'`. Perdu = `Lost`. Pipeline commercial en cours = les autres stages.

PIÈGE 1, les Deals au stage `Won` ont leur lookup `Account_Name` pointant vers un compte générique "D-EDGE" (id 93025000000688535), PAS vers le vrai compte client (le nom du client est dans `Deal_Name`). Donc ne pas joindre Deal -> Account pour retrouver le client d'un deal gagné. La bonne source du pipeline, ce sont les `Accounts` eux-mêmes, `Account_Type = 'Client'` et `Sub_Start_date` renseigné et dans le futur, et pas encore de projet `live` côté Zoho Projects. `Sub_Start_date` est fiable et bien rempli sur les comptes signés récents (dates futures présentes, ex Cairns 2027-01-11, Hotel Windy 2026-12-01). Go-live prévu = `Sub_Start_date`. Le module Deals sert surtout à confirmer/dater la signature, pas à porter le client.

PIÈGE 2, normalisation du nom CSM. Le lookup `CSM` renvoie tantôt le nom complet ("Aika Aitkali"), tantôt seulement le nom de famille ("Rohaut", "Exilie", "Bonnaud"). Or `csm_capacity_rules` utilise les prénoms (Ghislaine, Laurane, Anne-Charlotte...). Il faut un resolver de correspondance vers la clé du roster, idéalement via l'id utilisateur Zoho. Correspondances connues, Rohaut = Ghislaine, Exilie = Laurane, Bonnaud = Anne-Charlotte, Aitkali = Aika. Prévoir la même prudence pour Deydra (Acero), Sherazade (Benamar), Tara (Donnelly). Le mapping existant `crmClient.csm = CSM?.name` renvoie donc une valeur non normalisée, à corriger.

`Date_de_passation` (Accounts) marque la passation OB -> CSM effectuée, souvent null, rempli quand fait.

Un CSM non résolu ne doit jamais être deviné ni rattaché au hasard, il doit ressortir explicitement comme non résolu. Un mauvais rattachement fausserait silencieusement la continuité de groupe, donc toute la projection.

Roster tranché, OB implé = Thuy-Tien (senior), Dalia (junior), Winli (junior). Deydra et Sherazade sont CSM et sortent de l'implé. Winli fera aussi du CSM (capacité à définir) et est prioritaire sur les clients APAC en implé (règle de zone à ajouter plus tard).

## 9. Décisions tranchées le 05/09 par Pablo, vérifiées dans Zoho, ne pas les redériver

### 9.1 `dmbookOnly` se dérive bien du champ `Plan`

Vérifié sur données réelles. Les comptes Dmbook seul ont `Plan` valant exactement `["Dmbook"]` (Maison Astor, Citysuites, Hana, The One Monumental Palace).

Valeurs de `Plan` observées : `Insight`, `Enterprise`, `Dmbook`, `Communication`, `Sentinel`, `WhatsApp`, `Guest Survey`, `Loyalty Programme`.

Règle : `dmbookOnly` est vrai si et seulement si `Plan` vaut exactement `["Dmbook"]`, Dmbook et rien d'autre. Attention, la valeur est `"Dmbook"`, pas `"Dmbook Pro"`. Un `Plan` contenant Dmbook parmi d'autres produits n'est PAS un compte Dmbook seul.

### 9.2 Les points de départ du mois CSM s'indexent sur le go-live, pas sur la date d'attribution

Le barème compte les points à la passation (modèle du SUIVI), et toute la projection est indexée sur le go-live. Mélanger les deux axes fausserait le mois courant : un compte attribué ce mois mais live le mois suivant serait mal placé.

Règle : la base du mois courant est la somme des poids des comptes dont `Date_de_passation` tombe dans le mois courant, à défaut leur go-live. Ne PAS utiliser `onboarding_projects.csm_assigned_at`.

### 9.3 Ids utilisateurs Zoho

Récupérés le 05/09, voir `docs/plan-charge-csm-user-ids.sql`. Ils fiabilisent la résolution du nom de CSM, qui repose sinon sur les noms et alias.

| Clé du roster | Nom Zoho | Id utilisateur |
| --- | --- | --- |
| Anne-Charlotte | Bonnaud | 93025000241678001 |
| Laurane | Exilie | 93025000105340001 |
| Deydra | Acero Vela | 93025000029321001 |
| Sherazade | Benamar | 93025000011483001 |
| Tara | Donnelly | 93025000116805001 |
| Aika | Aitkali | 93025000077681001 |
| Ghislaine | Rohaut | 93025000129927001 |
| Harmony | Telli | 93025000262893001 |
| Astrid | Lapeyre | 93025000264881001 |

Implémenteurs OB : Thuy-Tien (Truong) `93025000189875001`, Dalia (Chaal) `93025000180012268`, Winli `93025000257105001`.

Harmony et Astrid ne figurent pas dans le seed de la migration 016, qui ne créait que 7 CSM : il faut les INSÉRER avant de poser leur id.

Piège de résolution : une « Anne-Sophie Paillard » existe parmi les utilisateurs Zoho, à ne jamais confondre avec Anne-Charlotte.

## 8. Définition de fini
- Migrations appliquées, seeds cohérents avec le SUIVI.
- Moteur couvert par des tests unitaires (porter les cas du prototype, continuité, STOP, redistribution sur Absent).
- Page fonctionnelle en français, pré-attributions éditables et persistées, projections affichées avec flags.
- `npx tsc --noEmit --pretty false`, `npm run lint`, `npm run build` passent.
- Note de vérif dans `docs/`, à la manière des `phaseX-verification.md`.
