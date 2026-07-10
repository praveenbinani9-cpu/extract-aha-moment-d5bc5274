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

export const Route = createFileRoute("/api/v1/invoices")({
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
          .select("id, status")
          .eq("api_key", apiKey)
          .maybeSingle();

        if (tenantErr) return json({ error: "Lookup failed" }, 500);
        if (!tenant) return json({ error: "Invalid api_key" }, 401);
        if (tenant.status !== "active") return json({ error: "Tenant is disabled" }, 403);

        const { data, error } = await supabaseAdmin
          .from("invoices" as never)
          .select("id, billing_month, total_pages, total_amount, status, due_date, generated_at, paid_at, payment_reference")
          .eq("tenant_id", tenant.id)
          .order("billing_month", { ascending: false });

        if (error) return json({ error: "Invoice lookup failed" }, 500);

        return json({ invoices: data ?? [], currency: "INR" });
      },
    },
  },
});
