# Recette du cockpit décisionnel — 9 septembre 2026

## Périmètre de la version

Cette passe met en œuvre les corrections factuelles et plusieurs parcours de
l’audit du 8 septembre. Elle ne prétend pas résoudre tous les besoins métier de
l’audit. La recette ci-dessous précède la publication via `main` sur Vercel,
demandée le 9 septembre. Aucun changement de données métier n’est inclus.

| Usage | Parcours disponible |
| --- | --- |
| Support | Séparer créations filtrées et stock historisé ouvert ; repérer ancienneté et produits ; voir la fraîcheur réelle |
| Implémentation | Retrouver les prochaines actions saisies, leurs échéances/propriétaires/blocages ; voir les pauses hors plafond |
| Formations | Examiner les quatre semaines à venir par thème/langue, heures, inscriptions, sessions vides et capacité connue |
| Team lead CSM | Pré-attribuer sans modifier l’OB ; arbitrer une date ; retrouver les reprises non datées/échues ; lire les plafonds effectifs individuels |

## Vérifications

- TypeScript, lint, build de production et suite de tests exécutés ; résultats finaux consignés à la clôture ci-dessous.
- Tests de pagination : zéro ligne, 1 000 exactes, 2 060, erreur tardive, réponse absente.
- Routes d’écriture réelles compilées avec identité et stockage fictifs : refus des champs OB/groupes pour CSM lead, commercial interdit, date impossible refusée, attribution CSM et capacité CSM acceptées. Aucun appel Zoho et aucune écriture réelle lors de ces tests.
- Calculs : ancienneté inconnue/future, déduplication des noms clients, capacité formation inconnue, brouillons/annulations, report de date CRM, date arbitrée échue, dédoublement OB complet et partiel, conservation des points CSM.
- Prochaines actions : rapprochement identifiant Zoho, exclusion des projets clos, échéances passées/à sept jours/sans date, pauses et couverture de saisie.
- Navigateur : pages/composants réels compilés avec sources fictives et CSS du build. Vérifiés : OB désactivé pour la team lead, édition CSM, payload sans champ OB, édition de capacité complète, enregistrement de date, commercial sans éditeur actif, état partiel sans faux succès, recherche vide, formations à venir et stock support. Ces fixtures ne vérifient pas une session authentifiée en production.
- Contrôle réel Supabase en lecture seule : **2 074** tickets sur six mois avec nom client, total identique au `count: exact`. **95** tickets Open/Pending historisés, **34** de plus de trente jours à la mesure. Vérification des colonnes pauses, prochaines actions, provenance des snapshots et date manuelle d’attribution.

Les mesures sont ponctuelles et non des constantes produit. La collecte la plus
ancienne du stock ouvert mesuré date du **18 juillet 2026**. L’interface avertit
qu’une partie du stock n’a pas été resynchronisée récemment ; il ne faut pas le
présenter comme un inventaire live exhaustif. Le cron actuel relit douze mois de
créations et une fenêtre de modifications : cela ne constitue pas une preuve de
réconciliation complète des anciens tickets ouverts.

## Règles conservées

- Zoho CRM en lecture seule ; traitement support/bugs dans Zoho Desk/Linear.
- Barème, capacité nominale et règles d’éligibilité inchangés.
- Base OB active conservée sur tout l’horizon par prudence ; pas de date de
  libération inventée pour un projet actif. Seuls les projets effectivement
  inclus dans la base du roster sont déduits des slots supplémentaires.
- Pipeline non arbitré : sélection future existante conservée. Les vieux comptes
  CRM sans preuve de projet ouvert ne deviennent pas artificiellement un
  pipeline. Les dates explicitement arbitrées et échues restent visibles.
- Reprises CSM ≠ charge récurrente totale du portefeuille. La date d’abonnement
  reste une estimation ; les pré-attributions locales ne confirment pas une
  passation réelle. Les changements de disponibilité s’appliquent à tout
  l’horizon, pas à un calendrier d’absences daté.
- Les rattrapages ne sont pas des observations historiques du jour manqué.
- Fenêtres de quatorze jours des relances et quatre-vingt-dix jours des jalons
  inchangées. Pas de changement de page d’accueil avant le pilote prévu.

## Ce qui reste à faire ou arbitrer

1. Revue de la fraîcheur/réconciliation exhaustive du stock historique support,
   puis suivi de son évolution ; le panneau actuel expose le stock connu et ses
   limites, pas une garantie de synchronisation live.
2. Date de revue généralisée des projets en pause (distincte de la pause par
   produit) et revue dédiée de dette ancienne. Aucun nouveau champ métier n’a
   été ajouté arbitrairement.
3. Canal, responsable et preuve de passation CSM ; communication effective et
   journal partagé des décisions. Aucun envoi ni validation fictive.
4. Besoins de formation par produit/client, invitation et preuve de présence ;
   le remplissage seul ne prouve ni pertinence pédagogique ni autonomie.
5. Calendrier d’absences/capacités datées et simulations de scénarios non
   persistées ; diagnostic d’impact des bugs et décisions support suivies.
6. Décision explicite avant activation du worker de préqualification support.
7. Recette authentifiée par rôles en environnement déployé, puis deux revues
   hebdomadaires réelles pour mesurer l’utilité et la discipline de saisie des
   prochaines actions. Le code ne peut pas fabriquer cet usage.

## Résultats de clôture

- `npx tsc --noEmit --pretty false` : succès.
- `npm run lint` : aucune erreur ni avertissement.
- `npm run build` : succès, 39 pages statiques générées.
- `npm test` : **138 tests réussis, zéro échec**.
- `git diff --check` : succès.
- Navigateur sur fixtures : affichage desktop et mobile examiné ; contrôles et
  états décrits ci-dessus validés, aucune exception navigateur signalée.
- Contrôle Supabase en lecture seule : pagination réconciliée avec le total
  exact et quatre schémas vérifiés.
- Code, tests, audit, recette et changelog regroupés pour publication via `main`.
  Le statut de livraison et le SHA effectivement servi se vérifient dans Vercel ;
  les contrôles locaux ci-dessus ne remplacent pas une recette authentifiée en production.
