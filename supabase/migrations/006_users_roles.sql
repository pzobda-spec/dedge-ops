CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT,
  role TEXT NOT NULL CHECK (role IN ('admin', 'onboarder', 'support', 'commercial_readonly')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  invited_at TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_active ON users(active);

INSERT INTO users (id, email, role, full_name, active)
VALUES (
  gen_random_uuid(),
  'pablo.zobda@loungeup.com',
  'admin',
  'Pablo Zobda',
  TRUE
)
ON CONFLICT (email) DO UPDATE SET role = 'admin', active = TRUE, updated_at = NOW();

INSERT INTO users (id, email, role, full_name, active)
VALUES (
  gen_random_uuid(),
  'pzobda@d-edge.com',
  'onboarder',
  'Pablo Zobda',
  TRUE
)
ON CONFLICT (email) DO UPDATE SET role = 'onboarder', active = TRUE, updated_at = NOW();
