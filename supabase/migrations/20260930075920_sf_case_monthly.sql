CREATE TABLE IF NOT EXISTS public.sf_case_monthly (
  month DATE NOT NULL CHECK (EXTRACT(DAY FROM month) = 1),
  case_type TEXT NOT NULL CHECK (case_type IN ('welcome', 'setup')),
  product TEXT NOT NULL CHECK (length(trim(product)) > 0),
  opened INTEGER NOT NULL CHECK (opened >= 0),
  closed INTEGER NOT NULL CHECK (closed >= 0),
  open_stock INTEGER CHECK (open_stock >= 0),
  avg_age_days NUMERIC(10,2) CHECK (avg_age_days >= 0),
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (month, case_type, product)
);

ALTER TABLE public.sf_case_monthly ENABLE ROW LEVEL SECURITY;

-- One RPC call is one database transaction. A failed insert rolls back the delete.
CREATE OR REPLACE FUNCTION public.replace_sf_case_monthly(p_month DATE, p_rows JSONB)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_synced_at TIMESTAMPTZ := now();
BEGIN
  IF p_month IS NULL OR EXTRACT(DAY FROM p_month) <> 1
     OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'Invalid monthly case batch';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_month::text, 0));
  DELETE FROM public.sf_case_monthly WHERE month = p_month;

  INSERT INTO public.sf_case_monthly
    (month, case_type, product, opened, closed, open_stock, avg_age_days, synced_at)
  SELECT p_month, row.case_type, row.product, row.opened, row.closed,
         row.open_stock, row.avg_age_days, v_synced_at
  FROM pg_catalog.jsonb_to_recordset(p_rows) AS row(
    case_type TEXT, product TEXT, opened INTEGER, closed INTEGER,
    open_stock INTEGER, avg_age_days NUMERIC
  );

  IF (SELECT count(*) FROM public.sf_case_monthly
      WHERE month = p_month AND product = '__TOTAL__') <> 2 THEN
    RAISE EXCEPTION 'Both case totals are required';
  END IF;
  RETURN v_synced_at;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_sf_case_monthly(DATE, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_sf_case_monthly(DATE, JSONB) TO service_role;
