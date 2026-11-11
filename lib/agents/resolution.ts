// Resolution AI (plan Section 6.4, v2 refund and dispute agents). Compares a refund request or a PayPal dispute
// with the contract, the delivery evidence and the insurance cover; recommends; a person approves every refund,
// every dispute response and every insurance claim.

import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { audit } from "@/lib/agents/audit";
import { recordTrust } from "@/lib/agents/trust";
import { proposeAction } from "@/lib/approvals";
import type { ContractClauses } from "@/lib/contracts/schema";
import { addDays } from "@/lib/credit-clock";
import { db } from "@/lib/db";
import { day, money, num, round2 } from "@/lib/format";
import { decideClaim } from "@/lib/insurer-sim";
import { auditModel, generateJson } from "@/lib/llm";
import { getDispute, listDisputes, refundCapture, respondToDispute, type DisputeSummary } from "@/lib/paypal/api";
import { paypalConfigured } from "@/lib/paypal/client";
import type { SessionUser } from "@/lib/session";

const RecommendationSchema = z.object({
  decision: z.enum(["FULL", "PARTIAL", "NONE", "INVESTIGATE"]),
  amount: z.number().nonnegative(),
  reasoning: z.string().describe("3-5 sentences a non-lawyer can follow, citing the evidence ids"),
  contractClausesCited: z.array(z.string()),
  evidenceRefs: z.array(z.string()).describe("Ids from the evidence list only"),
  contradictions: z.array(z.string()),
  missingEvidence: z.array(z.string()),
  insuranceAssessment: z.string(),
  confidence: z.number().min(0).max(1),
});

const SYSTEM = `You are Resolution AI inside Proof2Pay. You assess a B2B buyer's refund request or payment dispute against the
signed contract and the delivery evidence. Be fair to both sides. Cite only evidence ids you were given. Never promise an outcome,
never call anyone fraudulent, never claim insurance cover beyond the simulated policy shown. If the evidence is insufficient or
contradictory, recommend INVESTIGATE. A refund for damage should normally be the pro-rata contract value of the damaged units
recorded at delivery, unless the contract or evidence says otherwise.`;

async function loadCase(shipmentId: string) {
  return db.shipment.findUniqueOrThrow({
    where: { id: shipmentId },
    include: {
      buyer: true,
      exporter: true,
      carrier: true,
      contracts: { where: { status: "ACCEPTED" }, take: 1 },
      verificationReports: { orderBy: { createdAt: "desc" }, take: 1 },
      deliveryEvidence: { select: { id: true, type: true, fileName: true } },
      paypalInvoices: true,
      insurancePolicies: { where: { status: "ACTIVE" } },
      paypalTrackings: true,
    },
  });
}

type Case = Awaited<ReturnType<typeof loadCase>>;

function evidenceList(c: Case) {
  const contract = c.contracts[0];
  const report = c.verificationReports[0];
  const invoice = c.paypalInvoices.find((i) => i.paidAt) ?? c.paypalInvoices[0];
  const clauses = contract?.clausesJson as unknown as ContractClauses | undefined;
  return {
    items: [
      ...(contract && clauses
        ? [
            { id: `contract:${contract.id}#3`, what: "Contract section 3, liability", text: `${clauses.liability.goodsSafety} Carrier liability limit ${clauses.liability.carrierLiabilityLimit}. ${clauses.liability.notes}` },
            { id: `contract:${contract.id}#4`, what: "Contract section 4, delivery conditions", text: `${clauses.delivery.conditionStandard} Acceptable POD: ${clauses.delivery.acceptablePod}` },
            { id: `contract:${contract.id}#7`, what: "Contract section 7, insurance", text: clauses.insurance ? `Simulated insurer, cover ${clauses.insurance.coverageAmount}` : "No insurance" },
            { id: `contract:${contract.id}#8`, what: "Contract section 8, disputes", text: `Objection window ${clauses.disputes.objectionWindowDays} days. ${clauses.disputes.evidenceRules}` },
          ]
        : []),
      ...(report
        ? [{ id: `verification:${report.id}`, what: "Delivery verification report", text: `${report.status} (confidence ${report.confidence}). ${report.summary} Discrepancies: ${JSON.stringify(report.discrepancies)}. Extracted: ${JSON.stringify(report.extractedJson)}` }]
        : []),
      ...c.deliveryEvidence.map((e) => ({ id: `${e.type.toLowerCase()}:${e.id}`, what: `${e.type} file ${e.fileName}`, text: "Read by Delivery AI; see verification report" })),
      ...(invoice ? [{ id: `invoice:${invoice.id}`, what: "Invoice", text: `${invoice.invoiceNumber}, ${money(invoice.amount, invoice.currency)}, status ${invoice.status}, paid ${day(invoice.paidAt)}` }] : []),
      ...c.paypalTrackings.map((t) => ({ id: `tracking:${t.id}`, what: "PayPal tracking", text: `${t.trackingNumber} ${t.status} on transaction ${t.transactionId}` })),
    ],
    unitValue: round2(num(c.declaredValue) / c.quantity),
    invoice,
    report,
  };
}

function sampleRecommendation(c: Case, requested: number, ev: ReturnType<typeof evidenceList>): z.infer<typeof RecommendationSchema> {
  const damaged = ((ev.report?.extractedJson as { damagedUnits?: number } | null)?.damagedUnits ?? 0) || 0;
  const amount = Math.min(requested, round2(damaged * ev.unitValue));
  const contractId = c.contracts[0]?.id;
  return {
    decision: damaged ? (amount >= requested ? "FULL" : "PARTIAL") : "INVESTIGATE",
    amount: damaged ? amount : 0,
    reasoning: damaged
      ? `The verification report records ${damaged} damaged ${c.unit.replace(/s$/, "")} at delivery, noted on the POD. Section 4 requires all ${c.quantity} ${c.unit} intact, so the buyer's claim is supported for the damaged unit(s). At the contract value of ${money(ev.unitValue, c.currency)} per ${c.unit.replace(/s$/, "")}, the substantiated loss is ${money(amount, c.currency)}${amount < requested ? `, below the ${money(requested, c.currency)} requested` : ""}.`
      : "No damage or shortage was recorded at delivery, so the claim cannot be assessed from the record. A person should review it with the buyer.",
    contractClausesCited: contractId ? ["4. Delivery conditions", "8. Disputes"] : [],
    evidenceRefs: [ev.report ? `verification:${ev.report.id}` : "", contractId ? `contract:${contractId}#4` : ""].filter(Boolean),
    contradictions: amount < requested && damaged ? [`Requested ${money(requested, c.currency)} exceeds the pro-rata value of the units recorded as damaged.`] : [],
    missingEvidence: damaged ? [] : ["Photos or a POD remark showing the damage"],
    insuranceAssessment: c.insurancePolicies[0] ? "Damage recorded at delivery falls within the simulated all-risks transit cover." : "No active policy.",
    confidence: damaged ? 0.84 : 0.4,
  };
}

export async function requestRefund(shipmentId: string, input: { amount: number; reason: string }, actor: SessionUser) {
  const shipment = await db.shipment.findUniqueOrThrow({ where: { id: shipmentId }, include: { paypalInvoices: true } });
  if (actor.businessId !== shipment.buyerId) throw new Error("Only the buyer requests a refund.");
  const paid = shipment.paypalInvoices.find((i) => i.paidAt && i.channel === "PAYPAL");
  if (!paid) throw new Error("A refund needs a PayPal payment on this shipment.");
  if (!(input.amount > 0) || input.amount > num(paid.amount)) throw new Error(`Enter an amount up to ${money(paid.amount, paid.currency)}.`);
  if (input.reason.trim().length < 10) throw new Error("Describe the problem in a sentence.");
  const request = await db.refundRequest.create({
    data: { shipmentId, requestedById: actor.id, amount: input.amount, currency: paid.currency, reason: input.reason.trim() },
  });
  await audit({ agent: "OPERATOR", trigger: "user:request_refund", shipmentId, actorUserId: actor.id, evidenceRefs: [`refund-request:${request.id}`], outcome: `Buyer requested ${money(input.amount, paid.currency)}: ${input.reason.trim()}` });
  return recommendRefund(request.id);
}

export async function recommendRefund(refundRequestId: string) {
  const request = await db.refundRequest.findUniqueOrThrow({ where: { id: refundRequestId } });
  const c = await loadCase(request.shipmentId);
  const ev = evidenceList(c);
  const requested = num(request.amount);
  const result = await generateJson({
    system: SYSTEM,
    prompt:
      `Refund request: ${money(requested, request.currency)}. Buyer's reason: "${request.reason}".\n` +
      `Contract value per ${c.unit.replace(/s$/, "")}: ${money(ev.unitValue, c.currency)} (${c.quantity} ${c.unit}, ${money(c.declaredValue, c.currency)}).\n` +
      `Evidence:\n${ev.items.map((e) => `- [${e.id}] ${e.what}: ${e.text}`).join("\n")}`,
    schema: RecommendationSchema,
    sample: sampleRecommendation(c, requested, ev),
  });
  const known = new Set(ev.items.map((e) => e.id));
  const rec = result.data;
  // Guardrails: never above the request or the payment; NONE and INVESTIGATE carry no amount.
  const ceiling = Math.min(requested, num(ev.invoice?.amount ?? requested));
  const amount = rec.decision === "NONE" || rec.decision === "INVESTIGATE" ? 0 : round2(Math.min(rec.amount, ceiling));
  const evidenceRefs = rec.evidenceRefs.filter((ref) => known.has(ref));

  const recommendation = await db.recommendation.create({
    data: {
      shipmentId: c.id,
      refundRequestId,
      decision: rec.decision,
      amount,
      currency: request.currency,
      reasoning: rec.reasoning,
      evidenceRefs,
      contractClausesCited: rec.contractClausesCited,
      confidence: rec.confidence,
    },
  });
  await db.refundRequest.update({ where: { id: refundRequestId }, data: { status: "RECOMMENDED" } });
  const details = { contradictions: rec.contradictions, missingEvidence: rec.missingEvidence, insuranceAssessment: rec.insuranceAssessment };

  if (amount > 0) {
    await proposeAction({
      agent: "RESOLUTION_AI",
      actionType: "REFUND",
      shipmentId: c.id,
      summary: `Refund ${money(amount, request.currency)} to ${c.buyer.name} for ${c.reference} (${rec.decision.toLowerCase()}; ${money(requested, request.currency)} requested)`,
      payload: { refundRequestId, recommendationId: recommendation.id, amount, currency: request.currency, ...details } as Prisma.InputJsonValue,
      reasoning: rec.reasoning,
      trigger: `refund-request:${refundRequestId}`,
      model: auditModel(result),
      confidence: rec.confidence,
      evidenceRefs,
    });
  } else {
    await audit({
      agent: "RESOLUTION_AI",
      trigger: `refund-request:${refundRequestId}`,
      shipmentId: c.id,
      evidenceRefs,
      reasoning: rec.reasoning,
      proposedAction: rec.decision === "INVESTIGATE" ? "A person reviews the case with the buyer" : "Decline the refund",
      confidence: rec.confidence,
      outcome: rec.decision,
      model: auditModel(result),
      metadata: details,
    });
  }
  return { decision: rec.decision, amount, source: result.source };
}

/** Executes an approved REFUND through PayPal Payments v2 on the invoice's payment transaction. */
export async function executeRefund(approvalId: string, payload: { refundRequestId: string; amount: number; currency: string }, actor: SessionUser) {
  const request = await db.refundRequest.findUniqueOrThrow({ where: { id: payload.refundRequestId }, include: { shipment: { include: { paypalInvoices: true, buyer: true, insurancePolicies: { where: { status: "ACTIVE" } }, verificationReports: { orderBy: { createdAt: "desc" }, take: 1 } } } } });
  const invoice = request.shipment.paypalInvoices.find((i) => i.paidAt && i.paymentReference);
  if (!invoice?.paymentReference) throw new Error("No PayPal payment transaction to refund.");
  const refund = await refundCapture({
    captureId: invoice.paymentReference,
    amount: payload.amount,
    currency: payload.currency,
    noteToPayer: `Refund for ${request.shipment.reference}: ${request.reason}`,
    idempotencyKey: `refund-${approvalId}`,
  });
  await db.payPalRefund.create({
    data: { paypalRefundId: refund.id, invoiceId: invoice.id, refundRequestId: request.id, amount: payload.amount, currency: payload.currency, status: refund.status, reason: request.reason, raw: refund.raw as Prisma.InputJsonValue },
  });
  await db.refundRequest.update({ where: { id: request.id }, data: { status: "EXECUTED" } });
  await audit({
    agent: "RESOLUTION_AI",
    trigger: `approval:${approvalId}`,
    shipmentId: request.shipmentId,
    actorUserId: actor.id,
    approvalRequestId: approvalId,
    evidenceRefs: [`paypal-refund:${refund.id}`],
    outcome: `${refund.mocked ? "PayPal mocked: " : ""}Refund ${money(payload.amount, payload.currency)} ${refund.status} on PayPal transaction ${invoice.paymentReference} (refund ${refund.id})`,
  });
  await recordTrust([request.shipment.carrierId], `refund:${refund.id}`);

  // Recover the loss from the (simulated) insurer: a person approves the claim too.
  const policy = request.shipment.insurancePolicies[0];
  if (policy) {
    await proposeAction({
      agent: "RESOLUTION_AI",
      actionType: "INSURANCE_CLAIM",
      shipmentId: request.shipmentId,
      summary: `Claim ${money(payload.amount, payload.currency)} from ${policy.insurerName} (simulated) for ${request.shipment.reference}`,
      payload: { policyId: policy.id, amount: payload.amount, reason: request.reason, refundId: refund.id },
      reasoning: `The refund of ${money(payload.amount, payload.currency)} compensates damage recorded at delivery, which the policy covers (all risks in transit). Claim evidence: verification report, POD, refund record.`,
      trigger: `refund:${refund.id}`,
      evidenceRefs: [`insurance-policy:${policy.id}`, `paypal-refund:${refund.id}`],
    });
  }
  return { refundId: refund.id, mocked: refund.mocked };
}

export async function executeInsuranceClaim(approvalId: string, payload: { policyId: string; amount: number; reason: string }, actor: SessionUser) {
  const policy = await db.insurancePolicy.findUniqueOrThrow({ where: { id: payload.policyId }, include: { shipment: { include: { verificationReports: { orderBy: { createdAt: "desc" }, take: 1 } } } } });
  const report = policy.shipment.verificationReports[0];
  const damageRecorded = Boolean((report?.discrepancies as { field: string }[] | undefined)?.some((d) => d.field === "condition"));
  const terms = policy.termsJson as { deductible?: number } | null;
  const decision = decideClaim({
    policyActive: policy.status === "ACTIVE",
    coverageAmount: num(policy.coverageAmount),
    deductible: terms?.deductible ?? 0,
    amountClaimed: payload.amount,
    damageRecordedAtDelivery: damageRecorded,
  });
  const claim = await db.insuranceClaim.create({
    data: {
      policyId: policy.id,
      claimReference: `SIM-C-${policy.shipment.reference.replace("SH-", "")}-${Date.now().toString(36).toUpperCase()}`,
      amountClaimed: payload.amount,
      amountApproved: decision.amountApproved,
      reason: payload.reason,
      status: decision.status,
      decisionNote: decision.note,
      decidedAt: new Date(),
    },
  });
  await audit({
    agent: "RESOLUTION_AI",
    trigger: `approval:${approvalId}`,
    shipmentId: policy.shipmentId,
    actorUserId: actor.id,
    approvalRequestId: approvalId,
    evidenceRefs: [`insurance-claim:${claim.id}`],
    outcome: `Simulated insurer: claim ${claim.claimReference} ${decision.status}, ${money(decision.amountApproved, policy.currency)}. ${decision.note}`,
  });
  return claim.id;
}

// ---------------------------------------------------------------------------
// Disputes
// ---------------------------------------------------------------------------

async function upsertDispute(d: DisputeSummary, trigger: string) {
  const invoice = d.sellerTransactionId ? await db.payPalInvoice.findFirst({ where: { paymentReference: d.sellerTransactionId } }) : null;
  const existing = await db.payPalDispute.findUnique({ where: { paypalDisputeId: d.id } });
  const data = {
    shipmentId: invoice?.shipmentId ?? existing?.shipmentId ?? null,
    reason: d.reason,
    status: d.status,
    disputeAmount: d.amount,
    currency: d.currency,
    disputedTransactionId: d.sellerTransactionId,
    responseDueAt: d.responseDueAt,
    outcome: d.outcome,
    openedAt: d.openedAt,
    resolvedAt: d.status === "RESOLVED" ? new Date() : null,
    raw: d.raw as Prisma.InputJsonValue,
  };
  const dispute = existing
    ? await db.payPalDispute.update({ where: { id: existing.id }, data })
    : await db.payPalDispute.create({ data: { paypalDisputeId: d.id, ...data } });
  if (dispute.shipmentId && !existing && d.status !== "RESOLVED") {
    await db.shipment.update({ where: { id: dispute.shipmentId }, data: { status: "DISPUTED" } });
  }
  if (!existing || existing.status !== d.status) {
    await audit({
      agent: "WEBHOOK",
      trigger,
      shipmentId: dispute.shipmentId,
      evidenceRefs: [`dispute:${dispute.id}`],
      outcome: `PayPal dispute ${d.id}: ${d.reason}, status ${d.status}${d.amount ? `, ${money(d.amount, d.currency)}` : ""}${dispute.shipmentId ? "" : " (no matching shipment)"}`,
    });
  }
  return dispute;
}

export async function syncDispute(paypalDisputeId: string, trigger: string) {
  return upsertDispute(await getDispute(paypalDisputeId), trigger);
}

export async function syncDisputes(trigger: string) {
  if (!paypalConfigured()) throw new Error("PayPal sandbox keys are not set (mocked mode): use the labelled dispute replay instead.");
  const disputes = await listDisputes();
  for (const d of disputes) await upsertDispute(d, trigger);
  return disputes.length;
}

/** DEMO_MODE replay (plan Section 14): a recorded dispute, labelled simulated, so the demo never depends on sandbox dispute creation. */
export async function simulateDispute(shipmentId: string, actor: SessionUser) {
  if (process.env.DEMO_MODE !== "true") throw new Error("Dispute replay is available only in DEMO_MODE.");
  const shipment = await db.shipment.findUniqueOrThrow({ where: { id: shipmentId }, include: { paypalInvoices: true, buyer: true } });
  if (actor.businessId !== shipment.buyerId) throw new Error("Switch to the buyer to open a dispute.");
  const invoice = shipment.paypalInvoices.find((i) => i.paidAt && i.channel === "PAYPAL");
  if (!invoice) throw new Error("A dispute needs a PayPal payment.");
  const dispute = await db.payPalDispute.create({
    data: {
      shipmentId,
      paypalDisputeId: `SIM-DISPUTE-${Date.now().toString(36).toUpperCase()}`,
      reason: "MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED",
      status: "WAITING_FOR_SELLER_RESPONSE",
      disputeAmount: 400,
      currency: invoice.currency,
      disputedTransactionId: invoice.paymentReference,
      responseDueAt: addDays(new Date(), 10),
      openedAt: new Date(),
      simulated: true,
      raw: { replay: true, claim: "One carton arrived dented and two parts inside are scratched; we ask for $400." },
    },
  });
  await db.shipment.update({ where: { id: shipmentId }, data: { status: "DISPUTED" } });
  await audit({ agent: "WEBHOOK", trigger: "replay:CUSTOMER.DISPUTE.CREATED", shipmentId, actorUserId: actor.id, evidenceRefs: [`dispute:${dispute.id}`], outcome: "Replayed dispute (simulated, labelled): item not as described, $400" });
  return dispute.id;
}

const DisputeResponseSchema = z.object({
  summary: z.string(),
  timeline: z.array(z.object({ date: z.string(), event: z.string(), source: z.string() })),
  contradictions: z.array(z.string()),
  missingEvidence: z.array(z.string()),
  recommendedResponse: z.enum(["PROVIDE_EVIDENCE", "OFFER_PARTIAL_REFUND", "ACCEPT_CLAIM"]),
  offerAmount: z.number().nonnegative(),
  notesToPayPal: z.string().describe("Seller's response to PayPal, under 1500 characters, factual, citing the records"),
  confidence: z.number().min(0).max(1),
});

export async function prepareDisputeResponse(disputeId: string, actor: SessionUser) {
  if (actor.role !== "MANAGER" && actor.role !== "EXPORTER") throw new Error("Only the exporter's operators prepare dispute responses.");
  const dispute = await db.payPalDispute.findUniqueOrThrow({ where: { id: disputeId } });
  if (!dispute.shipmentId) throw new Error("This dispute is not linked to a shipment.");
  const c = await loadCase(dispute.shipmentId);
  const ev = evidenceList(c);
  const refunds = await db.payPalRefund.findMany({ where: { invoice: { shipmentId: c.id } } });
  const claim = (dispute.raw as { claim?: string } | null)?.claim ?? dispute.reason;
  const refunded = refunds.reduce((sum, r) => sum + num(r.amount), 0);
  const damaged = ((ev.report?.extractedJson as { damagedUnits?: number } | null)?.damagedUnits ?? 0) || 0;

  const result = await generateJson({
    system: SYSTEM + " Now prepare the seller's response to a PayPal dispute: a timeline, contradictions, missing evidence and the response notes.",
    prompt:
      `Dispute ${dispute.paypalDisputeId}: reason ${dispute.reason}, amount ${money(dispute.disputeAmount, dispute.currency)}. Buyer's claim: "${claim}".\n` +
      `Refunds already made on this shipment: ${money(refunded, dispute.currency)}.\nEvidence:\n${ev.items.map((e) => `- [${e.id}] ${e.what}: ${e.text}`).join("\n")}`,
    schema: DisputeResponseSchema,
    sample: {
      summary: `The buyer disputes ${money(dispute.disputeAmount, dispute.currency)} for damage. The record shows ${damaged} damaged unit(s) noted at delivery${refunded ? ` and a ${money(refunded, dispute.currency)} refund already paid` : ""}.`,
      timeline: [
        { date: day(c.contracts[0]?.finalisedAt), event: "Contract accepted by exporter and buyer", source: "contract" },
        { date: day(c.deliveredAt), event: `Delivered; POD records ${damaged} damaged unit(s)`, source: ev.report ? `verification:${ev.report.id}` : "POD" },
        { date: day(ev.invoice?.paidAt), event: "Invoice paid through PayPal", source: ev.invoice ? `invoice:${ev.invoice.id}` : "invoice" },
        ...(refunded ? [{ date: day(refunds[0].createdAt), event: `Partial refund ${money(refunded, dispute.currency)}`, source: `paypal-refund:${refunds[0].paypalRefundId}` }] : []),
      ],
      contradictions: damaged === 1 ? ["The claim mentions scratched parts, but the POD records one dented carton and no damage to contents."] : [],
      missingEvidence: ["Buyer photos of the scratched parts"],
      recommendedResponse: refunded ? "PROVIDE_EVIDENCE" : "OFFER_PARTIAL_REFUND",
      offerAmount: refunded ? 0 : round2(damaged * ev.unitValue),
      notesToPayPal:
        `Shipment ${c.reference}: delivery was verified against a signed POD naming the buyer, with ${damaged} carton(s) noted as dented and contents not reported damaged. ` +
        (refunded ? `We have already refunded ${money(refunded, dispute.currency)}, the pro-rata contract value of the damaged carton. ` : `We offer the pro-rata contract value of the damaged carton. `) +
        `Tracking ${c.carrierTrackingNumber ?? ""} shows the shipment delivered. The contract (hash ${c.contracts[0]?.hash.slice(0, 12)}) required damage to be noted at delivery.`,
      confidence: 0.8,
    },
  });
  const r = result.data;
  const markdown = [
    `# Dispute evidence pack: ${c.reference}`,
    ``,
    `> Prepared by Proof2Pay Resolution AI for review. Nothing is sent to PayPal until an operator approves it.`,
    ``,
    `**Dispute:** ${dispute.paypalDisputeId}${dispute.simulated ? " (replayed, simulated)" : ""}, ${dispute.reason}, ${money(dispute.disputeAmount, dispute.currency)}. **Buyer's claim:** ${claim}`,
    ``,
    `## Summary`,
    r.summary,
    ``,
    `## Timeline`,
    ...r.timeline.map((t) => `- **${t.date}:** ${t.event} _(source: ${t.source})_`),
    ``,
    `## Contradictions`,
    ...(r.contradictions.length ? r.contradictions.map((x) => `- ${x}`) : ["- None found"]),
    ``,
    `## Missing evidence`,
    ...(r.missingEvidence.length ? r.missingEvidence.map((x) => `- ${x}`) : ["- None"]),
    ``,
    `## Recommended response: ${r.recommendedResponse.replace(/_/g, " ").toLowerCase()}${r.offerAmount ? ` (${money(r.offerAmount, dispute.currency)})` : ""}`,
    ``,
    `### Notes to PayPal`,
    r.notesToPayPal,
    ``,
    `## Evidence index`,
    ...ev.items.map((e) => `- \`${e.id}\`: ${e.what}`),
  ].join("\n");

  const pack = await db.evidencePack.create({
    data: {
      shipmentId: c.id,
      disputeId,
      kind: "DISPUTE_RESPONSE",
      status: "READY",
      markdown,
      filesJson: ev.items.map((e) => ({ label: e.what, ref: e.id })),
    },
  });
  await db.recommendation.create({
    data: {
      shipmentId: c.id,
      disputeId,
      decision: r.recommendedResponse === "ACCEPT_CLAIM" ? "FULL" : r.offerAmount > 0 ? "PARTIAL" : "NONE",
      amount: r.offerAmount,
      currency: dispute.currency,
      reasoning: r.summary,
      evidenceRefs: ev.items.map((e) => e.id),
      contractClausesCited: ["4. Delivery conditions", "8. Disputes"],
      confidence: r.confidence,
    },
  });
  await proposeAction({
    agent: "RESOLUTION_AI",
    actionType: "DISPUTE_EVIDENCE",
    shipmentId: c.id,
    summary: `Send dispute response for ${dispute.paypalDisputeId} (${r.recommendedResponse.replace(/_/g, " ").toLowerCase()})`,
    payload: { disputeId, packId: pack.id, notes: r.notesToPayPal, trackingNumber: c.carrierTrackingNumber, carrierName: c.carrier.name },
    reasoning: r.summary,
    trigger: `user:prepare_dispute_response`,
    model: auditModel(result),
    confidence: r.confidence,
    evidenceRefs: [`evidence-pack:${pack.id}`],
  });
  return pack.id;
}

export async function executeDisputeResponse(
  approvalId: string,
  payload: { disputeId: string; packId: string; notes: string; trackingNumber: string | null; carrierName: string },
  actor: SessionUser,
) {
  const dispute = await db.payPalDispute.findUniqueOrThrow({ where: { id: payload.disputeId } });
  const result = await respondToDispute({ disputeId: dispute.paypalDisputeId, notes: payload.notes, trackingNumber: payload.trackingNumber, carrierName: payload.carrierName });
  await db.evidencePack.update({ where: { id: payload.packId }, data: { status: "SUBMITTED", submittedAt: new Date() } });
  await db.payPalDispute.update({ where: { id: dispute.id }, data: { status: result.method === "mock" ? "UNDER_REVIEW" : dispute.status } });
  await audit({
    agent: "RESOLUTION_AI",
    trigger: `approval:${approvalId}`,
    shipmentId: dispute.shipmentId,
    actorUserId: actor.id,
    approvalRequestId: approvalId,
    evidenceRefs: [`evidence-pack:${payload.packId}`, `dispute:${dispute.id}`],
    outcome:
      result.method === "mock"
        ? `Simulated dispute: response recorded (not sent to PayPal)`
        : `Response sent to PayPal dispute ${dispute.paypalDisputeId} via ${result.method}`,
    metadata: { raw: result.raw } as Prisma.InputJsonValue,
  });
  return result.method;
}

