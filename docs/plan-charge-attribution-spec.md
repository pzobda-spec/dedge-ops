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

### Points tranchés le 05/09 par Pablo, ne pas les redériver

**Signature.** Signé = `Deals.Stage = 'Won'`. Stages observés sur le module `Deals` : `Presentation`, `Evaluation`, `Negociation`, `Verbal`, `Won`, `Lost`. Le pipeline commercial encore en cours, c'est tout ce qui n'est ni `Won` ni `Lost`.

**Piège 1, ne JAMAIS joindre Deal vers Account sur les deals gagnés.** Sur les deals `Won`, `Account_Name` pointe vers un compte générique « D-EDGE » (id `93025000000688535`) et non vers le vrai client. Le client réel est dans le texte de `Deal_Name`. Conséquence directe sur l'architecture du pipeline :

- La source de vérité du pipeline « signé pas encore live », ce sont les **Accounts**, pas les Deals. Critères : `Account_Type = 'Client'`, `Sub_Start_date` renseignée et future, et aucun projet en statut `live` côté Zoho Projects.
- `Sub_Start_date` est fiable et bien renseignée en pratique (exemples vus, Cairns 2027-01-11, Windy 2026-12-01). C'est la date de go-live prévue.
- Les Deals ne servent qu'à confirmer la signature, jamais à porter l'identité du client. Tout rapprochement Deal vers compte passe par le texte de `Deal_Name`, donc reste approximatif, et doit être signalé comme tel plutôt que présenté comme certain.

**Piège 2, le nom du CSM n'est pas normalisé côté Zoho.** Le lookup `CSM` renvoie tantôt le nom complet (« Aika Aitkali »), tantôt le seul nom de famille (« Rohaut », « Exilie », « Bonnaud »), alors que `csm_capacity_rules` est indexée sur les prénoms. `CRMAccount.csm`, aujourd'hui alimenté par `CSM?.name`, renvoie donc une valeur brute inutilisable telle quelle pour la continuité de groupe.

Il faut un resolver, idéalement appuyé sur l'id utilisateur Zoho plutôt que sur le libellé. Correspondances connues :

| Nom de famille Zoho | Prénom dans `csm_capacity_rules` |
| --- | --- |
| Rohaut | Ghislaine |
| Exilie | Laurane |
| Bonnaud | Anne-Charlotte |
| Aitkali | Aika |
| Acero | Deydra |
| Benamar | Sherazade |
| Donnelly | Tara |

Un CSM non résolu ne doit jamais être deviné ni rattaché au hasard : il doit ressortir explicitement comme non résolu.

Roster tranché, OB implé = Thuy-Tien (senior), Dalia (junior), Winli (junior). Deydra et Sherazade sont CSM et sortent de l'implé. Winli fera aussi du CSM (capacité à définir) et est prioritaire sur les clients APAC en implé (règle de zone à ajouter plus tard).

## 8. Définition de fini
- Migrations appliquées, seeds cohérents avec le SUIVI.
- Moteur couvert par des tests unitaires (porter les cas du prototype, continuité, STOP, redistribution sur Absent).
- Page fonctionnelle en français, pré-attributions éditables et persistées, projections affichées avec flags.
- `npx tsc --noEmit --pretty false`, `npm run lint`, `npm run build` passent.
- Note de vérif dans `docs/`, à la manière des `phaseX-verification.md`.
