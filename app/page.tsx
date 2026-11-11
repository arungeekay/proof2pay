import { ArrowRight, CircleAlert, FileCheck2, PackageCheck, Scale } from "lucide-react";
import Link from "next/link";
import { resetDemoAction, switchPersona } from "@/app/actions";
import { ActionForm } from "@/components/action-form";
import { SimTag, StatusBadge, Tag } from "@/components/status";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/db";
import { money, num } from "@/lib/format";
import { paypalConfigured } from "@/lib/paypal/client";
import { currentUser, listPersonas } from "@/lib/session";

export const dynamic = "force-dynamic";

const ROLE_HINT = {
  EXPORTER: "Drafts contracts, approves invoices and refunds",
  CARRIER: "Confirms pickup, uploads proof of delivery",
  BUYER: "Accepts contracts, pays, requests refunds",
  MANAGER: "Approves agent actions, watches receivables",
} as const;

export default async function Home() {
  const [user, personas, demo, domestic, pending, open] = await Promise.all([
    currentUser(),
    listPersonas(),
    db.shipment.findUnique({ where: { reference: "SH-1042" } }),
    db.shipment.findUnique({ where: { reference: "SH-1039" } }),
    db.approvalRequest.count({ where: { status: "PENDING" } }),
    db.payPalInvoice.findMany({ where: { paidAt: null }, include: { creditClock: true } }),
  ]);
  const now = new Date();
  const overdue = open.filter((i) => i.creditClock && i.creditClock.dueDate < now);
  const sumBy = (rows: typeof open, currency: string) => rows.filter((r) => r.currency === currency).reduce((s, r) => s + num(r.amount), 0);

  const scenarios = [
    {
      icon: PackageCheck,
      title: "1. Successful shipment",
      text: "Contract accepted by both parties, insurance assessed, delivery verified by AI, PayPal invoice paid and confirmed, trust profiles updated.",
      href: demo ? `/shipments/${demo.id}` : "/shipments",
      ref: "SH-1042",
      status: demo?.status,
      tag: <Tag tone="info">PayPal</Tag>,
    },
    {
      icon: CircleAlert,
      title: "2. Delayed payment",
      text: "An Indian domestic invoice is past its MSMED due date. The AI works out interest, drafts the final notice and assembles the MSME evidence package.",
      href: domestic ? `/shipments/${domestic.id}` : "/shipments",
      ref: "SH-1039",
      status: domestic?.status,
      tag: <SimTag>Manual record (INR)</SimTag>,
    },
    {
      icon: Scale,
      title: "3. Damage and dispute",
      text: "On SH-1042 after payment: the buyer reports a dented carton. Resolution AI weighs contract, POD and cover, recommends a partial refund, prepares the claim and dispute evidence.",
      href: demo ? `/shipments/${demo.id}#resolution` : "/shipments",
      ref: "SH-1042",
      status: demo?.status,
      tag: <Tag tone="info">PayPal refund + dispute</Tag>,
    },
  ];

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3 pt-4">
        <p className="text-primary text-sm font-medium">Every shipment. Every promise. Every payment. Verified.</p>
        <h1 className="max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl">
          Contracts, delivery proof and PayPal settlement for B2B logistics, with AI agents that recommend and people who approve.
        </h1>
        <p className="text-muted-foreground max-w-3xl">
          Proof2Pay gives every shipment a verifiable agreement, a documented delivery, a measurable payment obligation and an auditable outcome,
          so reliable businesses build a record and late payment gets harder to hide.
        </p>
        <div className="flex flex-wrap gap-2 text-xs">
          {paypalConfigured() ? <Tag tone="info">PayPal sandbox connected</Tag> : <SimTag>PayPal mocked: add sandbox keys to go live</SimTag>}
          <Tag tone={process.env.GEMINI_API_KEY ? "good" : "warn"}>{process.env.GEMINI_API_KEY ? `Gemini ${process.env.GEMINI_MODEL ?? ""}` : "Gemini key missing: sample AI output"}</Tag>
          <SimTag>Insurer simulated</SimTag>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {scenarios.map((s) => (
          <Card key={s.title} className="flex flex-col">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <s.icon className="text-primary size-5" /> {s.title}
              </CardTitle>
              <CardDescription>{s.text}</CardDescription>
            </CardHeader>
            <CardContent className="mt-auto flex items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-mono text-sm">{s.ref}</span>
                {s.status && <StatusBadge status={s.status} />}
                {s.tag}
              </div>
              <Button asChild size="sm">
                <Link href={s.href}>
                  Open <ArrowRight />
                </Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Waiting for a person</CardDescription>
            <CardTitle className="text-2xl">{pending} approvals</CardTitle>
          </CardHeader>
          <CardContent>
            <Link href="/approvals" className="text-primary text-sm hover:underline">
              Open the approval queue
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Open receivables</CardDescription>
            <CardTitle className="text-2xl">
              {money(sumBy(open, "USD"), "USD")} <span className="text-muted-foreground text-base">+ {money(sumBy(open, "INR"), "INR")}</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Link href="/receivables" className="text-primary text-sm hover:underline">
              Credit clocks and interest
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Overdue</CardDescription>
            <CardTitle className="text-2xl">{overdue.length} invoices</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-sm">Status shown as overdue, never as default or fraud.</CardContent>
        </Card>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="flex items-center gap-2 font-semibold">
          <FileCheck2 className="size-4" /> Pick who you are
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {personas.map((p) => (
            <form key={p.id} action={switchPersona}>
              <input type="hidden" name="userId" value={p.id} />
              <button
                type="submit"
                className={`hover:border-primary w-full rounded-lg border p-3 text-left text-sm transition ${p.id === user.id ? "border-primary bg-primary/5" : "bg-card"}`}
              >
                <div className="font-medium">{p.name}</div>
                <div className="text-muted-foreground text-xs">{p.business.name}</div>
                <div className="mt-1 text-xs">{ROLE_HINT[p.role]}</div>
              </button>
            </form>
          ))}
        </div>
      </section>

      {process.env.DEMO_MODE === "true" && (
        <section className="text-muted-foreground flex flex-col gap-2 border-t pt-4 text-sm">
          <p>Judges share this demo. If SH-1042 has already been run through, reset it to start the scenarios again (takes about a minute).</p>
          <ActionForm action={resetDemoAction} label="Reset demo data" variant="outline" pendingLabel="Reloading the demo data…" />
        </section>
      )}
    </div>
  );
}
