import { AuditGrid, type AuditRow } from "@/components/grids";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const ist = (d: Date) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(d);

export default async function AuditPage() {
  const events = await db.auditEvent.findMany({
    where: { trigger: { not: "seed:historical" } },
    orderBy: { createdAt: "desc" },
    take: 1000,
    include: { shipment: { select: { reference: true } }, actorUser: { select: { name: true } } },
  });
  const rows: AuditRow[] = events.map((e) => ({
    id: e.id,
    createdAt: ist(e.createdAt),
    agent: e.agent,
    trigger: e.trigger,
    shipmentId: e.shipmentId,
    reference: e.shipment?.reference ?? null,
    actor: e.actorUser?.name ?? null,
    outcome: [e.outcome, e.proposedAction && `Proposed: ${e.proposedAction}`].filter(Boolean).join(" · "),
    reasoning: e.reasoning ?? "",
    model: e.model ?? "",
    confidence: e.confidence,
    evidence: e.evidenceRefs.join(", "),
  }));
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Audit trail</h1>
        <p className="text-muted-foreground text-sm">
          Every agent action, operator decision and PayPal webhook, with its reasoning, model and evidence. Filter any column. Seed records are hidden.
        </p>
      </div>
      <AuditGrid rows={rows} />
    </div>
  );
}
