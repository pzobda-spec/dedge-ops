CREATE TABLE IF NOT EXISTS ticket_analytics_backfill_state (
  job_name TEXT PRIMARY KEY,
  phase TEXT NOT NULL DEFAULT 'created',
  cursor_offset INTEGER NOT NULL DEFAULT 0,
  rows_synced INTEGER NOT NULL DEFAULT 0,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  last_error TEXT,
  earliest_created_at TIMESTAMPTZ,
  latest_created_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS ticket_analytics_history_coverage (
  id TEXT PRIMARY KEY,
  certified_from TIMESTAMPTZ,
  certified_to TIMESTAMPTZ,
  rows_synced INTEGER NOT NULL DEFAULT 0,
  backfill_completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
