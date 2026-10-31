import { describe, expect, it } from "vitest";
import { ContractClausesSchema, type ContractClauses } from "@/lib/contracts/schema";
import { renderContractMarkdown } from "@/lib/contracts/render";
import { canonicalJson, hashContent } from "@/lib/hash";

const clauses: ContractClauses = {
  identities: {
    exporter: { name: "Exporter Co", country: "IN", city: "Chennai" },
    carrier: { name: "Carrier Co", country: "IN" },
    buyer: { name: "Buyer Co", country: "US", city: "Chicago" },
  },
  cargo: { description: "machined parts", quantity: 40, unit: "cartons", declaredValue: 12_000, currency: "USD" },
  liability: { goodsSafety: "Packed to export standard.", carrierLiabilityLimit: 12_000, notes: "" },
  delivery: {
    origin: "Chennai, IN",
    destination: "Chicago, US",
    pickupWindow: { start: "2026-11-03", end: "2026-11-04" },
    deliveryWindow: { start: "2026-11-10", end: "2026-11-13" },
    acceptablePod: "Signed POD naming the consignee, with date and carton count.",
    conditionStandard: "Cartons intact and dry.",
  },
  payment: {
    freight: { amount: 850, method: "PAYPAL_ORDER_AUTHORIZE_CAPTURE", trigger: "Captured on verified delivery." },
    goods: { amount: 12_000, method: "PAYPAL_INVOICE", trigger: "Invoiced on verified delivery." },
  },
  credit: { days: 30, preset: "IN_MSMED", startsFrom: "verified delivery", lateInterest: "" },
  insurance: null,
  disputes: { objectionWindowDays: 7, evidenceRules: "Photos required.", forum: "Proof2Pay resolution." },
  signatures: { requiredParties: ["EXPORTER", "BUYER"] },
};

describe("contract clauses", () => {
  it("accepts a complete contract", () => {
    expect(ContractClausesSchema.safeParse(clauses).success).toBe(true);
  });

  it("rejects a contract that only one party signs", () => {
    const oneParty = { ...clauses, signatures: { requiredParties: ["EXPORTER"] } };
    expect(ContractClausesSchema.safeParse(oneParty).success).toBe(false);
  });

  it("renders every clause section", () => {
    const markdown = renderContractMarkdown("SH-1042", 1, clauses);
    expect(markdown).toContain("# Shipment contract SH-1042 (version 1)");
    for (const heading of ["Parties", "Cargo declaration", "Delivery conditions", "Payment terms", "Credit period", "Insurance", "Disputes", "Signatures"]) {
      expect(markdown).toContain(heading);
    }
    expect(markdown).toContain("$12,000.00");
  });
});

describe("content hash", () => {
  it("ignores key order", () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe('{"a":{"c":3,"d":2},"b":1}');
    expect(hashContent({ b: 1, a: 2 })).toBe(hashContent({ a: 2, b: 1 }));
  });

  it("changes when any clause changes", () => {
    const changed = { ...clauses, credit: { ...clauses.credit, days: 31 } };
    expect(hashContent(changed)).not.toBe(hashContent(clauses));
  });
});
