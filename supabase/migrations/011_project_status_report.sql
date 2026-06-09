-- Structured AI status report combining project data and Todoist notes.

ALTER TABLE onboarding_projects
  ADD COLUMN IF NOT EXISTS status_report JSONB,
  ADD COLUMN IF NOT EXISTS status_report_generated_at TIMESTAMPTZ;
