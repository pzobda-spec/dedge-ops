-- UI display language for the onboarding workspace, separate from
-- user_settings.default_language which controls the language of outgoing
-- client emails (EmailComposer).
ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS ui_language TEXT CHECK (ui_language IN ('fr', 'en')) DEFAULT 'fr';
