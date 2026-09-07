# Vérification, snapshots quotidiens de charge et de portefeuille

Lot 0.3 du plan `docs/plan-execution-cockpit.md`. Note de vérification exigée pour
tout lot touchant une route.

## Périmètre

- Migration `20260907170000_portfolio_snapshots.sql` : crée
  `csm_portfolio_snapshots`, ajoute `capacity` à `onboarding_workload_snapshots`
  et rend `charge_pct` nullable.
- `lib/onboarding/snapshots.ts` : `persistDailySnapshots(referenceDate)`.
- `app/api/cron/sync-portfolio-snapshots/route.ts` : cron quotidien, `30 8 * * *`.
- `app/api/onboarding/workload-snapshots/route.ts` : lecture bornée par dates.
- `app/onboarding/pilotage/page.tsx` : graphique « Évolution de la charge »
  branché sur les relevés réels, avec repli sur l'estimation.

## Idempotence

Les deux écritures sont des `upsert` : `onConflict: 'snapshot_date,owner'` pour la
charge, `onConflict: 'snapshot_date,csm_name'` pour le portefeuille. Un rejeu le
même jour écrase la ligne, il ne la duplique pas. `captured_at` est réécrit à
chaque passage et trace le moment réel du calcul.

## Piège de date, traité

Les crons Vercel tournent en UTC. La clé d'upsert porte la **date métier
Europe/Paris**, obtenue par `planChargeReferenceDate()`. Une date dérivée d'UTC
aurait fait écrire sur le lendemain pour tout passage après 22 h heure de Paris.
Le cron ne calcule aucune date lui-même.

## Points de modélisation à connaître

- **`charge_pct` est nullable.** Un implémenteur absent ou en stop a une capacité
  effective nulle : le pourcentage n'est pas calculable. `NULL` veut dire « non
  calculable », pas zéro. `active_projects` et `capacity` portent la vérité.
  La page signale explicitement ces cas sous le graphique, avec le nombre de
  dossiers concernés : sans cela, la surcharge d'une personne absente
  disparaîtrait de toutes les courbes en silence.
- **`capacity` est stockée** avec chaque relevé. Le plafond réel est propre à
  chaque implémenteur et pondéré par sa disponibilité. Sans le dénominateur, un
  pourcentage historique deviendrait illisible dès qu'un plafond change, ce qui
  va arriver : les rôles prévoient 50 pour un senior ou un junior, 30 pour un
  alternant, 5 pour un stagiaire.
- **Un zéro est une donnée.** Chaque implémenteur du roster et chaque CSM du
  roster reçoit une ligne, même à portefeuille vide. Sans cela, un trou dans
  l'historique serait indistinguable d'une absence de mesure.
- **Le portefeuille sans porteur est capté** sous le nom `Non attribué`. C'est un
  portefeuille réel, il ne doit pas disparaître de l'historique.
- **`valued_accounts` accompagne `valued_mrr`.** Le MRR n'est renseigné que sur
  45,5 % du parc : sans son dénominateur, le montant historique serait illisible.

## Séries réelles et estimées, jamais mélangées

Le graphique porte deux séries par implémenteur, `owner` pour le réel et
`owner (estimé)` pour l'estimation reconstituée depuis les dates de projet.

Un mois ne porte jamais les deux valeurs : si un relevé réel existe, la clé
estimée vaut `null`, et inversement. La séparation est donc structurelle, aucun
calcul ne peut mélanger les deux natures. `connectNulls={false}` empêche le trait
de sauter par-dessus un mois sans donnée.

Rendu : trait plein pour le réel, pointillé grisé pour l'estimé, ligne verticale
annotée sur le mois du premier relevé réel. Aucune moyenne, tendance ou variation
n'est calculée à cheval sur cette bascule : elle serait un artefact de méthode.

## Vérifications

```bash
npx tsc --noEmit --pretty false   # aucune erreur
npm run lint                      # No ESLint warnings or errors
npm run build                     # build complet, les deux routes apparaissent
npm test                          # 82 tests, 82 passent
```

Exécutées le 7 septembre 2026.

## Ce qui reste à faire pour déclarer le lot fini

Le plan définit le lot comme fini quand **deux jours consécutifs de snapshots
existent en base pour les deux tables**. Cette condition ne peut pas être
vérifiée par le code : elle demande deux passages réels du cron.

1. Appliquer la migration, `supabase db push`.
2. Vérifier que `CRON_SECRET` est bien défini dans l'environnement de production.
3. Laisser passer deux exécutions, ou déclencher manuellement deux fois à des
   dates métier différentes.
4. Contrôler que `onboarding_workload_snapshots` et `csm_portfolio_snapshots`
   portent bien deux dates distinctes, et qu'un rejeu du même jour n'a rien
   dupliqué.

Tant que ces quatre points ne sont pas faits, le lot reste `en cours` au journal.
