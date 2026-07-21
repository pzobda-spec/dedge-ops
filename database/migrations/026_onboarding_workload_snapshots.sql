-- Daily per-owner workload snapshots, used to evaluate how long a project
-- owner has stayed above the overload threshold over a given period.
-- No historical backfill: tracking starts from the day this migration is
-- applied and the cron begins running.
CREATE TABLE IF NOT EXISTS onboarding_workload_snapshots (
  snapshot_date DATE NOT NULL,
  owner TEXT NOT NULL,
  active_projects INTEGER NOT NULL,
  charge_pct INTEGER NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (snapshot_date, owner)
);

ALTER TABLE onboarding_workload_snapshots ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_onboarding_workload_owner_date
  ON onboarding_workload_snapshots(owner, snapshot_date DESC);
