// Vertex AI responseSchema for Gemini generateContent (OpenAPI 3.0 subset).
// Mirrors the output contract in SYSTEM_PROMPT (extract-core.server.ts).

const nullableString = { type: "STRING", nullable: true } as const;
const nullableNumber = { type: "NUMBER", nullable: true } as const;
const nullableBoolean = { type: "BOOLEAN", nullable: true } as const;

const partySchema = {
  type: "OBJECT",
  properties: {
    name: nullableString,
    gstin: nullableString,
    pan: nullableString,
    address: nullableString,
    city: nullableString,
    state: nullableString,
    state_code: nullableString,
    pincode: nullableString,
    email: nullableString,
    phone: nullableString,
    website: nullableString,
  },
} as const;

const buyerSchema = {
  type: "OBJECT",
  properties: {
    name: nullableString,
    gstin: nullableString,
    pan: nullableString,
    address: nullableString,
    city: nullableString,
    state: nullableString,
    state_code: nullableString,
    pincode: nullableString,
    email: nullableString,
    phone: nullableString,
  },
} as const;

const lineItemSchema = {
  type: "OBJECT",
  properties: {
    sr_no: nullableNumber,
    description: { type: "STRING" },
    hsn_sac: nullableString,
    quantity: nullableNumber,
    unit: nullableString,
    rate: nullableNumber,
    discount: nullableNumber,
    taxable_amount: nullableNumber,
    tax_rate: nullableNumber,
    cgst_rate: nullableNumber,
    cgst: nullableNumber,
    sgst_rate: nullableNumber,
    sgst: nullableNumber,
    igst_rate: nullableNumber,
    igst: nullableNumber,
    cess_rate: nullableNumber,
    cess: nullableNumber,
    amount: nullableNumber,
  },
  required: ["description"],
} as const;

const totalsSchema = {
  type: "OBJECT",
  properties: {
    subtotal: nullableNumber,
    total_discount: nullableNumber,
    taxable_amount: nullableNumber,
    cgst: nullableNumber,
    sgst: nullableNumber,
    igst: nullableNumber,
    cess: nullableNumber,
    total_tax: nullableNumber,
    tcs: nullableNumber,
    tds: nullableNumber,
    freight_charges: nullableNumber,
    other_charges: nullableNumber,
    round_off: nullableNumber,
    grand_total: nullableNumber,
    amount_in_words: nullableString,
    currency: nullableString,
  },
} as const;

const perFieldConfidenceSchema = {
  type: "OBJECT",
  properties: {
    seller_gstin: { type: "NUMBER" },
    buyer_gstin: { type: "NUMBER" },
    invoice_number: { type: "NUMBER" },
    invoice_date: { type: "NUMBER" },
    line_items: { type: "NUMBER" },
    tax_amounts: { type: "NUMBER" },
    grand_total: { type: "NUMBER" },
    bank_details: { type: "NUMBER" },
    transport_details: { type: "NUMBER" },
  },
} as const;

const documentSchema = {
  type: "OBJECT",
  properties: {
    document_type: { type: "STRING" },
    document_number: nullableString,
    document_date: nullableString,
    due_date: nullableString,
    irn: nullableString,
    acknowledgement_no: nullableString,
    acknowledgement_date: nullableString,
    reverse_charge: nullableBoolean,
    supply_type: nullableString,
    place_of_supply: nullableString,
    currency: nullableString,
    seller: partySchema,
    buyer: buyerSchema,
    shipping: {
      type: "OBJECT",
      nullable: true,
      properties: {
        name: nullableString,
        address: nullableString,
        city: nullableString,
        state: nullableString,
        state_code: nullableString,
        pincode: nullableString,
        gstin: nullableString,
      },
    },
    line_items: {
      type: "ARRAY",
      items: lineItemSchema,
    },
    totals: totalsSchema,
    payment_terms: {
      type: "OBJECT",
      nullable: true,
      properties: {
        payment_mode: nullableString,
        due_date: nullableString,
        due_days: nullableNumber,
        interest_rate_percent: nullableNumber,
        advance_received: nullableNumber,
      },
    },
    bank_details: {
      type: "OBJECT",
      nullable: true,
      properties: {
        bank_name: nullableString,
        account_number: nullableString,
        ifsc_code: nullableString,
        account_holder_name: nullableString,
        branch: nullableString,
      },
    },
    transport_details: {
      type: "OBJECT",
      nullable: true,
      properties: {
        transporter_name: nullableString,
        transporter_gstin: nullableString,
        vehicle_number: nullableString,
        lr_number: nullableString,
        lr_date: nullableString,
        eway_bill_number: nullableString,
        eway_bill_date: nullableString,
        dispatch_from: nullableString,
        ship_to: nullableString,
        place_of_supply: nullableString,
        place_of_supply_code: nullableString,
      },
    },
    broker_agent_details: {
      type: "OBJECT",
      nullable: true,
      properties: {
        broker_name: nullableString,
        broker_address: nullableString,
        agent_name: nullableString,
        agency_code: nullableString,
      },
    },
    document_references: {
      type: "OBJECT",
      properties: {
        challan_number: nullableString,
        order_number: nullableString,
        po_number: nullableString,
        case_pack_info: nullableString,
        reverse_charge_applicable: { type: "BOOLEAN" },
      },
    },
    references: {
      type: "OBJECT",
      properties: {
        po_number: nullableString,
        po_date: nullableString,
        challan_number: nullableString,
        challan_date: nullableString,
        invoice_reference: nullableString,
        contract_number: nullableString,
      },
    },
    authorized_signatory: {
      type: "OBJECT",
      nullable: true,
      properties: {
        name: nullableString,
        designation: nullableString,
        company: nullableString,
      },
    },
    qr_code: nullableString,
    notes: nullableString,
    additional: { type: "OBJECT" },
    validation: {
      type: "OBJECT",
      properties: {
        warnings: {
          type: "ARRAY",
          items: { type: "STRING" },
        },
      },
    },
    per_field_confidence: perFieldConfidenceSchema,
    overall_confidence: { type: "NUMBER" },
  },
  required: ["document_type", "line_items", "totals", "per_field_confidence"],
} as const;

/** Top-level schema: single document OR { documents: [...] } for multi-invoice inputs. */
export const VERTEX_EXTRACTION_SCHEMA = {
  oneOf: [
    documentSchema,
    {
      type: "OBJECT",
      properties: {
        documents: {
          type: "ARRAY",
          items: documentSchema,
        },
      },
      required: ["documents"],
    },
  ],
} as const;
