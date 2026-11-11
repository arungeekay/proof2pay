import { z } from "zod";

// Structured contract clauses (plan Section 6.1). Contract AI produces this shape;
// the markdown shown to parties is rendered from it, and its canonical hash is what each party accepts.

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

const PartySchema = z.object({
  name: z.string().min(1),
  country: z.string().length(2),
  city: z.string().optional(),
  paypalEmail: z.string().optional(),
});

const WindowSchema = z.object({ start: isoDate, end: isoDate });

export const ContractClausesSchema = z.object({
  identities: z.object({
    exporter: PartySchema,
    carrier: PartySchema,
    buyer: PartySchema,
  }),
  cargo: z.object({
    description: z.string().min(1),
    quantity: z.number().int().positive(),
    unit: z.string().min(1),
    declaredValue: z.number().positive(),
    currency: z.string().length(3),
  }),
  liability: z.object({
    goodsSafety: z.string().min(1),
    carrierLiabilityLimit: z.number().nonnegative(),
    notes: z.string(),
  }),
  delivery: z.object({
    origin: z.string().min(1),
    destination: z.string().min(1),
    pickupWindow: WindowSchema,
    deliveryWindow: WindowSchema,
    acceptablePod: z.string().min(1),
    conditionStandard: z.string().min(1),
  }),
  payment: z.object({
    freight: z.object({
      amount: z.number().nonnegative(),
      // PAYPAL_INVOICE_LINE: freight billed to the buyer on the PayPal goods invoice (v2 scope).
      // MANUAL_RECORD: Indian domestic trade, which PayPal does not settle; payment is entered as a verified record.
      method: z.enum(["PAYPAL_ORDER_AUTHORIZE_CAPTURE", "PAYPAL_INVOICE_LINE", "MANUAL_RECORD"]),
      trigger: z.string().min(1),
    }),
    goods: z.object({
      amount: z.number().positive(),
      method: z.enum(["PAYPAL_INVOICE", "PAYPAL_ORDER_CAPTURE", "MANUAL_RECORD"]),
      trigger: z.string().min(1),
    }),
  }),
  credit: z.object({
    days: z.number().int().nonnegative(),
    preset: z.enum(["IN_MSMED", "GENERIC"]),
    startsFrom: z.string().min(1),
    lateInterest: z.string(),
  }),
  insurance: z
    .object({
      insurer: z.string().min(1),
      quoteReference: z.string().min(1),
      coverageAmount: z.number().positive(),
      premium: z.number().nonnegative(),
      simulated: z.literal(true),
    })
    .nullable(),
  disputes: z.object({
    objectionWindowDays: z.number().int().positive(),
    evidenceRules: z.string().min(1),
    forum: z.string().min(1),
  }),
  signatures: z.object({
    requiredParties: z.array(z.enum(["EXPORTER", "CARRIER", "BUYER"])).min(2),
  }),
});

export type ContractClauses = z.infer<typeof ContractClausesSchema>;
