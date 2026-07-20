CREATE TABLE IF NOT EXISTS ticket_analytics_daily_snapshots (
  snapshot_date DATE NOT NULL,
  ticket_id TEXT NOT NULL,
  ticket_number TEXT,
  status TEXT,
  priority TEXT,
  category TEXT,
  classification TEXT,
  product_area TEXT,
  client_name TEXT,
  client_id TEXT,
  assignee TEXT,
  created_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  first_response_at TIMESTAMPTZ,
  first_contact_resolution BOOLEAN,
  source TEXT,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (snapshot_date, ticket_id)
);

ALTER TABLE ticket_analytics_daily_snapshots ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_ticket_snapshots_ticket_date
  ON ticket_analytics_daily_snapshots(ticket_id, snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_ticket_snapshots_date_status
  ON ticket_analytics_daily_snapshots(snapshot_date, status);
CREATE INDEX IF NOT EXISTS idx_ticket_snapshots_date_product
  ON ticket_analytics_daily_snapshots(snapshot_date, product_area);

CREATE TABLE IF NOT EXISTS ticket_analytics_snapshot_coverage (
  id TEXT PRIMARY KEY,
  first_snapshot_date DATE,
  last_snapshot_date DATE,
  last_snapshot_rows INTEGER NOT NULL DEFAULT 0,
  last_captured_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE ticket_analytics_snapshot_coverage ENABLE ROW LEVEL SECURITY;
