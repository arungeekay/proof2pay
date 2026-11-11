// Simulated cargo insurer (plan v2: no live insurer is integrated). Deterministic, and every record it
// produces is stored with simulated=true and shown as "Simulated insurer" in the UI. It never represents real cover.

export const SIMULATED_INSURER = "Simulated Insurer (demo)";

export interface QuoteInput {
  reference: string;
  declaredValue: number;
  domestic: boolean;
  version: number;
}

export interface Quote {
  insurer: string;
  quoteReference: string;
  coverageAmount: number;
  premium: number;
  deductible: number;
  cover: string;
  exclusions: string[];
}

export function quoteCargoInsurance(input: QuoteInput): Quote {
  const rate = input.domestic ? 0.002 : 0.004;
  return {
    insurer: SIMULATED_INSURER,
    quoteReference: `SIM-Q-${input.reference.replace("SH-", "")}-${input.version}`,
    coverageAmount: input.declaredValue,
    premium: Math.round(input.declaredValue * rate * 100) / 100,
    deductible: 0,
    cover: "All risks in transit, warehouse to warehouse, up to the declared value.",
    exclusions: ["Inherent vice or improper packing by the exporter", "Delay without physical loss or damage", "Damage not recorded at delivery"],
  };
}

export interface ClaimDecisionInput {
  policyActive: boolean;
  coverageAmount: number;
  deductible: number;
  amountClaimed: number;
  /** Damage was recorded on the POD or in the delivery verification report. */
  damageRecordedAtDelivery: boolean;
}

export interface ClaimDecision {
  status: "APPROVED" | "PARTIALLY_APPROVED" | "REJECTED";
  amountApproved: number;
  note: string;
}

export function decideClaim(input: ClaimDecisionInput): ClaimDecision {
  if (!input.policyActive) return { status: "REJECTED", amountApproved: 0, note: "No active policy for this shipment." };
  if (!input.damageRecordedAtDelivery) {
    return { status: "REJECTED", amountApproved: 0, note: "Exclusion: damage was not recorded at delivery." };
  }
  const payable = Math.max(0, Math.min(input.amountClaimed, input.coverageAmount) - input.deductible);
  return payable >= input.amountClaimed
    ? { status: "APPROVED", amountApproved: payable, note: "Damage recorded at delivery; within cover." }
    : { status: "PARTIALLY_APPROVED", amountApproved: payable, note: "Approved up to cover, less the deductible." };
}
