// Operator decision on an ApprovalRequest, and execution of approved actions. Nothing an agent proposes
// reaches PayPal (or the simulated insurer) without passing through here.

import type { Prisma } from "@/generated/prisma/client";
import { audit } from "@/lib/agents/audit";
import { executeInvoiceSend, type InvoiceProposal } from "@/lib/agents/payment";
import { executeDisputeResponse, executeInsuranceClaim, executeRefund } from "@/lib/agents/resolution";
import { db } from "@/lib/db";
import { canApprove, type SessionUser } from "@/lib/session";

export async function decideApproval(approvalId: string, approve: boolean, note: string, actor: SessionUser) {
  if (!canApprove(actor)) throw new Error("Switch to the exporter or the finance manager to approve.");
  const approval = await db.approvalRequest.findUniqueOrThrow({ where: { id: approvalId } });
  if (approval.status !== "PENDING" && approval.status !== "FAILED") throw new Error(`Already ${approval.status.toLowerCase()}.`);

  await db.approvalRequest.update({
    where: { id: approvalId },
    data: { status: approve ? "APPROVED" : "REJECTED", decidedById: actor.id, decidedAt: new Date(), decisionNote: note || null },
  });
  await audit({
    agent: "OPERATOR",
    trigger: `approval:${approvalId}`,
    shipmentId: approval.shipmentId,
    actorUserId: actor.id,
    approvalRequestId: approvalId,
    outcome: `${approve ? "Approved" : "Rejected"}: ${approval.summary}${note ? ` (${note})` : ""}`,
  });
  if (!approve) {
    if (approval.actionType === "REFUND") {
      const payload = approval.payload as { refundRequestId?: string };
      if (payload.refundRequestId) await db.refundRequest.update({ where: { id: payload.refundRequestId }, data: { status: "REJECTED" } });
    }
    return "Rejected";
  }

  try {
    const payload = approval.payload as unknown;
    let result: unknown;
    switch (approval.actionType) {
      case "INVOICE_SEND":
        result = await executeInvoiceSend(approvalId, payload as InvoiceProposal, actor);
        break;
      case "REFUND":
        result = await executeRefund(approvalId, payload as { refundRequestId: string; amount: number; currency: string }, actor);
        break;
      case "INSURANCE_CLAIM":
        result = await executeInsuranceClaim(approvalId, payload as { policyId: string; amount: number; reason: string }, actor);
        break;
      case "DISPUTE_EVIDENCE":
        result = await executeDisputeResponse(
          approvalId,
          payload as { disputeId: string; packId: string; notes: string; trackingNumber: string | null; carrierName: string },
          actor,
        );
        break;
      default:
        throw new Error(`No executor for ${approval.actionType}`);
    }
    await db.approvalRequest.update({
      where: { id: approvalId },
      data: { status: "EXECUTED", executedAt: new Date(), executionResult: (result ?? {}) as Prisma.InputJsonValue },
    });
    return "Approved and executed";
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db.approvalRequest.update({ where: { id: approvalId }, data: { status: "FAILED", executionResult: { error: message } } });
    await audit({ agent: "SYSTEM", trigger: `approval:${approvalId}`, shipmentId: approval.shipmentId, approvalRequestId: approvalId, outcome: `Execution failed: ${message}` });
    throw new Error(`Approved, but execution failed: ${message}`);
  }
}
