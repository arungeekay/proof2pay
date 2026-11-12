import { ApprovalItem } from "@/components/approval-item";
import { db } from "@/lib/db";
import { canApprove, currentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function ApprovalsPage() {
  const [user, open, decided] = await Promise.all([
    currentUser(),
    db.approvalRequest.findMany({ where: { status: { in: ["PENDING", "FAILED"] } }, orderBy: { createdAt: "asc" }, include: { shipment: { select: { id: true, reference: true } } } }),
    db.approvalRequest.findMany({
      where: { status: { in: ["EXECUTED", "REJECTED", "APPROVED"] }, shipment: { seeded: false } },
      orderBy: { decidedAt: "desc" },
      take: 20,
      include: { shipment: { select: { id: true, reference: true } } },
    }),
  ]);
  const allowed = canApprove(user);
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Approvals</h1>
        <p className="text-muted-foreground text-sm">
          The AI proposes; a person decides. Invoices, refunds, dispute responses and insurance claims wait here until the exporter or the finance manager approves them.
          {!allowed && " You are viewing as someone who cannot approve: switch to the finance manager with “Viewing as” at the top right."}
        </p>
      </div>
      <section className="flex flex-col gap-3">
        {open.length === 0 && <p className="text-muted-foreground text-sm">Nothing is waiting for approval.</p>}
        {open.map((a) => (
          <ApprovalItem key={a.id} approval={a} canDecide={allowed} showShipment />
        ))}
      </section>
      {decided.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="font-semibold">Recently decided</h2>
          {decided.map((a) => (
            <ApprovalItem key={a.id} approval={a} canDecide={false} showShipment />
          ))}
        </section>
      )}
    </div>
  );
}
