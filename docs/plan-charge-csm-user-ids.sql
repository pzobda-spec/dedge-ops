-- Ids utilisateurs Zoho CRM des CSM et implémenteurs (récupérés le 05/09 via getUsers).
-- Sert à fiabiliser resolveCsmName (id Zoho -> nom exact), le maillon faible du resolver de noms.
-- Adapter le nom de table si zoho_user_id n'est pas sur csm_capacity_rules (voir migration 20260905140000_csm_directory_aliases.sql).
-- PK csm_capacity_rules = csm_name (prénoms).

-- CSM
UPDATE csm_capacity_rules SET zoho_user_id = '93025000241678001' WHERE csm_name = 'Anne-Charlotte'; -- Anne Charlotte Bonnaud
UPDATE csm_capacity_rules SET zoho_user_id = '93025000105340001' WHERE csm_name = 'Laurane';        -- Laurane Exilie
UPDATE csm_capacity_rules SET zoho_user_id = '93025000029321001' WHERE csm_name = 'Deydra';         -- Deydra Acero Vela
UPDATE csm_capacity_rules SET zoho_user_id = '93025000011483001' WHERE csm_name = 'Sherazade';      -- Sherazade Benamar
UPDATE csm_capacity_rules SET zoho_user_id = '93025000116805001' WHERE csm_name = 'Tara';           -- Tara Donnelly
UPDATE csm_capacity_rules SET zoho_user_id = '93025000077681001' WHERE csm_name = 'Aika';           -- Aika Aitkali
UPDATE csm_capacity_rules SET zoho_user_id = '93025000129927001' WHERE csm_name = 'Ghislaine';      -- Ghislaine Rohaut

-- Nouveaux CSM (Harmony, Astrid), à INSERER d'abord s'ils ne sont pas dans le seed 016.
UPDATE csm_capacity_rules SET zoho_user_id = '93025000262893001' WHERE csm_name = 'Harmony';        -- Harmony Telli
UPDATE csm_capacity_rules SET zoho_user_id = '93025000264881001' WHERE csm_name = 'Astrid';         -- Astrid LAPEYRE

-- Implémenteurs OB (pour ob_capacity_rules si on veut aussi y stocker l'id Zoho)
-- Thuy-Tien Truong   93025000189875001
-- Dalia Chaal        93025000180012268
-- Winli (W Winli)    93025000257105001

-- Alias (nom de famille) utiles au fallback du resolver, le lookup CSM Zoho renvoie parfois
-- seulement le nom de famille : Bonnaud=Anne-Charlotte, Exilie=Laurane, Acero=Deydra,
-- Benamar=Sherazade, Donnelly=Tara, Aitkali=Aika, Rohaut=Ghislaine, Telli=Harmony, Lapeyre=Astrid.
