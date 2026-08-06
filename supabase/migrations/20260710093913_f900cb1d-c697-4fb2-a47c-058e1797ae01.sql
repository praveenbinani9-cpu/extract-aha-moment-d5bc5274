
-- Extend tenants with per-page rate + billing contact
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS rate_per_page numeric(10,2) NOT NULL DEFAULT 1.00,
  ADD COLUMN IF NOT EXISTS billing_contact_name text,
  ADD COLUMN IF NOT EXISTS billing_email text,
  ADD COLUMN IF NOT EXISTS billing_phone text;

-- Extend extractions with real PDF page count used for billing
ALTER TABLE public.extractions
  ADD COLUMN IF NOT EXISTS billed_pages integer;

-- Invoices (created first so usage_ledger.invoice_id FK resolves)
CREATE TABLE IF NOT EXISTS public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  billing_month date NOT NULL,
  total_pages integer NOT NULL,
  total_amount numeric(10,2) NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','paid','overdue')),
  generated_at timestamptz NOT NULL DEFAULT now(),
  due_date date NOT NULL,
  payment_method text NOT NULL DEFAULT 'offline_bank_transfer',
  paid_at timestamptz,
  payment_reference text,
  notes text,
  CONSTRAINT unique_tenant_month UNIQUE (tenant_id, billing_month)
);

-- Usage ledger
CREATE TABLE IF NOT EXISTS public.usage_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  extraction_id uuid NOT NULL REFERENCES public.extractions(id) ON DELETE CASCADE,
  page_count integer NOT NULL CHECK (page_count > 0),
  rate_per_page numeric(10,2) NOT NULL,
  amount numeric(10,2) NOT NULL,
  billing_month date NOT NULL,
  invoice_id uuid REFERENCES public.invoices(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT unique_extraction_billing UNIQUE (extraction_id)
);

CREATE INDEX IF NOT EXISTS usage_ledger_tenant_month_idx
  ON public.usage_ledger (tenant_id, billing_month) WHERE invoice_id IS NULL;

-- Billing errors log
CREATE TABLE IF NOT EXISTS public.billing_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid,
  extraction_id uuid,
  error_message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Lockdown pattern: revoke client access, grant service role, deny-all restrictive policy
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['invoices','usage_ledger','billing_errors'] LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "deny all client access to %I" ON public.%I', t, t);
    EXECUTE format('CREATE POLICY "deny all client access to %I" ON public.%I AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false)', t, t);
  END LOOP;
END $$;
