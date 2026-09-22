BEGIN;

ALTER TABLE public.access_requests
  ADD COLUMN IF NOT EXISTS full_name text,
  ADD COLUMN IF NOT EXISTS requested_role text CHECK (requested_role IN ('admin','onboarder','support','commercial_readonly','csm_lead')),
  ADD COLUMN IF NOT EXISTS approved_role text CHECK (approved_role IN ('admin','onboarder','support','commercial_readonly','csm_lead'));

-- Access requests are only exposed through server routes with explicit authorization.
ALTER TABLE public.access_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.access_requests FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.access_requests_id_seq FROM anon, authenticated;
GRANT ALL ON public.access_requests TO service_role;
GRANT ALL ON SEQUENCE public.access_requests_id_seq TO service_role;

-- Auth identities are created beforehand; retries reuse them after any DB failure.
CREATE OR REPLACE FUNCTION public.approve_app_access(
  p_email text, p_auth_id uuid, p_full_name text, p_role text, p_request_only boolean DEFAULT true
) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_request public.access_requests%ROWTYPE;
  v_user public.users%ROWTYPE;
BEGIN
  IF p_role IS NULL OR p_role NOT IN ('admin','onboarder','support','commercial_readonly','csm_lead') THEN
    RAISE EXCEPTION 'Rôle invalide';
  END IF;
  -- p_auth_id is resolved using the Auth Admin API by our service-role-only caller.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_email, 0));
  SELECT * INTO v_request FROM public.access_requests WHERE email = p_email FOR UPDATE;
  IF p_request_only AND (v_request.id IS NULL OR v_request.status = 'rejected') THEN
    RAISE EXCEPTION 'Demande absente ou refusée';
  END IF;
  SELECT * INTO v_user FROM public.users WHERE email = p_email FOR UPDATE;
  IF v_user.id IS NOT NULL THEN
    IF NOT v_user.active THEN
      RAISE EXCEPTION 'Compte désactivé : utilisez Modifier pour le réactiver.';
    END IF;
    -- Replays never change an existing account's role or activation status.
  ELSE
    INSERT INTO public.users (id,email,full_name,role,active,invited_at)
      VALUES (p_auth_id,p_email,nullif(trim(p_full_name),''),p_role,true,now())
      RETURNING * INTO v_user;
  END IF;
  INSERT INTO public.access_requests (email,full_name,status,approved_role,updated_at)
    VALUES (p_email,v_user.full_name,'approved',v_user.role,now())
    ON CONFLICT (email) DO UPDATE SET status='approved',approved_role=EXCLUDED.approved_role,updated_at=now();
  RETURN v_user.id;
END;
$$;
REVOKE ALL ON FUNCTION public.approve_app_access(text,uuid,text,text,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_app_access(text,uuid,text,text,boolean) TO service_role;

COMMIT;
