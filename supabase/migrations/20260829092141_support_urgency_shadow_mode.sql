-- Support urgency prequalification v3.1 — shadow mode only.
-- This migration is additive. External writes are disabled in the seeded ruleset.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;

CREATE SCHEMA IF NOT EXISTS support_private;
REVOKE ALL ON SCHEMA support_private FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS public.support_urgency_rulesets (
  version TEXT PRIMARY KEY,
  active BOOLEAN NOT NULL DEFAULT FALSE,
  mode TEXT NOT NULL DEFAULT 'shadow' CHECK (mode IN ('shadow', 'active')),
  config JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS support_urgency_rulesets_one_active
  ON public.support_urgency_rulesets (active)
  WHERE active;

INSERT INTO public.support_urgency_rulesets (version, active, mode, config)
VALUES (
  '3.1',
  TRUE,
  'shadow',
  jsonb_build_object(
    'sla_business_minutes', jsonb_build_object(
      'urgent', 360,
      'high', 1440,
      'medium', 1440,
      'low', 2880
    ),
    'generalized_bug_hotel_threshold', 3,
    'urgent_motifs', jsonb_build_array(
      jsonb_build_object(
        'code', 'production_down',
        'label', 'Production indisponible',
        'confidence', 0.98,
        'patterns', jsonb_build_array(
          '\\bprod(?:uction)?\\s+(?:est\\s+)?(?:down|ko|indisponible|hors service)\\b',
          '\\b(?:site|plateforme|service)\\s+(?:est\\s+)?(?:down|ko|indisponible)\\b'
        )
      ),
      jsonb_build_object(
        'code', 'login_impossible',
        'label', 'Connexion impossible',
        'confidence', 0.95,
        'patterns', jsonb_build_array(
          '\\b(?:connexion|login|authentification)\\s+(?:est\\s+)?impossible\\b',
          '\\b(?:impossible|n’arrive pas|n''arrive pas)\\s+(?:de|à)\\s+(?:se )?connecter\\b'
        )
      ),
      jsonb_build_object(
        'code', 'one_way_down',
        'label', 'Flux 1WAY indisponible',
        'confidence', 0.96,
        'patterns', jsonb_build_array(
          '\\b1\\s*[- ]?way\\b.{0,30}\\b(?:ko|down|bloqué|indisponible|ne (?:marche|fonctionne) plus)\\b',
          '\\b(?:ko|down|bloqué|indisponible)\\b.{0,30}\\b1\\s*[- ]?way\\b'
        )
      ),
      jsonb_build_object(
        'code', 'two_way_down',
        'label', 'Flux 2WAY indisponible',
        'confidence', 0.96,
        'patterns', jsonb_build_array(
          '\\b2\\s*[- ]?way\\b.{0,30}\\b(?:ko|down|bloqué|indisponible|ne (?:marche|fonctionne) plus)\\b',
          '\\b(?:ko|down|bloqué|indisponible)\\b.{0,30}\\b2\\s*[- ]?way\\b'
        )
      ),
      jsonb_build_object(
        'code', 'phishing_suspected',
        'label', 'Suspicion de phishing',
        'confidence', 0.94,
        'patterns', jsonb_build_array(
          '\\b(?:phishing|hameçonnage)\\b',
          '\\b(?:mail|email|message|lien)\\s+(?:suspect|frauduleux|malveillant)\\b'
        )
      )
    ),
    'writes', jsonb_build_object(
      'zoho', false,
      'linear', false,
      'slack', false
    )
  )
)
ON CONFLICT (version) DO UPDATE SET
  active = EXCLUDED.active,
  mode = EXCLUDED.mode,
  config = EXCLUDED.config,
  updated_at = NOW();

CREATE TABLE IF NOT EXISTS public.support_business_hours (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  timezone TEXT NOT NULL,
  weekly_schedule JSONB NOT NULL,
  holidays JSONB NOT NULL DEFAULT '[]'::jsonb,
  zoho_holiday_list_ids TEXT[] NOT NULL DEFAULT '{}',
  source TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT FALSE,
  synced_at TIMESTAMPTZ,
  sync_error TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS support_business_hours_one_active
  ON public.support_business_hours (active)
  WHERE active;

INSERT INTO public.support_business_hours (
  id, name, timezone, weekly_schedule, zoho_holiday_list_ids, source, active
)
VALUES (
  '5861000000007117',
  'Paris office',
  'Europe/Paris',
  '{"monday":[{"start":"09:00","end":"18:00"}],"tuesday":[{"start":"09:00","end":"18:00"}],"wednesday":[{"start":"09:00","end":"18:00"}],"thursday":[{"start":"09:00","end":"18:00"}],"friday":[{"start":"09:00","end":"18:00"}],"saturday":[],"sunday":[]}'::jsonb,
  ARRAY['5861000002410005'],
  'fallback_pending_zoho_sync',
  TRUE
)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.ticket_urgency_assessments (
  ticket_id TEXT PRIMARY KEY,
  zoho_ticket_number TEXT,
  ticket_created_at TIMESTAMPTZ,
  zoho_priority TEXT,
  linear_priority_label TEXT,
  state TEXT NOT NULL CHECK (state IN ('probable', 'confirmed', 'non_urgent', 'to_qualify')),
  recommended_level TEXT CHECK (recommended_level IN ('urgent', 'high', 'medium', 'low')),
  effective_sla_level TEXT CHECK (effective_sla_level IN ('urgent', 'high', 'medium', 'low')),
  reason_code TEXT,
  reason_text TEXT,
  confidence NUMERIC(4,3) CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  ruleset_version TEXT NOT NULL REFERENCES public.support_urgency_rulesets(version),
  detected_hotel_count INTEGER CHECK (detected_hotel_count IS NULL OR detected_hotel_count >= 0),
  generalized_bug_candidate BOOLEAN NOT NULL DEFAULT FALSE,
  first_response_due_at TIMESTAMPTZ,
  sla_target_business_minutes INTEGER CHECK (sla_target_business_minutes IS NULL OR sla_target_business_minutes > 0),
  first_response_status TEXT NOT NULL DEFAULT 'no_data'
    CHECK (first_response_status IN ('within_target', 'overdue', 'pending', 'no_data')),
  source TEXT NOT NULL DEFAULT 'automatic',
  last_auto_assessed_at TIMESTAMPTZ,
  human_validated_at TIMESTAMPTZ,
  human_validated_by UUID REFERENCES public.users(id),
  human_validation_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ticket_urgency_assessments_state_idx
  ON public.ticket_urgency_assessments (state, updated_at DESC);
CREATE INDEX IF NOT EXISTS ticket_urgency_assessments_sla_idx
  ON public.ticket_urgency_assessments (first_response_status, first_response_due_at);
CREATE INDEX IF NOT EXISTS ticket_urgency_assessments_created_idx
  ON public.ticket_urgency_assessments (ticket_created_at DESC);

CREATE OR REPLACE FUNCTION support_private.enforce_urgency_state_transitions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.state = 'confirmed'
     AND (NEW.source <> 'human' OR NEW.human_validated_at IS NULL OR NEW.human_validated_by IS NULL) THEN
    RAISE EXCEPTION 'confirmed urgency requires human validation';
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.source = 'automatic' AND OLD.state = 'confirmed' THEN
    NEW.state := OLD.state;
    NEW.recommended_level := OLD.recommended_level;
    NEW.effective_sla_level := OLD.effective_sla_level;
    NEW.reason_code := OLD.reason_code;
    NEW.reason_text := OLD.reason_text;
    NEW.confidence := OLD.confidence;
    NEW.human_validated_at := OLD.human_validated_at;
    NEW.human_validated_by := OLD.human_validated_by;
    NEW.human_validation_note := OLD.human_validation_note;
    NEW.source := OLD.source;
  ELSIF TG_OP = 'UPDATE'
        AND NEW.source = 'automatic'
        AND OLD.state = 'probable'
        AND NEW.state NOT IN ('probable', 'confirmed') THEN
    NEW.state := OLD.state;
    NEW.recommended_level := OLD.recommended_level;
    NEW.effective_sla_level := OLD.effective_sla_level;
    NEW.reason_code := OLD.reason_code;
    NEW.reason_text := OLD.reason_text;
    NEW.confidence := OLD.confidence;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_urgency_state_transitions
  ON public.ticket_urgency_assessments;
CREATE TRIGGER enforce_urgency_state_transitions
  BEFORE INSERT OR UPDATE ON public.ticket_urgency_assessments
  FOR EACH ROW EXECUTE FUNCTION support_private.enforce_urgency_state_transitions();

CREATE TABLE IF NOT EXISTS public.ticket_urgency_assessment_events (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  ticket_id TEXT NOT NULL,
  event_kind TEXT NOT NULL CHECK (event_kind IN ('automatic_assessment', 'human_validation')),
  state TEXT NOT NULL CHECK (state IN ('probable', 'confirmed', 'non_urgent', 'to_qualify')),
  recommended_level TEXT CHECK (recommended_level IN ('urgent', 'high', 'medium', 'low')),
  reason_code TEXT,
  reason_text TEXT,
  confidence NUMERIC(4,3) CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  ruleset_version TEXT NOT NULL REFERENCES public.support_urgency_rulesets(version),
  validated_by UUID REFERENCES public.users(id),
  validation_note TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ticket_urgency_events_ticket_idx
  ON public.ticket_urgency_assessment_events (ticket_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ticket_urgency_events_validation_idx
  ON public.ticket_urgency_assessment_events (event_kind, state, created_at DESC);

ALTER TABLE public.webhook_events
  ADD COLUMN IF NOT EXISTS dedupe_key TEXT,
  ADD COLUMN IF NOT EXISTS event_time TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS org_id TEXT,
  ADD COLUMN IF NOT EXISTS jwt_verified BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS processing_status TEXT NOT NULL DEFAULT 'queued',
  ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error TEXT,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS webhook_events_dedupe_key_idx
  ON public.webhook_events (dedupe_key)
  WHERE dedupe_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS webhook_events_queue_idx
  ON public.webhook_events (processing_status, processed_at);

CREATE TABLE IF NOT EXISTS public.support_shadow_jobs (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  webhook_event_id BIGINT REFERENCES public.webhook_events(id) ON DELETE SET NULL,
  ticket_id TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_at TIMESTAMPTZ,
  locked_by TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS support_shadow_jobs_claim_idx
  ON public.support_shadow_jobs (status, available_at, id);

CREATE TABLE IF NOT EXISTS public.support_shadow_sync_state (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.support_shadow_sync_state (key, value)
VALUES ('zoho_reconciliation', '{"last_successful_modified_time":null}'::jsonb)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.support_urgency_rulesets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_business_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_urgency_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_urgency_assessment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_shadow_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_shadow_sync_state ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.support_urgency_rulesets FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.support_business_hours FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.ticket_urgency_assessments FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.ticket_urgency_assessment_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.webhook_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.support_shadow_jobs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.support_shadow_sync_state FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.support_urgency_rulesets TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.support_business_hours TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ticket_urgency_assessments TO service_role;
GRANT SELECT, INSERT ON TABLE public.ticket_urgency_assessment_events TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.webhook_events TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.support_shadow_jobs TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.support_shadow_sync_state TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;

CREATE OR REPLACE FUNCTION support_private.claim_shadow_jobs(
  p_worker_id TEXT,
  p_limit INTEGER DEFAULT 20
)
RETURNS SETOF public.support_shadow_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF COALESCE(current_setting('request.jwt.claim.role', TRUE), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role required';
  END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT id
    FROM public.support_shadow_jobs
    WHERE (
      status = 'queued'
      OR (status = 'processing' AND locked_at < NOW() - INTERVAL '10 minutes')
    )
      AND available_at <= NOW()
    ORDER BY id
    FOR UPDATE SKIP LOCKED
    LIMIT GREATEST(1, LEAST(p_limit, 100))
  )
  UPDATE public.support_shadow_jobs AS jobs
  SET status = 'processing',
      locked_at = NOW(),
      locked_by = p_worker_id,
      attempt_count = jobs.attempt_count + 1
  FROM candidates
  WHERE jobs.id = candidates.id
  RETURNING jobs.*;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_support_shadow_jobs(
  p_worker_id TEXT,
  p_limit INTEGER DEFAULT 20
)
RETURNS SETOF public.support_shadow_jobs
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT * FROM support_private.claim_shadow_jobs(p_worker_id, p_limit);
$$;

REVOKE ALL ON FUNCTION public.claim_support_shadow_jobs(TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_support_shadow_jobs(TEXT, INTEGER) TO service_role;

CREATE OR REPLACE FUNCTION public.enqueue_support_webhook_batch(p_events JSONB)
RETURNS TABLE(inserted_count INTEGER, queued_count INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  item JSONB;
  event_id BIGINT;
  inserted_total INTEGER := 0;
  queued_total INTEGER := 0;
BEGIN
  IF COALESCE(current_setting('request.jwt.claim.role', TRUE), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role required';
  END IF;
  IF jsonb_typeof(p_events) <> 'array' OR jsonb_array_length(p_events) > 100 THEN
    RAISE EXCEPTION 'invalid webhook event batch';
  END IF;

  FOR item IN SELECT value FROM jsonb_array_elements(p_events)
  LOOP
    event_id := NULL;
    INSERT INTO public.webhook_events (
      event_type, ticket_id, payload, dedupe_key, event_time, org_id,
      jwt_verified, processing_status, completed_at
    ) VALUES (
      COALESCE(item->>'event_type', 'unknown'),
      NULLIF(item->>'ticket_id', ''),
      COALESCE(item->'payload', '{}'::jsonb),
      item->>'dedupe_key',
      NULLIF(item->>'event_time', '')::timestamptz,
      NULLIF(item->>'org_id', ''),
      TRUE,
      CASE WHEN NULLIF(item->>'ticket_id', '') IS NULL THEN 'completed' ELSE 'queued' END,
      CASE WHEN NULLIF(item->>'ticket_id', '') IS NULL THEN NOW() ELSE NULL END
    )
    ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
    RETURNING id INTO event_id;

    IF event_id IS NOT NULL THEN
      inserted_total := inserted_total + 1;
      IF NULLIF(item->>'ticket_id', '') IS NOT NULL THEN
        INSERT INTO public.support_shadow_jobs (webhook_event_id, ticket_id, payload)
        VALUES (
          event_id,
          item->>'ticket_id',
          jsonb_build_object(
            'source', 'zoho_webhook',
            'eventType', item->>'event_type',
            'eventTime', item->>'event_time',
            'payload', COALESCE(item->'payload', '{}'::jsonb)
          )
        );
        queued_total := queued_total + 1;
      END IF;
    END IF;
  END LOOP;

  RETURN QUERY SELECT inserted_total, queued_total;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_support_webhook_batch(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_support_webhook_batch(JSONB) TO service_role;

CREATE OR REPLACE FUNCTION support_private.trigger_shadow_worker()
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  worker_url TEXT;
  worker_secret TEXT;
  request_id BIGINT;
BEGIN
  SELECT decrypted_secret INTO worker_url
  FROM vault.decrypted_secrets
  WHERE name = 'support_shadow_worker_url'
  ORDER BY updated_at DESC
  LIMIT 1;

  SELECT decrypted_secret INTO worker_secret
  FROM vault.decrypted_secrets
  WHERE name = 'support_shadow_worker_secret'
  ORDER BY updated_at DESC
  LIMIT 1;

  IF worker_url IS NULL OR worker_secret IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT net.http_post(
    url := worker_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || worker_secret
    ),
    body := '{"source":"supabase_cron"}'::jsonb,
    timeout_milliseconds := 5000
  ) INTO request_id;

  RETURN request_id;
END;
$$;

REVOKE ALL ON FUNCTION support_private.trigger_shadow_worker() FROM PUBLIC, anon, authenticated;

SELECT cron.schedule(
  'support-shadow-worker-every-15-minutes',
  '*/15 * * * *',
  'SELECT support_private.trigger_shadow_worker()'
);
