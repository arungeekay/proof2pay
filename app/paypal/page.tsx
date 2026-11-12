// PayPal activity: totals and one row per PayPal event, built from Proof2Pay's own records of what it sent to
// and received from PayPal. It does not read the PayPal wallet balance.

import { PayPalGrid, type PayPalRow } from "@/components/grids";
import { SimTag, Tag } from "@/components/status";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/db";
import { dateTime, humanize, money, num } from "@/lib/format";
import { isMockId, paypalConfigured } from "@/lib/paypal/client";

export const dynamic = "force-dynamic";

type Source = PayPalRow["source"];

const sourceOf = (id: string | null | undefined, seeded: boolean): Source => (isMockId(id) ? "Mocked" : seeded || id?.startsWith("SEED-") ? "Demo history" : "PayPal sandbox");

export default async function PayPalPage() {
  const [invoices, refunds, disputes] = await Promise.all([
    db.payPalInvoice.findMany({ where: { channel: "PAYPAL" }, include: { shipment: { include: { buyer: true } } } }),
    db.payPalRefund.findMany({ include: { invoice: { include: { shipment: { include: { buyer: true } } } } } }),
    db.payPalDispute.findMany({ include: { shipment: { include: { buyer: true } } } }),
  ]);

  const rows: (PayPalRow & { at: Date })[] = [];
  for (const inv of invoices) {
    const base = { shipmentId: inv.shipmentId, reference: inv.shipment.reference, party: inv.shipment.buyer.name, currency: inv.currency, source: sourceOf(inv.paypalInvoiceId, inv.shipment.seeded) };
    rows.push({ ...base, id: `inv-${inv.id}`, at: inv.sentAt ?? inv.createdAt, type: "Invoice sent", amount: num(inv.amount), status: inv.paidAt ? "Paid" : humanize(inv.status), paypalId: inv.paypalInvoiceId, when: "" });
    if (inv.paidAt) rows.push({ ...base, id: `pay-${inv.id}`, at: inv.paidAt, type: "Payment received", amount: num(inv.amount), status: "Completed", paypalId: inv.paymentReference ?? inv.paypalInvoiceId, when: "" });
  }
  for (const r of refunds) {
    const shipment = r.invoice?.shipment;
    rows.push({
      id: `ref-${r.id}`,
      at: r.createdAt,
      type: "Refund paid",
      shipmentId: shipment?.id ?? null,
      reference: shipment?.reference ?? null,
      party: shipment?.buyer.name ?? "",
      currency: r.currency,
      amount: -num(r.amount),
      status: humanize(r.status),
      paypalId: r.paypalRefundId,
      source: sourceOf(r.paypalRefundId, shipment?.seeded ?? false),
      when: "",
    });
  }
  for (const d of disputes) {
    rows.push({
      id: `dis-${d.id}`,
      at: d.openedAt ?? d.createdAt,
      type: "Dispute opened",
      shipmentId: d.shipmentId,
      reference: d.shipment?.reference ?? null,
      party: d.shipment?.buyer.name ?? "",
      currency: d.currency,
      amount: num(d.disputeAmount),
      status: humanize(d.status),
      paypalId: d.paypalDisputeId,
      source: d.simulated ? "Replayed" : sourceOf(d.paypalDisputeId, d.shipment?.seeded ?? false),
      when: "",
    });
  }
  rows.sort((a, b) => b.at.getTime() - a.at.getTime());
  const gridRows: PayPalRow[] = rows.map(({ at, ...row }) => ({ ...row, when: dateTime(at) }));

  const total = (type: PayPalRow["type"], liveOnly = false) =>
    rows.filter((r) => r.type === type && r.currency === "USD" && (!liveOnly || r.source === "PayPal sandbox")).reduce((sum, r) => sum + Math.abs(r.amount), 0);
  const waiting = (liveOnly = false) =>
    invoices.filter((i) => !i.paidAt && i.currency === "USD" && (!liveOnly || sourceOf(i.paypalInvoiceId, i.shipment.seeded) === "PayPal sandbox")).reduce((sum, i) => sum + num(i.amount), 0);
  const openDisputes = disputes.filter((d) => d.status !== "RESOLVED").length;

  const tiles = [
    { label: "Received through PayPal", value: money(total("Payment received")), live: money(total("Payment received", true)) },
    { label: "Refunded to buyers", value: money(total("Refund paid")), live: money(total("Refund paid", true)) },
    { label: "Invoices waiting to be paid", value: money(waiting()), live: money(waiting(true)) },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight">
          PayPal {paypalConfigured() ? <Tag tone="info">sandbox connected (test money)</Tag> : <SimTag>PayPal mocked</SimTag>}
        </h1>
        <p className="text-muted-foreground text-sm">
          Every invoice, payment, refund and dispute that went through PayPal, in one place. These figures come from Proof2Pay&apos;s own records of its PayPal
          activity; they are not the PayPal wallet balance.
          {process.env.PAYPAL_SANDBOX_BUYER_EMAIL && ` In this demo, invoices go to the sandbox buyer ${process.env.PAYPAL_SANDBOX_BUYER_EMAIL}.`}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((t) => (
          <Card key={t.label}>
            <CardHeader>
              <CardDescription>{t.label}</CardDescription>
              <CardTitle className="text-2xl tabular-nums">{t.value}</CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground text-xs">Of which live in the PayPal sandbox: {t.live}. The rest is pre-loaded demo history.</CardContent>
          </Card>
        ))}
        <Card>
          <CardHeader>
            <CardDescription>Open disputes</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{openDisputes}</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-xs">
            {disputes.length} in total. A person approves every dispute response.
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="font-semibold">Transactions</h2>
        <p className="text-muted-foreground text-xs">
          Newest first. Click a shipment to open it. “Source” says whether a row is live in the PayPal sandbox, pre-loaded demo history, mocked, or a replayed dispute.
        </p>
        {gridRows.length ? <PayPalGrid rows={gridRows} /> : <p className="text-muted-foreground text-sm">No PayPal activity yet. Run story 1 to send the first invoice.</p>}
      </div>
    </div>
  );
}
