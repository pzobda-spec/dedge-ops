CREATE TABLE IF NOT EXISTS user_settings (
  user_id UUID PRIMARY KEY,
  user_email TEXT NOT NULL UNIQUE,
  acuity_link_15min TEXT,
  acuity_link_30min TEXT,
  acuity_link_60min TEXT,
  default_language TEXT CHECK (default_language IN ('fr', 'en')) DEFAULT 'fr',
  signature TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_settings_email ON user_settings(user_email);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  description TEXT,
  updated_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO app_settings (key, description, value) VALUES
  ('gemini_recap_gem_url', 'URL du Gem Gemini pour générer les récaps RDV', 'https://gemini.google.com/gem/f52d2af6eaca')
ON CONFLICT (key) DO NOTHING;
