# Journal d'exécution, cockpit dedge-ops v2

Journal de reprise du plan `docs/plan-execution-cockpit.md` et de ses arbitrages
`docs/plan-execution-arbitrages.md`. Tenu par le main, jamais par un worker, mis à
jour à chaque fin de lot.

En cas de divergence entre les deux plans, `plan-execution-arbitrages.md` prime :
il porte les décisions prises après mesure sur la production Zoho.

Dernière mise à jour : 2026-09-07.

---

## 1. État des lots

### Arbitrages (`plan-execution-arbitrages.md`)

| Lot | État |
| --- | --- |
| A1, charge hors dossiers en pause | **livré** |
| A2, afficher les projets en pause par implémenteur | à faire |
| A3, date de revue des pauses et deux vues | à faire |
| B1, gabarit ramené à cinq jalons | à faire |
| B2, dix jalons supprimés et occurrences closes | à faire |
| B3, aucun jalon créé | sans objet, décision de ne rien faire |
| B4, calcul du retard borné | à faire |
| C1, contrat de passation généré | à faire, hors canal |
| C2, bilan à 3 mois porté par le CSM | à faire |
| C3, canal du contrat de passation | **bloqué, arbitrage métier attendu** |
| D1, cause de blocage en liste fermée | à faire |
| D2, PMS en liste fermée | à faire |
| D3, `Live date` et `Date_de_passation` obligatoires | à faire |
| D4, responsable obligatoire sur les tâches | à faire |

### Plan principal (`plan-execution-cockpit.md`)

| Lot | État |
| --- | --- |
| 0.0, reprise d'état | **livré** |
| 0.1, nom du département Desk | à faire |
| 0.2, couverture des données | à faire |
| 0.3, snapshots quotidiens | à faire, priorité 2 de l'ordre d'exécution |
| 0.4, fermer les routes admin | à faire |
| 0.5, réparer ou retirer l'assistant IA | à faire |
| 1.1, vue « à traiter cette semaine » | à faire, après 0.2 et 0.3 |
| 1.2, préqualification d'urgence | à faire, en dernier |
| 1.3, journal d'actions par projet | à faire |
| 1.4, délai promis contre délai réel | à faire |
| 1.5, dossiers calés par jalon | à faire, après 1.4 |

---

## 2. État de départ mesuré au lot 0.0

Relevé le 2026-09-07 sur `main`, commit `8ad425f`.

- Les quatre PR du plan de charge sont fusionnées. `main` porte le moteur, le
  pipeline Zoho, les routes et les pages. Aucune PR ouverte.
- Vérifications au départ : `tsc` sans erreur, `lint` sans avertissement,
  76 tests verts.
- 30 migrations dans `supabase/migrations/`, dont les quatre du plan de charge
  (`20260905120000` à `20260905180000`). **Elles sont appliquées en base**,
  confirmé par Pablo. `docs/plan-charge-avancement.md` indique le contraire :
  il est périmé sur ce point.
- `onboarding_workload_snapshots` existe (migration 026) et **n'est alimentée
  par aucun cron**. Constat du plan confirmé : aucune référence à cette table
  dans `app/api/cron/`.
- `csm_portfolio_snapshots` n'existe dans aucune migration. À créer au lot 0.3.
- `app/api/cron/process-support-shadow/route.ts` existe mais **n'est pas
  déclaré dans `vercel.json`** : ce cron ne tourne donc jamais. Non prévu au
  plan, à arbitrer.
- 10 branches `agent/*` subsistent en local et sur `origin`, toutes fusionnées
  ou abandonnées. Nettoyage sans risque, non prioritaire.

---

## 3. Décisions tranchées

- **A1, périmètre de la charge.** `isActiveProject` écarte désormais `blocked`,
  `pending_client` et `standby` en plus de `live` et `other`. Justification :
  46 projets mesurés dans ces statuts gonflaient la charge des implémenteurs et
  le plafond du moteur d'attribution avec des dossiers que personne ne traite.
- **A1, séparation de deux concepts qui étaient confondus.** Le code mélangeait
  la charge et le périmètre d'affichage sous la même règle littérale, recopiée
  dans trois fichiers. Trois fonctions nommées les distinguent maintenant :
  `isActiveProject` (charge, exclut les pauses), `isPausedProject` (pause), et
  `isOpenProject` (affichage, garde les pauses). Justification : appliquer la
  règle de charge aux vues board et clients aurait vidé les colonnes Bloqué,
  En attente client et Standby sous le périmètre « actifs ».
- **A1, comportement des pages inchangé.** `app/onboarding/board` et
  `app/onboarding/clients` consomment `isOpenProject` : même résultat qu'avant,
  mais la règle n'est plus dupliquée.
- **Pourcentage de charge, dénominateur.** Confirmé par Pablo le 7 septembre :
  la charge se mesure contre le plafond réel de chaque implémenteur
  (`ob_capacity_rules.max_projects`, pondéré par la disponibilité), et le
  dénominateur est stocké dans `onboarding_workload_snapshots.capacity`.
  Justification : une alternante et une stagiaire arrivent dans l'équipe, leurs
  plafonds sont de 30 et 5 contre 50 pour les seniors et juniors. Les plafonds
  vont donc réellement diverger, et sans le dénominateur un pourcentage
  historique deviendrait illisible dès qu'un plafond change. Numériquement, rien
  ne change aujourd'hui : les trois implémenteurs actuels sont à 50.
- **Graphique d'évolution de la charge, deux séries jamais mélangées.** Confirmé
  par Pablo. Les snapshots réels s'affichent en trait plein, l'estimation
  antérieure en pointillé grisé, avec la date de bascule annotée sur l'axe. Les
  deux séries n'entrent jamais dans un même calcul de tendance ou de moyenne :
  une variation à cheval sur la bascule serait un artefact de méthode, pas un
  mouvement de charge.

---

## 4. Écarts assumés par rapport au plan

- Le plan A1 annonce « une ligne de code ». En pratique la règle était recopiée
  dans trois fichiers : corriger la seule fonction aurait laissé deux vues avec
  une définition divergente de « actif ». Le correctif touche donc trois
  fichiers, sans changer le comportement des deux pages.
- `isPausedProject` est exporté sans être encore consommé par une vue. Il sera
  utilisé au lot A2, qui affiche le nombre de dossiers en pause par
  implémenteur.
- **La spécification A1 a été rectifiée dans le fichier d'arbitrages**, à la
  demande de Pablo. Elle annonçait « c'est une ligne de code », ce que la mesure
  a démenti. La séparation en trois fonctions remplace la spécification
  initiale et a été validée : un plafond de charge et un périmètre d'affichage
  ne suivent pas la même règle.
- `csm_portfolio_snapshots` est créée dans le même lot que le cron, avec la même
  clé d'upsert que la charge implémentation. Validé : la montée en charge CSM a
  besoin du même historique, c'est la demande d'origine de la team lead CSM.

---

## 5. Questions ouvertes, arbitrage métier attendu

1. **C3, canal du contrat de passation.** Mail automatique Zoho, fiche dans le
   cockpit avec notification, ou message Slack. Rien à implémenter côté canal
   sans décision explicite. La génération du contenu (C1) peut avancer sans.
2. **Traçabilité du relais AM ou commercial après une mise en pause.** Aucune
   trace n'existe, ni Zoho ni Salesforce, sur les 46 dossiers concernés.
3. **Rôle de l'AM dans les données**, absent de toutes les sources.
4. **Cron `process-support-shadow` non déclaré dans `vercel.json`.** À NE PAS
   brancher. Une route de shadow mode qui n'a jamais tourné peut avoir été
   débranchée volontairement. Pablo vérifie avant toute intervention.
5. Reste de `plan-charge-avancement.md` : capacité CSM de Winli, absente de
   `csm_capacity_rules` ; plafonds de Harmony (15) et Astrid (8) repris du
   prototype, à confirmer.
6. **Seuil de santé de compte**, nombre de tickets ouverts à partir duquel un
   compte passe en alerte. Aucun seuil posé à ce jour, volontairement.

---

## 6. Prochaine action concrète

Pour quelqu'un sans aucun contexte :

1. Lot **0.3**, les snapshots quotidiens. La migration
   `20260907170000_portfolio_snapshots.sql` est écrite : elle crée
   `csm_portfolio_snapshots` et ajoute la colonne `capacity` à
   `onboarding_workload_snapshots`. Restent à faire, un cron quotidien
   idempotent alimentant les deux tables, et le branchement du graphique
   « Évolution de la charge » sur la table plutôt que sur le recalcul.
   **Piège de date** : la clé d'upsert doit porter la date métier
   `Europe/Paris` (`planChargeReferenceDate()`), pas la date UTC du
   déclenchement. Les crons Vercel tournent en UTC : un cron exécuté après 22 h
   heure de Paris écrirait sur le lendemain.
2. Puis **B4**, le calcul du retard borné, qui conditionne le lot 1.1.

## 6 bis. Incident résolu

Un `.git/index.lock` a bloqué tout commit le 7 septembre entre 16 h 23 et
17 h 10. Origine : un `git status` lancé depuis un autre outil sur le dossier
monté, ni par le main ni par un worker. Rien à corriger dans le repo. Le verrou
a été levé par Pablo, les fichiers du lot A1 ont ensuite été commités.

---

## 7. Fichiers du lot A1, commités le 2026-09-07

- `lib/onboarding/workload.ts` : `isActiveProject` corrigée, ajout de
  `isOpenProject` et `isPausedProject`.
- `app/onboarding/board/page.tsx` : consomme `isOpenProject`.
- `app/onboarding/clients/page.tsx` : consomme `isOpenProject`.
- `tests/onboarding-workload.test.ts` : nouveau, 6 tests de non-régression.
- `tests/plan-charge-pipeline.test.ts` : un test corrigé, il encodait
  l'ancienne règle en comptant un dossier `blocked` dans la charge.
- `CHANGELOG.md` : entrée fonctionnelle du lot A1.

Commités au même moment :

- `docs/plan-execution-cockpit.md`, `docs/plan-execution-arbitrages.md` (avec la
  rectification de A1), `docs/plan-execution-journal.md`.

En attente, rattaché au lot 0.3 et non commité avec A1 :

- `supabase/migrations/20260907170000_portfolio_snapshots.sql`, écrite et non
  encore accompagnée de son cron. Le lot n'est pas déclaré livré.
