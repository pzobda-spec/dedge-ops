-- Performance indexes added 2026-05-28
-- Run in Supabase SQL editor

-- Used in generate-client-reply: WHERE product_area = ?
CREATE INDEX IF NOT EXISTS idx_knowledge_articles_product_area
  ON knowledge_articles(product_area);

-- Used in auth/login: WHERE email = ? and UPDATE WHERE email = ?
CREATE UNIQUE INDEX IF NOT EXISTS idx_access_requests_email
  ON access_requests(email);

-- Used in onboarding/satisfaction: ORDER BY submitted_at DESC (already in schema.sql but verify)
CREATE INDEX IF NOT EXISTS idx_onboarding_satisfaction_submitted_at
  ON onboarding_satisfaction(submitted_at DESC);

-- ticket_chunks ticket_id index and webhook_events processed_at index
-- are already present in schema.sql — included here for completeness only
-- (IF NOT EXISTS makes them safe to re-run)
CREATE INDEX IF NOT EXISTS idx_ticket_chunks_ticket_id
  ON ticket_chunks(ticket_id);

CREATE INDEX IF NOT EXISTS idx_webhook_events_processed_at
  ON webhook_events(processed_at DESC);
