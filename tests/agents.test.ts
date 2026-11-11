import { describe, expect, it } from "vitest";
import { keywordSpec } from "@/lib/agents/command-spec";
import { consigneeMatches, matchDelivery, type PodExtraction } from "@/lib/agents/delivery-match";
import { decideClaim, quoteCargoInsurance } from "@/lib/insurer-sim";
import { extractJson } from "@/lib/llm";
import { carrierMetrics, confidenceFor, payerMetrics, payerStatusLines } from "@/lib/trust-score";

const clean: PodExtraction = {
  documentType: "proof of delivery",
  readability: "CLEAR",
  consigneeName: "NORTHWIND IMPORTS INC.",
  signaturePresent: true,
  deliveredOn: "2026-11-12",
  quantityReceived: 40,
  damagedUnits: 0,
  conditionNotes: "Received in good order",
  sealIntact: true,
  photoObservations: [],
};
const terms = { buyerName: "Northwind Imports Inc", quantity: 40, unit: "cartons", deliveryWindowEnd: "2026-12-25" };

describe("Delivery AI matching", () => {
  it("verifies a clean POD", () => {
    const result = matchDelivery(clean, terms);
    expect(result.status).toBe("VERIFIED");
    expect(result.discrepancies).toEqual([]);
  });

  it("flags one dented carton as a minor condition discrepancy", () => {
    const result = matchDelivery({ ...clean, damagedUnits: 1, conditionNotes: "1 carton dented" }, terms);
    expect(result.status).toBe("VERIFIED_WITH_DISCREPANCY");
    expect(result.discrepancies).toHaveLength(1);
    expect(result.discrepancies[0]).toMatchObject({ field: "condition", severity: "MINOR" });
  });

  it("fails when the consignee is someone else", () => {
    expect(matchDelivery({ ...clean, consigneeName: "Harbourside Trading Ltd" }, terms).status).toBe("FAILED");
  });

  it("fails when the package count is unreadable, and flags a short delivery as major", () => {
    expect(matchDelivery({ ...clean, quantityReceived: null }, terms).status).toBe("FAILED");
    const short = matchDelivery({ ...clean, quantityReceived: 36 }, terms);
    expect(short.discrepancies[0]).toMatchObject({ field: "quantity", severity: "MAJOR" });
  });

  it("treats early delivery as fine and late delivery as a discrepancy", () => {
    expect(matchDelivery({ ...clean, deliveredOn: "2026-11-01" }, terms).status).toBe("VERIFIED");
    expect(matchDelivery({ ...clean, deliveredOn: "2026-12-30" }, terms).discrepancies[0].field).toBe("delivery date");
  });

  it("ignores legal suffixes when matching the consignee", () => {
    expect(consigneeMatches("Northwind Imports", "Northwind Imports Inc")).toBe(true);
    expect(consigneeMatches("Imports Inc", "Northwind Imports Inc")).toBe(false);
  });
});

describe("trust score", () => {
  const due = new Date("2026-10-01");
  const day = (d: number) => new Date(due.getTime() + d * 86_400_000);

  it("bands confidence by verified history", () => {
    expect(confidenceFor(2)).toBe("LOW");
    expect(confidenceFor(10)).toBe("MEDIUM");
    expect(confidenceFor(51)).toBe("HIGH");
  });

  it("computes on-time rate, lateness and overdue as objective counts", () => {
    const m = payerMetrics(
      [
        { dueDate: due, paidAt: day(-1), amount: 100, currency: "USD", channel: "PAYPAL" },
        { dueDate: due, paidAt: day(10), amount: 200, currency: "USD", channel: "PAYPAL" },
        { dueDate: due, paidAt: null, amount: 300, currency: "INR", channel: "MANUAL_RECORD" },
      ],
      [{ outcome: "RESOLVED_SELLER_FAVOUR" }],
      day(30),
    );
    expect(m).toMatchObject({ verifiedPayments: 2, onTimeRatePct: 50, averageDaysLate: 10, currentlyOverdue: 1, disputesResolvedForSeller: 1 });
    expect(m.verifiedVolume).toEqual({ USD: 300 });
    const lines = payerStatusLines(m).join(" ");
    expect(lines).toContain("overdue (status: overdue, not a default)");
    expect(lines).not.toMatch(/fraud|unreliable/i);
  });

  it("counts substantiated damage for carriers", () => {
    const m = carrierMetrics(
      [
        { status: "VERIFIED", substantiatedDamage: false },
        { status: "VERIFIED_WITH_DISCREPANCY", substantiatedDamage: true },
        { status: "FAILED", substantiatedDamage: false },
      ],
      [],
    );
    expect(m).toMatchObject({ documentedDeliveries: 3, verificationPassRatePct: 66.7, substantiatedDamageIncidents: 1, confidence: "LOW" });
  });
});

describe("simulated insurer", () => {
  it("quotes 0.4% cross-border and labels the insurer as simulated", () => {
    const quote = quoteCargoInsurance({ reference: "SH-1042", declaredValue: 12_000, domestic: false, version: 1 });
    expect(quote.premium).toBe(48);
    expect(quote.insurer).toMatch(/Simulated/);
  });

  it("pays recorded damage within cover and rejects unrecorded damage", () => {
    const base = { policyActive: true, coverageAmount: 12_000, deductible: 0, amountClaimed: 300 };
    expect(decideClaim({ ...base, damageRecordedAtDelivery: true })).toMatchObject({ status: "APPROVED", amountApproved: 300 });
    expect(decideClaim({ ...base, damageRecordedAtDelivery: false }).status).toBe("REJECTED");
    expect(decideClaim({ ...base, policyActive: false, damageRecordedAtDelivery: true }).status).toBe("REJECTED");
  });
});

describe("LLM output parsing", () => {
  it("accepts bare JSON and fenced JSON", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
    expect(extractJson('```json\n{"a":2}\n```')).toEqual({ a: 2 });
  });
});

describe("command center keyword fallback", () => {
  it("reads the scripted questions without Gemini", () => {
    expect(keywordSpec("Show disputed shipments over $10,000 with insurance attached")).toMatchObject({
      dataset: "shipments",
      filters: { minAmount: 10000, disputedOnly: true, insuredOnly: true, currency: "USD" },
    });
    expect(keywordSpec("Which invoices are overdue?")).toMatchObject({ dataset: "invoices", filters: { overdueOnly: true } });
    expect(keywordSpec("What is waiting for my approval?").dataset).toBe("approvals");
  });
});
