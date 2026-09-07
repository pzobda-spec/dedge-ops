# Arbitrages du 7 septembre 2026

Complément à `docs/plan-execution-cockpit.md`. Ce fichier prime sur lui en cas de
divergence : il porte les décisions prises après mesure sur la production Zoho.
Toutes les mesures ci-dessous ont été faites sur les 711 projets actifs du portail
20063488449 et leurs 3 402 jalons, le 6 septembre 2026.

Statut : A1 livré. Lot 0.3 en cours. Voir `docs/plan-execution-journal.md`.

---

## A. Charge et mise en pause

**A1. Priorité absolue, à faire avant tout le reste. LIVRÉ le 7 septembre 2026.**
`isActiveProject` (`lib/onboarding/workload.ts`) n'écartait que `live` et `other`.
Elle écarte désormais aussi `blocked`, `pending_client` et `standby`.

Mesure : 46 projets sont dans ces trois statuts (22 `Blocked`, 22 `Pending (client)`,
2 `Standby`) sur 179 projets non-Live. Ils comptaient donc dans la charge des
implémenteurs et dans le plafond du moteur d'attribution, alors que personne ne les
traite.

**Rectification.** Cette section annonçait « c'est une ligne de code ». C'était faux.
La règle littérale `status !== 'live' && status !== 'other'` était recopiée dans trois
fichiers, et surtout deux concepts distincts étaient confondus sous elle : le plafond
de charge et le périmètre d'affichage ne suivent pas la même règle. Appliquer la règle
de charge aux vues board et clients aurait vidé les colonnes Bloqué, En attente client
et Standby sous le périmètre « actifs », ce qui aurait été une régression
fonctionnelle.

Trois fonctions nomment désormais les deux concepts, et cette séparation remplace la
spécification initiale :

| Fonction | Sert à | Dossiers en pause |
| --- | --- | --- |
| `isActiveProject` | charge et plafonds | exclus |
| `isPausedProject` | identifier une pause, base du lot A2 | — |
| `isOpenProject` | périmètre d'affichage (board, clients) | inclus |

Le comportement des deux vues est inchangé, mais la règle n'est plus dupliquée.
Six tests de non-régression couvrent les trois fonctions et le comptage par
implémenteur. Un test préexistant échouait après le correctif : il attendait deux
projets actifs en comptant un dossier `blocked`, il encodait l'ancienne règle.

**A2.** Ne pas les faire disparaître pour autant : afficher, par implémenteur, le
nombre de projets en pause à côté de la charge active. Sortis du plafond, visibles
à l'écran.

**A3.** Une mise en pause sans date de revue est un trou noir : 8 des 22 projets
`Blocked` n'ont eu aucun mouvement depuis plus de deux ans, le plus ancien depuis
962 jours ; 6 des `Pending (client)` dorment depuis plus de 900 jours. Prévoir une
date de revue et deux vues : pauses sans date de revue, pauses dont la date est
dépassée.

---

## B. Jalons : on en supprime dix, on n'en crée aucun

**B1. Le gabarit est ramené à cinq jalons**, ceux qui sont réellement clôturés :

| Jalon conservé | Volume | Taux de clôture |
|---|---|---|
| `Kickoff & Information Gathering` | 461 | 83,7 % |
| `Connexion PMS` | 461 | 76,1 % |
| `Content integration` | 462 | 75,3 % |
| `Implementation meeting` | 459 | 74,1 % |
| `Campagnes Auto` | 458 | 69,2 % |

**B2. Supprimés du gabarit**, et leurs occurrences ouvertes closes administrativement :

- `Transfert CSM & GP` : 457 créés, **1 coché** (0,2 %).
- `FollowUp & Transfert to CSM` : 151 créés, 1 coché.
- `Kickoff`, `Onboarding` : ancien gabarit, doublons des jalons conservés.
- `WhatsApp Integration`, `Create templates` : 122 créés, 7 % de clôture. Aucun des
  24 projets WhatsApp de 2026 n'a un seul jalon coché.
- `Application`, `Mobile Keys Integration`, et trois libellés uniques hérités.

Effet mesuré de B2 : **590 jalons cessent d'apparaître en retard, soit 44 % du retard
affiché aujourd'hui**, sans qu'une seule case soit cochée.

**B3. Aucun jalon n'est créé.** La version précédente du plan proposait d'ajouter
« relecture et ajustements », « mise en ligne » et « bilan à 3 mois ». Décision
inversée. Ce qui manque est déjà capté :

| Ce qu'il faut suivre | Où c'est capté |
|---|---|
| Attente d'un retour client | statut projet `Pending (client)`, déjà utilisé |
| Mise en ligne et sa date | statut `Live` + champ `Live date` (rempli à 53,5 %, à rendre obligatoire) |
| Passation au CSM | date écrite dans le CRM à l'envoi du contrat de passation |
| Bilan à 3 mois | ligne du contrat de passation, porté par le CSM |
| Blocage et sa cause | statut `Blocked` + champ cause de blocage (D1) |

**B4. Calcul du retard.** Il se fait sur les jalons Zoho, jamais sur les guides
client (qui portent des durées promises, pas des dates). Filtre obligatoire :
exclure les projets au statut `Live`, borner le retard à 90 jours. Sans filtre :
1 340 jalons en retard, retard médian 394 jours, inexploitable. Avec filtre :
**128 jalons sur 40 projets**, ce qui est la maille de la vue « à traiter cette
semaine » du lot 1.1.

---

## C. Contrat de passation

**C1.** Fiche générée, pas rédigée. Déclenchée à la fin de l'implémentation, envoyée
au CSM **avant** le mail officiel qui inclut le client. Cinq blocs sur sept sont
auto-remplissables depuis Zoho ; seuls « formation faite / reste à faire » et
« points de vigilance et promesses faites en séance » sont saisis à la main.

**C2.** Le bilan à 3 mois n'est plus posé par l'implémentation. Elle transmet la date
cible (mise en ligne + 3 mois), le CSM cale et anime.

**C3. Canal non tranché.** Mail automatique Zoho, fiche dans le cockpit avec
notification, ou message Slack. Ne rien implémenter côté canal sans arbitrage
explicite de Pablo. Le reste (génération du contenu) peut avancer sans cette décision.

---

## D. Champs à créer ou rendre obligatoires

- **D1.** Cause de blocage en liste fermée de huit valeurs, dans cet ordre de
  fréquence mesurée sur 93 blocages relevés dans les comptes rendus hebdomadaires :
  client sans réponse (30), en attente de contenu ou de validation (20), intégration
  PMS (18), anomalie produit (10), désaccord ou insatisfaction (7), partenaire tiers
  (5), interlocuteur indisponible (3), blocage interne D-EDGE (3).
- **D2.** PMS en liste fermée plutôt qu'en texte libre.
- **D3.** `Live date` et `Date_de_passation` rendues obligatoires. La date de
  passation n'est renseignée que dans 4,3 % des comptes CRM aujourd'hui.
- **D4.** Responsable obligatoire sur les tâches. Mesure : 100 % des tâches terminées
  portent un responsable, contre 2 % des tâches à faire. Le nom est posé au moment
  où l'on coche, jamais avant.

---

## E. Ce qui reste ouvert, à ne pas trancher seul

1. Le canal du contrat de passation (C3).
2. La traçabilité du suivi confié à l'AM ou au commercial après une mise en pause :
   aucune trace n'existe, ni dans Zoho ni dans Salesforce, sur les 46 dossiers
   concernés. La règle métier existe (deux relances sans réponse, mise en pause,
   relais à l'AM ou au commercial) mais rien ne permet de vérifier qu'elle est honorée.
3. Le rôle de l'AM dans les données en général : il n'apparaît dans aucune source.

---

## Ordre d'exécution

1. **A1** (livré le 7 septembre 2026, corrige tous les chiffres de charge).
2. **Lot 0.3** du plan principal, les snapshots quotidiens : chaque jour d'attente
   est une journée d'historique définitivement perdue.
3. **B4** puis le lot 1.1, la vue « à traiter cette semaine ».
4. **A2**, **A3**, **D1** à **D4**.
5. **C1** hors canal.

Les règles de délégation, le protocole de journal et les quatre vérifications
obligatoires restent celles de `docs/plan-execution-cockpit.md`.
