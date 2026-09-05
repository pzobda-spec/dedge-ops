-- Résolution des alias de nom CSM renvoyés par Zoho CRM.
-- Le lookup `CSM` du module Accounts n'est pas normalisé : il renvoie tantôt
-- le nom complet (« Aika Aitkali »), tantôt le seul nom de famille
-- (« Rohaut », « Exilie », « Bonnaud »), alors que csm_capacity_rules.csm_name
-- est indexé sur les prénoms. La clé de résolution la plus fiable reste
-- `zoho_user_id`, à renseigner dès que les ids utilisateurs Zoho seront
-- connus ; en attendant, on s'appuie sur une liste d'alias de nom de famille.
-- Voir docs/plan-charge-attribution-spec.md, section 7.

ALTER TABLE csm_capacity_rules ADD COLUMN IF NOT EXISTS zoho_user_id TEXT;
ALTER TABLE csm_capacity_rules ADD COLUMN IF NOT EXISTS zoho_aliases TEXT[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_csm_capacity_zoho_user ON csm_capacity_rules(zoho_user_id);

-- Seed des alias connus (correspondances tranchées le 05/09 par Pablo).
UPDATE csm_capacity_rules SET zoho_aliases = ARRAY['Rohaut'] WHERE csm_name = 'Ghislaine';
UPDATE csm_capacity_rules SET zoho_aliases = ARRAY['Exilie'] WHERE csm_name = 'Laurane';
UPDATE csm_capacity_rules SET zoho_aliases = ARRAY['Bonnaud'] WHERE csm_name = 'Anne-Charlotte';
UPDATE csm_capacity_rules SET zoho_aliases = ARRAY['Aitkali'] WHERE csm_name = 'Aika';
UPDATE csm_capacity_rules SET zoho_aliases = ARRAY['Acero'] WHERE csm_name = 'Deydra';
UPDATE csm_capacity_rules SET zoho_aliases = ARRAY['Benamar'] WHERE csm_name = 'Sherazade';
UPDATE csm_capacity_rules SET zoho_aliases = ARRAY['Donnelly'] WHERE csm_name = 'Tara';

-- Un CSM non résolu (ni par zoho_user_id, ni par alias, ni par nom exact) ne
-- doit jamais être deviné : il doit ressortir explicitement comme non résolu.
