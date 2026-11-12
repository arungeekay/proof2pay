import Link from "next/link";
import { decideApprovalAction } from "@/app/actions";
import { ActionForm } from "@/components/action-form";
import { StatusBadge, Tag } from "@/components/status";
import { Input } from "@/components/ui/input";
import type { ApprovalRequest } from "@/generated/prisma/client";
import { actionLabel, agentLabel, dateTime, money } from "@/lib/format";

export function ApprovalItem({ approval: a, canDecide, showShipment }: { approval: ApprovalRequest & { shipment?: { id: string; reference: string } | null }; canDecide: boolean; showShipment?: boolean }) {
  const payload = a.payload as Record<string, unknown>;
  return (
    <div className="flex flex-col gap-2 rounded-md border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Tag tone="info">Proposed by {agentLabel(a.agent)}</Tag>
        <Tag>{actionLabel(a.actionType)}</Tag>
        <StatusBadge status={a.status} />
        {showShipment && a.shipment && (
          <Link href={`/shipments/${a.shipment.id}`} className="text-primary font-mono text-xs hover:underline">
            {a.shipment.reference}
          </Link>
        )}
        <span className="text-muted-foreground text-xs">{dateTime(a.createdAt)}</span>
      </div>
      <div className="font-medium">{a.summary}</div>
      {a.actionType === "INVOICE_SEND" && Array.isArray(payload.items) && (
        <div className="text-muted-foreground text-xs">
          {(payload.items as { name: string; quantity: number; unitAmount: number }[]).map((i) => `${i.quantity} × ${i.name} @ ${money(i.unitAmount, String(payload.currency))}`).join(" · ")} · to{" "}
          {String(payload.recipientEmail)} · {payload.channel === "PAYPAL" ? "via PayPal Invoicing" : "domestic invoice (manual record)"}
        </div>
      )}
      {a.actionType === "REFUND" && typeof payload.insuranceAssessment === "string" && (
        <div className="text-muted-foreground text-xs">Insurance: {payload.insuranceAssessment}</div>
      )}
      {a.status === "FAILED" && <p className="text-destructive text-xs">Execution failed: {String((a.executionResult as { error?: string } | null)?.error ?? "")}</p>}
      {canDecide ? (
        <ActionForm
          action={decideApprovalAction}
          fields={{ approvalId: a.id }}
          pendingLabel="Executing…"
          buttons={[
            { label: a.status === "FAILED" ? "Retry" : "Approve", name: "decision", value: "approve" },
            { label: "Reject", name: "decision", value: "reject", variant: "outline" },
          ]}
        >
          <Input name="note" placeholder="Note (optional)" className="h-8 max-w-md text-xs" />
        </ActionForm>
      ) : (
        <p className="text-muted-foreground text-xs">Only the exporter or the finance manager can approve this. Use “Viewing as” at the top right to switch.</p>
      )}
    </div>
  );
}

