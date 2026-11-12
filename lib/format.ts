// Display helpers shared by pages and agents.

type Numeric = number | string | { toString(): string } | null | undefined;

export const num = (value: Numeric): number => (value === null || value === undefined ? 0 : Number(value.toString()));

export function money(amount: Numeric, currency = "USD"): string {
  return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", { style: "currency", currency }).format(num(amount));
}

export const isoDay = (date: Date) => date.toISOString().slice(0, 10);

export function day(date: Date | null | undefined): string {
  if (!date) return "–";
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(date);
}

export function dateTime(date: Date | null | undefined): string {
  if (!date) return "–";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  }).format(date);
}

export const round2 = (value: number) => Math.round(value * 100) / 100;

export function humanize(value: string): string {
  return value.toLowerCase().replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

export const ROLE_LABEL = { EXPORTER: "Exporter", CARRIER: "Carrier", BUYER: "Buyer", MANAGER: "Finance manager" } as const;

/** "PAYMENT_AI" becomes "Payment AI". */
export const agentLabel = (agent: string) => humanize(agent).replace(/\bai\b/i, "AI");

const ACTION_LABEL: Record<string, string> = {
  INVOICE_SEND: "Send invoice",
  REFUND: "Pay refund",
  INSURANCE_CLAIM: "File insurance claim",
  DISPUTE_EVIDENCE: "Send dispute response",
  DISPUTE_ACCEPT_CLAIM: "Accept dispute claim",
  CONTRACT_FINALISE: "Finalise contract",
  PAYOUT: "Pay out",
};

/** Plain wording for what an approval will do once a person approves it. */
export const actionLabel = (actionType: string) => ACTION_LABEL[actionType] ?? humanize(actionType);
