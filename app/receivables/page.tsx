import { ReceivablesGrid, type ReceivableRow } from "@/components/grids";
import { refreshClocks } from "@/lib/agents/payment";
import { computeInterest, daysBetween } from "@/lib/credit-clock";
import { db } from "@/lib/db";
import { isoDay, num } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ReceivablesPage() {
  await refreshClocks();
  const invoices = await db.payPalInvoice.findMany({
    where: { purpose: "GOODS" },
    include: { shipment: { include: { buyer: true } }, creditClock: { include: { _count: { select: { reminders: true } } } } },
  });
  const now = new Date();
  const rows: ReceivableRow[] = invoices.map((inv) => {
    const clock = inv.creditClock;
    const interest =
      clock?.interestRatePct && clock.statutoryDueDate
        ? computeInterest(num(inv.amount), { kind: "COMPOUND_MONTHLY", annualRatePct: num(clock.interestRatePct), accruesAfter: clock.statutoryDueDate, basis: "" }, inv.paidAt ?? now)
        : 0;
    return {
      shipmentId: inv.shipmentId,
      reference: inv.shipment.reference,
      buyer: inv.shipment.buyer.name,
      channel: inv.channel,
      currency: inv.currency,
      amount: num(inv.amount),
      dueDate: clock ? isoDay(clock.dueDate) : inv.dueDate ? isoDay(inv.dueDate) : "",
      daysToDue: inv.paidAt || !clock ? null : daysBetween(now, clock.dueDate),
      status: inv.paidAt ? "PAID" : clock && clock.dueDate < now ? "OVERDUE" : "RUNNING",
      interest,
      preset: clock?.preset ?? "",
      paidAt: inv.paidAt ? isoDay(inv.paidAt) : "",
      reminders: clock?._count.reminders ?? 0,
    };
  });
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Receivables and credit clocks</h1>
        <p className="text-muted-foreground text-sm">
          Each invoice&apos;s clock starts on acceptance of goods. Under the MSMED preset, interest after the statutory due date is compound, with monthly rests,
          at three times the RBI bank rate ({process.env.RBI_BANK_RATE_PCT ?? "5.75"}%). Overdue is a status, not a judgement.
        </p>
      </div>
      <ReceivablesGrid rows={rows} />
    </div>
  );
}
