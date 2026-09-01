# Préqualification des urgences — shadow mode v3.1

## Garanties actives

- Les sorties Zoho, Linear et Slack sont désactivées dans le ruleset et absentes du worker.
- Une urgence confirmée ne peut être créée que par la route de validation humaine authentifiée.
- Une urgence probable ou confirmée ne peut pas être rétrogradée par le classifieur. La règle est appliquée dans le code et par un trigger PostgreSQL.
- La priorité Linear reste indépendante. Le worker ne crée ni ne modifie de P1.
- Le seuil de bug généralisé est une donnée du ruleset (`generalized_bug_hotel_threshold: 3`). Il ne produit en shadow mode qu'un indicateur mesurable.

## Flux

1. `POST /api/webhooks/zoho-desk` vérifie `X-ZDesk-JWT` (RS256, issuer et audience).
2. Le tableau officiel Zoho est écrit dans `webhook_events` et `support_shadow_jobs` avant l'accusé de réception.
3. Le worker répond en arrière-plan au webhook et est rappelé toutes les 15 minutes par Supabase Cron.
4. Le cron réconcilie aussi les tickets modifiés depuis son dernier passage, avec un recouvrement de 30 minutes.
5. Les résultats et leur historique sont écrits dans `ticket_urgency_assessments` et `ticket_urgency_assessment_events`.

## Configuration Supabase Cron

La migration crée le job `support-shadow-worker-every-15-minutes`. Il reste volontairement sans effet tant que ses deux secrets Vault ne sont pas présents. Après déploiement de l'application, les créer dans le projet Supabase :

```sql
select vault.create_secret(
  'https://<domaine>/api/cron/process-support-shadow',
  'support_shadow_worker_url'
);

select vault.create_secret(
  '<même valeur que CRON_SECRET côté application>',
  'support_shadow_worker_secret'
);
```

Le même endpoint accepte un appel Vercel Cron avec `Authorization: Bearer <CRON_SECRET>` si ce planificateur est retenu plus tard. Il ne faut pas ajouter ce job à `vercel.json` tant que Supabase Cron est le planificateur de référence.

## Calendrier et SLA

Le worker synchronise quotidiennement le jeu d'horaires Zoho actif et ses listes de jours fériés. Le fallback initial, clairement marqué `fallback_pending_zoho_sync`, correspond à Paris : lundi–vendredi, 09:00–18:00, Europe/Paris.

| Niveau interne | Délai de première réponse |
| --- | ---: |
| Urgence | 6 heures ouvrées |
| High | 24 heures ouvrées |
| Medium | 24 heures ouvrées |
| Low | 48 heures ouvrées |

Un ticket sans niveau Zoho reste `À qualifier` et reçoit temporairement la cible prudente de 6 heures ouvrées.

## Mesure

Le cockpit expose :

- le nombre de délais dépassés avec un seuil propre à chaque ticket ;
- le pourcentage de réponses dans le délai ;
- les groupes dans le délai / hors délai / sans donnée pour chaque niveau ;
- les quatre états de préqualification ;
- le taux de faux positifs, calculé sur les urgences automatiquement probables ensuite jugées non urgentes par un humain ;
- trois colonnes séparées pour préqualification, niveau Zoho et priorité Linear.

## Activation future des écritures

Les trois clés `writes.zoho`, `writes.linear` et `writes.slack` sont forcées à `false` par le chargeur en shadow mode. Une activation exige une évolution de code dédiée, une migration de configuration et une validation séparée. Zoho doit être traité avant Slack. P1 Linear reste exclu de toute écriture automatique.
