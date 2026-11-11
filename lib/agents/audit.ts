// AuditEvent writer (plan Section 0, rule 6). Every agent action, operator decision and webhook goes through here.

import type { AuditAgent, Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";

export interface AuditInput {
  agent: AuditAgent;
  trigger: string;
  shipmentId?: string | null;
  actorUserId?: string | null;
  evidenceRefs?: string[];
  reasoning?: string | null;
  proposedAction?: string | null;
  confidence?: number | null;
  outcome?: string | null;
  approvalRequestId?: string | null;
  model?: string | null;
  metadata?: Prisma.InputJsonValue;
}

export async function audit(input: AuditInput) {
  return db.auditEvent.create({
    data: {
      agent: input.agent,
      trigger: input.trigger,
      shipmentId: input.shipmentId ?? null,
      actorUserId: input.actorUserId ?? null,
      evidenceRefs: input.evidenceRefs ?? [],
      reasoning: input.reasoning ?? null,
      proposedAction: input.proposedAction ?? null,
      confidence: input.confidence ?? null,
      outcome: input.outcome ?? null,
      approvalRequestId: input.approvalRequestId ?? null,
      model: input.model ?? null,
      metadata: input.metadata,
    },
  });
}
