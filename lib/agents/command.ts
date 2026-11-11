// Financial command center. Gemini turns a manager's plain-language question into a structured query spec;
// this file runs that spec with fixed, read-only Prisma queries (the model never writes SQL) and AG Grid shows it.

import type { Prisma } from "@/generated/prisma/client";
import { audit } from "@/lib/agents/audit";
import { computeInterest, daysBetween } from "@/lib/credit-clock";
import { db } from "@/lib/db";
import { isoDay, num } from "@/lib/format";
import { auditModel, generateJson } from "@/lib/llm";
import type { SessionUser } from "@/lib/session";
import { keywordSpec, QuerySpecSchema, type CommandResult, type QuerySpec } from "./command-spec";

export type { Column, CommandResult } from "./command-spec";

const matches = (needle: string | null, ...haystack: (string | null | undefined)[]) =>
  !needle || haystack.some((h) => h?.toLowerCase().includes(needle.toLowerCase()));

async function run(spec: QuerySpec): Promise<Pick<CommandResult, "columns" | "rows">> {
  const f = spec.filters;
  const since = f.lastDays ? new Date(Date.now() - f.lastDays * 86_400_000) : null;
  const statusOk = (s: string) => !f.statusIn.length || f.statusIn.map((x) => x.toUpperCase()).includes(s.toUpperCase());
  const now = new Date();

  switch (spec.dataset) {
    case "shipments": {
      const shipments = await db.shipment.findMany({
        include: { buyer: true, carrier: true, insurancePolicies: true, paypalDisputes: true, refundRequests: true },
        orderBy: { reference: "desc" },
      });
      return {
        columns: [
          { field: "reference", headerName: "Shipment", kind: "link" },
          { field: "buyer", headerName: "Buyer", kind: "text" },
          { field: "carrier", headerName: "Carrier", kind: "text" },
          { field: "value", headerName: "Value", kind: "money" },
          { field: "status", headerName: "Status", kind: "text" },
          { field: "insurance", headerName: "Insurance (simulated)", kind: "text" },
          { field: "disputes", headerName: "Disputes", kind: "number" },
          { field: "refunds", headerName: "Refund requests", kind: "number" },
          { field: "delivered", headerName: "Delivered", kind: "date" },
        ],
        rows: shipments
          .filter((s) => matches(f.textContains, s.buyer.name, s.carrier.name, s.reference))
          .filter((s) => (f.minAmount === null || num(s.declaredValue) >= f.minAmount) && (!f.currency || s.currency === f.currency))
          .filter((s) => !f.disputedOnly || s.paypalDisputes.length > 0 || s.refundRequests.length > 0)
          .filter((s) => !f.insuredOnly || s.insurancePolicies.length > 0)
          .filter((s) => statusOk(s.status) && (!since || s.updatedAt >= since))
          .map((s) => ({
            id: s.id,
            reference: s.reference,
            buyer: s.buyer.name,
            carrier: s.carrier.name,
            value: num(s.declaredValue),
            currency: s.currency,
            status: s.status,
            insurance: s.insurancePolicies[0] ? `${s.insurancePolicies[0].quoteReference} (${s.insurancePolicies[0].status.toLowerCase()})` : "none",
            disputes: s.paypalDisputes.length,
            refunds: s.refundRequests.length,
            delivered: s.deliveredAt ? isoDay(s.deliveredAt) : null,
          })),
      };
    }
    case "invoices": {
      const invoices = await db.payPalInvoice.findMany({ include: { shipment: { include: { buyer: true } }, creditClock: true } });
      return {
        columns: [
          { field: "reference", headerName: "Shipment", kind: "link" },
          { field: "buyer", headerName: "Buyer", kind: "text" },
          { field: "amount", headerName: "Amount", kind: "money" },
          { field: "channel", headerName: "Channel", kind: "text" },
          { field: "status", headerName: "Status", kind: "text" },
          { field: "due", headerName: "Due", kind: "date" },
          { field: "daysOverdue", headerName: "Days overdue", kind: "number" },
          { field: "interest", headerName: "MSMED interest", kind: "money" },
        ],
        rows: invoices
          .map((i) => {
            const clock = i.creditClock;
            const overdue = !i.paidAt && clock ? Math.max(0, daysBetween(clock.dueDate, now)) : 0;
            const interest =
              clock?.interestRatePct && clock.statutoryDueDate
                ? computeInterest(num(i.amount), { kind: "COMPOUND_MONTHLY", annualRatePct: num(clock.interestRatePct), accruesAfter: clock.statutoryDueDate, basis: "" }, i.paidAt ?? now)
                : 0;
            return {
              id: i.shipmentId,
              reference: i.shipment.reference,
              buyer: i.shipment.buyer.name,
              amount: num(i.amount),
              currency: i.currency,
              channel: i.channel === "PAYPAL" ? "PayPal" : "Manual record",
              status: i.paidAt ? "PAID" : overdue > 0 ? "OVERDUE" : "RUNNING",
              due: clock ? isoDay(clock.dueDate) : null,
              daysOverdue: overdue,
              interest,
              _created: i.createdAt.getTime(),
            };
          })
          .filter((r) => matches(f.textContains, r.buyer, r.reference))
          .filter((r) => (f.minAmount === null || r.amount >= f.minAmount) && (!f.currency || r.currency === f.currency))
          .filter((r) => (!f.overdueOnly || r.status === "OVERDUE") && statusOk(r.status) && (!since || r._created >= since.getTime()))
          .sort((a, b) => b.daysOverdue - a.daysOverdue)
          .map(({ _created, ...r }) => (void _created, r)),
      };
    }
    case "disputes": {
      const disputes = await db.payPalDispute.findMany({ include: { shipment: { include: { buyer: true } } }, orderBy: { createdAt: "desc" } });
      return {
        columns: [
          { field: "reference", headerName: "Shipment", kind: "link" },
          { field: "dispute", headerName: "PayPal dispute", kind: "text" },
          { field: "buyer", headerName: "Buyer", kind: "text" },
          { field: "amount", headerName: "Amount", kind: "money" },
          { field: "reason", headerName: "Reason", kind: "text" },
          { field: "status", headerName: "Status", kind: "text" },
          { field: "outcome", headerName: "Outcome", kind: "text" },
        ],
        rows: disputes
          .filter((d) => matches(f.textContains, d.shipment?.buyer.name, d.shipment?.reference) && statusOk(d.status) && (!since || d.createdAt >= since))
          .filter((d) => f.minAmount === null || num(d.disputeAmount) >= f.minAmount)
          .map((d) => ({
            id: d.shipmentId,
            reference: d.shipment?.reference ?? "–",
            dispute: `${d.paypalDisputeId}${d.simulated ? " (replay)" : ""}`,
            buyer: d.shipment?.buyer.name ?? "–",
            amount: num(d.disputeAmount),
            currency: d.currency,
            reason: d.reason.replace(/_/g, " ").toLowerCase(),
            status: d.status,
            outcome: d.outcome ?? "open",
          })),
      };
    }
    case "approvals": {
      const approvals = await db.approvalRequest.findMany({ include: { shipment: true, decidedBy: true }, orderBy: { createdAt: "desc" } });
      return {
        columns: [
          { field: "reference", headerName: "Shipment", kind: "link" },
          { field: "agent", headerName: "Agent", kind: "text" },
          { field: "action", headerName: "Action", kind: "text" },
          { field: "summary", headerName: "Proposal", kind: "text" },
          { field: "status", headerName: "Status", kind: "text" },
          { field: "decidedBy", headerName: "Decided by", kind: "text" },
          { field: "created", headerName: "Proposed", kind: "date" },
        ],
        rows: approvals
          .filter((a) => matches(f.textContains, a.summary, a.agent, a.shipment?.reference) && statusOk(a.status) && (!since || a.createdAt >= since))
          .map((a) => ({
            id: a.shipmentId,
            reference: a.shipment?.reference ?? "–",
            agent: a.agent,
            action: a.actionType,
            summary: a.summary,
            status: a.status,
            decidedBy: a.decidedBy?.name ?? "–",
            created: isoDay(a.createdAt),
          })),
      };
    }
    case "audit": {
      const events = await db.auditEvent.findMany({
        where: { trigger: { not: "seed:historical" }, ...(since ? { createdAt: { gte: since } } : {}) },
        include: { shipment: true },
        orderBy: { createdAt: "desc" },
        take: 500,
      });
      return {
        columns: [
          { field: "reference", headerName: "Shipment", kind: "link" },
          { field: "time", headerName: "Time (UTC)", kind: "text" },
          { field: "agent", headerName: "Agent", kind: "text" },
          { field: "outcome", headerName: "Outcome / proposal", kind: "text" },
          { field: "model", headerName: "Model", kind: "text" },
        ],
        rows: events
          .filter((e) => matches(f.textContains, e.agent, e.trigger, e.outcome, e.shipment?.reference))
          .map((e) => ({
            id: e.shipmentId,
            reference: e.shipment?.reference ?? "–",
            time: e.createdAt.toISOString().slice(0, 16).replace("T", " "),
            agent: e.agent,
            outcome: e.outcome ?? e.proposedAction ?? "",
            model: e.model ?? "",
          })),
      };
    }
  }
}

export async function askCommandCenter(question: string, actor: SessionUser): Promise<CommandResult> {
  if (question.trim().length < 3) throw new Error("Ask a question, for example: disputed shipments over $10,000 with insurance attached.");
  const spec = await generateJson({
    system:
      "You translate a finance manager's question about B2B shipments into a query spec for Proof2Pay. " +
      "Datasets: shipments (cargo, buyer, carrier, declared value, status, insurance, disputes), invoices (amount, PayPal or manual record, due date, overdue, MSMED interest), " +
      "disputes (PayPal disputes), approvals (agent proposals awaiting or decided by a person), audit (every agent action). " +
      "Shipment statuses: DRAFT, CONTRACT_PENDING, CONTRACTED, IN_TRANSIT, VERIFIED, INVOICED, PAID, DISPUTED, CLOSED. Approval statuses: PENDING, EXECUTED, REJECTED. " +
      "Amounts are in each row's currency (USD cross-border, INR domestic). Use null or false for filters the question does not ask for.",
    prompt: `Question: ${question.trim()}`,
    schema: QuerySpecSchema,
    sample: keywordSpec(question),
  });
  const { columns, rows } = await run(spec.data);
  const totals: Record<string, number> = {};
  const moneyField = columns.find((c) => c.kind === "money")?.field;
  if (moneyField) for (const r of rows) totals[String(r.currency ?? "USD")] = (totals[String(r.currency ?? "USD")] ?? 0) + Number(r[moneyField] ?? 0);

  await audit({
    agent: "SYSTEM",
    trigger: "user:command_center",
    actorUserId: actor.id,
    reasoning: `Question: "${question.trim()}". ${spec.data.explanation}`,
    outcome: `${spec.data.dataset}: ${rows.length} row(s)`,
    model: auditModel(spec),
    metadata: { spec: spec.data } as unknown as Prisma.InputJsonValue,
  });
  return { title: spec.data.title, explanation: spec.data.explanation, source: spec.source, model: spec.model, columns, rows, totals };
}
