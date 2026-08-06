# DocExtract AI — Deep Technical Assessment

> **Assessed:** 2026-07-17
> **Scope:** Extraction pipeline (`extract-core.server.ts`), provider cascade, post-processing / GST reconciliation layers

---

## 1. Extraction — Provider Layer

### Images

| Step | Detail |
|---|---|
| **Primary** | Groq (`llama-4-scout-17b-16e-instruct`, temp 0, seed 7). If `overall_confidence ≥ 0.95` → done. |
| **Cascade** | If below 0.95, Gemini (direct Vertex AI) is called on the same image(s). Whichever result scores higher wins; **near-ties (within 0.02) prefer Groq** to save cost. |
| **Cross-check** | The losing provider's result is used to cross-verify critical fields (`invoice_number`, `invoice_date`, seller/buyer GSTINs, `grand_total`). If Groq and Gemini disagree on a critical field, confidence on that field is **capped at 0.7** and a warning is appended. |

### PDFs

| Step | Detail |
|---|---|
| **Primary** | Lovable AI Gateway (Gemini 2.5 Flash). |
| **Fallback** | Direct Vertex AI on failure. Env var `VERTEX_PDF_FIRST` flips the order. |
| **Auth** | Hand-rolled service-account JWT signed with Web Crypto (Cloudflare Workers–compatible). In-memory token cache (~50 min), 45s retry budget. |

### Multi-page images

- Farmed out in **parallel** with bounded concurrency (default 5).
- System prompt enforces **explicit page isolation** — no cross-page bleed of seller/buyer/totals.

---

## 2. System Prompt — GST-Specific Extraction Spec

This is not a generic "extract JSON from this document" prompt. Key doctrines:

1. **Literal extraction only** — never infer, never calculate.
2. **Strict `invoice_number ≠ invoice_date` rule** — if the model confuses them, value is cleared.
3. **GSTIN regex validation** baked into the expected output.
4. **Per-line vs invoice-level tax separation** — the model is instructed not to fabricate per-line CGST/SGST/IGST when only a rate was printed.
5. **Multi-invoice document splitting** — output is always a `documents[]` array.
6. **Amount column is source of truth** for multi-column textile invoices.

---

## 3. Post-Processing / Validation Layers

This is the real value-add — three key functions form a pipeline of business-rule reconciliation:

### 3.1 `normalizeGstTaxes`

- Cross-checks seller/buyer state codes (from GSTIN or address) against which tax fields are populated.
- Normalizes to either **IGST-only** or **CGST+SGST-only**, zeroing out the wrong pair.
- Prevents the common LLM failure mode of populating both inter-state and intra-state taxes simultaneously.

### 3.2 `applyGstinValidation`

- Regex-checks both party GSTINs (official 15-char format).
- Flags mismatches between GSTIN state code (first two digits) and address state.
- Wraps each GSTIN in `{ raw_value, normalized_value, is_valid }`.

### 3.3 `postProcess` (orchestrator)

Chains the following validators:

| # | Validator | What it catches |
|---|---|---|
| 1 | **Math reconciliation** | Recomputes `total_tax` from CGST+SGST+IGST+cess. Checks `taxable_amount + taxes ≈ grand_total` within **0.2% tolerance**. Checks each line item `qty × rate − discount ≈ amount`. |
| 2 | **Fabrication detection** | Flags cases where the model likely invented per-line tax amounts — e.g., one line item equals entire invoice tax, or all rows show suspiciously uniform tax that doesn't reconcile to total. |
| 3 | **Invoice number/date collision guard** | If `document_number` matches `document_date` or looks like a date pattern, nulls it out and drops confidence to **0.4**. |
| 4 | **E-way bill check** | Flags missing e-way bill number when taxable amount > ₹50,000 (mirrors real GST rules). |
| 5 | **Overall confidence recompute** | `overall_confidence = mean(per_field_confidence.*)` — so the score reflects **post-validation** confidence, not just raw model output. |

---

## 4. Comparative Assessment vs DOCWISE

### Gap: No Image Preprocessing

DocExtract AI does **no** deskew, denoise, or contrast enhancement before sending images to the LLM. This is a genuine gap for:
- Phone-captured photos with rotation/skew
- Low-contrast thermal prints
- Faded or stamped-over text

### Counter-argument: App-Layer Validation > Preprocessing

The dual-provider cross-check + GST-specific business-rule reconciliation is **arguably more valuable** for end-to-end accuracy than deskew/denoise would be. Reasoning:

| Image preprocessing | App-layer validation |
|---|---|
| Fixes OCR input quality | Catches hallucinated/miscategorized output values |
| Helps with marginal image quality | Has no effect on already-clear images |
| Domain-agnostic | Domain-specific (GST rules, state codes, tax math) |
| Needed for phone photos | Not needed if scanned PDF |

The preprocessing gap matters for phone-capture use cases. The validation gap matters for **all** use cases. Net: DocExtract AI's approach is more defensible for the B2B/API segment where documents are mostly scanned PDFs.

---

## 5. Summary Verdict

This is **genuinely sophisticated** — much more than "call an LLM and return JSON."

- **Provider cascade** with cost-aware tie-breaking and cross-check on critical fields.
- **Post-processing pipeline** that catches the exact failure modes LLMs exhibit on Indian tax documents.
- **Confidence score that means something** — it's post-validation, not raw model output.
- **Known trade-off** is the missing image preprocessing, which is a real gap for phone-capture but less relevant for the scanned-PDF API market.
