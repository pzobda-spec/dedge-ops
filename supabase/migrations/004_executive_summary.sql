-- Onboarding executive summary cache

ALTER TABLE onboarding_projects
  ADD COLUMN IF NOT EXISTS executive_summary TEXT,
  ADD COLUMN IF NOT EXISTS executive_summary_generated_at TIMESTAMPTZ;
