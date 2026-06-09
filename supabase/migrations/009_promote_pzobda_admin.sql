-- Keep the primary D-EDGE account aligned with its application permissions.

UPDATE users
SET
  role = 'admin',
  active = TRUE,
  updated_at = NOW()
WHERE email = 'pzobda@d-edge.com';
