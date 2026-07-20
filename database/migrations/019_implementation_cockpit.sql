-- Mirror of supabase/migrations/019_implementation_cockpit.sql.
ALTER TABLE onboarding_projects
  ADD COLUMN IF NOT EXISTS implementation_phase TEXT NOT NULL DEFAULT 'waiting_resources',
  ADD COLUMN IF NOT EXISTS resources_validated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS implementation_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS implementation_target_date DATE,
  ADD COLUMN IF NOT EXISTS next_action TEXT,
  ADD COLUMN IF NOT EXISTS next_action_due DATE,
  ADD COLUMN IF NOT EXISTS next_action_owner TEXT,
  ADD COLUMN IF NOT EXISTS current_blocker TEXT,
  ADD COLUMN IF NOT EXISTS current_iteration INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_iterations INTEGER NOT NULL DEFAULT 2;

CREATE INDEX IF NOT EXISTS idx_onboarding_implementation_phase ON onboarding_projects(implementation_phase);

CREATE TABLE IF NOT EXISTS project_resource_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id TEXT NOT NULL REFERENCES onboarding_projects(id) ON DELETE CASCADE,
  resource_key TEXT NOT NULL,
  label TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'content',
  required BOOLEAN NOT NULL DEFAULT TRUE,
  status TEXT NOT NULL DEFAULT 'not_received',
  note TEXT,
  received_at TIMESTAMPTZ,
  validated_at TIMESTAMPTZ,
  updated_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, resource_key)
);

CREATE INDEX IF NOT EXISTS idx_project_resources_project ON project_resource_requirements(project_id);
CREATE INDEX IF NOT EXISTS idx_project_resources_status ON project_resource_requirements(status);

ALTER TABLE project_product_updates
  ADD COLUMN IF NOT EXISTS owner_email TEXT,
  ADD COLUMN IF NOT EXISTS target_date DATE,
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS project_implementation_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id TEXT NOT NULL REFERENCES onboarding_projects(id) ON DELETE CASCADE,
  milestone_key TEXT NOT NULL,
  label TEXT NOT NULL,
  planned_date DATE,
  actual_date DATE,
  status TEXT NOT NULL DEFAULT 'planned',
  updated_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, milestone_key)
);

CREATE INDEX IF NOT EXISTS idx_project_milestones_project ON project_implementation_milestones(project_id);
