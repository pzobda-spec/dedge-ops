-- D-EDGE Ops Cockpit — Database Schema
-- Sprint 1 (Supabase / PostgreSQL)

-- Clients
CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  segment TEXT NOT NULL CHECK (segment IN ('Strategic', 'Gold', 'Silver', 'Bronze')),
  country TEXT NOT NULL,
  language TEXT NOT NULL,
  products TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tickets
CREATE TABLE IF NOT EXISTS tickets (
  id TEXT PRIMARY KEY,
  external_id TEXT UNIQUE NOT NULL,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open', 'pending', 'resolved', 'reopened')),
  priority TEXT NOT NULL CHECK (priority IN ('urgent', 'high', 'medium', 'low')),
  type TEXT NOT NULL CHECK (type IN ('question', 'problem', 'task', 'feature')),
  product_area TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('email', 'chat', 'phone')),
  sentiment TEXT NOT NULL CHECK (sentiment IN ('positive', 'neutral', 'negative')),
  risk_score INTEGER NOT NULL DEFAULT 0 CHECK (risk_score BETWEEN 0 AND 100),
  summary TEXT,
  recommended_action TEXT,
  last_client_message_at TIMESTAMPTZ,
  last_agent_reply_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ticket messages
CREATE TABLE IF NOT EXISTS ticket_messages (
  id BIGSERIAL PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  author_type TEXT NOT NULL CHECK (author_type IN ('client', 'agent', 'system')),
  author_name TEXT,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Escalations
CREATE TABLE IF NOT EXISTS escalations (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  linear_issue_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('to_qualify', 'sent', 'waiting', 'in_progress', 'fix_ready', 'resolved', 'client_to_inform')),
  subject TEXT NOT NULL,
  technical_summary TEXT,
  expected_behavior TEXT,
  actual_behavior TEXT,
  reproduction_steps TEXT,
  impact TEXT,
  next_action TEXT,
  owner TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trainings
CREATE TABLE IF NOT EXISTS trainings (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  language TEXT NOT NULL CHECK (language IN ('FR', 'EN', 'ES')),
  training_date TIMESTAMPTZ NOT NULL,
  theme TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('scheduled', 'completed', 'cancelled')),
  replay_sent BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Training registrations
CREATE TABLE IF NOT EXISTS training_registrations (
  id BIGSERIAL PRIMARY KEY,
  training_id TEXT NOT NULL REFERENCES trainings(id) ON DELETE CASCADE,
  hotel_name TEXT NOT NULL,
  participant_name TEXT NOT NULL,
  participant_email TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('registered', 'cancelled', 'no_show')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Onboarding projects
CREATE TABLE IF NOT EXISTS onboarding_projects (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  owner TEXT NOT NULL,
  plan TEXT,
  status TEXT NOT NULL CHECK (status IN ('kickoff', 'credentials_pending', 'documents_pending', 'build', 'client_review', 'adjustments', 'ready', 'live', 'blocked')),
  start_date DATE,
  target_go_live DATE,
  actual_go_live DATE,
  blockers TEXT,
  iteration_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Onboarding satisfaction responses
CREATE TABLE IF NOT EXISTS onboarding_satisfaction (
  zoho_id TEXT PRIMARY KEY,
  establishment TEXT NOT NULL DEFAULT '',
  respondent_name TEXT NOT NULL DEFAULT '',
  owner TEXT NOT NULL DEFAULT '',
  score_global NUMERIC(3,2) NOT NULL DEFAULT 0,
  score_onboarding NUMERIC(3,2) NOT NULL DEFAULT 0,
  score_simplicity NUMERIC(3,2) NOT NULL DEFAULT 0,
  score_tool NUMERIC(3,2) NOT NULL DEFAULT 0,
  score_training NUMERIC(3,2) NOT NULL DEFAULT 0,
  comment TEXT,
  submitted_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Knowledge articles
CREATE TABLE IF NOT EXISTS knowledge_articles (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  product_area TEXT NOT NULL,
  problem TEXT,
  symptoms TEXT[] DEFAULT '{}',
  causes TEXT[] DEFAULT '{}',
  checks TEXT[] DEFAULT '{}',
  solution TEXT,
  client_reply_template TEXT,
  source_ticket_id TEXT REFERENCES tickets(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Monthly metrics
CREATE TABLE IF NOT EXISTS monthly_metrics (
  id BIGSERIAL PRIMARY KEY,
  month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  year INTEGER NOT NULL,
  total_tickets INTEGER NOT NULL DEFAULT 0,
  total_calls INTEGER NOT NULL DEFAULT 0,
  total_chats INTEGER NOT NULL DEFAULT 0,
  avg_first_response_hours DECIMAL(5,2),
  fcr_rate DECIMAL(4,3),
  top_products JSONB DEFAULT '[]',
  by_channel JSONB DEFAULT '{}',
  opened_vs_resolved JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (month, year)
);

-- AI actions log
CREATE TABLE IF NOT EXISTS ai_actions (
  id BIGSERIAL PRIMARY KEY,
  action_type TEXT NOT NULL CHECK (action_type IN ('summarize_ticket', 'generate_reply', 'create_escalation', 'create_kb_article', 'monthly_analysis')),
  ticket_id TEXT REFERENCES tickets(id) ON DELETE SET NULL,
  input_payload JSONB,
  output_payload JSONB,
  model TEXT NOT NULL DEFAULT 'gpt-4o',
  tokens_used INTEGER,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ticket chunks (RAG — vector embeddings for AI search)
CREATE TABLE IF NOT EXISTS ticket_chunks (
  id BIGSERIAL PRIMARY KEY,
  ticket_id TEXT NOT NULL,
  chunk_type TEXT NOT NULL CHECK (chunk_type IN ('subject_and_description', 'thread', 'resolution')),
  content TEXT NOT NULL,
  embedding vector(1536),
  zoho_status TEXT,
  product_area TEXT,
  segment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Webhook events log
CREATE TABLE IF NOT EXISTS webhook_events (
  id BIGSERIAL PRIMARY KEY,
  event_type TEXT NOT NULL,
  ticket_id TEXT,
  payload JSONB,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ticket_chunks_ticket_id ON ticket_chunks(ticket_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_processed_at ON webhook_events(processed_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_client_id ON tickets(client_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_risk_score ON tickets(risk_score DESC);
CREATE INDEX IF NOT EXISTS idx_escalations_ticket_id ON escalations(ticket_id);
CREATE INDEX IF NOT EXISTS idx_escalations_status ON escalations(status);
CREATE INDEX IF NOT EXISTS idx_training_registrations_training_id ON training_registrations(training_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_client_id ON onboarding_projects(client_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_satisfaction_submitted_at ON onboarding_satisfaction(submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_onboarding_satisfaction_owner ON onboarding_satisfaction(owner);
CREATE INDEX IF NOT EXISTS idx_ai_actions_ticket_id ON ai_actions(ticket_id);
CREATE INDEX IF NOT EXISTS idx_monthly_metrics_month_year ON monthly_metrics(year DESC, month DESC);
