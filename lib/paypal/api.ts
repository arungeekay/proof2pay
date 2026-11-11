// The PayPal calls Proof2Pay makes (plan Section 5, v2 scope): Invoicing v2, Payments v2 refunds,
// Shipment Tracking, Disputes v1 and Webhooks. Each returns `mocked: true` with MOCK- ids when no sandbox keys are set.

import { mockId, paypalConfigured, paypalFetch } from "./client";

const value = (amount: number) => amount.toFixed(2);

// ---------------------------------------------------------------------------
// Invoicing v2
// ---------------------------------------------------------------------------

export interface InvoiceItem {
  name: string;
  description?: string;
  quantity: number;
  unitAmount: number;
}

export interface CreateInvoiceInput {
  invoiceNumber: string;
  reference: string;
  currency: string;
  invoiceDate: string;
  dueDate: string;
  invoicerBusinessName: string;
  recipientBusinessName: string;
  recipientEmail: string;
  items: InvoiceItem[];
  note: string;
  terms: string;
}

export interface SentInvoice {
  id: string;
  status: string;
  payerViewUrl: string | null;
  mocked: boolean;
  raw: unknown;
}

interface PayPalInvoiceBody {
  id: string;
  status: string;
  detail?: { metadata?: { recipient_view_url?: string } };
  payments?: { transactions?: { payment_id?: string; transaction_id?: string; payment_date?: string; method?: string; amount?: { value: string } }[] };
  refunds?: { transactions?: { refund_id?: string }[] };
}

export async function createAndSendInvoice(input: CreateInvoiceInput): Promise<SentInvoice> {
  if (!paypalConfigured()) {
    return { id: mockId("INV"), status: "SENT", payerViewUrl: null, mocked: true, raw: { mocked: true, input } };
  }
  const draft = await paypalFetch<PayPalInvoiceBody>("/v2/invoicing/invoices", {
    headers: { Prefer: "return=representation" },
    body: {
      detail: {
        invoice_number: input.invoiceNumber,
        reference: input.reference,
        currency_code: input.currency,
        invoice_date: input.invoiceDate,
        payment_term: { due_date: input.dueDate },
        note: input.note.slice(0, 4000),
        terms_and_conditions: input.terms.slice(0, 4000),
      },
      invoicer: { business_name: input.invoicerBusinessName },
      primary_recipients: [
        { billing_info: { business_name: input.recipientBusinessName, email_address: input.recipientEmail } },
      ],
      items: input.items.map((item) => ({
        name: item.name.slice(0, 200),
        description: item.description?.slice(0, 1000),
        quantity: String(item.quantity),
        unit_amount: { currency_code: input.currency, value: value(item.unitAmount) },
        unit_of_measure: "QUANTITY",
      })),
      configuration: { allow_tip: false, partial_payment: { allow_partial_payment: false } },
    },
  });
  await paypalFetch(`/v2/invoicing/invoices/${draft.id}/send`, {
    body: { send_to_invoicer: false, send_to_recipient: true },
    idempotencyKey: `send-${draft.id}`,
  });
  const sent = await getInvoice(draft.id);
  return { id: draft.id, status: sent.status, payerViewUrl: sent.payerViewUrl, mocked: false, raw: sent.raw };
}

export interface InvoiceState {
  status: string;
  payerViewUrl: string | null;
  /** PayPal transaction id of the payment (the capture to refund and to attach tracking to). */
  transactionId: string | null;
  paidAt: Date | null;
  raw: unknown;
}

export async function getInvoice(id: string): Promise<InvoiceState> {
  const invoice = await paypalFetch<PayPalInvoiceBody>(`/v2/invoicing/invoices/${id}`);
  const payment = invoice.payments?.transactions?.find((t) => t.payment_id || t.transaction_id);
  return {
    status: invoice.status,
    payerViewUrl: invoice.detail?.metadata?.recipient_view_url ?? null,
    transactionId: payment?.payment_id ?? payment?.transaction_id ?? null,
    paidAt: payment?.payment_date ? new Date(payment.payment_date) : null,
    raw: invoice,
  };
}

export async function remindInvoice(id: string, subject: string, note: string): Promise<{ mocked: boolean }> {
  if (!paypalConfigured()) return { mocked: true };
  await paypalFetch(`/v2/invoicing/invoices/${id}/remind`, {
    body: { subject: subject.slice(0, 4000), note: note.slice(0, 4000), send_to_invoicer: false, send_to_recipient: true },
  });
  return { mocked: false };
}

// ---------------------------------------------------------------------------
// Payments v2: refunds
// ---------------------------------------------------------------------------

export async function refundCapture(input: {
  captureId: string;
  amount: number;
  currency: string;
  invoiceId?: string;
  noteToPayer: string;
  idempotencyKey: string;
}): Promise<{ id: string; status: string; mocked: boolean; raw: unknown }> {
  if (!paypalConfigured() || input.captureId.startsWith("MOCK-")) {
    return { id: mockId("REFUND"), status: "COMPLETED", mocked: true, raw: { mocked: true } };
  }
  const refund = await paypalFetch<{ id: string; status: string }>(`/v2/payments/captures/${input.captureId}/refund`, {
    body: {
      amount: { currency_code: input.currency, value: value(input.amount) },
      note_to_payer: input.noteToPayer.slice(0, 255),
      ...(input.invoiceId ? { invoice_id: input.invoiceId } : {}),
    },
    idempotencyKey: input.idempotencyKey,
  });
  return { id: refund.id, status: refund.status, mocked: false, raw: refund };
}

// ---------------------------------------------------------------------------
// Shipment Tracking
// ---------------------------------------------------------------------------

export async function addTracker(input: {
  transactionId: string;
  trackingNumber: string;
  carrierName: string;
}): Promise<{ trackerId: string | null; mocked: boolean; raw: unknown }> {
  if (!paypalConfigured() || input.transactionId.startsWith("MOCK-")) {
    return { trackerId: null, mocked: true, raw: { mocked: true } };
  }
  const result = await paypalFetch<{
    tracker_identifiers?: { transaction_id: string; tracking_number: string }[];
    errors?: { name?: string; message?: string; details?: { issue?: string }[] }[];
  }>("/v1/shipping/trackers-batch", {
    body: {
      trackers: [
        {
          transaction_id: input.transactionId,
          tracking_number: input.trackingNumber,
          status: "DELIVERED",
          carrier: "OTHER",
          carrier_name_other: input.carrierName,
        },
      ],
    },
  });
  if (result.errors?.length) {
    const error = result.errors[0];
    throw new Error(`PayPal Add Tracking failed: ${error.details?.[0]?.issue ?? error.name ?? error.message}`);
  }
  const id = result.tracker_identifiers?.[0];
  return { trackerId: id ? `${id.transaction_id}-${id.tracking_number}` : null, mocked: false, raw: result };
}

// ---------------------------------------------------------------------------
// Disputes v1
// ---------------------------------------------------------------------------

export interface DisputeSummary {
  id: string;
  reason: string;
  status: string;
  amount: number | null;
  currency: string;
  sellerTransactionId: string | null;
  responseDueAt: Date | null;
  outcome: string | null;
  openedAt: Date | null;
  raw: unknown;
}

interface PayPalDisputeBody {
  dispute_id: string;
  reason: string;
  status: string;
  create_time?: string;
  seller_response_due_date?: string;
  dispute_amount?: { value: string; currency_code: string };
  dispute_outcome?: { outcome_code?: string };
  disputed_transactions?: { seller_transaction_id?: string }[];
}

export async function listDisputes(): Promise<DisputeSummary[]> {
  if (!paypalConfigured()) return [];
  const list = await paypalFetch<{ items?: { dispute_id: string }[] }>("/v1/customer/disputes?page_size=20");
  return Promise.all((list.items ?? []).map((item) => getDispute(item.dispute_id)));
}

export async function getDispute(id: string): Promise<DisputeSummary> {
  const d = await paypalFetch<PayPalDisputeBody>(`/v1/customer/disputes/${id}`);
  return {
    id: d.dispute_id,
    reason: d.reason,
    status: d.status,
    amount: d.dispute_amount ? Number(d.dispute_amount.value) : null,
    currency: d.dispute_amount?.currency_code ?? "USD",
    sellerTransactionId: d.disputed_transactions?.[0]?.seller_transaction_id ?? null,
    responseDueAt: d.seller_response_due_date ? new Date(d.seller_response_due_date) : null,
    outcome: d.dispute_outcome?.outcome_code ?? null,
    openedAt: d.create_time ? new Date(d.create_time) : null,
    raw: d,
  };
}

/**
 * Sends the seller's evidence. PayPal accepts provide-evidence only at some dispute stages; at the
 * inquiry stage the same notes go as a message to the buyer instead. Returns which call succeeded.
 */
export async function respondToDispute(input: {
  disputeId: string;
  notes: string;
  trackingNumber: string | null;
  carrierName: string;
}): Promise<{ method: "provide-evidence" | "send-message" | "mock"; raw: unknown }> {
  if (!paypalConfigured() || input.disputeId.startsWith("MOCK-") || input.disputeId.startsWith("SIM-")) {
    return { method: "mock", raw: { mocked: true } };
  }
  const evidence = new FormData();
  evidence.append(
    "input",
    new Blob(
      [
        JSON.stringify({
          evidences: [
            {
              evidence_type: "PROOF_OF_FULFILLMENT",
              evidence_info: input.trackingNumber
                ? {
                    tracking_info: [
                      { carrier_name: "OTHER", carrier_name_other: input.carrierName, tracking_number: input.trackingNumber },
                    ],
                  }
                : undefined,
              notes: input.notes.slice(0, 2000),
            },
          ],
        }),
      ],
      { type: "application/json" },
    ),
  );
  try {
    const raw = await paypalFetch(`/v1/customer/disputes/${input.disputeId}/provide-evidence`, { form: evidence });
    return { method: "provide-evidence", raw };
  } catch (error) {
    const message = new FormData();
    message.append("input", new Blob([JSON.stringify({ message: input.notes.slice(0, 2000) })], { type: "application/json" }));
    const raw = await paypalFetch(`/v1/customer/disputes/${input.disputeId}/send-message`, { form: message });
    return { method: "send-message", raw: { provideEvidenceError: String(error), response: raw } };
  }
}

// ---------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------

export const WEBHOOK_EVENTS = [
  "INVOICING.INVOICE.PAID",
  "INVOICING.INVOICE.CANCELLED",
  "PAYMENT.CAPTURE.COMPLETED",
  "PAYMENT.CAPTURE.REFUNDED",
  "CUSTOMER.DISPUTE.CREATED",
  "CUSTOMER.DISPUTE.UPDATED",
  "CUSTOMER.DISPUTE.RESOLVED",
];

export async function verifyWebhookSignature(headers: Headers, event: unknown): Promise<boolean> {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!paypalConfigured() || !webhookId) return false;
  const result = await paypalFetch<{ verification_status: string }>("/v1/notifications/verify-webhook-signature", {
    body: {
      auth_algo: headers.get("paypal-auth-algo"),
      cert_url: headers.get("paypal-cert-url"),
      transmission_id: headers.get("paypal-transmission-id"),
      transmission_sig: headers.get("paypal-transmission-sig"),
      transmission_time: headers.get("paypal-transmission-time"),
      webhook_id: webhookId,
      webhook_event: event,
    },
  });
  return result.verification_status === "SUCCESS";
}

/** Registers (or finds) the webhook for `url`. Returns its id for PAYPAL_WEBHOOK_ID. */
export async function ensureWebhook(url: string): Promise<{ id: string; created: boolean }> {
  const existing = await paypalFetch<{ webhooks?: { id: string; url: string }[] }>("/v1/notifications/webhooks");
  const match = existing.webhooks?.find((webhook) => webhook.url === url);
  if (match) return { id: match.id, created: false };
  const created = await paypalFetch<{ id: string }>("/v1/notifications/webhooks", {
    body: { url, event_types: WEBHOOK_EVENTS.map((name) => ({ name })) },
  });
  return { id: created.id, created: true };
}
