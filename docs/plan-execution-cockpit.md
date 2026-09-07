# Plan d'exécution, cockpit dedge-ops v2

Plan de travail délégué pour Claude Code ou Codex. Il fait suite à l'audit du cockpit
(constats chiffrés sur la production Zoho CRM, Projects, Desk, Linear, Salesforce).
Ce fichier est le point d'entrée unique : il est autoportant, un agent qui le lit
n'a besoin d'aucun contexte de conversation.

Statut : à démarrer. Dernière mise à jour : 2026-09-06.

---

## 0. Règles de délégation

Trois rôles, une règle simple : le scout regarde, le worker écrit, le main décide.

**main** (session principale). Ne se délègue jamais :
- authentification, rôles, middleware, `requireRole`, RLS ;
- migrations de schéma et toute contrainte de base ;
- arbitrages métier et résolution des contradictions de spec ;
- revue de chaque livraison de worker avant commit ;
- ouverture des PR et mise à jour du CHANGELOG.

**scout** (agent en lecture seule). Précède tout lot dont les fichiers cibles ne sont pas
déjà connus. Ne modifie rien. Rend : fichiers concernés, conventions en place, pièges,
et ce qui existe déjà et ne doit pas être recréé.

**worker** (agent d'implémentation). Un worker par lot, sur des fichiers disjoints.
Deux workers ne touchent jamais le même fichier dans la même vague.
Un worker qui rencontre une contradiction dans la spec s'arrête et remonte, il ne tranche pas.

Règle de vague : lancer au maximum deux workers en parallèle, et seulement si leurs
fichiers ne se recoupent pas. Sinon, séquentiel.

---

## 1. Protocole de reprise et de journal

Objectif : pouvoir basculer de Claude Code à Codex, ou l'inverse, sans perte.

**`docs/plan-execution-journal.md`** (à créer au lot 0.0). Mis à jour par le main
à chaque fin de lot, jamais par un worker. Contient, dans cet ordre :
1. l'état de chaque lot : `à faire` / `en cours` / `livré` / `abandonné (raison)` ;
2. les décisions tranchées, avec leur justification en une phrase ;
3. les écarts assumés par rapport à ce plan ;
4. les questions ouvertes en attente d'arbitrage métier ;
5. la prochaine action concrète, formulée pour quelqu'un qui n'a aucun contexte.

**`CHANGELOG.md`** (existe déjà). Mis à jour par le main **uniquement après**
que les quatre vérifications passent, jamais avant. Une entrée par lot livré,
orientée fonctionnel et non technique : ce que l'utilisateur peut faire ou voir
de nouveau, pas le nom des fichiers touchés.

**Règle de bascule.** Avant de changer d'outil, le main clôt le lot en cours ou le
marque explicitement `en cours` avec l'état exact des fichiers modifiés et non commités.
Un lot n'est jamais laissé dans un état implicite.

---

## 2. Vérifications obligatoires

Aucun lot n'est déclaré livré tant que les quatre ne passent pas :

```bash
npx tsc --noEmit --pretty false
npm run lint
npm run build
npm test
```

Tout lot touchant un calcul métier ajoute des tests de non-régression.
Tout lot touchant une route ajoute ou met à jour la note de vérification dans `docs/`.

---

## 3. Lots de travail

### Lot 0.0 — Reprise d'état (scout, puis main)

**Pourquoi.** Trois PR ont été ouvertes et fusionnées récemment (moteur, pipeline Zoho,
routes et pages). Il faut savoir ce qui est réellement sur `main` avant d'écrire quoi que ce soit.

**Scout.** Rendre : branches et PR ouvertes, contenu réel de `main`, migrations appliquées
ou non, état de `docs/plan-charge-avancement.md`, et présence des tables
`onboarding_workload_snapshots`, `account_assignments`, `ob_capacity_rules`.

**Main.** Créer `docs/plan-execution-journal.md` et y consigner l'état de départ.

**Fini quand** le journal existe et décrit l'état réel du repo.

---

### Lot 0.1 — Corriger le nom du département Desk (main)

**Constat.** Le code exclut le département `5861000019985859` en le nommant « CSM ».
Ce département s'appelle en réalité **LoungeUp Onboarding Team**. Le vrai département CSM
est `5861000051855057` (D-EDGE CRM CSM Team, créé en juin 2026, 44 tickets).

**Mesure faite.** Sur 505 tickets du département mal nommé : 99,5 % n'ont qu'un seul message,
100 % zéro commentaire, 0 % fermés, environ 98 % émis par des automates
(Meta WhatsApp, Spotify, Zoho, Thinkific, sondage NPS) ou des alias internes.
Le département a `isVisibleInCustomerPortal: false`.

**Décision déjà prise, ne pas la rouvrir.** L'exclusion est correcte, c'est du bruit.
Seule l'étiquette est fausse.

**À faire.** Renommer la constante et le commentaire dans `CLAUDE.md` et dans le code
(`lib/zoho/constants.ts` et tout endroit citant l'id). Ajouter une constante distincte
pour le vrai département CSM, sans encore l'exploiter. Documenter l'exclusion et sa raison
dans `docs/analytics-dashboards-verification.md`.

**Fini quand** aucune occurrence du mot « CSM » ne désigne plus le département Onboarding.

---

### Lot 0.2 — Afficher la couverture des données (worker)

**Pourquoi.** Le cockpit affiche des chiffres dérivés de champs très incomplets sans le dire.
C'est la première cause de perte de confiance dans l'outil.

**Taux mesurés, à afficher tels quels :**

| Champ | Source | Remplissage |
|---|---|---|
| `accountId` sur les tickets | Zoho Desk | 48 % |
| `MRR_Total` non nul | Zoho CRM | 45,5 % (919 comptes sur 1 686 à zéro) |
| bloc engagement produit (9 champs) | Zoho CRM | 47,7 %, exactement les mêmes 805 comptes |
| `live_date` | Zoho Projects | 53,5 % |
| `Date_de_passation` | Zoho CRM | 4,3 % |
| `Account_level` | Zoho CRM | 51,3 % |

**À faire.** Un composant réutilisable `CoverageNote` affichant, sous toute métrique
concernée, la formulation : « calculé sur N comptes valorisés sur M, soit X % ».
L'appliquer à toutes les métriques dérivées des champs ci-dessus.
Le taux est calculé à l'exécution, jamais codé en dur.

**Fini quand** aucune métrique dérivée d'un champ à moins de 80 % de remplissage
n'est affichée sans sa couverture.

---

### Lot 0.3 — Démarrer les snapshots quotidiens (worker)

**Pourquoi.** C'est l'action la moins visible et la plus rentable du plan. Sans historique,
ni rétention, ni tendance, ni délai réel ne seront jamais calculables. Chaque jour d'attente
est un jour d'historique définitivement perdu.

**Constat.** La table `onboarding_workload_snapshots` existe (migration 026) et
**n'est alimentée par rien**. Le graphique « Évolution de la charge » recalcule une
estimation à la volée au lieu de la lire.

**À faire.**
1. Un cron quotidien alimentant `onboarding_workload_snapshots`
   (date, owner, projets actifs, charge en pourcentage).
2. Une nouvelle table `csm_portfolio_snapshots`
   (date, csm, comptes clients, comptes live, MRR valorisé, comptes churned cumulés).
3. Brancher le graphique existant sur la table plutôt que sur le recalcul.
4. Idempotence : un rejeu le même jour écrase, il ne duplique pas.

**Fini quand** deux jours consécutifs de snapshots existent en base pour les deux tables.

---

### Lot 0.4 — Fermer les routes admin (main)

**Constat.** `/api/admin/normalize-tickets` et `/api/admin/fix-undefined-tickets`
ne vérifient pas les droits. Déjà relevé dans `docs/performance-audit.md`, non corrigé.

**À faire.** `requireRole(['admin'])` sur les deux routes, et vérifier qu'aucune autre
route sous `app/api/admin/` n'est dans le même cas.

**Fini quand** un appel non authentifié à ces routes renvoie 401 ou 403.

---

### Lot 0.5 — Réparer ou retirer l'assistant IA (worker)

**Constat.** Les 6 actions rapides de `/assistant` changent le texte du prompt mais
appellent toutes `/api/ai/summarize-ticket` sur un ticket échantillon fixe.
Les routes `generate-client-reply`, `create-escalation`, `create-knowledge-article`
et `monthly-analysis` existent et ne sont jamais atteintes.

**À faire.** Router chaque action vers sa route réelle, avec le contexte attendu.
Si une action n'a pas de contexte utilisable, la retirer plutôt que la laisser décorative.

**Fini quand** chaque action visible appelle une route distincte et renvoie un résultat réel.

---

### Lot 1.1 — Vue « À traiter cette semaine » (worker, après 0.2 et 0.3)

**Pourquoi.** C'est le virage central : passer d'un tableau d'état à une liste d'exceptions.
Chaque ligne porte un objet, une raison, un propriétaire, une échéance, un lien d'action.

**Règles d'exception à implémenter.** Toutes calculables sans nouvelle source.
Les seuils sont des constantes exportées et réglables, pas des valeurs enfouies.

| Règle | Source |
|---|---|
| Projet dont le temps dans la phase courante dépasse le 75e centile de cette phase | Zoho Projects, jalons |
| Projet démarré depuis plus de 30 jours sans `live_date` | Zoho Projects |
| Ticket ouvert au-delà du SLA de son niveau d'urgence préqualifié | `lib/support/urgency` |
| Ticket rouvert dans les 7 jours | `reopenCount` |
| Compte à 3 tickets ou plus en 7 jours glissants | `ticket_analytics` |
| Compte dont `Next_FollowUp_due_date` est dépassée | Zoho CRM |
| Compte live sans CSM actif | Zoho CRM |
| Implémenteur au-dessus de son plafond de projets simultanés | plan de charge |

**À faire.** Une route agrégée renvoyant les exceptions, et une vue par rôle
(implémentation, support, CSM) devenant la page d'accueil du rôle concerné.
Le silence est un état valide et doit s'afficher comme un succès, pas comme un vide.

**Fini quand** la vue liste des exceptions réelles, chacune avec propriétaire et lien d'action.

---

### Lot 1.2 — Activer la préqualification d'urgence (main)

**Constat.** `lib/support/urgency` est complet : SLA en minutes ouvrées,
5 motifs critiques, scores de confiance de 0,94 à 0,98. Les écritures Zoho, Linear
et Slack sont forcées à `false`. Le travail est fait, il dort.

**À faire.** Sortir du shadow mode par étapes, jamais d'un coup : d'abord l'affichage
dans la vue exceptions du lot 1.1, ensuite seulement, et après validation humaine
sur au moins deux semaines, envisager une écriture.

**Ce lot reste au main** : il touche à ce qui peut écrire dans des outils de production.

**Fini quand** les urgences préqualifiées alimentent la vue exceptions, sans aucune écriture externe.

---

### Lot 1.3 — Afficher le journal d'actions par projet (worker)

**Constat.** Les tables `project_decisions`, `project_actions` et `project_calendar_events`
sont alimentées par le serveur MCP (comptes rendus de rendez-vous, décisions, tâches)
et **ne sont lues par aucune page**. La fiche projet n'affiche que des modèles d'email statiques.

**Pourquoi ça compte.** C'est précisément l'endroit central où remontent les actions
de l'équipe par projet, demandé de longue date. Il est écrit et invisible.

**À faire.** Un onglet ou une section de la fiche projet affichant, par ordre
antéchronologique : décisions, actions avec leur propriétaire et leur échéance,
et événements de calendrier. Lecture seule dans un premier temps.

**Fini quand** un compte rendu enregistré via MCP apparaît sur la fiche du projet concerné.

---

### Lot 1.4 — Délai promis contre délai réel (worker)

**Pourquoi.** Les guides d'implémentation client engagent par écrit sur une durée.
Personne ne compare le réel au promis. C'est la métrique de sommet du service.

**Durées cibles, du kick-off à la mise en ligne :**

| Plan | Cible |
|---|---|
| Communication | 3 à 4 semaines |
| Insight | 3 à 4 semaines |
| Engagement | 4 à 6 semaines |
| Enterprise | 4 à 6 semaines |
| option Programme de fidélité | + 2 à 5 semaines, en parallèle |
| option WhatsApp | + 1 à 2 semaines, en parallèle |

**À faire.** Une table de référence des durées cibles par plan, puis le calcul
du délai réel (début du projet vers `live_date`, à défaut date de passage au statut Live),
et l'écart. Afficher la médiane par plan, jamais la moyenne seule.
Afficher la couverture, `live_date` n'étant renseigné qu'à 53,5 %.

**Attention.** Les options se déroulent en parallèle et ne doivent pas être comptées
dans le délai du plan principal.

**Fini quand** on peut lire, par plan, la médiane du délai réel face à la cible annoncée.

---

### Lot 1.5 — Dossiers calés, par jalon (worker, après 1.4)

**Constat mesuré sur 711 projets.** La complétion Zoho est réelle et exploitable :
87,1 % des tâches et 70,3 % des jalons sont clos sur les projets passés Live,
et cela s'améliore (8,0 % de tâches ouvertes sur les Live créés en 2026, contre 13,8 % avant).
En revanche 85,8 % des projets sont en `is_rollup_project`, donc le statut des jalons
est **calculé à partir de la clôture des tâches** et non saisi : mesurer les tâches, pas les jalons.

**À faire.** Le temps passé dans le jalon courant, par projet, et la liste des projets
dont ce temps dépasse le 75e centile historique du même jalon pour le même type de projet.

**Exclusions à appliquer.** 25 projets Live gelés à 0 % depuis 2023-2024,
et 16 projets Fidélité sans aucune tâche : ils fausseraient les centiles.
Les exclure explicitement et afficher leur nombre.

**Fini quand** la liste des dossiers calés alimente la vue du lot 1.1.

---

## 4. Ordre d'exécution

```
0.0 scout + main            (bloquant, toujours en premier)
 |
 +-- 0.1 main  ---+
 +-- 0.4 main  ---+--- peuvent être menés dans la même session
 |
 +-- 0.2 worker ---+
 +-- 0.3 worker ---+--- fichiers disjoints, parallélisables
 |
 +-- 0.5 worker      (indépendant, à faire quand il reste du temps)
 |
1.4 worker                  (avant 1.5, qui en dépend)
1.3 worker                  (indépendant, parallélisable avec 1.4)
1.5 worker
1.1 worker                  (consomme 1.5, donc après)
1.2 main                    (en dernier, alimente 1.1)
```

---

## 5. Hors périmètre, décisions déjà prises

Ne pas rouvrir ces sujets sans arbitrage métier explicite :

- **Welcome Process Salesforce** : abandonné. 16 dossiers sur 6 846 concernent un compte CRM,
  99,5 % portent un produit générique, et les identifiants de jointure vers Zoho
  sont remplis à 0,7 %.
- **Score de santé composite** : reporté. L'usage produit ne couvre que 47,7 % du parc,
  la satisfaction déclarative n'a aucun pouvoir prédictif (749 « Satisfied » sur 859 renseignés,
  8 négatifs au total).
- **Sous-catégorie et priorité des tickets Desk** : 0 % et 7 % de remplissage.
  Chantier de process côté Desk, pas d'affichage.
- **Migrer le suivi des actions vers Zoho Projects** : écarté. Zoho ne porte aucun commentaire
  (0 sur 24 listes inspectées), 7 tâches sur 10 sont sans responsable, et son gabarit
  ignore la boucle de relecture et le bilan à 3 mois. Le référentiel du parcours reste le cockpit.
- **Ajouter des graphiques** : non. En retirer serait plus utile.

---

## 6. Point d'honnêteté à conserver dans le code

`Date_de_passation` n'est renseigné qu'à **4,3 %**. Le modèle de charge CSM s'appuie dessus
avec un repli sur le go-live. Ce repli n'est pas un cas limite, c'est la règle réelle.
Le commentaire dans le code doit le dire, et l'interface doit afficher la couverture.
