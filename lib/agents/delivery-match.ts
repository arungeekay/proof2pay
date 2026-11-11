// Delivery AI, deterministic half: compares what Gemini read from the POD and photos with the contract.
// The model only extracts fields; whether delivery matches the contract is decided here, by rules a person can read.

import { z } from "zod";

export const PodExtractionSchema = z.object({
  documentType: z.string().describe("What the document is, e.g. 'proof of delivery' or 'delivery photo'"),
  readability: z.enum(["CLEAR", "PARTIAL", "UNREADABLE"]),
  consigneeName: z.string().nullable().describe("Consignee / receiver company name exactly as written"),
  signaturePresent: z.boolean().describe("A handwritten signature is visible in the receiver signature area"),
  deliveredOn: z.string().nullable().describe("Delivery date as YYYY-MM-DD, or null if absent"),
  quantityReceived: z.number().int().nullable().describe("Number of packages the receiver confirmed"),
  damagedUnits: z.number().int().min(0).describe("Packages noted or visible as damaged, dented, wet or opened"),
  conditionNotes: z.string().describe("Receiver remarks about condition, quoted where possible"),
  sealIntact: z.boolean().nullable(),
  photoObservations: z.array(z.string()).describe("One short observation per photo, in upload order"),
});

export type PodExtraction = z.infer<typeof PodExtractionSchema>;

export interface Discrepancy {
  field: string;
  expected: string;
  observed: string;
  severity: "MINOR" | "MAJOR";
  note: string;
}

export interface ContractTerms {
  buyerName: string;
  quantity: number;
  unit: string;
  /** YYYY-MM-DD */
  deliveryWindowEnd: string;
}

export interface MatchResult {
  status: "VERIFIED" | "VERIFIED_WITH_DISCREPANCY" | "FAILED";
  discrepancies: Discrepancy[];
  confidence: number;
}

const LEGAL_SUFFIXES = new Set(["inc", "ltd", "pvt", "private", "limited", "llc", "gmbh", "co", "corp", "plc", "pte", "the"]);

const tokens = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((token) => token && !LEGAL_SUFFIXES.has(token));

/** The consignee matches when the buyer's first distinctive word appears in it. */
export function consigneeMatches(observed: string | null, buyerName: string): boolean {
  if (!observed) return false;
  const first = tokens(buyerName)[0];
  return Boolean(first) && tokens(observed).includes(first);
}

export function matchDelivery(x: PodExtraction, c: ContractTerms): MatchResult {
  const discrepancies: Discrepancy[] = [];
  let failed = x.readability === "UNREADABLE";

  if (!consigneeMatches(x.consigneeName, c.buyerName)) {
    failed = true;
    discrepancies.push({
      field: "consignee",
      expected: c.buyerName,
      observed: x.consigneeName ?? "not stated",
      severity: "MAJOR",
      note: "The POD does not name the contracted buyer as consignee.",
    });
  }
  if (x.quantityReceived === null) {
    failed = true;
    discrepancies.push({
      field: "quantity",
      expected: `${c.quantity} ${c.unit}`,
      observed: "not stated",
      severity: "MAJOR",
      note: "The POD does not confirm how many packages were received.",
    });
  } else if (x.quantityReceived !== c.quantity) {
    discrepancies.push({
      field: "quantity",
      expected: `${c.quantity} ${c.unit}`,
      observed: `${x.quantityReceived} ${c.unit}`,
      severity: x.quantityReceived < c.quantity ? "MAJOR" : "MINOR",
      note: x.quantityReceived < c.quantity ? "Short delivery." : "More packages received than contracted.",
    });
  }
  if (!x.signaturePresent) {
    discrepancies.push({
      field: "signature",
      expected: "Consignee signature on POD",
      observed: "No signature visible",
      severity: "MINOR",
      note: "The contract asks for a POD signed by the consignee.",
    });
  }
  if (x.damagedUnits > 0) {
    discrepancies.push({
      field: "condition",
      expected: `All ${c.quantity} ${c.unit} intact`,
      observed: `${x.damagedUnits} of ${c.quantity} ${c.unit} damaged: ${x.conditionNotes}`,
      severity: x.damagedUnits / c.quantity <= 0.05 ? "MINOR" : "MAJOR",
      note: "Damage recorded at delivery. The buyer may object within the contract's objection window.",
    });
  }
  if (x.deliveredOn && /^\d{4}-\d{2}-\d{2}$/.test(x.deliveredOn) && x.deliveredOn > c.deliveryWindowEnd) {
    discrepancies.push({
      field: "delivery date",
      expected: `On or before ${c.deliveryWindowEnd}`,
      observed: x.deliveredOn,
      severity: "MINOR",
      note: "Delivered after the contracted window.",
    });
  }

  const base = x.readability === "CLEAR" ? 0.95 : x.readability === "PARTIAL" ? 0.8 : 0.4;
  const confidence = Math.max(0.3, Math.round((base - 0.04 * discrepancies.length) * 100) / 100);
  const status = failed ? "FAILED" : discrepancies.length ? "VERIFIED_WITH_DISCREPANCY" : "VERIFIED";
  return { status, discrepancies, confidence };
}
