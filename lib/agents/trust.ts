// Trust AI (plan Section 6.5 / 11). Loads verified events and computes the profile with lib/trust-score.
// Every recorded change writes a TrustScore snapshot and an AuditEvent.

import type { Prisma } from "@/generated/prisma/client";
import { audit } from "@/lib/agents/audit";
import { db } from "@/lib/db";
import { num } from "@/lib/format";
import { carrierMetrics, payerMetrics, type CarrierDelivery } from "@/lib/trust-score";

export async function computeProfile(businessId: string) {
  const business = await db.business.findUniqueOrThrow({ where: { id: businessId } });
  const now = new Date();

  const invoices = business.isBuyer
    ? await db.payPalInvoice.findMany({ where: { shipment: { buyerId: businessId }, purpose: "GOODS" }, include: { creditClock: true } })
    : [];
  const payerDisputes = business.isBuyer ? await db.payPalDispute.findMany({ where: { shipment: { buyerId: businessId } } }) : [];
  const payer = business.isBuyer
    ? payerMetrics(
        invoices
          .filter((invoice) => invoice.dueDate)
          .map((invoice) => ({
            dueDate: invoice.creditClock?.dueDate ?? invoice.dueDate!,
            paidAt: invoice.paidAt,
            amount: num(invoice.amount),
            currency: invoice.currency,
            channel: invoice.channel,
          })),
        payerDisputes.map((d) => ({ outcome: d.outcome })),
        now,
      )
    : null;

  let carrier = null;
  if (business.isCarrier) {
    const shipments = await db.shipment.findMany({
      where: { carrierId: businessId },
      include: { verificationReports: { orderBy: { createdAt: "desc" }, take: 1 }, refundRequests: { where: { status: "EXECUTED" } }, paypalDisputes: true },
    });
    const deliveries: CarrierDelivery[] = shipments
      .filter((s) => s.verificationReports[0])
      .map((s) => {
        const report = s.verificationReports[0];
        const discrepancies = report.discrepancies as { field: string; severity: string }[];
        return {
          status: report.status,
          substantiatedDamage: discrepancies.some((d) => d.field === "condition" && d.severity === "MAJOR") || s.refundRequests.length > 0,
        };
      });
    carrier = carrierMetrics(deliveries, shipments.flatMap((s) => s.paypalDisputes).map((d) => ({ outcome: d.outcome })));
  }
  return { business, payer, carrier };
}

/** Recomputes and records profiles after a verified event. */
export async function recordTrust(businessIds: string[], trigger: string) {
  for (const businessId of [...new Set(businessIds)]) {
    const { business, payer, carrier } = await computeProfile(businessId);
    for (const [role, metrics] of [["PAYER", payer], ["CARRIER", carrier]] as const) {
      if (!metrics) continue;
      const basis = role === "PAYER" ? payer!.verifiedPayments : carrier!.documentedDeliveries;
      const score = await db.trustScore.create({
        data: { businessId, subjectRole: role, metricsJson: metrics as unknown as Prisma.InputJsonValue, confidence: metrics.confidence, basisTransactionCount: basis },
      });
      await audit({
        agent: "TRUST_AI",
        trigger,
        evidenceRefs: [`trust-score:${score.id}`],
        reasoning: `Recomputed ${role.toLowerCase()} profile for ${business.name} from ${basis} verified events.`,
        outcome: `Confidence ${metrics.confidence}`,
      });
    }
  }
}
