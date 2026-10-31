export type PresetId = "IN_MSMED" | "GENERIC";

export interface PresetRules {
  id: PresetId;
  label: string;
  /** Longest credit period the law allows, in days from acceptance. null = no cap. */
  maxAgreedDays: number | null;
  /** Credit period that applies when the contract states none. null = the contract must state one. */
  defaultDaysWhenUnwritten: number | null;
  /** Delayed-payment interest as a multiple of the RBI bank rate. null = no statutory interest. */
  bankRateMultiplier: number | null;
  citation: string | null;
}

// Figures from the MSMED Act, 2006, ss.15-16. Re-check against https://samadhaan.msme.gov.in before the demo.
export const PRESETS: Record<PresetId, PresetRules> = {
  IN_MSMED: {
    id: "IN_MSMED",
    label: "India: MSMED Act, 2006",
    maxAgreedDays: 45,
    defaultDaysWhenUnwritten: 15,
    bankRateMultiplier: 3,
    citation: "Micro, Small and Medium Enterprises Development Act, 2006, sections 15 and 16",
  },
  GENERIC: {
    id: "GENERIC",
    label: "Generic Net-X",
    maxAgreedDays: null,
    defaultDaysWhenUnwritten: null,
    bankRateMultiplier: null,
    citation: null,
  },
};

const DEFAULT_RBI_BANK_RATE_PCT = 5.5;

/** RBI bank rate in percent, from RBI_BANK_RATE_PCT. Verify against rbi.org.in before the demo. */
export function rbiBankRatePct(): number {
  const raw = process.env.RBI_BANK_RATE_PCT;
  const value = raw ? Number(raw) : DEFAULT_RBI_BANK_RATE_PCT;
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`RBI_BANK_RATE_PCT must be a positive number, got "${raw}"`);
  }
  return value;
}
