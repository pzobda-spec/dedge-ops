CREATE TABLE IF NOT EXISTS ticket_analytics (
  id TEXT PRIMARY KEY,
  ticket_number TEXT,
  subject TEXT,
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
  source TEXT,
  last_synced_at TIMESTAMPTZ DEFAULT NOW()
);

-- Kept separately so rerunning this migration also upgrades an analytics
-- table created from the original schema. The dashboard uses this boolean for
-- its existing (estimated) first-contact-resolution KPI.
ALTER TABLE ticket_analytics
  ADD COLUMN IF NOT EXISTS first_contact_resolution BOOLEAN;

ALTER TABLE ticket_analytics ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_ticket_analytics_created
  ON ticket_analytics(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ticket_analytics_product
  ON ticket_analytics(product_area);
CREATE INDEX IF NOT EXISTS idx_ticket_analytics_client
  ON ticket_analytics(client_name);
CREATE INDEX IF NOT EXISTS idx_ticket_analytics_status
  ON ticket_analytics(status);

CREATE TABLE IF NOT EXISTS linear_analytics (
  id TEXT PRIMARY KEY,
  identifier TEXT,
  title TEXT,
  description TEXT,
  status TEXT,
  status_type TEXT,
  priority INTEGER,
  priority_label TEXT,
  labels TEXT[],
  creator_name TEXT,
  creator_email TEXT,
  assignee_name TEXT,
  created_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  last_synced_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE linear_analytics
  ADD COLUMN IF NOT EXISTS status_type TEXT;

ALTER TABLE linear_analytics ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_linear_analytics_created
  ON linear_analytics(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_linear_analytics_status
  ON linear_analytics(status);
CREATE INDEX IF NOT EXISTS idx_linear_analytics_creator
  ON linear_analytics(creator_name);
