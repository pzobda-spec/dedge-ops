-- Integration regression checks; all fixtures are rolled back.
BEGIN;
INSERT INTO public.access_requests(email,full_name,requested_role)
VALUES ('auth-regression@example.invalid','Auth Regression','support');
SET LOCAL ROLE service_role;
DO $$
DECLARE v_id uuid := gen_random_uuid(); v_result uuid;
BEGIN
  v_result := public.approve_app_access('auth-regression@example.invalid',v_id,'Auth Regression','onboarder',true);
  IF v_result <> v_id OR NOT EXISTS (
    SELECT 1 FROM public.users u JOIN public.access_requests r USING(email)
    WHERE u.id=v_id AND u.active AND u.role='onboarder'
      AND r.status='approved' AND r.approved_role='onboarder' AND r.requested_role='support'
  ) THEN RAISE EXCEPTION 'Approval must create active profile with adjusted role'; END IF;
  PERFORM public.approve_app_access('auth-regression@example.invalid',v_id,'Changed','admin',true);
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id=v_id AND role='onboarder') THEN
    RAISE EXCEPTION 'Replay changed permissions';
  END IF;
  UPDATE public.users SET active=false WHERE id=v_id;
  BEGIN
    PERFORM public.approve_app_access('auth-regression@example.invalid',v_id,'Changed','admin',false);
    RAISE EXCEPTION 'FAIL: inactive account accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'Compte désactivé%' THEN RAISE; END IF;
  END;
  IF EXISTS (SELECT 1 FROM public.users WHERE id=v_id AND active) THEN RAISE EXCEPTION 'Account reactivated'; END IF;
  BEGIN
    PERFORM public.approve_app_access('missing-request@example.invalid',gen_random_uuid(),'Missing','onboarder',true);
    RAISE EXCEPTION 'FAIL: missing request accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'Demande absente%' THEN RAISE; END IF;
  END;
END $$;
RESET ROLE;
DO $$ BEGIN
  IF has_function_privilege('anon','public.approve_app_access(text,uuid,text,text,boolean)','EXECUTE')
    OR has_function_privilege('authenticated','public.approve_app_access(text,uuid,text,text,boolean)','EXECUTE')
    OR has_table_privilege('anon','public.access_requests','UPDATE')
    OR has_table_privilege('authenticated','public.access_requests','INSERT') THEN
    RAISE EXCEPTION 'Untrusted callers can grant access';
  END IF;
END $$;
ROLLBACK;
SELECT 'PASS: atomic approval, adjusted role, idempotent retries, inactive accounts, missing requests, permissions; fixtures rolled back' AS result;
