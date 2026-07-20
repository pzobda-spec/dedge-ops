-- Grandfather existing projects into the new implementation workflow.
-- The client-resource gate applies to new/not-started projects, not retroactively
-- to implementations that already have execution history in Zoho.
UPDATE onboarding_projects
SET
  implementation_phase = CASE
    WHEN zoho_status = 'live' THEN 'live'
    WHEN zoho_status = 'in_progress' THEN 'configuration'
    WHEN zoho_status IN ('pending_client', 'blocked') AND start_date IS NOT NULL THEN 'configuration'
    ELSE implementation_phase
  END,
  resources_validated_at = CASE
    WHEN zoho_status IN ('live', 'in_progress')
      OR (zoho_status IN ('pending_client', 'blocked') AND start_date IS NOT NULL)
    THEN COALESCE(resources_validated_at, start_date::timestamptz, last_synced_at, NOW())
    ELSE resources_validated_at
  END,
  implementation_started_at = CASE
    WHEN zoho_status IN ('live', 'in_progress')
      OR (zoho_status IN ('pending_client', 'blocked') AND start_date IS NOT NULL)
    THEN COALESCE(implementation_started_at, start_date::timestamptz, last_synced_at, NOW())
    ELSE implementation_started_at
  END,
  implementation_target_date = COALESCE(implementation_target_date, target_go_live)
WHERE implementation_phase = 'waiting_resources';
