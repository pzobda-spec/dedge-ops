-- Mirror of supabase/migrations/021_simplify_document_gate.sql.
ALTER TABLE onboarding_projects
  ADD COLUMN IF NOT EXISTS documents_received BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS documents_received_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS document_reservation TEXT;

UPDATE onboarding_projects
SET
  documents_received = TRUE,
  documents_received_at = COALESCE(documents_received_at, resources_validated_at, implementation_started_at, start_date::timestamptz, NOW())
WHERE resources_validated_at IS NOT NULL
   OR implementation_started_at IS NOT NULL
   OR implementation_phase NOT IN ('waiting_resources', 'ready_to_start');
