CREATE TABLE IF NOT EXISTS acuity_enterprise_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key TEXT NOT NULL UNIQUE,
  action TEXT NOT NULL CHECK (action IN ('create_appointment_type', 'offer_class_times')),
  request_hash TEXT NOT NULL,
  actor_email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'succeeded', 'partial', 'failed', 'unknown')),
  appointment_type_id BIGINT,
  class_ids BIGINT[],
  response_status INTEGER,
  response_body JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  CONSTRAINT acuity_enterprise_operations_key_length
    CHECK (char_length(idempotency_key) BETWEEN 16 AND 128)
);

CREATE INDEX IF NOT EXISTS idx_acuity_enterprise_operations_created
  ON acuity_enterprise_operations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_acuity_enterprise_operations_actor
  ON acuity_enterprise_operations(actor_email, created_at DESC);

ALTER TABLE acuity_enterprise_operations ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE acuity_enterprise_operations IS
  'Server-only audit and idempotency ledger for Acuity Enterprise mutations.';
