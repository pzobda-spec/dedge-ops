-- Rôle applicatif « csm_lead », pour la team lead CSM.
-- Périmètre : toute la section Onboarding en lecture, plus l'édition du roster
-- CSM et des attributions CSM du plan de charge. Aucun accès au reste du
-- cockpit (tickets, bugs, tableau de bord, formations, reporting), bloqué au
-- niveau du middleware et de chaque route API.
--
-- La contrainte CHECK de la migration 006 énumérait quatre rôles : on la
-- remplace plutôt que d'en ajouter une seconde, sinon les deux se cumuleraient
-- et aucun rôle ne satisferait les deux.

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('admin', 'onboarder', 'support', 'commercial_readonly', 'csm_lead'));

-- Attribution du rôle : depuis /admin/users, aucune ligne n'est créée ici.
