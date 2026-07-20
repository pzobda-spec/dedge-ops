-- Correct model and values from "SUIVI Passation OB _ CSM".
ALTER TABLE onboarding_projects
  ADD COLUMN IF NOT EXISTS commercial_plan TEXT,
  ADD COLUMN IF NOT EXISTS customer_tier TEXT,
  ADD COLUMN IF NOT EXISTS customer_type TEXT,
  ADD COLUMN IF NOT EXISTS dmbook_only BOOLEAN;

INSERT INTO csm_assignment_rules (tier, customer_type, dmbook_only, points) VALUES
  ('Bronze', '*', TRUE, 1),
  ('Bronze', '*', FALSE, 2),
  ('Silver', 'Individuel', FALSE, 3),
  ('Silver', 'Groupe', FALSE, 4),
  ('Gold', 'Individuel', FALSE, 5),
  ('Gold', 'Groupe', FALSE, 8),
  ('Key', '*', FALSE, 10)
ON CONFLICT (tier, customer_type, dmbook_only) DO UPDATE SET points = EXCLUDED.points;

INSERT INTO csm_capacity_rules (csm_name, monthly_capacity_points, active) VALUES
  ('Anne-Charlotte', 15, TRUE),
  ('Laurane', 15, TRUE),
  ('Deydra', 15, TRUE),
  ('Sherazade', 15, TRUE),
  ('Tara', 15, TRUE),
  ('Aika', 0, FALSE),
  ('Ghislaine', 15, TRUE)
ON CONFLICT (csm_name) DO UPDATE SET
  monthly_capacity_points = EXCLUDED.monthly_capacity_points,
  active = EXCLUDED.active,
  updated_at = NOW();
