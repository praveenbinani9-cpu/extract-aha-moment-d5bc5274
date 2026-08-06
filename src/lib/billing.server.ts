// Records a billable extraction into usage_ledger. Never throws.
// A unique_violation on extraction_id means we already billed this extraction —
// silently ignore (idempotent for retries).

export async function recordUsage(
  tenantId: string,
  extractionId: string,
  pageCount: number,
  ratePerPage: number,
): Promise<void> {
  try {
    if (pageCount < 1) pageCount = 1;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const now = new Date();
    const billingMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
    const amount = Number((pageCount * ratePerPage).toFixed(2));

    const { error } = await supabaseAdmin.from("usage_ledger" as never).insert({
      tenant_id: tenantId,
      extraction_id: extractionId,
      page_count: pageCount,
      rate_per_page: ratePerPage,
      amount,
      billing_month: billingMonth,
    } as never);

    if (error) {
      // Postgres unique_violation
      const code = (error as { code?: string }).code;
      if (code === "23505") return; // already billed
      await logBillingError(tenantId, extractionId, error.message);
    }
  } catch (err) {
    await logBillingError(
      tenantId,
      extractionId,
      err instanceof Error ? err.message : String(err),
    );
  }
}

async function logBillingError(tenantId: string, extractionId: string, message: string) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("billing_errors" as never)
      .insert({ tenant_id: tenantId, extraction_id: extractionId, error_message: message } as never);
  } catch (err) {
    console.error("billing_errors log failed", err);
  }
}
