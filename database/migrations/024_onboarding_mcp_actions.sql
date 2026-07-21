-- Structured decisions and actions recorded from Claude through the D-EDGE Ops MCP server.
ALTER TABLE project_product_updates
  ADD COLUMN IF NOT EXISTS paused_until DATE,
  ADD COLUMN IF NOT EXISTS pause_reason TEXT;

CREATE TABLE IF NOT EXISTS project_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id TEXT NOT NULL REFERENCES onboarding_projects(id) ON DELETE CASCADE,
  summary TEXT NOT NULL,
  decision_date DATE NOT NULL,
  product_key TEXT,
  effective_until DATE,
  source_type TEXT NOT NULL DEFAULT 'manual',
  source_reference TEXT,
  actor_email TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_decisions_project_date
  ON project_decisions(project_id, decision_date DESC);

CREATE TABLE IF NOT EXISTS project_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id TEXT NOT NULL REFERENCES onboarding_projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  owner TEXT,
  due_date DATE,
  product_key TEXT,
  source_decision_id UUID REFERENCES project_decisions(id) ON DELETE SET NULL,
  created_by TEXT NOT NULL,
  completed_by TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT project_actions_status_check CHECK (status IN ('open', 'completed', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_project_actions_project_status
  ON project_actions(project_id, status, due_date);

CREATE TABLE IF NOT EXISTS project_calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id TEXT NOT NULL REFERENCES onboarding_projects(id) ON DELETE CASCADE,
  google_event_id TEXT NOT NULL,
  calendar_id TEXT NOT NULL DEFAULT 'primary',
  title TEXT NOT NULL,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  html_link TEXT,
  attendees JSONB NOT NULL DEFAULT '[]'::jsonb,
  linked_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(calendar_id, google_event_id)
);

CREATE INDEX IF NOT EXISTS idx_project_calendar_events_project
  ON project_calendar_events(project_id, starts_at DESC);

CREATE TABLE IF NOT EXISTS mcp_operation_log (
  idempotency_key TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES onboarding_projects(id) ON DELETE CASCADE,
  operation_type TEXT NOT NULL,
  actor_email TEXT NOT NULL,
  request_payload JSONB NOT NULL,
  result_payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- These records are exposed only through the authenticated server-side MCP tools.
-- The service role used by the application bypasses RLS; browser/anonymous clients do not.
ALTER TABLE project_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE mcp_operation_log ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION record_mcp_meeting_outcome(
  p_project_id TEXT,
  p_summary TEXT,
  p_meeting_date DATE,
  p_actor_email TEXT,
  p_source_type TEXT,
  p_source_reference TEXT,
  p_idempotency_key TEXT,
  p_decisions JSONB,
  p_actions JSONB,
  p_product_updates JSONB,
  p_calendar_event JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  item JSONB;
  result JSONB;
  existing_result JSONB;
  event_id UUID;
  decision_count INTEGER := 0;
  action_count INTEGER := 0;
  product_count INTEGER := 0;
  calendar_count INTEGER := 0;
BEGIN
  SELECT result_payload INTO existing_result
  FROM mcp_operation_log
  WHERE idempotency_key = p_idempotency_key;

  IF FOUND THEN
    RETURN existing_result || jsonb_build_object('already_applied', TRUE);
  END IF;

  INSERT INTO onboarding_events (
    project_id, event_type, event_label, actor_email, metadata, occurred_at
  ) VALUES (
    p_project_id,
    'meeting_decision',
    'Compte rendu de rendez-vous enregistré',
    p_actor_email,
    jsonb_build_object(
      'summary', p_summary,
      'source_type', p_source_type,
      'source_reference', p_source_reference,
      'decisions', COALESCE(p_decisions, '[]'::jsonb),
      'actions', COALESCE(p_actions, '[]'::jsonb),
      'product_updates', COALESCE(p_product_updates, '[]'::jsonb)
    ),
    p_meeting_date::timestamp AT TIME ZONE 'Europe/Paris'
  ) RETURNING id INTO event_id;

  FOR item IN SELECT value FROM jsonb_array_elements(COALESCE(p_decisions, '[]'::jsonb))
  LOOP
    INSERT INTO project_decisions (
      project_id, summary, decision_date, product_key, effective_until,
      source_type, source_reference, actor_email, metadata
    ) VALUES (
      p_project_id,
      item->>'summary',
      p_meeting_date,
      NULLIF(item->>'product_key', ''),
      NULLIF(item->>'effective_until', '')::date,
      p_source_type,
      p_source_reference,
      p_actor_email,
      COALESCE(item->'metadata', '{}'::jsonb)
    );
    decision_count := decision_count + 1;
  END LOOP;

  FOR item IN SELECT value FROM jsonb_array_elements(COALESCE(p_actions, '[]'::jsonb))
  LOOP
    INSERT INTO project_actions (
      project_id, title, description, owner, due_date, product_key, created_by
    ) VALUES (
      p_project_id,
      item->>'title',
      NULLIF(item->>'description', ''),
      NULLIF(item->>'owner', ''),
      NULLIF(item->>'due_date', '')::date,
      NULLIF(item->>'product_key', ''),
      p_actor_email
    );
    action_count := action_count + 1;
  END LOOP;

  FOR item IN SELECT value FROM jsonb_array_elements(COALESCE(p_product_updates, '[]'::jsonb))
  LOOP
    INSERT INTO project_product_updates (
      project_id, product_key, status, comment, owner_email, target_date,
      paused_until, pause_reason, updated_by, updated_at
    ) VALUES (
      p_project_id,
      item->>'product_key',
      item->>'status',
      NULLIF(item->>'comment', ''),
      NULLIF(item->>'owner_email', ''),
      NULLIF(item->>'target_date', '')::date,
      CASE WHEN item->>'status' = 'on_hold' THEN NULLIF(item->>'paused_until', '')::date ELSE NULL END,
      CASE WHEN item->>'status' = 'on_hold' THEN NULLIF(item->>'pause_reason', '') ELSE NULL END,
      p_actor_email,
      NOW()
    )
    ON CONFLICT (project_id, product_key) DO UPDATE SET
      status = EXCLUDED.status,
      comment = EXCLUDED.comment,
      owner_email = COALESCE(EXCLUDED.owner_email, project_product_updates.owner_email),
      target_date = COALESCE(EXCLUDED.target_date, project_product_updates.target_date),
      paused_until = EXCLUDED.paused_until,
      pause_reason = EXCLUDED.pause_reason,
      updated_by = EXCLUDED.updated_by,
      updated_at = NOW();
    product_count := product_count + 1;
  END LOOP;

  IF p_calendar_event IS NOT NULL AND COALESCE(p_calendar_event->>'google_event_id', '') <> '' THEN
    INSERT INTO project_calendar_events (
      project_id, google_event_id, calendar_id, title, starts_at, ends_at,
      html_link, attendees, linked_by, updated_at
    ) VALUES (
      p_project_id,
      p_calendar_event->>'google_event_id',
      COALESCE(NULLIF(p_calendar_event->>'calendar_id', ''), 'primary'),
      COALESCE(NULLIF(p_calendar_event->>'title', ''), p_summary),
      NULLIF(p_calendar_event->>'starts_at', '')::timestamptz,
      NULLIF(p_calendar_event->>'ends_at', '')::timestamptz,
      NULLIF(p_calendar_event->>'html_link', ''),
      COALESCE(p_calendar_event->'attendees', '[]'::jsonb),
      p_actor_email,
      NOW()
    )
    ON CONFLICT (calendar_id, google_event_id) DO UPDATE SET
      project_id = EXCLUDED.project_id,
      title = EXCLUDED.title,
      starts_at = EXCLUDED.starts_at,
      ends_at = EXCLUDED.ends_at,
      html_link = EXCLUDED.html_link,
      attendees = EXCLUDED.attendees,
      linked_by = EXCLUDED.linked_by,
      updated_at = NOW();
    calendar_count := 1;
  END IF;

  result := jsonb_build_object(
    'project_id', p_project_id,
    'event_id', event_id,
    'decisions_created', decision_count,
    'actions_created', action_count,
    'products_updated', product_count,
    'calendar_events_linked', calendar_count,
    'already_applied', FALSE
  );

  INSERT INTO mcp_operation_log (
    idempotency_key, project_id, operation_type, actor_email,
    request_payload, result_payload
  ) VALUES (
    p_idempotency_key,
    p_project_id,
    'record_meeting_outcome',
    p_actor_email,
    jsonb_build_object(
      'summary', p_summary,
      'meeting_date', p_meeting_date,
      'source_type', p_source_type,
      'source_reference', p_source_reference,
      'decisions', COALESCE(p_decisions, '[]'::jsonb),
      'actions', COALESCE(p_actions, '[]'::jsonb),
      'product_updates', COALESCE(p_product_updates, '[]'::jsonb),
      'calendar_event', p_calendar_event
    ),
    result
  );

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION record_mcp_meeting_outcome(
  TEXT, TEXT, DATE, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB, JSONB, JSONB
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION record_mcp_meeting_outcome(
  TEXT, TEXT, DATE, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB, JSONB, JSONB
) TO service_role;
