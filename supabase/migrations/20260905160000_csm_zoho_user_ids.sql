-- Ids utilisateurs Zoho CRM des CSM et implémenteurs OB, récupérés le 05/09.
-- Ils fiabilisent resolveCsmName, qui repose sinon sur les noms et alias
-- (souvent non normalisés côté Zoho). Voir docs/plan-charge-attribution-spec.md, section 9.3.

-- Harmony et Astrid ne figurent pas dans le seed de la migration 016, qui ne
-- créait que 7 CSM : on les insère avant de poser leur id et leurs alias.
-- Plafonds 15 et 8 repris du prototype de référence validé
-- (docs/plan-charge-prototype-reference.html), à confirmer avec la team lead
-- CSM ; éditables depuis le roster.
INSERT INTO csm_capacity_rules (csm_name, monthly_capacity_points, active, availability) VALUES
  ('Harmony', 15, TRUE, 'full'),
  ('Astrid', 8, TRUE, 'full')
ON CONFLICT (csm_name) DO NOTHING;

-- Ids utilisateurs Zoho par CSM.
UPDATE csm_capacity_rules SET zoho_user_id = '93025000241678001' WHERE csm_name = 'Anne-Charlotte'; -- Anne Charlotte Bonnaud
UPDATE csm_capacity_rules SET zoho_user_id = '93025000105340001' WHERE csm_name = 'Laurane';        -- Laurane Exilie
UPDATE csm_capacity_rules SET zoho_user_id = '93025000029321001' WHERE csm_name = 'Deydra';         -- Deydra Acero Vela
UPDATE csm_capacity_rules SET zoho_user_id = '93025000011483001' WHERE csm_name = 'Sherazade';      -- Sherazade Benamar
UPDATE csm_capacity_rules SET zoho_user_id = '93025000116805001' WHERE csm_name = 'Tara';           -- Tara Donnelly
UPDATE csm_capacity_rules SET zoho_user_id = '93025000077681001' WHERE csm_name = 'Aika';           -- Aika Aitkali
UPDATE csm_capacity_rules SET zoho_user_id = '93025000129927001' WHERE csm_name = 'Ghislaine';      -- Ghislaine Rohaut
UPDATE csm_capacity_rules SET zoho_user_id = '93025000262893001' WHERE csm_name = 'Harmony';        -- Harmony Telli
UPDATE csm_capacity_rules SET zoho_user_id = '93025000264881001' WHERE csm_name = 'Astrid';         -- Astrid Lapeyre

-- Alias manquants pour les deux nouveaux CSM, la migration précédente
-- (20260905140000_csm_directory_aliases.sql) n'en avait seedé que 7.
UPDATE csm_capacity_rules SET zoho_aliases = ARRAY['Telli'] WHERE csm_name = 'Harmony';
UPDATE csm_capacity_rules SET zoho_aliases = ARRAY['Lapeyre'] WHERE csm_name = 'Astrid';

-- Deydra : nom de famille composé, on ajoute l'alias complet en plus de
-- « Acero » déjà présent.
UPDATE csm_capacity_rules SET zoho_aliases = ARRAY['Acero', 'Acero Vela'] WHERE csm_name = 'Deydra';

-- Roster OB : mêmes besoins de résolution fiable pour les implémenteurs.
ALTER TABLE ob_capacity_rules ADD COLUMN IF NOT EXISTS zoho_user_id TEXT;

UPDATE ob_capacity_rules SET zoho_user_id = '93025000189875001' WHERE owner = 'Thuy-Tien'; -- Thuy-Tien Truong
UPDATE ob_capacity_rules SET zoho_user_id = '93025000180012268' WHERE owner = 'Dalia';      -- Dalia Chaal
UPDATE ob_capacity_rules SET zoho_user_id = '93025000257105001' WHERE owner = 'Winli';      -- Winli

CREATE INDEX IF NOT EXISTS idx_ob_capacity_zoho_user ON ob_capacity_rules(zoho_user_id);

-- Une « Anne-Sophie Paillard » existe parmi les utilisateurs Zoho : à ne
-- jamais confondre avec Anne-Charlotte lors de la résolution de noms.
