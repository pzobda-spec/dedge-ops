CREATE TABLE IF NOT EXISTS onboarding_satisfaction (
  zoho_id TEXT PRIMARY KEY,
  establishment TEXT NOT NULL DEFAULT '',
  respondent_name TEXT NOT NULL DEFAULT '',
  owner TEXT NOT NULL DEFAULT '',
  score_global NUMERIC(3,2) NOT NULL DEFAULT 0 CHECK (score_global BETWEEN 0 AND 5),
  score_onboarding NUMERIC(3,2) NOT NULL DEFAULT 0 CHECK (score_onboarding BETWEEN 0 AND 5),
  score_simplicity NUMERIC(3,2) NOT NULL DEFAULT 0 CHECK (score_simplicity BETWEEN 0 AND 5),
  score_tool NUMERIC(3,2) NOT NULL DEFAULT 0 CHECK (score_tool BETWEEN 0 AND 5),
  score_training NUMERIC(3,2) NOT NULL DEFAULT 0 CHECK (score_training BETWEEN 0 AND 5),
  comment TEXT,
  submitted_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE onboarding_satisfaction ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_onboarding_satisfaction_submitted_at
  ON onboarding_satisfaction(submitted_at DESC);

CREATE INDEX IF NOT EXISTS idx_onboarding_satisfaction_owner
  ON onboarding_satisfaction(owner);
