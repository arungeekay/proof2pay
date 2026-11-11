// Contract AI (plan Section 6.1). Builds the contract from the fixed clause library, then Gemini reviews it:
// flags issues and explains each section in plain language. Rule flags (MSMED cap) block acceptance;
// the AI never signs. Both parties accept the same hash.

import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { audit } from "@/lib/agents/audit";
import { buildClauses, isDomestic } from "@/lib/contracts/build";
import { renderContractMarkdown } from "@/lib/contracts/render";
import type { ContractClauses } from "@/lib/contracts/schema";
import { computeClock, PRESETS } from "@/lib/credit-clock";
import { db } from "@/lib/db";
import { num } from "@/lib/format";
import { hashContent } from "@/lib/hash";
import { quoteCargoInsurance } from "@/lib/insurer-sim";
import { auditModel, generateJson } from "@/lib/llm";
import type { SessionUser } from "@/lib/session";

export const ContractReviewSchema = z.object({
  summary: z.string().describe("Two sentences: what this contract commits each party to"),
  flags: z.array(
    z.object({
      clause: z.string(),
      severity: z.enum(["INFO", "WARNING"]),
      issue: z.string(),
      suggestion: z.string(),
    }),
  ),
  explanations: z.array(z.object({ section: z.string(), plainLanguage: z.string() })),
});

export type ContractFlag = { clause: string; severity: "INFO" | "WARNING" | "BLOCKING"; issue: string; suggestion: string; source: "rule" | "ai" };

export interface ContractReview {
  summary: string;
  flags: ContractFlag[];
  explanations: { section: string; plainLanguage: string }[];
  source: "live" | "sample";
  model: string;
}

const SYSTEM = `You are Contract AI inside Proof2Pay, reviewing a B2B shipment contract before two businesses accept it.
The clause wording comes from a fixed, human-written library. You must not invent legal terms, deadlines or verification results.
Your job: flag missing, risky or inconsistent terms, and explain each section in plain language for a small business owner.
Severity INFO = worth knowing; WARNING = should be fixed or consciously accepted. Never claim insurance cover is real: the insurer is simulated.`;

function sampleReview(c: ContractClauses): z.infer<typeof ContractReviewSchema> {
  return {
    summary: `The exporter ships ${c.cargo.quantity} ${c.cargo.unit} of ${c.cargo.description} to ${c.identities.buyer.name}, who pays within ${c.credit.days} days of verified delivery. The carrier is liable for transit damage up to the declared value.`,
    flags: [
      ...(c.insurance
        ? [{ clause: "7. Insurance", severity: "INFO" as const, issue: "Cover comes from a simulated insurer in this demo.", suggestion: "Replace with a real cargo policy before relying on it." }]
        : [{ clause: "7. Insurance", severity: "WARNING" as const, issue: "No cargo insurance.", suggestion: "Consider cover for goods of this value." }]),
      { clause: "4. Delivery conditions", severity: "INFO", issue: "Damage must be written on the POD to count.", suggestion: "Ask the carrier to brief the consignee to note any damage at handover." },
    ],
    explanations: [
      { section: "Payment terms", plainLanguage: `The buyer pays ${c.payment.goods.amount} ${c.cargo.currency} for the goods after delivery is verified.` },
      { section: "Credit period", plainLanguage: `The ${c.credit.days}-day clock starts on the day the goods are accepted at delivery.` },
      { section: "Disputes", plainLanguage: `The buyer has ${c.disputes.objectionWindowDays} days to object, and must point to the delivery evidence.` },
    ],
  };
}

/** Rule-based flags. BLOCKING flags stop acceptance. */
export function ruleFlags(c: ContractClauses, preset: "IN_MSMED" | "GENERIC", insuranceRequested: boolean): ContractFlag[] {
  const flags: ContractFlag[] = [];
  const clock = computeClock({ acceptanceDate: new Date(), agreedDays: c.credit.days, preset });
  if (clock.capViolation) {
    flags.push({
      clause: "6. Credit period",
      severity: "BLOCKING",
      issue: clock.capViolation.explanation,
      suggestion: `Change the credit period to ${clock.capViolation.capDays} days or fewer.`,
      source: "rule",
    });
  }
  if (c.delivery.deliveryWindow.start < c.delivery.pickupWindow.start) {
    flags.push({ clause: "4. Delivery conditions", severity: "BLOCKING", issue: "The delivery window starts before pickup.", suggestion: "Fix the shipment windows.", source: "rule" });
  }
  if (insuranceRequested && !c.insurance) {
    flags.push({ clause: "7. Insurance", severity: "WARNING", issue: "Insurance was requested but no quote is attached.", suggestion: "Request a quote.", source: "rule" });
  }
  if (c.liability.carrierLiabilityLimit < c.cargo.declaredValue) {
    flags.push({ clause: "3. Liability", severity: "WARNING", issue: "Carrier liability is below the declared value.", suggestion: "Raise the limit or insure the gap.", source: "rule" });
  }
  return flags;
}

export const hasBlockingFlag = (flagsJson: unknown) =>
  Boolean((flagsJson as ContractReview | null)?.flags?.some((flag) => flag.severity === "BLOCKING"));

function loadShipment(id: string) {
  return db.shipment.findUniqueOrThrow({
    where: { id },
    include: { exporter: true, carrier: true, buyer: true, contracts: { orderBy: { version: "desc" } } },
  });
}

export async function draftContract(shipmentId: string, actor: SessionUser) {
  const shipment = await loadShipment(shipmentId);
  if (actor.businessId !== shipment.exporterId) throw new Error("Only the exporter's team drafts the contract.");
  if (!["DRAFT", "CONTRACT_PENDING"].includes(shipment.status)) throw new Error(`Shipment is ${shipment.status}; the contract is already settled.`);

  const version = (shipment.contracts[0]?.version ?? 0) + 1;
  const quote = shipment.insuranceRequested
    ? quoteCargoInsurance({ reference: shipment.reference, declaredValue: num(shipment.declaredValue), domestic: isDomestic(shipment), version })
    : null;
  const clauses = buildClauses({
    shipment,
    exporter: shipment.exporter,
    carrier: shipment.carrier,
    buyer: shipment.buyer,
    insurance: quote
      ? { insurer: quote.insurer, quoteReference: quote.quoteReference, coverageAmount: quote.coverageAmount, premium: quote.premium, simulated: true }
      : null,
  });
  const markdown = renderContractMarkdown(shipment.reference, version, clauses);
  const preset = PRESETS[shipment.jurisdictionPreset];

  const review = await generateJson({
    system: SYSTEM,
    prompt:
      `Jurisdiction preset: ${preset.label}${preset.citation ? ` (${preset.citation})` : ""}. ` +
      `Supplier is a registered micro or small enterprise: ${shipment.exporter.msmeRegistered}.\n\n` +
      `Contract:\n${markdown}\n\nStructured clauses:\n${JSON.stringify(clauses)}`,
    schema: ContractReviewSchema,
    sample: sampleReview(clauses),
  });

  const flags: ContractFlag[] = [
    ...ruleFlags(clauses, shipment.jurisdictionPreset, shipment.insuranceRequested),
    ...review.data.flags.map((flag) => ({ ...flag, source: "ai" as const })),
  ];
  const stored: ContractReview = {
    summary: review.data.summary,
    flags,
    explanations: review.data.explanations,
    source: review.source,
    model: auditModel(review),
  };
  const blocked = flags.some((flag) => flag.severity === "BLOCKING");
  const hash = hashContent(clauses);

  const contract = await db.$transaction(async (tx) => {
    await tx.contract.updateMany({ where: { shipmentId, status: { in: ["DRAFT", "PENDING_ACCEPTANCE"] } }, data: { status: "SUPERSEDED" } });
    const created = await tx.contract.create({
      data: {
        shipmentId,
        version,
        clausesJson: clauses as Prisma.InputJsonValue,
        markdown,
        hash,
        jurisdictionPreset: shipment.jurisdictionPreset,
        creditDays: shipment.creditTermsDays,
        goodsSettlement: "INVOICE",
        flagsJson: stored as unknown as Prisma.InputJsonValue,
        status: blocked ? "DRAFT" : "PENDING_ACCEPTANCE",
      },
    });
    if (quote) {
      await tx.insurancePolicy.create({
        data: {
          shipmentId,
          contractId: created.id,
          insurerName: quote.insurer,
          quoteReference: quote.quoteReference,
          coverageAmount: quote.coverageAmount,
          premium: quote.premium,
          currency: shipment.currency,
          termsJson: { cover: quote.cover, deductible: quote.deductible, exclusions: quote.exclusions },
          status: "QUOTED",
        },
      });
    }
    await tx.shipment.update({ where: { id: shipmentId }, data: { status: "CONTRACT_PENDING" } });
    return created;
  });

  await audit({
    agent: "CONTRACT_AI",
    trigger: "user:draft_contract",
    shipmentId,
    actorUserId: actor.id,
    evidenceRefs: [`contract:${contract.id}`, ...(quote ? [`insurance-quote:${quote.quoteReference}`] : [])],
    reasoning: `${stored.summary} ${flags.length} flag(s): ${flags.map((f) => `${f.severity} ${f.clause}`).join("; ") || "none"}.`,
    proposedAction: blocked ? "Fix blocking terms before acceptance" : "Send to both parties for acceptance",
    outcome: blocked ? "BLOCKED_BY_RULE" : "PENDING_ACCEPTANCE",
    model: stored.model,
    metadata: { version, hash, insuranceQuote: quote ? { ...quote } : null },
  });
  return { version, blocked, flags: flags.length, source: review.source };
}

export async function changeCreditTerms(shipmentId: string, days: number, actor: SessionUser) {
  const shipment = await loadShipment(shipmentId);
  if (actor.businessId !== shipment.exporterId) throw new Error("Only the exporter's team changes the terms.");
  if (!Number.isInteger(days) || days < 0 || days > 365) throw new Error("Credit days must be a whole number from 0 to 365.");
  if (!["DRAFT", "CONTRACT_PENDING"].includes(shipment.status)) throw new Error("Terms are fixed once the contract is accepted.");
  await db.shipment.update({ where: { id: shipmentId }, data: { creditTermsDays: days } });
  await audit({
    agent: "OPERATOR",
    trigger: "user:change_credit_terms",
    shipmentId,
    actorUserId: actor.id,
    outcome: `Credit terms changed from Net ${shipment.creditTermsDays} to Net ${days}`,
  });
  return draftContract(shipmentId, actor);
}

export async function acceptContract(contractId: string, actor: SessionUser) {
  const contract = await db.contract.findUniqueOrThrow({
    where: { id: contractId },
    include: { shipment: true, acceptances: true, insurancePolicies: true },
  });
  const { shipment } = contract;
  const party =
    actor.businessId === shipment.exporterId && (actor.role === "EXPORTER" || actor.role === "MANAGER")
      ? "EXPORTER"
      : actor.businessId === shipment.buyerId && actor.role === "BUYER"
        ? "BUYER"
        : null;
  if (!party) throw new Error("Only the exporter and the buyer accept this contract.");
  if (contract.status !== "PENDING_ACCEPTANCE") throw new Error(`Contract version ${contract.version} is ${contract.status}.`);
  if (hasBlockingFlag(contract.flagsJson)) throw new Error("This version has a blocking flag and cannot be accepted.");
  if (contract.acceptances.some((a) => a.party === party)) throw new Error(`The ${party.toLowerCase()} has already accepted.`);

  await db.contractAcceptance.create({ data: { contractId, party, userId: actor.id, hash: contract.hash } });
  const accepted = new Set([...contract.acceptances.map((a) => a.party), party]);
  const complete = accepted.has("EXPORTER") && accepted.has("BUYER");

  if (complete) {
    await db.$transaction([
      db.contract.update({ where: { id: contractId }, data: { status: "ACCEPTED", finalisedAt: new Date() } }),
      db.shipment.update({ where: { id: shipment.id }, data: { status: "CONTRACTED" } }),
      // Both parties accepted the contract that names this quote: the (simulated) policy is bound.
      db.insurancePolicy.updateMany({ where: { contractId, status: "QUOTED" }, data: { status: "ACTIVE" } }),
    ]);
  }
  await audit({
    agent: "OPERATOR",
    trigger: "user:accept_contract",
    shipmentId: shipment.id,
    actorUserId: actor.id,
    evidenceRefs: [`contract:${contractId}`],
    outcome: complete
      ? `Accepted by ${party}; both parties have accepted hash ${contract.hash.slice(0, 12)}. Contract final.`
      : `Accepted by ${party} (hash ${contract.hash.slice(0, 12)}); waiting for the other party.`,
  });
  return { party, complete };
}
