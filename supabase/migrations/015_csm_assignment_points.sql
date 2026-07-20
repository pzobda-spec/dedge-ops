ALTER TABLE onboarding_projects
  ADD COLUMN IF NOT EXISTS csm_assignment_points NUMERIC(6,2);
