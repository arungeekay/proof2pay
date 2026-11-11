// Trust profiles (plan Section 11, and v2 "how reputation stays fair"). Pure functions over verified events only:
// PayPal-confirmed or manually verified payments, verification reports and resolved disputes.
// No AI is involved in the numbers; users cannot post allegations, and confidence reflects how much history there is.

export type Confidence = "LOW" | "MEDIUM" | "HIGH";

export function confidenceFor(count: number): Confidence {
  if (count > 50) return "HIGH";
  if (count >= 10) return "MEDIUM";
  return "LOW";
}

export interface PayerInvoice {
  dueDate: Date;
  paidAt: Date | null;
  amount: number;
  currency: string;
  /** PAYPAL = confirmed by PayPal; MANUAL_RECORD = entered by an operator as a manually verified record. */
  channel: "PAYPAL" | "MANUAL_RECORD";
}

export interface ResolvedDispute {
  /** PayPal outcome code, e.g. RESOLVED_BUYER_FAVOUR; null while open. */
  outcome: string | null;
}

const DAY_MS = 86_400_000;
const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 1000) / 10 : null);

export function payerMetrics(invoices: PayerInvoice[], disputes: ResolvedDispute[], asOf: Date) {
  const paid = invoices.filter((invoice) => invoice.paidAt);
  const late = paid.filter((invoice) => invoice.paidAt! > invoice.dueDate);
  const daysLate = late.map((invoice) => Math.ceil((invoice.paidAt!.getTime() - invoice.dueDate.getTime()) / DAY_MS));
  const overdue = invoices.filter((invoice) => !invoice.paidAt && invoice.dueDate < asOf);
  const volume: Record<string, number> = {};
  for (const invoice of paid) volume[invoice.currency] = (volume[invoice.currency] ?? 0) + invoice.amount;

  return {
    verifiedPayments: paid.length,
    viaPayPal: paid.filter((invoice) => invoice.channel === "PAYPAL").length,
    viaManualRecord: paid.filter((invoice) => invoice.channel === "MANUAL_RECORD").length,
    onTimeRatePct: pct(paid.length - late.length, paid.length),
    averageDaysLate: daysLate.length ? Math.round((daysLate.reduce((a, b) => a + b, 0) / daysLate.length) * 10) / 10 : 0,
    currentlyOverdue: overdue.length,
    disputesRaised: disputes.length,
    disputesResolvedForPayer: disputes.filter((d) => d.outcome === "RESOLVED_BUYER_FAVOUR").length,
    disputesResolvedForSeller: disputes.filter((d) => d.outcome === "RESOLVED_SELLER_FAVOUR").length,
    verifiedVolume: volume,
    confidence: confidenceFor(paid.length),
  };
}

export interface CarrierDelivery {
  status: "VERIFIED" | "VERIFIED_WITH_DISCREPANCY" | "FAILED";
  /** A MAJOR condition discrepancy, or damage later upheld through a refund. */
  substantiatedDamage: boolean;
}

export function carrierMetrics(deliveries: CarrierDelivery[], disputesAgainst: ResolvedDispute[]) {
  const passed = deliveries.filter((d) => d.status !== "FAILED");
  const clean = deliveries.filter((d) => d.status === "VERIFIED");
  return {
    documentedDeliveries: deliveries.length,
    verificationPassRatePct: pct(passed.length, deliveries.length),
    cleanDeliveryRatePct: pct(clean.length, deliveries.length),
    substantiatedDamageIncidents: deliveries.filter((d) => d.substantiatedDamage).length,
    disputesInvolvingShipments: disputesAgainst.length,
    confidence: confidenceFor(deliveries.length),
  };
}

export type PayerMetrics = ReturnType<typeof payerMetrics>;
export type CarrierMetrics = ReturnType<typeof carrierMetrics>;

/** Objective status lines for the public profile. Never adjectives, never allegations. */
export function payerStatusLines(m: PayerMetrics): string[] {
  const lines = [`${m.verifiedPayments} verified payments (${m.viaPayPal} confirmed by PayPal, ${m.viaManualRecord} manually verified records)`];
  if (m.onTimeRatePct !== null) lines.push(`${m.onTimeRatePct}% paid on or before the due date`);
  if (m.currentlyOverdue) lines.push(`${m.currentlyOverdue} invoice${m.currentlyOverdue > 1 ? "s" : ""} currently overdue (status: overdue, not a default)`);
  if (m.disputesRaised) {
    lines.push(
      `${m.disputesRaised} payment dispute${m.disputesRaised > 1 ? "s" : ""}: ${m.disputesResolvedForPayer} resolved in the payer's favour, ${m.disputesResolvedForSeller} in the seller's`,
    );
  }
  return lines;
}
