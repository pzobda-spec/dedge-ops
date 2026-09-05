-- Scaffolding du moteur d'attribution de charge OB / CSM.
-- Cette migration ajoute :
--   1. Le roster OB (implémenteurs onboarding) avec rôle, plafond de projets
--      simultanés et état de disponibilité ;
--   2. L'état de disponibilité côté CSM, en complément du booléen `active`
--      existant ;
--   3. La table des pré-attributions et overrides manuels OB/CSM par compte.
-- Voir docs/plan-charge-attribution-spec.md, sections 2, 4 et 5.1.

-- 1. Roster OB : rôle, plafond, disponibilité.
CREATE TABLE IF NOT EXISTS ob_capacity_rules (
  owner TEXT PRIMARY KEY,
  owner_email TEXT,
  role TEXT NOT NULL DEFAULT 'junior' CHECK (role IN ('senior', 'junior', 'alternant', 'stagiaire')),
  max_projects INTEGER NOT NULL DEFAULT 50,
  availability TEXT NOT NULL DEFAULT 'full' CHECK (availability IN ('full', 'relache', 'absent', 'stop')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE ob_capacity_rules ENABLE ROW LEVEL SECURITY;

INSERT INTO ob_capacity_rules (owner, role, max_projects, availability) VALUES
  ('Thuy-Tien', 'senior', 50, 'full'),
  ('Dalia', 'junior', 50, 'full'),
  ('Winli', 'junior', 50, 'full')
ON CONFLICT (owner) DO NOTHING;

-- Les futures recrues (alternant plafond 30, stagiaire plafond 5, CDI) seront
-- ajoutées ici en availability='absent' au moment du recrutement, pour ne pas
-- fausser la capacité tant qu'elles ne sont pas opérationnelles. Exemple :
-- INSERT INTO ob_capacity_rules (owner, role, max_projects, availability)
--   VALUES ('Nouvel Alternant', 'alternant', 30, 'absent')
--   ON CONFLICT (owner) DO NOTHING;

-- 2. Extension de csm_capacity_rules (table existante, migration 014) avec
-- l'état de disponibilité, qui remplace le simple booléen `active` comme
-- source de vérité pour le moteur de plan de charge.
ALTER TABLE csm_capacity_rules ADD COLUMN IF NOT EXISTS availability TEXT NOT NULL DEFAULT 'full';

ALTER TABLE csm_capacity_rules DROP CONSTRAINT IF EXISTS csm_capacity_rules_availability_check;
ALTER TABLE csm_capacity_rules ADD CONSTRAINT csm_capacity_rules_availability_check
  CHECK (availability IN ('full', 'relache', 'absent', 'stop'));

-- Backfill : migre l'ancien booléen `active=false` (Aika) vers l'état 'stop'.
UPDATE csm_capacity_rules SET availability = 'stop' WHERE active = FALSE AND availability = 'full';

-- La colonne `active` est CONSERVÉE en lecture pour compatibilité (elle est
-- encore filtrée par app/api/onboarding/projects/[id]/csm-suggestion/route.ts).
-- `availability` devient la source de vérité pour le moteur de plan de charge.

-- 3. Pré-attributions et overrides manuels OB/CSM par compte.
CREATE TABLE IF NOT EXISTS account_assignments (
  account_id TEXT PRIMARY KEY,
  account_name TEXT,
  group_id TEXT,
  ob_owner TEXT,
  ob_locked BOOLEAN NOT NULL DEFAULT FALSE,
  csm_name TEXT,
  csm_locked BOOLEAN NOT NULL DEFAULT FALSE,
  expected_go_live DATE,
  source TEXT NOT NULL DEFAULT 'engine' CHECK (source IN ('engine', 'manual', 'zoho')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- `ob_locked` / `csm_locked` : override manuel, prioritaire sur la continuité
-- de groupe et sur la répartition automatique.

ALTER TABLE account_assignments ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_account_assignments_group ON account_assignments(group_id);
CREATE INDEX IF NOT EXISTS idx_account_assignments_csm ON account_assignments(csm_name);
CREATE INDEX IF NOT EXISTS idx_account_assignments_ob ON account_assignments(ob_owner);
