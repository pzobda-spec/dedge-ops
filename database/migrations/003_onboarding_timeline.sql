-- Onboarding timeline foundation
-- Phase 1: store Zoho project sync metadata and timeline events.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE onboarding_projects
  ADD COLUMN IF NOT EXISTS zoho_project_id TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS zoho_status TEXT,
  ADD COLUMN IF NOT EXISTS hotel_name TEXT,
  ADD COLUMN IF NOT EXISTS product TEXT,
  ADD COLUMN IF NOT EXISTS owner_email TEXT,
  ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_onboarding_zoho_id
  ON onboarding_projects(zoho_project_id);

CREATE INDEX IF NOT EXISTS idx_onboarding_owner_email
  ON onboarding_projects(owner_email);

CREATE INDEX IF NOT EXISTS idx_onboarding_zoho_status
  ON onboarding_projects(zoho_status);

CREATE TABLE IF NOT EXISTS onboarding_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id TEXT NOT NULL REFERENCES onboarding_projects(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  event_label TEXT NOT NULL,
  actor_email TEXT,
  metadata JSONB DEFAULT '{}',
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_onboarding_events_project
  ON onboarding_events(project_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_onboarding_events_type
  ON onboarding_events(event_type);
