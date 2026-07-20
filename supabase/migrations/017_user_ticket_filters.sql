ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS ticket_analytics_filters JSONB NOT NULL DEFAULT '{}'::jsonb;
