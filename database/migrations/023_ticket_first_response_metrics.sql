-- Mirror of supabase/migrations/023_ticket_first_response_metrics.sql.
ALTER TABLE ticket_analytics
  ADD COLUMN IF NOT EXISTS first_response_time_ms BIGINT,
  ADD COLUMN IF NOT EXISTS metrics_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS metrics_sync_error TEXT,
  ADD COLUMN IF NOT EXISTS zoho_modified_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_ticket_analytics_metrics_sync
  ON ticket_analytics(metrics_synced_at ASC NULLS FIRST);

ALTER TABLE ticket_analytics_daily_snapshots
  ADD COLUMN IF NOT EXISTS first_response_time_ms BIGINT;
