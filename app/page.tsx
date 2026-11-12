import { ArrowRight, CircleAlert, FileCheck2, PackageCheck, Scale, Users } from "lucide-react";
import Link from "next/link";
import { resetDemoAction, switchPersona } from "@/app/actions";
import { ActionForm } from "@/components/action-form";
import { SimTag, StatusBadge, Tag } from "@/components/status";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/db";
import { money, num, ROLE_LABEL } from "@/lib/format";
import { paypalConfigured } from "@/lib/paypal/client";
import { currentUser, listPersonas } from "@/lib/session";

export const dynamic = "force-dynamic";

const ROLE_HINT = {
  EXPORTER: "Sells the goods. Drafts the contract and accepts it.",
  CARRIER: "Moves the goods. Confirms pickup and uploads proof of delivery.",
  BUYER: "Buys the goods. Accepts the contract, pays, and reports problems.",
  MANAGER: "Works for the exporter. Approves what the AI proposes.",
} as const;

const HOW = [
  ["1", "Agree", "AI drafts the contract. Both sides accept the same text."],
  ["2", "Deliver", "The carrier uploads proof of delivery. AI checks it against the contract."],
  ["3", "Get paid", "AI prepares the invoice. A person approves it and PayPal collects."],
  ["4", "Sort out problems", "AI weighs refund claims and disputes. A person decides."],
] as const;

const SETTLED = ["PAID", "DISPUTED", "CLOSED"];

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
  const demoHref = demo ? `/shipments/${demo.id}` : "/shipments";
  const settled = !!demo && SETTLED.includes(demo.status);

  const stories = [
    {
      icon: PackageCheck,
      title: "A shipment that goes right",
      text: "An exporter in Chennai ships machine parts to a buyer in Chicago. Follow it from contract to delivery to a paid PayPal invoice.",
      roles: "You play the exporter, buyer, carrier and finance manager",
      time: "About 3 minutes",
      href: demoHref,
      ref: "SH-1042",
      status: demo?.status,
      button: !demo || demo.status === "DRAFT" ? "Start" : settled ? "View (finished)" : "Continue",
      ready: true,
    },
    {
      icon: CircleAlert,
      title: "A customer who pays late",
      text: "An Indian buyer is 28 days late. See the interest the law allows, an AI-drafted final notice and a ready evidence package.",
      roles: "You play the finance manager",
      time: "About 1 minute",
      href: domestic ? `/shipments/${domestic.id}` : "/shipments",
      ref: "SH-1039",
      status: domestic?.status,
      button: "Start",
      ready: true,
    },
    {
      icon: Scale,
      title: "Damaged goods and a refund",
      text: "After story 1 is paid, the buyer reports a dented carton and asks for $400. AI checks the evidence and recommends a fair refund.",
      roles: "You play the buyer and finance manager",
      time: "About 2 minutes",
      href: demoHref,
      ref: "SH-1042",
      status: demo?.status,
      button: settled ? "Start" : "Finish story 1 first",
      ready: settled,
    },
  ];

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-2 pt-4">
        <p className="text-primary text-sm font-medium">Every shipment. Every promise. Every payment. Verified.</p>
        <h1 className="max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl">Ship it, prove it was delivered, get paid.</h1>
        <p className="text-muted-foreground max-w-3xl">
          Proof2Pay keeps the contract, the delivery proof and the payment for each shipment in one place. AI does the paperwork, a person approves
          every step that moves money, and PayPal settles it.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-xl font-semibold">Start here: pick a story</h2>
          <p className="text-muted-foreground text-sm">
            Each story walks you through step by step. A blue “What happens next” box tells you what to click, and switches you to the right person
            with one button.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {stories.map((s, i) => (
            <Card key={s.title} className={`flex flex-col ${s.ready ? "" : "opacity-70"}`}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <span className="bg-primary text-primary-foreground flex size-6 shrink-0 items-center justify-center rounded-full text-xs">{i + 1}</span>
                  {s.title}
                </CardTitle>
                <CardDescription>{s.text}</CardDescription>
              </CardHeader>
              <CardContent className="mt-auto flex flex-col gap-3">
                <div className="text-muted-foreground flex flex-col gap-1 text-xs">
                  <span className="flex items-center gap-1.5">
                    <Users className="size-3.5" /> {s.roles}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <s.icon className="size-3.5" /> {s.time} · shipment <span className="font-mono">{s.ref}</span>
                    {s.status && <StatusBadge status={s.status} />}
                  </span>
                </div>
                <Button asChild variant={s.ready ? "default" : "outline"}>
                  <Link href={s.href}>
                    {s.button} {s.ready && <ArrowRight />}
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">How it works</h2>
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {HOW.map(([n, title, text]) => (
            <li key={n} className="bg-card flex gap-3 rounded-lg border p-3 text-sm">
              <span className="text-primary text-lg font-semibold">{n}</span>
              <span className="flex flex-col">
                <span className="font-medium">{title}</span>
                <span className="text-muted-foreground text-xs">{text}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">Right now</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader>
              <CardDescription>Waiting for a person to approve</CardDescription>
              <CardTitle className="text-2xl">
                {pending} {pending === 1 ? "action" : "actions"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Link href="/approvals" className="text-primary text-sm hover:underline">
                Open approvals
              </Link>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription>Money owed on unpaid invoices</CardDescription>
              <CardTitle className="text-2xl">
                {money(sumBy(open, "USD"), "USD")} <span className="text-muted-foreground text-base">+ {money(sumBy(open, "INR"), "INR")}</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Link href="/receivables" className="text-primary text-sm hover:underline">
                See who owes what
              </Link>
              <span className="text-muted-foreground text-sm"> · </span>
              <Link href="/paypal" className="text-primary text-sm hover:underline">
                PayPal transactions
              </Link>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription>Past their due date</CardDescription>
              <CardTitle className="text-2xl">
                {overdue.length} {overdue.length === 1 ? "invoice" : "invoices"}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground text-sm">Shown as overdue, never as default or fraud.</CardContent>
          </Card>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-semibold">
            <FileCheck2 className="size-4" /> The people in the demo
          </h2>
          <p className="text-muted-foreground text-sm">
            There is no login. The stories switch you to the right person when needed; you can also click one here, or use “Viewing as” at the top right.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {personas.map((p) => (
            <form key={p.id} action={switchPersona}>
              <input type="hidden" name="userId" value={p.id} />
              <button
                type="submit"
                className={`hover:border-primary h-full w-full rounded-lg border p-3 text-left text-sm transition ${p.id === user.id ? "border-primary bg-primary/5" : "bg-card"}`}
              >
                <div className="font-medium">
                  {p.name} {p.id === user.id && <span className="text-primary text-xs font-normal">(you, now)</span>}
                </div>
                <div className="text-primary text-xs">{ROLE_LABEL[p.role]}</div>
                <div className="text-muted-foreground text-xs">{p.business.name}</div>
                <div className="mt-1 text-xs">{ROLE_HINT[p.role]}</div>
              </button>
            </form>
          ))}
        </div>
      </section>

      <section className="text-muted-foreground flex flex-col gap-3 border-t pt-4 text-sm">
        {process.env.DEMO_MODE === "true" && (
          <div className="flex flex-col gap-2">
            <p>
              <span className="text-foreground font-medium">Start again:</span> everyone shares this demo. If the stories have already been played, reset them
              (takes about a minute).
            </p>
            <ActionForm action={resetDemoAction} label="Reset demo data" variant="outline" pendingLabel="Reloading the demo data…" />
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span>Under the hood:</span>
          {paypalConfigured() ? <Tag tone="info">PayPal sandbox connected</Tag> : <SimTag>PayPal mocked: add sandbox keys to go live</SimTag>}
          <Tag tone={process.env.GEMINI_API_KEY ? "good" : "warn"}>{process.env.GEMINI_API_KEY ? `Gemini ${process.env.GEMINI_MODEL ?? ""}` : "Gemini key missing: sample AI output"}</Tag>
          <SimTag>Insurer simulated</SimTag>
        </div>
      </section>
    </div>
  );
}
