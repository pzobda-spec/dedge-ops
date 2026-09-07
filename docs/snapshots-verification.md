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

## Réconciliation, et non simple idempotence

La livraison des crons Vercel est en « best effort » : une invocation échouée
n'est jamais rejouée, et un même run peut être déclenché deux fois. L'`upsert`
traite le doublon, il ne traite pas le run manqué, qui laisse un trou définitif.

À chaque passage, le cron comble donc les dates absentes des sept derniers
jours, avec quatre garde-fous.

**Une date comblée est marquée** par `is_backfilled`. Ses valeurs sont celles du
moment de la collecte, pas celles du jour manqué, qui sont perdues sans recours.
Une mesure reconstituée qui se présente comme une mesure directe est pire qu'un
trou : un trou se voit.

**Un rattrapage n'écrase jamais une date existante.** Deux chemins d'écriture
strictement séparés : `upsert` pour la date du jour, afin qu'un rejeu la
rafraîchisse ; `upsert` avec `ignoreDuplicates`, soit un `ON CONFLICT DO
NOTHING`, pour les dates comblées. Écraser la mesure d'hier par celle
d'aujourd'hui détruirait l'historique que ce lot constitue.

**Sept jours est un plafond, pas un objectif.** Au-delà, les dates manquantes
sortent en avertissement borné, jamais comblées : ce n'est plus un incident de
livraison mais un cron arrêté.

**Avant le premier snapshot, une absence n'est pas un trou.** L'historique
n'avait pas commencé. Sans cette borne, le tout premier passage fabriquerait
sept lignes reconstituées à partir de rien.

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

## Règle du `charge_pct` nul, tranchée le 7 septembre 2026

Cette règle est écrite avant toute implémentation d'un compteur de jours au-dessus
du seuil, pour qu'elle ne soit pas redécidée au moment de coder.

**Un jour où `charge_pct` vaut `null` interrompt la série et s'affiche comme un
trou. Il n'est JAMAIS compté comme « sous le seuil ».**

La raison est que le signal cherché serait inversé. Un implémenteur absent ou en
stop a une capacité effective nulle : si ses dossiers ne lui ont pas été retirés,
il est en surcharge de fait. Traiter ce jour comme « sous le seuil » remettrait le
compteur de surcharge à zéro précisément le jour où la situation est la plus
mauvaise.

Conséquences à respecter :

- un jour `null` coupe la série de jours consécutifs, il ne la prolonge pas et ne
  la remet pas à zéro comme le ferait un jour sous le seuil ;
- il s'affiche comme une absence de donnée, jamais comme une valeur ;
- les personnes concernées sont nommées séparément, avec leur nombre de dossiers
  portés, ce que fait déjà la page de pilotage sous le graphique.

**Le seuil de 80 % s'entend en pourcentage du plafond réel stocké dans la colonne
`capacity`**, pas de la constante globale `CAPACITY_THRESHOLD` fixée à 50. Les
plafonds vont diverger : 50 pour un senior ou un junior, 30 pour un alternant,
5 pour un stagiaire, pondérés par le coefficient de disponibilité (relâche à 0,5,
absent et stop à 0). Un seuil calculé sur 50 pour tout le monde donnerait un
stagiaire à 40 % de charge alors qu'il serait à 400 % de la sienne.

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
2. `CRON_SECRET` est acquis : présent en production depuis cinquante-deux
   jours, antérieur au déploiement courant. Rien à faire sur ce point.
3. Laisser passer deux exécutions, ou déclencher manuellement deux fois à des
   dates métier différentes.
4. Contrôler que `onboarding_workload_snapshots` et `csm_portfolio_snapshots`
   portent bien deux dates distinctes, et qu'un rejeu du même jour n'a rien
   dupliqué.

Tant que ces quatre points ne sont pas faits, le lot reste `en cours` au journal.
