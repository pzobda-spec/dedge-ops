-- Lightweight project workspace: product statuses, options and CSM assignment.
ALTER TABLE onboarding_projects
  ADD COLUMN IF NOT EXISTS plan TEXT,
  ADD COLUMN IF NOT EXISTS csm_name TEXT,
  ADD COLUMN IF NOT EXISTS csm_email TEXT,
  ADD COLUMN IF NOT EXISTS csm_assignment_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS csm_assignment_points NUMERIC(6,2),
  ADD COLUMN IF NOT EXISTS csm_assignment_reason TEXT,
  ADD COLUMN IF NOT EXISTS csm_assigned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS product_statuses JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS enabled_options JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_onboarding_csm_email ON onboarding_projects(csm_email);
CREATE INDEX IF NOT EXISTS idx_onboarding_csm_assignment_status ON onboarding_projects(csm_assignment_status);

CREATE TABLE IF NOT EXISTS csm_capacity_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  csm_name TEXT NOT NULL UNIQUE,
  csm_email TEXT,
  monthly_capacity_points NUMERIC(6,2) NOT NULL DEFAULT 15,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS csm_assignment_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tier TEXT NOT NULL,
  customer_type TEXT NOT NULL DEFAULT '*',
  dmbook_only BOOLEAN,
  points NUMERIC(6,2) NOT NULL,
  UNIQUE(tier, customer_type, dmbook_only)
);

CREATE TABLE IF NOT EXISTS project_product_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id TEXT NOT NULL REFERENCES onboarding_projects(id) ON DELETE CASCADE,
  product_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'not_started',
  comment TEXT,
  updated_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, product_key)
);

CREATE INDEX IF NOT EXISTS idx_project_product_updates_project ON project_product_updates(project_id);

INSERT INTO csm_assignment_rules (tier, customer_type, dmbook_only, points) VALUES
  ('Bronze', '*', TRUE, 1),
  ('Bronze', '*', FALSE, 2),
  ('Silver', 'Individuel', FALSE, 3),
  ('Silver', 'Groupe', FALSE, 4),
  ('Gold', 'Individuel', FALSE, 5),
  ('Gold', 'Groupe', FALSE, 5),
  ('Key', '*', FALSE, 8)
ON CONFLICT (tier, customer_type, dmbook_only) DO UPDATE SET points = EXCLUDED.points;
