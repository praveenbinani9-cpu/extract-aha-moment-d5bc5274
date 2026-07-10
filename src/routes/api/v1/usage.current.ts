import { createFileRoute } from "@tanstack/react-router";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
    },
  });
}

export const Route = createFileRoute("/api/v1/usage/current")({
  server: {
    handlers: {
      OPTIONS: async () =>
        new Response(null, {
          status: 204,
          headers: {
            "access-control-allow-origin": "*",
            "access-control-allow-methods": "GET, OPTIONS",
            "access-control-allow-headers": "Content-Type, Authorization",
          },
        }),

      GET: async ({ request }) => {
        const authHeader = request.headers.get("authorization") ?? "";
        const apiKey = authHeader.startsWith("Bearer ")
          ? authHeader.slice("Bearer ".length).trim()
          : "";
        if (!apiKey) return json({ error: "Missing Bearer api_key" }, 401);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: tenant, error: tenantErr } = await supabaseAdmin
          .from("tenants")
          .select("id, status, rate_per_page")
          .eq("api_key", apiKey)
          .maybeSingle();

        if (tenantErr) return json({ error: "Lookup failed" }, 500);
        if (!tenant) return json({ error: "Invalid api_key" }, 401);
        if (tenant.status !== "active") return json({ error: "Tenant is disabled" }, 403);

        const now = new Date();
        const billingMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;

        const { data: rows, error: usageErr } = await supabaseAdmin
          .from("usage_ledger" as never)
          .select("page_count, amount")
          .eq("tenant_id", tenant.id)
          .eq("billing_month", billingMonth)
          .is("invoice_id", null);

        if (usageErr) return json({ error: "Usage lookup failed" }, 500);

        let totalPages = 0;
        let totalAmount = 0;
        for (const r of (rows ?? []) as Array<{ page_count: number; amount: number | string }>) {
          totalPages += Number(r.page_count) || 0;
          totalAmount += Number(r.amount) || 0;
        }

        const rate = Number((tenant as { rate_per_page: number | string }).rate_per_page) || 0;

        return json({
          billing_month: billingMonth,
          total_pages: totalPages,
          total_amount: Number(totalAmount.toFixed(2)),
          rate_per_page: rate,
          currency: "INR",
        });
      },
    },
  },
});
