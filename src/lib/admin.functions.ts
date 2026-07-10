import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

function genApiKey(): string {
  // 32 random bytes hex, prefixed
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `dx_live_${hex}`;
}

export const listTenants = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: tenants, error } = await supabaseAdmin
    .from("tenants")
    .select("id, name, api_key, status, created_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  // usage per tenant
  const { data: usage } = await supabaseAdmin
    .from("extractions")
    .select("tenant_id");
  const counts = new Map<string, number>();
  for (const row of usage ?? []) {
    counts.set(row.tenant_id, (counts.get(row.tenant_id) ?? 0) + 1);
  }
  return (tenants ?? []).map((t) => ({ ...t, usage: counts.get(t.id) ?? 0 }));
});

export const createTenant = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ name: z.string().min(1).max(120) }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("tenants")
      .insert({ name: data.name, api_key: genApiKey(), status: "active" })
      .select("id, name, api_key, status, created_at")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const rotateApiKey = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("tenants")
      .update({ api_key: genApiKey() })
      .eq("id", data.id)
      .select("id, api_key")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const setTenantStatus = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), status: z.enum(["active", "disabled"]) }).parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("tenants")
      .update({ status: data.status })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listRecentExtractions = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("extractions")
    .select("id, tenant_id, document_type, overall_confidence, page_count, created_at, tenants(name)")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return data ?? [];
});

// ── Billing admin ──────────────────────────────────────────────────────────
export const listInvoices = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("invoices" as never)
    .select("id, tenant_id, billing_month, total_pages, total_amount, status, due_date, generated_at, paid_at, payment_reference, notes, tenants(name)")
    .order("billing_month", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as Array<Record<string, unknown>>;
});

export const markInvoicePaid = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        invoiceId: z.string().uuid(),
        paymentReference: z.string().min(1).max(200),
        notes: z.string().max(2000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("invoices" as never)
      .update({
        status: "paid",
        paid_at: new Date().toISOString(),
        payment_reference: data.paymentReference,
        notes: data.notes ?? null,
      } as never)
      .eq("id", data.invoiceId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateTenantBilling = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        rate_per_page: z.number().min(0).max(10000).optional(),
        billing_contact_name: z.string().max(200).nullish(),
        billing_email: z.string().email().max(200).nullish(),
        billing_phone: z.string().max(50).nullish(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: Record<string, unknown> = {};
    if (data.rate_per_page !== undefined) patch.rate_per_page = data.rate_per_page;
    if (data.billing_contact_name !== undefined) patch.billing_contact_name = data.billing_contact_name;
    if (data.billing_email !== undefined) patch.billing_email = data.billing_email;
    if (data.billing_phone !== undefined) patch.billing_phone = data.billing_phone;
    const { error } = await supabaseAdmin
      .from("tenants")
      .update(patch as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
