-- Rattrapage des snapshots manqués, lot 0.3.
--
-- La livraison des crons Vercel est en « best effort » : une invocation échouée
-- n'est jamais rejouée, et un même run peut au contraire être déclenché deux
-- fois. L'upsert traitait déjà le doublon ; il ne traitait pas le run manqué,
-- qui laisse un trou définitif dans l'historique. C'est précisément ce que ce
-- lot existe pour éviter.
--
-- Le cron devient donc réconciliateur : à chaque passage il comble les dates
-- absentes des sept derniers jours. Mais une date rattrapée porte les données
-- du MOMENT DE LA COLLECTE, pas celles du jour manqué, qui sont perdues sans
-- recours. Elle doit donc être distinguable d'une mesure directe.
--
-- Une mesure reconstituée qui se présente comme une mesure du jour est pire
-- qu'un trou : un trou se voit, une reconstitution silencieuse se prend pour
-- la réalité.

ALTER TABLE onboarding_workload_snapshots
  ADD COLUMN IF NOT EXISTS is_backfilled BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN onboarding_workload_snapshots.is_backfilled IS
  'Vrai si la ligne comble une date manquée : snapshot_date est la date comblée, mais les valeurs sont celles mesurées à captured_at.';

ALTER TABLE csm_portfolio_snapshots
  ADD COLUMN IF NOT EXISTS is_backfilled BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN csm_portfolio_snapshots.is_backfilled IS
  'Vrai si la ligne comble une date manquée : snapshot_date est la date comblée, mais les valeurs sont celles mesurées à captured_at.';

-- Index partiel : les lectures d'historique voudront souvent écarter les
-- reconstitutions, ou les isoler pour les auditer.
CREATE INDEX IF NOT EXISTS idx_onboarding_workload_backfilled
  ON onboarding_workload_snapshots(snapshot_date)
  WHERE is_backfilled;

CREATE INDEX IF NOT EXISTS idx_csm_portfolio_backfilled
  ON csm_portfolio_snapshots(snapshot_date)
  WHERE is_backfilled;
