
CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION public.generate_monthly_invoices()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_month date := date_trunc('month', (now() AT TIME ZONE 'UTC') - interval '1 month')::date;
  rec record;
  new_invoice_id uuid;
  invoices_created integer := 0;
BEGIN
  FOR rec IN
    SELECT tenant_id,
           SUM(page_count)::int AS total_pages,
           SUM(amount)::numeric(10,2) AS total_amount
    FROM public.usage_ledger
    WHERE invoice_id IS NULL
      AND billing_month = target_month
    GROUP BY tenant_id
  LOOP
    BEGIN
      INSERT INTO public.invoices (
        tenant_id, billing_month, total_pages, total_amount,
        status, due_date
      ) VALUES (
        rec.tenant_id, target_month, rec.total_pages, rec.total_amount,
        'pending', (now()::date + interval '15 days')::date
      )
      RETURNING id INTO new_invoice_id;

      UPDATE public.usage_ledger
        SET invoice_id = new_invoice_id
        WHERE tenant_id = rec.tenant_id
          AND billing_month = target_month
          AND invoice_id IS NULL;

      invoices_created := invoices_created + 1;
    EXCEPTION WHEN unique_violation THEN
      -- Invoice already exists for this tenant/month; skip.
      CONTINUE;
    END;
  END LOOP;

  RETURN invoices_created;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_monthly_invoices() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_monthly_invoices() TO service_role;

-- Schedule: 00:15 UTC on the 1st of each month
SELECT cron.unschedule('generate-monthly-invoices')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'generate-monthly-invoices');

SELECT cron.schedule(
  'generate-monthly-invoices',
  '15 0 1 * *',
  $cron$ SELECT public.generate_monthly_invoices(); $cron$
);
