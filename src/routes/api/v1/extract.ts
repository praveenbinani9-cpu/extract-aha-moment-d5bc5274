import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

// ── Schema for JSON body (base64 approach) ──────────────────────────────────
const JsonBody = z.object({
  images: z.array(z.string().min(20)).min(1).max(8),
  hint: z.string().max(500).optional(),
});

// ── Helpers ─────────────────────────────────────────────────────────────────
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
    },
  });
}

function currentMonth(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

// ── Detect MIME type from base64 magic bytes ─────────────────────────────────
function detectMimeType(b64: string): string {
  try {
    const head = atob(b64.slice(0, 16));
    const b0 = head.charCodeAt(0);
    const b1 = head.charCodeAt(1);
    if (b0 === 0x89 && b1 === 0x50) return "image/png";           // PNG
    if (b0 === 0xFF && b1 === 0xD8) return "image/jpeg";          // JPEG
    if (b0 === 0x52 && b1 === 0x49) return "image/webp";          // WEBP (RIFF)
    if (b0 === 0x25 && b1 === 0x50) return "application/pdf";     // PDF (%PDF)
    if (b0 === 0x47 && b1 === 0x49) return "image/gif";           // GIF
  } catch { /* fall through to default */ }
  return "image/jpeg"; // safe default
}

// ── Normalise a raw base64 string → data URI ─────────────────────────────────
function toDataUri(b64: string): string {
  if (b64.startsWith("data:")) return b64; // already a data URI
  const mime = detectMimeType(b64);
  return `data:${mime};base64,${b64}`;
}

// ── Convert an uploaded File → base64 data URI ───────────────────────────────
async function fileToDataUri(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  const b64 = btoa(binary);
  return `data:${file.type || "image/jpeg"};base64,${b64}`;
}

// ── Parse request → { images: string[], hint?: string } ─────────────────────
//    Supports:
//      • application/json  → { images: string[], hint?: string }
//      • multipart/form-data → files in "images" field, optional "hint" field
async function parseRequest(
  request: Request
): Promise<{ images: string[]; hint?: string } | { error: string; status: number }> {
  const contentType = request.headers.get("content-type") ?? "";

  // ── JSON body ──
  if (contentType.includes("application/json")) {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return { error: "Invalid JSON body", status: 400 };
    }
    const parsed = JsonBody.safeParse(body);
    if (!parsed.success) {
      return { error: "Invalid input", status: 400 };
    }
    // Normalise each base64 string to a proper data URI
    const images = parsed.data.images.map(toDataUri);
    return { images, hint: parsed.data.hint };
  }

  // ── Multipart form-data ──
  if (contentType.includes("multipart/form-data")) {
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return { error: "Invalid multipart body", status: 400 };
    }

    const hint = formData.get("hint")?.toString() ?? undefined;

    // Support both:
    //   - multiple fields named "images" (standard multi-file)
    //   - single field named "image" (convenience alias)
    const files: File[] = [];
    const imageEntries = formData.getAll("images");
    const singleEntry = formData.get("image");

    for (const entry of imageEntries) {
      if (entry instanceof File && entry.size > 0) files.push(entry);
    }
    if (files.length === 0 && singleEntry instanceof File && singleEntry.size > 0) {
      files.push(singleEntry);
    }

    if (files.length === 0) return { error: "No image files found in form data. Use field name 'images' or 'image'.", status: 400 };
    if (files.length > 8)   return { error: "Maximum 8 images per request.", status: 400 };

    // Validate file types
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"];
    for (const file of files) {
      if (file.type && !allowed.includes(file.type)) {
        return { error: `Unsupported file type: ${file.type}. Allowed: JPG, PNG, WEBP, PDF.`, status: 400 };
      }
      if (file.size > 4 * 1024 * 1024) {
        return { error: `File "${file.name}" exceeds 10 MB limit.`, status: 400 };
      }
    }

    const images = await Promise.all(files.map(fileToDataUri));
    return { images, hint };
  }

  return {
    error: "Unsupported Content-Type. Use 'application/json' for base64 or 'multipart/form-data' for file upload.",
    status: 415,
  };
}

// ── Route ────────────────────────────────────────────────────────────────────
export const Route = createFileRoute("/api/v1/extract")({
  server: {
    handlers: {
      OPTIONS: async () =>
        new Response(null, {
          status: 204,
          headers: {
            "access-control-allow-origin": "*",
            "access-control-allow-methods": "POST, OPTIONS",
            "access-control-allow-headers": "Content-Type, Authorization",
          },
        }),

      POST: async ({ request }) => {
        // ── Auth ──
        const authHeader = request.headers.get("authorization") ?? "";
        const apiKey = authHeader.startsWith("Bearer ")
          ? authHeader.slice("Bearer ".length).trim()
          : "";
        if (!apiKey) return json({ error: "Missing Bearer api_key" }, 401);

        // ── Parse body (JSON or multipart) ──
        const parsed = await parseRequest(request);
        if ("error" in parsed) return json({ error: parsed.error }, parsed.status);
        const { images, hint } = parsed;

        // ── Tenant lookup ──
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: tenant, error: tenantErr } = await supabaseAdmin
          .from("tenants")
          .select("id, status, monthly_limit, rate_per_page")
          .eq("api_key", apiKey)
          .maybeSingle();

        if (tenantErr) return json({ error: "Lookup failed" }, 500);
        if (!tenant)   return json({ error: "Invalid api_key" }, 401);
        if (tenant.status !== "active") return json({ error: "Tenant is disabled" }, 403);

        const ratePerPage = Number((tenant as { rate_per_page: number | string | null }).rate_per_page ?? 0) || 0;

        // ── Usage check ──
        const month = currentMonth();
        const limit = (tenant as { monthly_limit: number | null }).monthly_limit ?? 0;

        const { data: usage, error: usageErr } = await supabaseAdmin
          .from("tenant_usage")
          .select("extraction_count")
          .eq("tenant_id", tenant.id)
          .eq("usage_month", month)
          .maybeSingle();

        if (usageErr) return json({ error: "Usage lookup failed" }, 500);

        const used = usage?.extraction_count ?? 0;
        if (limit > 0 && used >= limit) {
          return json({ error: "Monthly limit exceeded" }, 429);
        }

        // ── Count billable pages (real PDF page counts; images = 1 each) ──
        const { countPdfPages, isPdfDataUri } = await import("@/lib/pdf-pages.server");
        let billedPages = 0;
        for (const img of images) {
          if (isPdfDataUri(img)) {
            const n = await countPdfPages(img);
            billedPages += n && n > 0 ? n : 1;
          } else {
            billedPages += 1;
          }
        }
        if (billedPages < 1) billedPages = images.length || 1;

        // ── Extract ──
        const { extractCore } = await import("@/lib/extract-core.server");
        let result;
        try {
          result = await extractCore(images, hint);
        } catch (e) {
          return json({ error: e instanceof Error ? e.message : "Extraction failed" }, 502);
        }

        // ── Save to DB ──
        const parsedJson = result.parsed as Record<string, unknown> | null;
        const documentsArr = Array.isArray(parsedJson?.documents)
          ? (parsedJson!.documents as Array<Record<string, unknown>>)
          : null;
        const primary = documentsArr && documentsArr.length > 0 ? documentsArr[0] : parsedJson;

        const document_type =
          primary && typeof primary["document_type"] === "string"
            ? (primary["document_type"] as string)
            : null;
        const overall_confidence = result.overall_confidence;
        const provider_used = result.provider_used;
        const meets_confidence_threshold = result.meets_confidence_threshold;
        const docCount = documentsArr ? documentsArr.length : images.length;

        const { data: inserted, error: insertErr } = await supabaseAdmin
          .from("extractions")
          .insert({
            tenant_id: tenant.id,
            document_type,
            overall_confidence,
            page_count: docCount,
            billed_pages: billedPages,
            provider_used,
            meets_confidence_threshold,
            result: (parsedJson ?? {}) as never,
          } as never)
          .select("id, created_at")
          .single();

        if (insertErr) {
          console.error("extractions insert failed", insertErr);
        } else {
          const { error: rpcErr } = await supabaseAdmin.rpc("increment_usage", {
            p_tenant_id: tenant.id,
            p_month: month,
            p_count: docCount,
          });
          if (rpcErr) console.error("increment_usage failed", rpcErr);

          // ── Record billable usage (never let this affect the response) ──
          try {
            const { recordUsage } = await import("@/lib/billing.server");
            await recordUsage(tenant.id, inserted.id, billedPages, ratePerPage);
          } catch (err) {
            console.error("recordUsage failed", err);
          }
        }

        return json({
          ok: true,
          extraction_id: inserted?.id ?? null,
          created_at: inserted?.created_at ?? null,
          document_type,
          overall_confidence,
          provider_used,
          meets_confidence_threshold,
          billed_pages: billedPages,
          data: parsedJson,
        });
      },
    },
  },
});
