// Approval requests (plan Section 0, rule 7): agents propose, a person approves. Execution lives in lib/agents/execute.ts.

import type { ApprovalActionType, AuditAgent, Prisma } from "@/generated/prisma/client";
import { audit } from "@/lib/agents/audit";
import { db } from "@/lib/db";

export async function proposeAction(input: {
  agent: AuditAgent;
  actionType: ApprovalActionType;
  shipmentId: string;
  summary: string;
  payload: Prisma.InputJsonValue;
  reasoning: string;
  trigger: string;
  model?: string | null;
  confidence?: number | null;
  evidenceRefs?: string[];
}) {
  const approval = await db.approvalRequest.create({
    data: {
      agent: input.agent,
      actionType: input.actionType,
      shipmentId: input.shipmentId,
      summary: input.summary,
      payload: input.payload,
    },
  });
  await audit({
    agent: input.agent,
    trigger: input.trigger,
    shipmentId: input.shipmentId,
    reasoning: input.reasoning,
    proposedAction: input.summary,
    confidence: input.confidence,
    evidenceRefs: input.evidenceRefs,
    approvalRequestId: approval.id,
    model: input.model,
    outcome: "AWAITING_APPROVAL",
  });
  return approval;
}
