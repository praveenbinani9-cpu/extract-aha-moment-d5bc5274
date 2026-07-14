// Server-only core extraction logic. Used by both the createServerFn wrapper
// (src/lib/extract.functions.ts) and the public /api/v1/extract route.
// IMPORTANT: Do not change the system prompt or model — kept identical to the
// existing extractDocument behavior.
const SYSTEM_PROMPT = `You are a senior invoice and document extraction specialist.

Your task is to extract data exactly as it appears on the document.

Rules:
1. Extract only visible information.
2. Never guess missing values.
3. Never infer values.
4. Never calculate values.
5. Never modify values.
6. Never replace invoice numbers with dates.
7. Never replace GSTINs with similar-looking values.
8. Preserve original formatting exactly as shown.
9. If a field is unclear, return null.
10. Return valid JSON only.
11. Extract first, do not reason.
12. Read the document literally, not logically.

# Page isolation (CRITICAL)
- Treat every page as an independent document context.
- Do NOT carry header, seller, buyer, GSTIN, invoice number, totals, or line-item values from one page into another.
- If a value is not visible on the page being read, return null for that page — do not copy it from a sibling page.

# Section-targeted extraction
Extract these sections independently before merging into the final object:
- Header: invoice_number, invoice_date, seller_details, buyer_details, GSTINs
- Line items: description, quantity, rate, taxable_value (read row-by-row, preserve original row order, never shift columns)
- Totals: subtotal, tax_amounts, grand_total

# Invoice number vs invoice date
- invoice_number and invoice_date are independent fields. They must NOT be the same string.
- If the only candidate for invoice_number looks like a date, return null for invoice_number rather than copying the date.

# GSTIN
- GSTIN is always exactly 15 characters: ^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$
- Return the GSTIN exactly as printed (do not auto-correct). Validity is reported separately.
- Seller GSTIN is read ONLY from the header/letterhead. Buyer GSTIN is read ONLY from the Bill To/Buyer block. Never mix.

# Output contract — return ONE JSON object, nothing else
No prose. No markdown fences. No comments. No trailing text.

Schema:
{
  "document_type": string,
  "document_number": string|null,
  "document_date": string|null,
  "due_date": string|null,
  "irn": string|null,
  "acknowledgement_no": string|null,
  "acknowledgement_date": string|null,
  "reverse_charge": boolean|null,
  "supply_type": string|null,
  "place_of_supply": string|null,
  "currency": string|null,
  "seller": { "name": string|null, "gstin": string|null, "pan": string|null, "address": string|null, "city": string|null, "state": string|null, "state_code": string|null, "pincode": string|null, "email": string|null, "phone": string|null, "website": string|null },
  "buyer":  { "name": string|null, "gstin": string|null, "pan": string|null, "address": string|null, "city": string|null, "state": string|null, "state_code": string|null, "pincode": string|null, "email": string|null, "phone": string|null },
  "shipping": { "name": string|null, "address": string|null, "city": string|null, "state": string|null, "state_code": string|null, "pincode": string|null, "gstin": string|null } | null,
  "line_items": [
    { "sr_no": number|null, "description": string, "hsn_sac": string|null, "quantity": number|null, "unit": string|null, "rate": number|null, "discount": number|null, "taxable_amount": number|null, "tax_rate": number|null, "cgst_rate": number|null, "cgst": number|null, "sgst_rate": number|null, "sgst": number|null, "igst_rate": number|null, "igst": number|null, "cess_rate": number|null, "cess": number|null, "amount": number|null }
  ],

# Per-line tax amounts (CRITICAL — do NOT fabricate)
- Per-line cgst / sgst / igst / cess RUPEE amounts must ONLY be populated when a rupee figure for that specific line is visibly printed in the line-items table on the document.
- If the line-items table shows only a GST rate (e.g. "5%", "18%") for each row but does NOT print a per-line tax amount column, return null for that row's cgst / sgst / igst / cess amount fields. Populate only cgst_rate / sgst_rate / igst_rate / cess_rate in that case.
- Never compute a per-line tax amount from taxable_amount × rate.
- Never split, copy, or distribute the invoice-level total tax (from the footer/totals block) onto line items.
- The invoice-level totals.cgst / totals.sgst / totals.igst / totals.total_tax must still be extracted from the footer/totals block as printed — that is independent from per-line amounts.

  "totals": { "subtotal": number|null, "total_discount": number|null, "taxable_amount": number|null, "cgst": number|null, "sgst": number|null, "igst": number|null, "cess": number|null, "total_tax": number|null, "tcs": number|null, "tds": number|null, "freight_charges": number|null, "other_charges": number|null, "round_off": number|null, "grand_total": number|null, "amount_in_words": string|null, "currency": string|null },
  "payment_terms": { "payment_mode": string|null, "due_date": string|null, "due_days": number|null, "interest_rate_percent": number|null, "advance_received": number|null } | null,
  "bank_details": { "bank_name": string|null, "account_number": string|null, "ifsc_code": string|null, "account_holder_name": string|null, "branch": string|null } | null,
  "transport_details": { "transporter_name": string|null, "transporter_gstin": string|null, "vehicle_number": string|null, "lr_number": string|null, "lr_date": string|null, "eway_bill_number": string|null, "eway_bill_date": string|null, "dispatch_from": string|null, "ship_to": string|null, "place_of_supply": string|null, "place_of_supply_code": string|null } | null,
  "broker_agent_details": { "broker_name": string|null, "broker_address": string|null, "agent_name": string|null, "agency_code": string|null } | null,
  "document_references": { "challan_number": string|null, "order_number": string|null, "po_number": string|null, "case_pack_info": string|null, "reverse_charge_applicable": boolean },
  "references": { "po_number": string|null, "po_date": string|null, "challan_number": string|null, "challan_date": string|null, "invoice_reference": string|null, "contract_number": string|null },
  "authorized_signatory": { "name": string|null, "designation": string|null, "company": string|null } | null,
  "qr_code": string|null,
  "notes": string|null,
  "additional": object,
  "validation": { "warnings": string[] },
  "per_field_confidence": {
    "seller_gstin": number,
    "buyer_gstin": number,
    "invoice_number": number,
    "invoice_date": number,
    "line_items": number,
    "tax_amounts": number,
    "grand_total": number,
    "bank_details": number,
    "transport_details": number
  }
}

# Multi-invoice documents
- If the input contains more than one independent invoice/document, return { "documents": [ <object>, <object>, ... ] }.
- Never merge line items, totals, or parties across separate invoices.

Output JSON only.`;


export type ExtractCoreResult = {
  json: string;            // pretty-printed JSON string (for UI display)
  parsed: unknown;         // parsed JSON object (for DB storage)
};
function detectMimeType(b64: string): string {
  try {
    const head = atob(b64.slice(0, 16));

    const b0 = head.charCodeAt(0);
    const b1 = head.charCodeAt(1);

    if (b0 === 0x89 && b1 === 0x50) return "image/png";
    if (b0 === 0xff && b1 === 0xd8) return "image/jpeg";
    if (b0 === 0x52 && b1 === 0x49) return "image/webp";
    if (b0 === 0x25 && b1 === 0x50) return "application/pdf";
    if (b0 === 0x47 && b1 === 0x49) return "image/gif";
  } catch {
    // ignore
  }

  return "image/jpeg";
}

function normalizeImageUrl(input: string): string {
  if (input.startsWith("data:")) {
    return input;
  }

  const mime = detectMimeType(input);
  return `data:${mime};base64,${input}`;
}

type ExtractedObject = Record<string, unknown>;

const toObject = (value: unknown): ExtractedObject | null =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as ExtractedObject) : null;

const toNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const cleaned = value.replace(/[^0-9.-]/g, "");
    if (!cleaned) return null;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const positiveNumber = (value: unknown): number => {
  const parsed = toNumber(value);
  return parsed && parsed > 0 ? parsed : 0;
};

const setNumber = (target: ExtractedObject, key: string, value: number): void => {
  target[key] = Number(value.toFixed(2));
};

const firstStateCode = (party: ExtractedObject | null): string | null => {
  const direct = typeof party?.state_code === "string" ? party.state_code.replace(/\D/g, "") : "";
  if (direct.length >= 1) return direct.padStart(2, "0").slice(0, 2);

  const gstin = typeof party?.gstin === "string" ? party.gstin.trim().toUpperCase() : "";
  return /^\d{2}[A-Z0-9]{13}$/.test(gstin) ? gstin.slice(0, 2) : null;
};

const totalTaxType = (totals: ExtractedObject | null): "igst" | "cgst_sgst" | null => {
  const igst = positiveNumber(totals?.igst);
  const cgstSgst = positiveNumber(totals?.cgst) + positiveNumber(totals?.sgst);
  if (igst > 0 && cgstSgst === 0) return "igst";
  if (cgstSgst > 0 && igst === 0) return "cgst_sgst";
  return null;
};

const lineTaxType = (lineItems: unknown): "igst" | "cgst_sgst" | null => {
  if (!Array.isArray(lineItems)) return null;
  let igst = 0;
  let cgstSgst = 0;
  for (const item of lineItems) {
    const row = toObject(item);
    igst += positiveNumber(row?.igst);
    cgstSgst += positiveNumber(row?.cgst) + positiveNumber(row?.sgst);
  }
  if (igst > 0 && cgstSgst === 0) return "igst";
  if (cgstSgst > 0 && igst === 0) return "cgst_sgst";
  return null;
};

function normalizeGstTaxes(parsed: unknown): unknown {
  const root = toObject(parsed);
  if (!root) return parsed;

  const seller = toObject(root.seller);
  const buyer = toObject(root.buyer);
  const totals = toObject(root.totals);
  const validation = toObject(root.validation);
  const sellerStateCode = firstStateCode(seller);
  const buyerStateCode = firstStateCode(buyer);
  const stateTaxType = sellerStateCode && buyerStateCode ? (sellerStateCode === buyerStateCode ? "cgst_sgst" : "igst") : null;
  const observedTaxType = totalTaxType(totals) ?? lineTaxType(root.line_items);
  const chosenTaxType =
    observedTaxType === "igst" ? "igst" : stateTaxType === "igst" ? "igst" : stateTaxType ?? observedTaxType;

  if (chosenTaxType === "igst") {
    if (totals) {
      const cgstSgst = positiveNumber(totals.cgst) + positiveNumber(totals.sgst);
      if (positiveNumber(totals.igst) === 0 && cgstSgst > 0) setNumber(totals, "igst", cgstSgst);
      setNumber(totals, "cgst", 0);
      setNumber(totals, "sgst", 0);
    }

    if (Array.isArray(root.line_items)) {
      for (const item of root.line_items) {
        const row = toObject(item);
        if (!row) continue;
        const cgstSgst = positiveNumber(row.cgst) + positiveNumber(row.sgst);
        if (positiveNumber(row.igst) === 0 && cgstSgst > 0) setNumber(row, "igst", cgstSgst);
        const cgstRate = positiveNumber(row.cgst_rate);
        const sgstRate = positiveNumber(row.sgst_rate);
        if (positiveNumber(row.igst_rate) === 0 && cgstRate + sgstRate > 0) setNumber(row, "igst_rate", cgstRate + sgstRate);
        setNumber(row, "cgst", 0);
        setNumber(row, "sgst", 0);
        setNumber(row, "cgst_rate", 0);
        setNumber(row, "sgst_rate", 0);
      }
    }

    if (validation) {
      validation.igst_sum_ok = true;
      validation.cgst_sgst_sum_ok = true;
    }
  }

  if (chosenTaxType === "cgst_sgst") {
    if (totals) {
      const igst = positiveNumber(totals.igst);
      if (igst > 0 && positiveNumber(totals.cgst) === 0 && positiveNumber(totals.sgst) === 0) {
        setNumber(totals, "cgst", igst / 2);
        setNumber(totals, "sgst", igst / 2);
      }
      setNumber(totals, "igst", 0);
    }

    if (Array.isArray(root.line_items)) {
      for (const item of root.line_items) {
        const row = toObject(item);
        if (!row) continue;
        const igst = positiveNumber(row.igst);
        if (igst > 0 && positiveNumber(row.cgst) === 0 && positiveNumber(row.sgst) === 0) {
          setNumber(row, "cgst", igst / 2);
          setNumber(row, "sgst", igst / 2);
        }
        const igstRate = positiveNumber(row.igst_rate);
        if (igstRate > 0 && positiveNumber(row.cgst_rate) === 0 && positiveNumber(row.sgst_rate) === 0) {
          setNumber(row, "cgst_rate", igstRate / 2);
          setNumber(row, "sgst_rate", igstRate / 2);
        }
        setNumber(row, "igst", 0);
        setNumber(row, "igst_rate", 0);
      }
    }

    if (validation) {
      validation.igst_sum_ok = true;
      validation.cgst_sgst_sum_ok = true;
    }
  }

  const updatedTotals = toObject(root.totals);
  const grandTotal = toNumber(updatedTotals?.grand_total);
  const baseCandidates = [toNumber(updatedTotals?.taxable_amount), toNumber(updatedTotals?.subtotal)].filter(
    (value): value is number => value !== null,
  );

  if (updatedTotals && validation && grandTotal !== null && baseCandidates.length > 0) {
    const taxAndCharges =
      positiveNumber(updatedTotals.cgst) +
      positiveNumber(updatedTotals.sgst) +
      positiveNumber(updatedTotals.igst) +
      positiveNumber(updatedTotals.cess) +
      positiveNumber(updatedTotals.tcs) +
      positiveNumber(updatedTotals.freight_charges) +
      positiveNumber(updatedTotals.other_charges) +
      (toNumber(updatedTotals.round_off) ?? 0) -
      positiveNumber(updatedTotals.tds);
    const tolerance = Math.max(1, Math.abs(grandTotal) * 0.002);
    const reconciles = baseCandidates.some((base) => Math.abs(base + taxAndCharges - grandTotal) <= tolerance);

    validation.tax_math_ok = reconciles;
    validation.grand_total_ok = reconciles;
    if (!reconciles) {
      const confidence = toNumber(root.overall_confidence);
      root.overall_confidence = confidence === null ? 0.79 : Math.min(confidence, 0.79);
      const warnings = Array.isArray(validation.warnings) ? validation.warnings : [];
      if (!warnings.includes("Tax structure does not reconcile with invoice total.")) {
        warnings.push("Tax structure does not reconcile with invoice total.");
      }
      validation.warnings = warnings;
    }
  }

  return root;
}

const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

export function validateGSTIN(gstin: string | null | undefined): boolean {
  if (!gstin) return false;
  return GSTIN_REGEX.test(gstin.trim().toUpperCase());
}

export function getGSTINStateCode(gstin: string | null | undefined): string | null {
  if (!gstin || !validateGSTIN(gstin)) return null;
  return gstin.trim().substring(0, 2);
}

export const GST_STATE_CODES: Record<string, string> = {
  "01": "Jammu & Kashmir", "02": "Himachal Pradesh", "03": "Punjab", "04": "Chandigarh",
  "05": "Uttarakhand", "06": "Haryana", "07": "Delhi", "08": "Rajasthan",
  "09": "Uttar Pradesh", "10": "Bihar", "11": "Sikkim", "12": "Arunachal Pradesh",
  "13": "Nagaland", "14": "Manipur", "15": "Mizoram", "16": "Tripura",
  "17": "Meghalaya", "18": "Assam", "19": "West Bengal", "20": "Jharkhand",
  "21": "Odisha", "22": "Chhattisgarh", "23": "Madhya Pradesh", "24": "Gujarat",
  "26": "Dadra & Nagar Haveli and Daman & Diu", "27": "Maharashtra",
  "28": "Andhra Pradesh", "29": "Karnataka", "30": "Goa", "31": "Lakshadweep",
  "32": "Kerala", "33": "Tamil Nadu", "34": "Puducherry",
  "35": "Andaman & Nicobar Islands", "36": "Telangana", "37": "Andhra Pradesh (New)",
  "38": "Ladakh", "97": "Other Territory", "99": "Centre Jurisdiction",
};

function applyGstinValidation(parsed: unknown): unknown {
  const root = toObject(parsed);
  if (!root) return parsed;
  const seller = toObject(root.seller);
  const buyer = toObject(root.buyer);
  const sellerGstin = typeof seller?.gstin === "string" ? seller.gstin : null;
  const buyerGstin = typeof buyer?.gstin === "string" ? buyer.gstin : null;
  const sellerValid = validateGSTIN(sellerGstin);
  const buyerValid = buyerGstin ? validateGSTIN(buyerGstin) : true;

  root.gstin_seller_valid = sellerValid;
  root.gstin_buyer_valid = buyerValid;

  const validation = toObject(root.validation) ?? {};
  validation.gstin_seller_valid = sellerValid;
  validation.gstin_buyer_valid = buyerValid;
  const warnings: string[] = Array.isArray(validation.warnings) ? (validation.warnings as string[]) : [];
  const pushWarn = (w: string) => { if (!warnings.includes(w)) warnings.push(w); };

  if (sellerGstin && !sellerValid) pushWarn("GSTIN seller format invalid — verify manually");
  if (buyerGstin && !buyerValid) pushWarn("GSTIN buyer format invalid — verify manually");

  // Seller GSTIN state code vs seller address state mismatch
  const sellerCode = getGSTINStateCode(sellerGstin);
  const sellerAddrState = typeof seller?.state === "string" ? seller.state.trim() : "";
  if (sellerCode && sellerAddrState && GST_STATE_CODES[sellerCode]) {
    const expected = GST_STATE_CODES[sellerCode].toLowerCase();
    if (!sellerAddrState.toLowerCase().includes(expected.split(" ")[0])) {
      pushWarn(`Seller GSTIN state code ${sellerCode} does not match seller address state`);
    }
  }

  // per_field_confidence: clamp GSTIN confidences when invalid
  const pfc = toObject(root.per_field_confidence) ?? {};
  if (sellerGstin && !sellerValid) {
    const c = toNumber(pfc.seller_gstin);
    pfc.seller_gstin = c === null ? 0.6 : Math.min(c, 0.6);
  }
  if (buyerGstin && !buyerValid) {
    const c = toNumber(pfc.buyer_gstin);
    pfc.buyer_gstin = c === null ? 0.6 : Math.min(c, 0.6);
  }
  root.per_field_confidence = pfc;

  // Validation presence flags
  const totals = toObject(root.totals);
  const transport = toObject(root.transport_details) ?? toObject(root.transport);
  const bank = toObject(root.bank_details);
  const taxable = toNumber(totals?.taxable_amount) ?? 0;
  const ewayNo = transport ? (transport.eway_bill_number ?? transport.eway_bill_no) : null;
  validation.bank_details_present = !!bank;
  validation.transport_details_present = !!transport;
  validation.eway_bill_required = taxable > 50000 && !!transport;
  if (taxable > 50000 && !ewayNo) pushWarn("E-way bill missing — taxable amount exceeds ₹50,000");

  // Compute total_tax and compare against any printed footer value
  if (totals) {
    const computed =
      positiveNumber(totals.cgst) + positiveNumber(totals.sgst) +
      positiveNumber(totals.igst) + positiveNumber(totals.cess);
    const printed = toNumber(totals.total_tax);
    if (printed !== null && Math.abs(printed - computed) > 1) {
      pushWarn("total_tax mismatch — footer value differs from computed CGST+SGST+IGST");
    }
    totals.total_tax = Number(computed.toFixed(2));
  }

  // Line item amount verification
  let allItemsOk = true;
  if (Array.isArray(root.line_items)) {
    for (const item of root.line_items) {
      const row = toObject(item);
      if (!row) continue;
      const qty = toNumber(row.quantity);
      const rate = toNumber(row.rate);
      const discount = positiveNumber(row.discount);
      const amount = toNumber(row.taxable_amount) ?? toNumber(row.amount);
      if (qty !== null && rate !== null && amount !== null) {
        const expected = Math.round(qty * rate) - discount;
        if (Math.abs(expected - amount) > 1) {
          allItemsOk = false;
          const sr = row.sr_no ?? "?";
          pushWarn(`Line item amount inconsistency on item #${sr} — extracted qty×rate ≠ amount`);
        }
      }
    }
  }
  validation.line_items_amount_verified = allItemsOk;

  // Detect fabricated per-line tax amounts (model inventing values when only
  // a rate was printed per line). Two heuristics:
  //   (a) any single line item's tax equals the entire invoice total_tax
  //   (b) all line items have identical non-null tax amount AND identical rate
  //       AND their sum does not reconcile to totals.total_tax within tolerance
  // Also add a reconciliation warning when sum(line taxes) ≠ totals.total_tax
  // and no line item was left null (meaning the model claimed all were printed).
  if (Array.isArray(root.line_items) && root.line_items.length > 0 && totals) {
    const rows = root.line_items.map((it) => toObject(it)).filter((r): r is ExtractedObject => !!r);
    const perLineTax = (r: ExtractedObject) =>
      positiveNumber(r.cgst) + positiveNumber(r.sgst) + positiveNumber(r.igst);
    const hasAnyLineTax = (r: ExtractedObject) =>
      toNumber(r.cgst) !== null || toNumber(r.sgst) !== null || toNumber(r.igst) !== null;
    const totalTaxPrinted = toNumber(totals.total_tax);
    const totalTaxComputedFromTotals =
      positiveNumber(totals.cgst) + positiveNumber(totals.sgst) + positiveNumber(totals.igst);
    const invoiceTotalTax = totalTaxPrinted ?? (totalTaxComputedFromTotals > 0 ? totalTaxComputedFromTotals : null);

    const rowsWithTax = rows.filter(hasAnyLineTax);
    if (rowsWithTax.length > 0 && invoiceTotalTax !== null && invoiceTotalTax > 0) {
      // (a) single row equals entire invoice tax
      const suspicious = rowsWithTax.some((r) => Math.abs(perLineTax(r) - invoiceTotalTax) < 0.5);
      if (suspicious && rows.length > 1) {
        pushWarn("Line-item tax amounts appear estimated, not printed — verify against source document");
      }

      // (b) uniform rate + uniform amount across rows but sum ≠ total
      const rates = rowsWithTax.map((r) =>
        toNumber(r.tax_rate) ?? toNumber(r.igst_rate) ?? (positiveNumber(r.cgst_rate) + positiveNumber(r.sgst_rate)),
      );
      const amounts = rowsWithTax.map((r) => Number(perLineTax(r).toFixed(2)));
      const uniformRate = rates.length > 1 && rates.every((v) => v !== null && v === rates[0]);
      const uniformAmount = amounts.length > 1 && amounts.every((v) => v === amounts[0]);
      const sumLineTax = amounts.reduce((a, b) => a + b, 0);
      const tolerance = Math.max(1, Math.abs(invoiceTotalTax) * 0.01);
      if (uniformRate && uniformAmount && Math.abs(sumLineTax - invoiceTotalTax) > tolerance) {
        pushWarn("Line-item tax amounts appear estimated, not printed — verify against source document");
      }

      // Reconciliation: every row claims a printed tax, but they don't sum to total
      const allRowsHaveTax = rows.every(hasAnyLineTax);
      if (allRowsHaveTax && Math.abs(sumLineTax - invoiceTotalTax) > tolerance) {
        pushWarn("Line-item tax amounts do not sum to invoice total tax");
      }
    }
  }


  validation.warnings = warnings;
  root.validation = validation;

  // Backward-compat: compute overall_confidence from per_field_confidence average
  // so the /api/v1/extract route continues to populate the column.
  const pfcValues = Object.values(pfc).map((v) => toNumber(v)).filter((v): v is number => v !== null);
  if (pfcValues.length > 0) {
    root.overall_confidence = Number((pfcValues.reduce((a, b) => a + b, 0) / pfcValues.length).toFixed(2));
  }

  return root;
}

function normalizeResponse(parsed: unknown): unknown {
  const root = toObject(parsed);
  if (root && Array.isArray(root.documents)) {
    root.documents = root.documents.map((doc) => applyGstinValidation(normalizeGstTaxes(doc)));
    return root;
  }
  return applyGstinValidation(normalizeGstTaxes(parsed));
}

function isPdfDataUri(url: string): boolean {
  return url.startsWith("data:application/pdf");
}

// ────────────────────────────────────────────────────────────────────────────
// Provider calls
// ────────────────────────────────────────────────────────────────────────────

function reqId(): string {
  return Math.random().toString(36).slice(2, 10);
}

async function callGroqVision(images: string[], hint?: string): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY is not configured");

  const content: Array<Record<string, unknown>> = [
    {
      type: "text",
      text: `Extract structured data from this document.${hint ? " Hint: " + hint : ""} Return JSON only.`,
    },
    ...images.map((url) => ({
      type: "image_url",
      image_url: { url: normalizeImageUrl(url) },
    })),
  ];

  const body = JSON.stringify({
    model: "meta-llama/llama-4-scout-17b-16e-instruct",
    temperature: 0,
    top_p: 1,
    seed: 7,
    max_tokens: 8192,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content },
    ],
  });

  const rid = reqId();
  let lastErr = "";
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body,
    });

    if (res.ok) {
      const json = (await res.json()) as { choices: Array<{ message: { content: string } }> };
      return json.choices?.[0]?.message?.content ?? "{}";
    }

    const text = await res.text();
    lastErr = `Groq API error ${res.status}: ${text.slice(0, 500)}`;
    if (res.status !== 429 && res.status < 500) {
      console.error("[groq]", { rid, attempt, status: res.status, error: lastErr });
      break;
    }

    let waitMs = 0;
    const retryAfter = res.headers.get("retry-after");
    if (retryAfter) waitMs = Math.ceil(parseFloat(retryAfter) * 1000);
    const m = text.match(/try again in ([\d.]+)s/i);
    if (m) waitMs = Math.max(waitMs, Math.ceil(parseFloat(m[1]) * 1000));
    if (!waitMs) waitMs = 2000 * (attempt + 1);
    waitMs = Math.min(waitMs + 500, 30000);
    console.warn("[groq] retry", { rid, attempt, status: res.status, wait_ms: waitMs });
    await new Promise((r) => setTimeout(r, waitMs));
  }
  throw new Error(lastErr || "Groq API failed");
}

// ============================================================================
// Vertex AI (Google Cloud) Gemini call
// ============================================================================
// Uses a service account JWT (signed with Web Crypto — works in Cloudflare
// Workers) to obtain a short-lived OAuth access token, then calls the Vertex
// AI generateContent endpoint. Tokens are cached in-memory for ~50 minutes.
// Required secrets: GCP_PROJECT_ID, GCP_LOCATION, GCP_SERVICE_ACCOUNT_JSON.

interface ServiceAccountKey {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

let cachedVertexToken: { token: string; expiresAt: number } | null = null;

function b64urlEncode(input: ArrayBuffer | Uint8Array | string): string {
  let bytes: Uint8Array;
  if (typeof input === "string") bytes = new TextEncoder().encode(input);
  else if (input instanceof Uint8Array) bytes = input;
  else bytes = new Uint8Array(input);
  let str = "";
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const cleaned = pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  const binary = atob(cleaned);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function getVertexAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedVertexToken && cachedVertexToken.expiresAt - 60 > now) {
    return cachedVertexToken.token;
  }

  const rawJson = process.env.GCP_SERVICE_ACCOUNT_JSON;
  if (!rawJson) throw new Error("GCP_SERVICE_ACCOUNT_JSON is not configured");

  // Accept either raw JSON or base64-encoded JSON. Also strip UTF-8 BOM and
  // smart quotes that sneak in when the value is copied from a rich-text editor.
  const tryParse = (s: string): ServiceAccountKey | null => {
    try {
      return JSON.parse(s) as ServiceAccountKey;
    } catch {
      return null;
    }
  };

  let cleaned = rawJson.trim().replace(/^\uFEFF/, "");
  // Convert typographic quotes back to plain quotes (only if JSON parse fails on raw).
  const withStraightQuotes = cleaned
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'");

  let sa: ServiceAccountKey | null =
    tryParse(cleaned) ?? tryParse(withStraightQuotes);

  // Fallback: value may be base64-encoded JSON.
  if (!sa && /^[A-Za-z0-9+/=\s]+$/.test(cleaned) && cleaned.length > 100) {
    try {
      const decoded = atob(cleaned.replace(/\s+/g, ""));
      sa = tryParse(decoded);
    } catch {
      // ignore
    }
  }

  if (!sa) {
    const preview = cleaned.slice(0, 40).replace(/[\r\n]+/g, "\\n");
    const looksLikeBase64 = /^[A-Za-z0-9+/=]+$/.test(cleaned.slice(0, 40));
    throw new Error(
      `GCP_SERVICE_ACCOUNT_JSON is not valid JSON (starts with: "${preview}"..., ` +
      `base64-shape: ${looksLikeBase64}). Paste the full service-account file contents ` +
      `starting with { and ending with }, or a base64 encoding of it.`,
    );
  }
  if (!sa.client_email || !sa.private_key) {
    throw new Error("GCP_SERVICE_ACCOUNT_JSON missing client_email or private_key");
  }

  const tokenUri = sa.token_uri || "https://oauth2.googleapis.com/token";
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/cloud-platform",
    aud: tokenUri,
    exp: now + 3600,
    iat: now,
  };

  const signingInput = `${b64urlEncode(JSON.stringify(header))}.${b64urlEncode(JSON.stringify(payload))}`;
  const keyBuffer = pemToArrayBuffer(sa.private_key);
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    keyBuffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(signingInput),
  );
  const jwt = `${signingInput}.${b64urlEncode(signature)}`;

  const tokenRes = await fetch(tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=${encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer")}&assertion=${encodeURIComponent(jwt)}`,
  });
  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    throw new Error(`Vertex AI token exchange failed ${tokenRes.status}: ${errText.slice(0, 500)}`);
  }
  const tokenJson = (await tokenRes.json()) as { access_token?: string; expires_in?: number };
  if (!tokenJson.access_token) throw new Error("Vertex AI token exchange returned no access_token");

  cachedVertexToken = {
    token: tokenJson.access_token,
    expiresAt: now + (tokenJson.expires_in ?? 3600),
  };
  return cachedVertexToken.token;
}

// Vertex AI Gemini call. Supports both PDFs and images via inlineData parts.
async function callGeminiDirect(images: string[], hint?: string): Promise<string> {
  const projectId = process.env.GCP_PROJECT_ID;
  const location = process.env.GCP_LOCATION || "us-central1";
  if (!projectId) throw new Error("GCP_PROJECT_ID is not configured");

  const parts: Array<Record<string, unknown>> = [
    {
      text: `Extract structured data from this document.${hint ? " Hint: " + hint : ""} If multiple invoices/documents are present, return { "documents": [...] }. Return JSON only.`,
    },
  ];

  for (const url of images) {
    const dataUri = url.startsWith("data:") ? url : normalizeImageUrl(url);
    const match = dataUri.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) continue;
    const mimeType = match[1];
    const data = match[2];
    parts.push({ inlineData: { mimeType, data } });
  }

  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ role: "user", parts }],
    generationConfig: {
      temperature: 0,
      topP: 1,
      responseMimeType: "application/json",
    },
  });

  const host = location === "global"
    ? "aiplatform.googleapis.com"
    : `${location}-aiplatform.googleapis.com`;
  const endpoint = `https://${host}/v1/projects/${encodeURIComponent(projectId)}/locations/${encodeURIComponent(location)}/publishers/google/models/gemini-2.5-flash:generateContent`;
  const rid = reqId();
  let lastErr = "";

  // Reject oversized payloads up front. Cloudflare Workers can fail the
  // outbound fetch with a bare "fetch failed" when the request body is very
  // large, and a clear error is far more useful than a silent retry loop.
  const PAYLOAD_LIMIT_BYTES = 18 * 1024 * 1024; // ~18MB serialized JSON
  console.log("[vertex] request", { rid, payload_bytes: body.length, endpoint_host: host });
  if (body.length > PAYLOAD_LIMIT_BYTES) {
    throw new Error(
      `Document too large for Vertex AI (${(body.length / 1024 / 1024).toFixed(1)}MB payload, limit ~18MB). ` +
      `Please upload a smaller PDF or compress it first.`,
    );
  }

  // Total retry budget capped at ~45s so a saturated DSQ doesn't leave the
  // user staring at a spinner for minutes — they get a real error instead.
  const MAX_ATTEMPTS = 4;
  const MAX_TOTAL_WAIT_MS = 45_000;
  const MAX_SINGLE_WAIT_MS = 12_000;
  const startedAt = Date.now();
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    let accessToken: string;
    try {
      accessToken = await getVertexAccessToken();
    } catch (e) {
      throw new Error(`Vertex AI auth failed: ${e instanceof Error ? e.message : String(e)}`);
    }

    let res: Response;
    try {
      res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body,
        // Abort before Cloudflare's 524 gateway timeout (~100s) so we
        // surface a real error and can retry within budget.
        signal: AbortSignal.timeout(25_000),
      });
    } catch (e) {
      // Network-level failure (DNS, TLS, ECONNRESET, request-body too large
      // for the runtime). Retry with backoff if we still have budget;
      // otherwise surface the underlying reason instead of a bare "fetch failed".
      const msg = e instanceof Error ? e.message : String(e);
      lastErr = `Vertex AI network error: ${msg} (payload_bytes≈${body.length})`;
      console.error("[vertex] fetch threw", { rid, attempt, error: msg, payload_bytes: body.length });
      const elapsed = Date.now() - startedAt;
      if (elapsed > MAX_TOTAL_WAIT_MS || attempt === MAX_ATTEMPTS - 1) break;
      await new Promise((r) => setTimeout(r, 1500 + Math.floor(Math.random() * 500)));
      continue;
    }

    if (res.ok) {
      const json = (await res.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const text = json.candidates?.[0]?.content?.parts
        ?.map((p) => p.text ?? "")
        .join("") ?? "";
      return text || "{}";
    }

    const text = await res.text();
    lastErr = `Vertex AI error ${res.status}: ${text.slice(0, 500)}`;

    // Auth issue — bust the token cache and retry once immediately.
    if (res.status === 401 || res.status === 403) {
      cachedVertexToken = null;
      console.error("[vertex]", { rid, attempt, status: res.status, error: lastErr });
      if (attempt === 0) continue;
      break;
    }

    if (res.status !== 429 && res.status < 500) {
      console.error("[vertex]", { rid, attempt, status: res.status, error: lastErr });
      break;
    }

    // Exponential backoff + jitter, honoring Retry-After / "try again in Ns"
    // hints, but bounded so total wall time stays under ~45s.
    let waitMs = 0;
    const retryAfter = res.headers.get("retry-after");
    if (retryAfter) waitMs = Math.ceil(parseFloat(retryAfter) * 1000);
    const m = text.match(/try again in ([\d.]+)s/i);
    if (m) waitMs = Math.max(waitMs, Math.ceil(parseFloat(m[1]) * 1000));
    if (!waitMs) waitMs = 2000 * Math.pow(2, attempt); // 2s, 4s, 8s, 16s
    const jitter = Math.floor(Math.random() * 500);
    waitMs = Math.min(waitMs + jitter, MAX_SINGLE_WAIT_MS);

    const elapsed = Date.now() - startedAt;
    if (elapsed + waitMs > MAX_TOTAL_WAIT_MS) {
      console.error("[vertex] retry budget exhausted", {
        rid, attempt, status: res.status, elapsed_ms: elapsed, error: lastErr,
      });
      break;
    }
    console.warn("[vertex] retry", { rid, attempt, status: res.status, wait_ms: waitMs, elapsed_ms: elapsed });
    await new Promise((r) => setTimeout(r, waitMs));
  }
  throw new Error(lastErr || "Vertex AI Gemini call failed");
}

// Fallback: call Gemini via Lovable AI Gateway (separate quota pool from
// direct Vertex AI). Used when Vertex 429s / auth fails / times out so PDF
// extraction still succeeds. Uses OpenAI-compatible chat completions.
async function callGeminiViaLovableGateway(images: string[], hint?: string): Promise<string> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY not configured (Lovable AI Gateway fallback unavailable)");

  const content: Array<Record<string, unknown>> = [
    {
      type: "text",
      text: `Extract structured data from this document.${hint ? " Hint: " + hint : ""} If multiple invoices/documents are present, return { "documents": [...] }. Return JSON only.`,
    },
  ];
  for (const url of images) {
    const dataUri = url.startsWith("data:") ? url : normalizeImageUrl(url);
    content.push({ type: "image_url", image_url: { url: dataUri } });
  }

  const rid = reqId();
  const body = JSON.stringify({
    model: "google/gemini-2.5-flash",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content },
    ],
    temperature: 0,
    response_format: { type: "json_object" },
  });
  console.log("[lovable-ai] request", { rid, payload_bytes: body.length });

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": apiKey,
    },
    body,
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Lovable AI Gateway error ${res.status}: ${text.slice(0, 500)}`);
  }
  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return json.choices?.[0]?.message?.content ?? "{}";
}

function parseJsonLoose(raw: string): unknown {
  try { return JSON.parse(raw); } catch { /* fallthrough */ }
  const m = raw.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch { /* ignore */ } }
  return {};
}

// Wrap seller/buyer GSTIN with { raw_value, normalized_value, is_valid }
function annotateGstinQuality(doc: ExtractedObject): void {
  for (const key of ["seller", "buyer"] as const) {
    const party = toObject(doc[key]);
    if (!party) continue;
    const raw = typeof party.gstin === "string" ? party.gstin : null;
    if (raw === null) continue;
    const normalized = raw.replace(/\s+/g, "").toUpperCase();
    party.gstin_quality = {
      raw_value: raw,
      normalized_value: normalized,
      is_valid: GSTIN_REGEX.test(normalized),
    };
  }
}

function reconcileInvoiceNumberDate(doc: ExtractedObject, warnings: string[]): void {
  const num = typeof doc.document_number === "string" ? doc.document_number.trim() : null;
  const date = typeof doc.document_date === "string" ? doc.document_date.trim() : null;
  const looksLikeDate = num ? /^\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}$/.test(num) : false;
  if (num && (num === date || looksLikeDate)) {
    doc.document_number = null;
    const pfc = toObject(doc.per_field_confidence) ?? {};
    const c = toNumber(pfc.invoice_number);
    pfc.invoice_number = c === null ? 0.4 : Math.min(c, 0.4);
    doc.per_field_confidence = pfc;
    if (!warnings.includes("Invoice number matched invoice date — cleared to null")) {
      warnings.push("Invoice number matched invoice date — cleared to null");
    }
  }
}

function postProcess(parsed: unknown): unknown {
  const root = toObject(parsed);
  if (!root) return parsed;
  const apply = (doc: ExtractedObject) => {
    const validation = toObject(doc.validation) ?? {};
    const warnings: string[] = Array.isArray(validation.warnings) ? (validation.warnings as string[]) : [];
    reconcileInvoiceNumberDate(doc, warnings);
    annotateGstinQuality(doc);
    validation.warnings = warnings;
    doc.validation = validation;
  };
  if (Array.isArray(root.documents)) {
    root.documents.forEach((doc) => {
      const d = toObject(doc); if (!d) return;
      apply(d);
    });
  } else {
    apply(root);
  }
  return root;
}

// Compute an overall confidence score for a parsed result.
function getOverallConfidence(parsed: unknown): number {
  const root = toObject(parsed);
  if (!root) return 0;
  if (Array.isArray(root.documents)) {
    const vals = root.documents
      .map((d) => toNumber(toObject(d)?.overall_confidence) ?? 0);
    return vals.length ? Math.min(...vals) : 0;
  }
  return toNumber(root.overall_confidence) ?? 0;
}

const CONFIDENCE_THRESHOLD = 0.95;
const TIE_MARGIN = 0.02;

const CRITICAL_FIELDS = [
  { key: "invoice_number", get: (d: ExtractedObject) => d.document_number, pfc: "invoice_number" },
  { key: "invoice_date", get: (d: ExtractedObject) => d.document_date, pfc: "invoice_date" },
  { key: "seller_gstin", get: (d: ExtractedObject) => toObject(d.seller)?.gstin, pfc: "seller_gstin" },
  { key: "buyer_gstin", get: (d: ExtractedObject) => toObject(d.buyer)?.gstin, pfc: "buyer_gstin" },
  { key: "grand_total", get: (d: ExtractedObject) => toObject(d.totals)?.grand_total, pfc: "grand_total" },
] as const;

function normStr(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") return v.trim().toUpperCase().replace(/\s+/g, "");
  if (typeof v === "number") return String(v);
  return null;
}

function fieldsAgree(key: string, a: unknown, b: unknown): boolean {
  if (a === null || a === undefined || b === null || b === undefined) return false;
  if (key === "grand_total") {
    const na = toNumber(a);
    const nb = toNumber(b);
    if (na === null || nb === null) return false;
    return Math.abs(na - nb) < 0.01;
  }
  const sa = normStr(a);
  const sb = normStr(b);
  return sa !== null && sb !== null && sa === sb;
}

// Cross-check critical fields between winning and losing cascade results.
// Reuses in-memory results — makes NO additional API calls.
function crossCheckCritical(
  winner: unknown,
  loser: unknown,
  winnerProvider: "groq" | "gemini",
  loserProvider: "groq" | "gemini",
  rid: string,
): void {
  const w = toObject(winner);
  const l = toObject(loser);
  if (!w || !l) return;
  // Skip multi-document envelopes — ambiguous which doc pairs to which.
  if (Array.isArray(w.documents) || Array.isArray(l.documents)) return;

  const pfc = toObject(w.per_field_confidence) ?? {};
  const validation = toObject(w.validation) ?? {};
  const warnings: string[] = Array.isArray(validation.warnings) ? (validation.warnings as string[]) : [];

  for (const f of CRITICAL_FIELDS) {
    const wv = f.get(w);
    const lv = f.get(l);
    if ((wv === null || wv === undefined) && (lv === null || lv === undefined)) continue;
    const current = toNumber(pfc[f.pfc]);
    if (fieldsAgree(f.key, wv, lv)) {
      const boosted = current === null ? 0.99 : Math.min(0.99, current + 0.05);
      pfc[f.pfc] = Number(boosted.toFixed(2));
    } else {
      const capped = current === null ? 0.7 : Math.min(current, 0.7);
      pfc[f.pfc] = Number(capped.toFixed(2));
      const msg = `Critical field "${f.key}" disagreed between Groq and Gemini — confidence lowered`;
      if (!warnings.includes(msg)) warnings.push(msg);
      console.warn("[cross-check] disagreement", {
        rid,
        field: f.key,
        kept_provider: winnerProvider,
        kept_value: wv ?? null,
        other_provider: loserProvider,
        other_value: lv ?? null,
      });
    }
  }

  w.per_field_confidence = pfc;
  validation.warnings = warnings;
  w.validation = validation;

  // Recompute overall_confidence from the updated per_field_confidence.
  const vals = Object.values(pfc).map((v) => toNumber(v)).filter((v): v is number => v !== null);
  if (vals.length > 0) {
    w.overall_confidence = Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2));
  }
}

export type ExtractCoreOutput = ExtractCoreResult & {
  provider_used: "groq" | "gemini";
  overall_confidence: number;
  meets_confidence_threshold: boolean;
};


// Bounded-concurrency map: run `worker` over `items` with up to `limit` in-flight.
// Preserves input order and never fails-fast — each slot picks the next index.
async function pMap<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  const width = Math.max(1, Math.min(limit, items.length));
  let cursor = 0;
  const runners = Array.from({ length: width }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
    }
  });
  await Promise.all(runners);
  return results;
}

async function runGroqOnImages(images: string[], hint?: string): Promise<unknown> {
  if (images.length > 1) {
    // Process each image independently to prevent cross-page contamination,
    // but fan out in parallel with bounded concurrency (default 5, tunable
    // via EXTRACT_CONCURRENCY) so multi-page docs don't pay the full
    // per-page latency in series.
    const rid = reqId();
    const limit = Math.max(1, parseInt(process.env.EXTRACT_CONCURRENCY ?? "5", 10) || 5);
    const t0 = Date.now();
    console.log("[groq] parallel start", { rid, pages: images.length, concurrency: limit });
    const perImage = await pMap(images, limit, async (img, i) => {
      const started = Date.now();
      try {
        const raw = await callGroqVision([img], hint);
        const out = normalizeResponse(parseJsonLoose(raw));
        console.log("[groq] page done", { rid, page: i + 1, ms: Date.now() - started });
        return out;
      } catch (err) {
        console.error("[groq] page failed", { rid, page: i + 1, ms: Date.now() - started, error: err instanceof Error ? err.message : String(err) });
        throw err;
      }
    });
    console.log("[groq] parallel done", { rid, pages: images.length, total_ms: Date.now() - t0 });
    const docs: unknown[] = [];
    for (const r of perImage) {
      const o = toObject(r);
      if (o && Array.isArray(o.documents)) docs.push(...o.documents);
      else if (o) docs.push(o);
    }
    return docs.length === 1 ? docs[0] : { documents: docs };
  }
  return normalizeResponse(parseJsonLoose(await callGroqVision(images, hint)));
}

export async function extractCore(images: string[], hint?: string): Promise<ExtractCoreOutput> {
  const hasPdf = images.some((url) => {
    if (url.startsWith("data:")) return isPdfDataUri(url);
    return detectMimeType(url) === "application/pdf";
  });

  const rid = reqId();
  let parsed: unknown;
  let provider_used: "groq" | "gemini";
  let overall_confidence = 0;

  if (hasPdf) {
    // PDFs: use Lovable AI Gateway first. Direct Vertex has been producing
    // model-capacity 429s / gateway timeouts even for small multi-page PDFs;
    // billing credit does not bypass those model-serving limits. Keep Vertex
    // as a fallback, or force it first with VERTEX_PDF_FIRST=true.
    const vertexFirst = process.env.VERTEX_PDF_FIRST === "true";
    if (!vertexFirst) {
      try {
        parsed = normalizeResponse(parseJsonLoose(await callGeminiViaLovableGateway(images, hint)));
        provider_used = "gemini";
        overall_confidence = getOverallConfidence(parsed);
        console.log("[extract]", { rid, provider_used, primary: "lovable-ai", hasPdf, overall_confidence });
      } catch (gwErr) {
        const gwMsg = gwErr instanceof Error ? gwErr.message : String(gwErr);
        console.warn("[extract] Lovable AI Gateway failed for PDF; trying Vertex", { rid, error: gwMsg });
        try {
          parsed = normalizeResponse(parseJsonLoose(await callGeminiDirect(images, hint)));
          provider_used = "gemini";
          overall_confidence = getOverallConfidence(parsed);
          console.log("[extract]", { rid, provider_used, fallback: true, via: "vertex", hasPdf, overall_confidence });
        } catch (vertexErr) {
          const vertexMsg = vertexErr instanceof Error ? vertexErr.message : String(vertexErr);
          console.error("[extract] Both Lovable AI Gateway and Vertex failed for PDF", { rid, gateway: gwMsg, vertex: vertexMsg });
          throw new Error(`PDF extraction failed. Gateway: ${gwMsg}. Vertex fallback: ${vertexMsg}`);
        }
      }
    } else {
      try {
        parsed = normalizeResponse(parseJsonLoose(await callGeminiDirect(images, hint)));
        provider_used = "gemini";
        overall_confidence = getOverallConfidence(parsed);
        console.log("[extract]", { rid, provider_used, primary: "vertex", hasPdf, overall_confidence });
      } catch (vertexErr) {
        const vertexMsg = vertexErr instanceof Error ? vertexErr.message : String(vertexErr);
        console.warn("[extract] Vertex failed for PDF; trying Lovable AI Gateway", { rid, error: vertexMsg });
        try {
          parsed = normalizeResponse(parseJsonLoose(await callGeminiViaLovableGateway(images, hint)));
          provider_used = "gemini";
          overall_confidence = getOverallConfidence(parsed);
          console.log("[extract]", { rid, provider_used, fallback: true, via: "lovable-ai", hasPdf, overall_confidence });
        } catch (gwErr) {
          const gwMsg = gwErr instanceof Error ? gwErr.message : String(gwErr);
          console.error("[extract] Both Vertex and Lovable AI Gateway failed for PDF", { rid, vertex: vertexMsg, gateway: gwMsg });
          throw new Error(`PDF extraction failed. Vertex: ${vertexMsg}. Gateway fallback: ${gwMsg}`);
        }
      }
    }
  } else {
    // Images: Groq first. Cascade to Gemini only when confidence is low
    // or Groq hard-fails.
    let groqParsed: unknown | null = null;
    let groqConfidence = 0;
    let groqErr: unknown = null;

    try {
      groqParsed = await runGroqOnImages(images, hint);
      groqConfidence = getOverallConfidence(groqParsed);
    } catch (err) {
      groqErr = err;
      console.error("[extract] Groq hard failure — falling back to Gemini", {
        rid,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    if (groqErr) {
      // Hard-failure fallback to Gemini.
      try {
        parsed = normalizeResponse(parseJsonLoose(await callGeminiDirect(images, hint)));
        provider_used = "gemini";
        overall_confidence = getOverallConfidence(parsed);
        console.log("[extract]", {
          rid,
          provider_used,
          fallback: true,
          reason: "groq_hard_failure",
          overall_confidence,
        });
      } catch (gErr) {
        throw new Error(
          "Both providers failed. Groq: " +
            (groqErr instanceof Error ? groqErr.message : String(groqErr)) +
            " | Gemini: " +
            (gErr instanceof Error ? gErr.message : String(gErr)),
        );
      }
    } else if (groqConfidence >= CONFIDENCE_THRESHOLD) {
      parsed = groqParsed;
      provider_used = "groq";
      overall_confidence = groqConfidence;
      console.log("[extract]", { rid, provider_used, fallback: false, overall_confidence });
    } else {
      // Cascade: try Gemini and keep the higher-confidence result.
      // Prefer Groq on near-ties (within TIE_MARGIN) to save cost.
      console.log("[extract] cascade to Gemini due to low Groq confidence", {
        rid,
        groq_confidence: groqConfidence,
        threshold: CONFIDENCE_THRESHOLD,
      });
      try {
        const gemParsed = normalizeResponse(parseJsonLoose(await callGeminiDirect(images, hint)));
        const gemConfidence = getOverallConfidence(gemParsed);
        let loserParsed: unknown;
        let loserProvider: "groq" | "gemini";
        if (gemConfidence > groqConfidence + TIE_MARGIN) {
          parsed = gemParsed;
          provider_used = "gemini";
          overall_confidence = gemConfidence;
          loserParsed = groqParsed;
          loserProvider = "groq";
        } else {
          parsed = groqParsed;
          provider_used = "groq";
          overall_confidence = groqConfidence;
          loserParsed = gemParsed;
          loserProvider = "gemini";
        }
        // Free cross-check: reuse the losing provider's already-fetched
        // result to validate critical fields on the winner.
        crossCheckCritical(parsed, loserParsed, provider_used, loserProvider, rid);
        overall_confidence = getOverallConfidence(parsed);
        console.log("[extract] cascade result", {
          rid,
          provider_used,
          fallback: provider_used === "gemini",
          reason: "low_groq_confidence",
          groq_confidence: groqConfidence,
          gemini_confidence: gemConfidence,
          overall_confidence_after_crosscheck: overall_confidence,
        });

      } catch (gErr) {
        // Cascade Gemini call failed — keep the Groq result.
        console.error("[extract] Gemini cascade failed; keeping Groq result", {
          rid,
          error: gErr instanceof Error ? gErr.message : String(gErr),
        });
        parsed = groqParsed;
        provider_used = "groq";
        overall_confidence = groqConfidence;
      }
    }
  }

  parsed = postProcess(parsed);

  // Ensure overall_confidence on the top-level object mirrors the computed value
  // so downstream reads (DB column, response) stay consistent with the decision.
  const rootObj = toObject(parsed);
  if (rootObj && !Array.isArray(rootObj.documents)) {
    rootObj.overall_confidence = Number(overall_confidence.toFixed(2));
  }

  const meets_confidence_threshold = overall_confidence >= CONFIDENCE_THRESHOLD;
  const pretty = JSON.stringify(parsed, null, 2);
  return { json: pretty, parsed, provider_used, overall_confidence, meets_confidence_threshold };
}

