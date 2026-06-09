-- Fuzzy match review queue between Todoist and Zoho Projects.

CREATE TABLE IF NOT EXISTS todoist_match_candidates (
  todoist_project_id TEXT NOT NULL REFERENCES todoist_projects(id) ON DELETE CASCADE,
  zoho_project_id TEXT NOT NULL,
  score DOUBLE PRECISION NOT NULL CHECK (score >= 0 AND score <= 1),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (todoist_project_id, zoho_project_id)
);

CREATE INDEX IF NOT EXISTS idx_todoist_match_candidates_zoho_status
  ON todoist_match_candidates(zoho_project_id, status);
