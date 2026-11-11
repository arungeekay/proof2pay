import { Check } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  acceptContractAction,
  changeTermsAction,
  disputeResponseAction,
  draftContractAction,
  draftReminderAction,
  manualPaymentAction,
  msmePackAction,
  pickupAction,
  requestRefundAction,
  sendReminderAction,
  simulateDisputeAction,
  simulatePaymentAction,
  syncDisputesAction,
  syncInvoiceAction,
  uploadPodAction,
} from "@/app/actions";
import { ActionForm } from "@/components/action-form";
import { ApprovalItem } from "@/components/approval-item";
import { AuditList } from "@/components/audit-list";
import { SourceTag } from "@/components/source-tag";
import { Markdown } from "@/components/markdown";
import { PodUpload } from "@/components/pod-upload";
import { SimTag, StatusBadge, Tag } from "@/components/status";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { ContractReview } from "@/lib/agents/contract";
import type { Discrepancy } from "@/lib/agents/delivery-match";
import { computeInterest, daysBetween } from "@/lib/credit-clock";
import { db } from "@/lib/db";
import { dateTime, day, humanize, isoDay, money, num } from "@/lib/format";
import { isMockId, paypalConfigured } from "@/lib/paypal/client";
import { canApprove, currentUser, type SessionUser } from "@/lib/session";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const PACK_LABEL = { MSME_SAMADHAAN: "MSME delayed-payment evidence package", DISPUTE_RESPONSE: "Dispute response evidence pack", INSURANCE_CLAIM: "Insurance claim pack" } as const;

async function load(id: string) {
  return db.shipment.findUnique({
    where: { id },
    include: {
      exporter: true,
      carrier: true,
      buyer: true,
      contracts: { orderBy: { version: "desc" }, include: { acceptances: { include: { user: true } } } },
      insurancePolicies: { orderBy: { createdAt: "desc" }, include: { claims: true } },
      deliveryEvidence: { orderBy: { createdAt: "asc" }, select: { id: true, type: true, fileName: true, createdAt: true } },
      verificationReports: { orderBy: { createdAt: "desc" } },
      paypalInvoices: { orderBy: { createdAt: "desc" }, include: { creditClock: { include: { reminders: { orderBy: { createdAt: "asc" } } } }, refunds: true } },
      paypalTrackings: true,
      paypalDisputes: { orderBy: { createdAt: "desc" } },
      refundRequests: { orderBy: { createdAt: "desc" }, include: { recommendations: { orderBy: { createdAt: "desc" } }, refunds: true, requestedBy: true } },
      evidencePacks: { orderBy: { createdAt: "desc" } },
      approvalRequests: { orderBy: { createdAt: "desc" }, include: { decidedBy: true } },
      auditEvents: { orderBy: { createdAt: "desc" }, include: { actorUser: true } },
    },
  });
}

type Shipment = NonNullable<Awaited<ReturnType<typeof load>>>;

const STEPS = [
  ["Contract drafted", ["CONTRACT_PENDING"]],
  ["Both parties accepted", ["CONTRACTED"]],
  ["Picked up", ["IN_TRANSIT", "VERIFICATION_FAILED"]],
  ["Delivery verified", ["VERIFIED"]],
  ["Invoiced", ["INVOICED"]],
  ["Paid (confirmed)", ["PAID", "DISPUTED", "CLOSED"]],
] as const;

function stepIndex(status: string) {
  const i = STEPS.findIndex(([, statuses]) => (statuses as readonly string[]).includes(status));
  return status === "DRAFT" ? -1 : i;
}

function nextStep(s: Shipment, user: SessionUser): string {
  const role = user.role;
  const operator = role === "EXPORTER" || role === "MANAGER";
  const pending = s.approvalRequests.filter((a) => a.status === "PENDING");
  if (pending.length) return operator ? `Approve or reject: ${pending[0].summary}.` : "Waiting for the exporter's operator to approve the agent's proposal.";
  const contract = s.contracts.find((c) => c.status === "PENDING_ACCEPTANCE");
  switch (s.status) {
    case "DRAFT":
      return operator ? "Draft the contract with Contract AI." : "Switch to the exporter to draft the contract.";
    case "CONTRACT_PENDING": {
      if (!contract) return "The latest draft has a blocking flag: change the terms and redraft.";
      const accepted = contract.acceptances.map((a) => a.party);
      const missing = (["EXPORTER", "BUYER"] as const).filter((p) => !accepted.includes(p));
      return `Waiting for acceptance by: ${missing.map((p) => p.toLowerCase()).join(" and ")}. Switch persona to accept.`;
    }
    case "CONTRACTED":
      return role === "CARRIER" ? "Confirm pickup." : "Switch to the carrier to confirm pickup.";
    case "IN_TRANSIT":
    case "VERIFICATION_FAILED":
      return role === "CARRIER" ? "Upload the signed POD and photos for Delivery AI." : "Switch to the carrier to upload proof of delivery.";
    case "INVOICED": {
      const invoice = s.paypalInvoices[0];
      if (invoice?.channel === "MANUAL_RECORD") return "Domestic invoice: draft reminders, prepare the MSME package, or record a verified payment.";
      if (invoice && isMockId(invoice.paypalInvoiceId)) return "PayPal is mocked: simulate the buyer's payment on the Payment tab.";
      return "The buyer pays the invoice in the PayPal sandbox. PayPal's webhook (or Sync from PayPal) confirms it.";
    }
    case "PAID":
      return role === "BUYER" ? "Report a problem with the goods on the Resolution tab (scenario 3)." : "Settled. Trust profiles updated. The buyer may raise a refund request or a dispute.";
    case "DISPUTED": {
      const responded = s.evidencePacks.some((p) => p.kind === "DISPUTE_RESPONSE" && p.status === "SUBMITTED");
      if (responded) return "Dispute response sent. PayPal decides the outcome; the dispute webhook updates this shipment and the trust profiles.";
      return operator ? "Prepare the dispute response with Resolution AI." : "Dispute open: waiting for the seller's response.";
    }
    default:
      return "Nothing to do.";
  }
}

export default async function ShipmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [s, user] = await Promise.all([load(id), currentUser()]);
  if (!s) notFound();
  const operator = canApprove(user) && user.businessId === s.exporterId;
  const step = stepIndex(s.status);
  const pending = s.approvalRequests.filter((a) => a.status === "PENDING" || a.status === "FAILED");

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-mono text-2xl font-semibold">{s.reference}</h1>
            <StatusBadge status={s.status} />
            {s.seeded && <Tag>seeded history</Tag>}
            {s.destinationCountry === "IN" && <SimTag>domestic: manual payment record</SimTag>}
          </div>
          <p className="text-muted-foreground text-sm">
            {s.quantity} {s.unit} of {s.cargoDescription}, {s.originCity} to {s.destinationCity}. Declared value {money(s.declaredValue, s.currency)}, freight{" "}
            {money(s.freightAmount, s.currency)}, Net {s.creditTermsDays} ({s.jurisdictionPreset === "IN_MSMED" ? "MSMED preset" : "generic"}).
          </p>
          <p className="text-sm">
            Exporter <Link className="text-primary hover:underline" href={`/trust/${s.exporterId}`}>{s.exporter.name}</Link> · Carrier{" "}
            <Link className="text-primary hover:underline" href={`/trust/${s.carrierId}`}>{s.carrier.name}</Link> · Buyer{" "}
            <Link className="text-primary hover:underline" href={`/trust/${s.buyerId}`}>{s.buyer.name}</Link>
          </p>
        </div>
      </div>

      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-6">
        {STEPS.map(([label], i) => (
          <li key={label} className={cn("flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs", i <= step ? "border-primary bg-primary/5" : "bg-card text-muted-foreground")}>
            <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full text-[10px]", i <= step ? "bg-primary text-primary-foreground" : "bg-muted")}>
              {i <= step ? <Check className="size-3" /> : i + 1}
            </span>
            {label}
          </li>
        ))}
      </ol>

      <Alert className="border-primary/40 bg-primary/5">
        <AlertTitle>Next step for {user.name}</AlertTitle>
        <AlertDescription>{nextStep(s, user)}</AlertDescription>
      </Alert>

      {pending.length > 0 && (
        <Card className="border-amber-300">
          <CardHeader>
            <CardTitle>Waiting for approval</CardTitle>
            <CardDescription>Agents propose; nothing reaches PayPal or the insurer until a person approves.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {pending.map((a) => (
              <ApprovalItem key={a.id} approval={a} canDecide={operator} />
            ))}
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="contract">
        <TabsList>
          <TabsTrigger value="contract">Contract</TabsTrigger>
          <TabsTrigger value="delivery">Delivery</TabsTrigger>
          <TabsTrigger value="payment">Payment</TabsTrigger>
          <TabsTrigger value="resolution">Resolution</TabsTrigger>
          <TabsTrigger value="audit">Audit ({s.auditEvents.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="contract" className="pt-3">
          <ContractTab s={s} user={user} operator={operator} />
        </TabsContent>
        <TabsContent value="delivery" className="pt-3">
          <DeliveryTab s={s} user={user} />
        </TabsContent>
        <TabsContent value="payment" className="pt-3">
          <PaymentTab s={s} user={user} operator={operator} />
        </TabsContent>
        <TabsContent value="resolution" className="pt-3">
          <ResolutionTab s={s} user={user} operator={operator} />
        </TabsContent>
        <TabsContent value="audit" className="pt-3">
          <AuditList events={s.auditEvents} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ContractTab({ s, user, operator }: { s: Shipment; user: SessionUser; operator: boolean }) {
  const contract = s.contracts.find((c) => c.status !== "SUPERSEDED") ?? s.contracts[0];
  // Seeded contracts store flags as a bare array; drafted ones store the full review.
  const stored = contract?.flagsJson as ContractReview | unknown[] | null;
  const review = stored && !Array.isArray(stored) && Array.isArray(stored.flags) ? { ...stored, explanations: stored.explanations ?? [] } : null;
  const policy = contract ? s.insurancePolicies.find((p) => p.contractId === contract.id) : undefined;
  const editable = ["DRAFT", "CONTRACT_PENDING"].includes(s.status);
  const party = user.businessId === s.exporterId ? "EXPORTER" : user.businessId === s.buyerId && user.role === "BUYER" ? "BUYER" : null;
  const canAccept = contract?.status === "PENDING_ACCEPTANCE" && party && !contract.acceptances.some((a) => a.party === party);

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_380px]" id="contract">
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            {contract ? `Contract v${contract.version}` : "No contract yet"} {contract && <StatusBadge status={contract.status} />}
          </CardTitle>
          {contract && (
            <CardDescription className="font-mono text-xs break-all">
              SHA-256 {contract.hash}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {contract ? <Markdown>{contract.markdown}</Markdown> : <p className="text-muted-foreground text-sm">Contract AI drafts the contract from the shipment terms and a fixed clause library.</p>}
        </CardContent>
      </Card>
      <div className="flex flex-col gap-4">
        {operator && editable && (
          <Card>
            <CardHeader>
              <CardTitle>Contract AI</CardTitle>
              <CardDescription>Fills the clause library from the shipment, flags issues and explains each section.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <ActionForm action={draftContractAction} fields={{ shipmentId: s.id }} label={contract ? "Redraft" : "Draft contract"} pendingLabel="Contract AI is drafting…" />
              <ActionForm action={changeTermsAction} fields={{ shipmentId: s.id }} label="Change and redraft" variant="outline" pendingLabel="Redrafting…">
                <Label htmlFor="days" className="text-xs">
                  Credit period (days). Try 60 to see the MSMED rule block it.
                </Label>
                <Input id="days" name="days" type="number" min={0} max={365} defaultValue={s.creditTermsDays} className="h-8 w-28" />
              </ActionForm>
            </CardContent>
          </Card>
        )}
        {review && (
          <Card>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2">
                Review <SourceTag source={review.source} model={review.model} />
              </CardTitle>
              <CardDescription>{review.summary}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              {review.flags.map((f, i) => (
                <div key={i} className="flex flex-col gap-1 rounded-md border p-2">
                  <div className="flex items-center gap-2">
                    <StatusBadge status={f.severity} /> <span className="font-medium">{f.clause}</span>
                    <span className="text-muted-foreground text-xs">{f.source === "rule" ? "rule" : "AI"}</span>
                  </div>
                  <p>{f.issue}</p>
                  <p className="text-muted-foreground text-xs">{f.suggestion}</p>
                </div>
              ))}
              {review.explanations.length > 0 && (
                <details>
                  <summary className="cursor-pointer text-sm font-medium">Plain-language explanations</summary>
                  <dl className="mt-2 flex flex-col gap-2">
                    {review.explanations.map((e) => (
                      <div key={e.section}>
                        <dt className="text-xs font-medium">{e.section}</dt>
                        <dd className="text-muted-foreground text-xs">{e.plainLanguage}</dd>
                      </div>
                    ))}
                  </dl>
                </details>
              )}
            </CardContent>
          </Card>
        )}
        {contract && (
          <Card>
            <CardHeader>
              <CardTitle>Acceptance</CardTitle>
              <CardDescription>Each party accepts this exact hash. The AI never signs.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              {(["EXPORTER", "BUYER"] as const).map((p) => {
                const a = contract.acceptances.find((x) => x.party === p);
                return (
                  <div key={p} className="flex items-center justify-between gap-2">
                    <span>{humanize(p)}</span>
                    {a ? (
                      <span className="text-xs text-emerald-700">
                        {a.user.name}, {dateTime(a.acceptedAt)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-xs">not yet</span>
                    )}
                  </div>
                );
              })}
              {canAccept && <ActionForm action={acceptContractAction} fields={{ contractId: contract.id }} label={`Accept as ${party?.toLowerCase()}`} />}
            </CardContent>
          </Card>
        )}
        {policy && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Cargo insurance <SimTag>simulated insurer</SimTag>
              </CardTitle>
              <CardDescription>Assessed for this shipment. Not real cover.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-1 text-sm">
              <div className="flex justify-between">
                <span>Quote</span>
                <span className="font-mono text-xs">{policy.quoteReference}</span>
              </div>
              <div className="flex justify-between">
                <span>Cover</span>
                <span>{money(policy.coverageAmount, policy.currency)}</span>
              </div>
              <div className="flex justify-between">
                <span>Premium</span>
                <span>{money(policy.premium, policy.currency)}</span>
              </div>
              <div className="flex justify-between">
                <span>Status</span>
                <StatusBadge status={policy.status} />
              </div>
              <p className="text-muted-foreground text-xs">{(policy.termsJson as { cover?: string } | null)?.cover}</p>
            </CardContent>
          </Card>
        )}
        {s.contracts.length > 1 && (
          <Card>
            <CardHeader>
              <CardTitle>Version history</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-1 text-xs">
              {s.contracts.map((c) => (
                <div key={c.id} className="flex items-center justify-between">
                  <span>
                    v{c.version} · {c.creditDays} days · <span className="font-mono">{c.hash.slice(0, 12)}</span>
                  </span>
                  <StatusBadge status={c.status} />
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function DeliveryTab({ s, user }: { s: Shipment; user: SessionUser }) {
  const carrier = user.businessId === s.carrierId;
  return (
    <div className="flex flex-col gap-4" id="delivery">
      {carrier && s.status === "CONTRACTED" && (
        <Card>
          <CardHeader>
            <CardTitle>Pickup</CardTitle>
            <CardDescription>Confirm you have collected the cargo.</CardDescription>
          </CardHeader>
          <CardContent>
            <ActionForm action={pickupAction} fields={{ shipmentId: s.id }} label="Confirm pickup" />
          </CardContent>
        </Card>
      )}
      {carrier && ["IN_TRANSIT", "VERIFICATION_FAILED"].includes(s.status) && (
        <Card>
          <CardHeader>
            <CardTitle>Proof of delivery</CardTitle>
            <CardDescription>Delivery AI reads the POD and photos with Gemini vision and checks them against the contract.</CardDescription>
          </CardHeader>
          <CardContent>
            <PodUpload
              action={uploadPodAction}
              shipmentId={s.id}
              reference={s.reference}
              buyerName={s.buyer.name}
              buyerCity={s.destinationCity}
              carrierName={s.carrier.name}
              trackingNumber={s.carrierTrackingNumber ?? ""}
              quantity={s.quantity}
              unit={s.unit}
            />
          </CardContent>
        </Card>
      )}
      {s.carrierTrackingNumber && (
        <p className="text-sm">
          Tracking <span className="font-mono">{s.carrierTrackingNumber}</span> · picked up {day(s.pickedUpAt)} · delivered {day(s.deliveredAt)}
        </p>
      )}
      {s.deliveryEvidence.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {s.deliveryEvidence.map((e) => (
            <a key={e.id} href={`/api/evidence/${e.id}`} target="_blank" className="flex flex-col gap-1 text-xs">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/evidence/${e.id}`} alt={e.fileName} className="h-36 rounded border object-cover" />
              {e.type} · {e.fileName}
            </a>
          ))}
        </div>
      )}
      {s.verificationReports.map((r) => {
        const x = r.extractedJson as Record<string, unknown>;
        const discrepancies = r.discrepancies as unknown as Discrepancy[];
        return (
          <Card key={r.id}>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2">
                Verification report <StatusBadge status={r.status} /> <Tag>confidence {Math.round(r.confidence * 100)}%</Tag>
                {x.source === "sample" && <SimTag>sample AI output</SimTag>}
              </CardTitle>
              <CardDescription>{r.summary}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <table className="text-sm">
                <tbody>
                  {["consigneeName", "signaturePresent", "deliveredOn", "quantityReceived", "damagedUnits", "conditionNotes", "sealIntact"].map((k) =>
                    k in x ? (
                      <tr key={k} className="border-b last:border-0">
                        <td className="text-muted-foreground py-1 pr-3 text-xs">{humanize(k.replace(/([A-Z])/g, "_$1"))}</td>
                        <td className="py-1">{String(x[k] ?? "–")}</td>
                      </tr>
                    ) : null,
                  )}
                </tbody>
              </table>
              <div className="flex flex-col gap-2">
                {discrepancies.length === 0 && <p className="text-sm text-emerald-700">No discrepancies.</p>}
                {discrepancies.map((d, i) => (
                  <div key={i} className="rounded-md border p-2 text-sm">
                    <div className="flex items-center gap-2">
                      <Tag tone={d.severity === "MAJOR" ? "bad" : "warn"}>{d.severity.toLowerCase()}</Tag> <span className="font-medium">{d.field}</span>
                    </div>
                    <p className="text-xs">
                      Expected: {d.expected}. Observed: {d.observed}.
                    </p>
                    <p className="text-muted-foreground text-xs">{d.note}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })}
      {!s.verificationReports.length && !carrier && <p className="text-muted-foreground text-sm">No delivery evidence yet. The carrier uploads it.</p>}
    </div>
  );
}

function PaymentTab({ s, user, operator }: { s: Shipment; user: SessionUser; operator: boolean }) {
  const now = new Date();
  if (!s.paypalInvoices.length) return <p className="text-muted-foreground text-sm" id="payment">No invoice yet. Payment AI proposes one after delivery is verified, and an operator approves it.</p>;
  return (
    <div className="flex flex-col gap-4" id="payment">
      {s.paypalInvoices.map((inv) => {
        const clock = inv.creditClock;
        const mocked = isMockId(inv.paypalInvoiceId);
        const seededId = inv.paypalInvoiceId.startsWith("SEED-");
        const interest =
          clock?.interestRatePct && clock.statutoryDueDate
            ? computeInterest(num(inv.amount), { kind: "COMPOUND_MONTHLY", annualRatePct: num(clock.interestRatePct), accruesAfter: clock.statutoryDueDate, basis: "" }, inv.paidAt ?? now)
            : 0;
        const daysLeft = clock ? daysBetween(now, clock.dueDate) : null;
        const unsent = clock?.reminders.filter((r) => !r.sentAt) ?? [];
        return (
          <div key={inv.id} className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2">
                  Invoice {inv.invoiceNumber} <StatusBadge status={inv.status} />
                  {inv.channel === "MANUAL_RECORD" ? <SimTag>domestic: manual record</SimTag> : mocked ? <SimTag>PayPal mocked</SimTag> : seededId ? <Tag>seeded</Tag> : <Tag tone="info">PayPal Invoicing</Tag>}
                </CardTitle>
                <CardDescription className="font-mono text-xs">{inv.paypalInvoiceId}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 text-sm">
                <div className="flex justify-between">
                  <span>Amount</span>
                  <span className="font-medium">{money(inv.amount, inv.currency)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Sent</span>
                  <span>{dateTime(inv.sentAt)} to {inv.recipientEmail}</span>
                </div>
                <div className="flex justify-between">
                  <span>Paid</span>
                  <span>{inv.paidAt ? `${dateTime(inv.paidAt)} · ${inv.paymentReference}` : "not yet"}</span>
                </div>
                {inv.payerViewUrl && !inv.paidAt && (
                  <a href={inv.payerViewUrl} target="_blank" className="text-primary text-sm hover:underline">
                    Open the PayPal invoice as the buyer (sandbox login) ↗
                  </a>
                )}
                <div className="flex flex-wrap gap-3 pt-2">
                  {inv.channel === "PAYPAL" && !mocked && !seededId && !inv.paidAt && (
                    <ActionForm action={syncInvoiceAction} fields={{ invoiceId: inv.id }} label="Sync from PayPal" variant="outline" pendingLabel="Reading PayPal…" />
                  )}
                  {mocked && !inv.paidAt && !paypalConfigured() && (
                    <ActionForm action={simulatePaymentAction} fields={{ invoiceId: inv.id }} label="Simulate buyer payment (mocked)" variant="outline" />
                  )}
                </div>
                {inv.channel === "MANUAL_RECORD" && !inv.paidAt && operator && (
                  <ActionForm action={manualPaymentAction} fields={{ invoiceId: inv.id }} label="Record verified payment" variant="outline">
                    <p className="text-muted-foreground text-xs">PayPal does not settle Indian domestic payments. Record a bank transfer only after checking it.</p>
                    <div className="flex flex-wrap gap-2">
                      <Input name="bankReference" placeholder="Bank (UTR) reference" className="h-8 w-48 text-xs" />
                      <Input name="paidOn" type="date" defaultValue={isoDay(now)} className="h-8 w-40 text-xs" />
                    </div>
                  </ActionForm>
                )}
                {inv.refunds.map((r) => (
                  <div key={r.id} className="flex justify-between text-xs">
                    <span>
                      Refund {r.paypalRefundId} {isMockId(r.paypalRefundId) && <SimTag>mocked</SimTag>}
                    </span>
                    <span>
                      {money(r.amount, r.currency)} {r.status.toLowerCase()}
                    </span>
                  </div>
                ))}
                {s.paypalTrackings.map((t) => (
                  <p key={t.id} className="text-muted-foreground text-xs">
                    Tracking {t.trackingNumber} ({t.status}) on PayPal transaction {t.transactionId}
                    {isMockId(t.transactionId) && " (mocked)"}
                  </p>
                ))}
              </CardContent>
            </Card>
            {clock && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    Credit clock <StatusBadge status={inv.paidAt ? "PAID" : daysLeft !== null && daysLeft < 0 ? "OVERDUE" : "RUNNING"} />
                  </CardTitle>
                  <CardDescription>
                    Starts on acceptance of goods ({day(clock.acceptanceDate)}). {clock.preset === "IN_MSMED" ? "MSMED Act, 2006: s.15 caps credit at 45 days; s.16 interest at 3x the RBI bank rate, compounded monthly." : "Generic Net terms."}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-2 text-sm">
                  {!inv.paidAt && daysLeft !== null && (
                    <div className={cn("text-3xl font-semibold tabular-nums", daysLeft < 0 && "text-red-700")}>
                      {daysLeft >= 0 ? `${daysLeft} days left` : `${-daysLeft} days overdue`}
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span>Due (Net {clock.agreedDays})</span>
                    <span>{day(clock.dueDate)}</span>
                  </div>
                  {clock.statutoryDueDate && (
                    <div className="flex justify-between">
                      <span>Statutory due date</span>
                      <span>{day(clock.statutoryDueDate)}</span>
                    </div>
                  )}
                  {clock.interestRatePct && (
                    <div className="flex justify-between">
                      <span>Interest {num(clock.interestRatePct)}% a year</span>
                      <span className={cn(interest > 0 && "font-medium text-red-700")}>{money(interest, inv.currency)}</span>
                    </div>
                  )}
                  <div className="mt-2 flex flex-col gap-1">
                    <span className="text-xs font-medium">Reminders</span>
                    {clock.reminders.length === 0 && <span className="text-muted-foreground text-xs">None yet. Schedule: 7 and 1 days before, 1 and 15 days after the due date.</span>}
                    {clock.reminders.map((r) => (
                      <details key={r.id} className="rounded border px-2 py-1 text-xs">
                        <summary className="cursor-pointer">
                          {r.stage.replace(/_/g, " ")} · {r.tone} · {r.sentAt ? `sent ${day(r.sentAt)}` : "draft"} · {r.channel === "EMAIL_STUB" ? "email" : "PayPal reminder"}
                        </summary>
                        <p className="mt-1 font-medium">{r.subject}</p>
                        <p className="whitespace-pre-line">{r.body}</p>
                      </details>
                    ))}
                  </div>
                  {operator && !inv.paidAt && (
                    <div className="flex flex-wrap gap-3 pt-2">
                      <ActionForm action={draftReminderAction} fields={{ invoiceId: inv.id }} label="Draft next reminder (AI)" variant="outline" pendingLabel="Payment AI is drafting…" />
                      {unsent.map((r) => (
                        <ActionForm key={r.id} action={sendReminderAction} fields={{ reminderId: r.id }} label={`Send ${r.stage.replace(/_/g, " ").toLowerCase()}`} />
                      ))}
                    </div>
                  )}
                  {operator && clock.preset === "IN_MSMED" && daysLeft !== null && daysLeft < 0 && (
                    <ActionForm action={msmePackAction} fields={{ shipmentId: s.id }} label="Prepare MSME evidence package (AI)" variant="secondary" pendingLabel="Assembling the record…" />
                  )}
                  {user.role === "BUYER" && !inv.paidAt && <p className="text-muted-foreground text-xs">Pay through the PayPal invoice link sent to your sandbox account.</p>}
                </CardContent>
              </Card>
            )}
          </div>
        );
      })}
      <EvidencePacks packs={s.evidencePacks.filter((p) => p.kind === "MSME_SAMADHAAN")} />
    </div>
  );
}

function EvidencePacks({ packs }: { packs: Shipment["evidencePacks"] }) {
  if (!packs.length) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Evidence packages</CardTitle>
        <CardDescription>Prepared by Proof2Pay from its records. Not filed anywhere.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-1 text-sm">
        {packs.map((p) => (
          <Link key={p.id} href={`/evidence/${p.id}`} className="text-primary flex items-center gap-2 hover:underline">
            {PACK_LABEL[p.kind]} · {dateTime(p.createdAt)} <StatusBadge status={p.status} />
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}

function ResolutionTab({ s, user, operator }: { s: Shipment; user: SessionUser; operator: boolean }) {
  const buyer = user.businessId === s.buyerId && user.role === "BUYER";
  const paid = s.paypalInvoices.find((i) => i.paidAt && i.channel === "PAYPAL");
  const claims = s.insurancePolicies.flatMap((p) => p.claims);
  return (
    <div className="grid gap-4 lg:grid-cols-2" id="resolution">
      <div className="flex flex-col gap-4">
        {buyer && paid && (
          <Card>
            <CardHeader>
              <CardTitle>Report a problem</CardTitle>
              <CardDescription>Resolution AI compares your request with the contract, the POD and the insurance cover. A person decides.</CardDescription>
            </CardHeader>
            <CardContent>
              <ActionForm action={requestRefundAction} fields={{ shipmentId: s.id }} label="Request refund" pendingLabel="Resolution AI is assessing…">
                <div className="flex gap-2">
                  <Input name="amount" type="number" step="0.01" min="1" defaultValue="400" className="h-8 w-32" />
                  <span className="text-muted-foreground self-center text-xs">{paid.currency}</span>
                </div>
                <Textarea name="reason" defaultValue="One carton (no. 17) arrived dented and two parts inside are scratched. We ask for $400." rows={3} className="text-sm" />
              </ActionForm>
            </CardContent>
          </Card>
        )}
        {s.refundRequests.map((r) => (
          <Card key={r.id}>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2">
                Refund request {money(r.amount, r.currency)} <StatusBadge status={r.status} />
              </CardTitle>
              <CardDescription>
                {r.requestedBy?.name}: “{r.reason}”
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              {r.recommendations.map((rec) => (
                <div key={rec.id} className="flex flex-col gap-1 rounded-md border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Tag tone="info">Resolution AI</Tag>
                    <span className="font-medium">
                      {rec.decision.toLowerCase()} {num(rec.amount) > 0 && money(rec.amount, rec.currency)}
                    </span>
                    <Tag>confidence {Math.round(rec.confidence * 100)}%</Tag>
                  </div>
                  <p>{rec.reasoning}</p>
                  {rec.contractClausesCited.length > 0 && <p className="text-muted-foreground text-xs">Clauses: {rec.contractClausesCited.join(", ")}</p>}
                  {rec.evidenceRefs.length > 0 && <p className="text-muted-foreground font-mono text-xs break-all">Evidence: {rec.evidenceRefs.join(", ")}</p>}
                </div>
              ))}
              {r.refunds.map((f) => (
                <p key={f.id} className="text-xs">
                  PayPal refund {f.paypalRefundId}: {money(f.amount, f.currency)} {f.status.toLowerCase()} {isMockId(f.paypalRefundId) && <SimTag>mocked</SimTag>}
                </p>
              ))}
            </CardContent>
          </Card>
        ))}
        {claims.map((c) => (
          <Card key={c.id}>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2">
                Insurance claim {c.claimReference} <StatusBadge status={c.status} /> <SimTag>simulated insurer</SimTag>
              </CardTitle>
              <CardDescription>
                Claimed {money(c.amountClaimed)}, approved {money(c.amountApproved)}. {c.decisionNote}
              </CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>
      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle>PayPal disputes</CardTitle>
            <CardDescription>Opened by the buyer in PayPal. Resolution AI builds the case file; an operator approves the response.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <div className="flex flex-wrap gap-3">
              {operator && paypalConfigured() && <ActionForm action={syncDisputesAction} label="Sync disputes from PayPal" variant="outline" pendingLabel="Reading PayPal…" />}
              {buyer && paid && process.env.DEMO_MODE === "true" && !s.paypalDisputes.some((d) => d.status !== "RESOLVED") && (
                <ActionForm action={simulateDisputeAction} fields={{ shipmentId: s.id }} label="Open a dispute (replay, labelled)" variant="outline" />
              )}
            </div>
            {s.paypalDisputes.length === 0 && <p className="text-muted-foreground text-xs">No disputes on this shipment.</p>}
            {s.paypalDisputes.map((d) => (
              <div key={d.id} className="flex flex-col gap-2 rounded-md border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs">{d.paypalDisputeId}</span>
                  <StatusBadge status={d.status} />
                  {d.simulated && <SimTag>replayed dispute</SimTag>}
                  {d.outcome && <Tag>{humanize(d.outcome)}</Tag>}
                </div>
                <p>
                  {humanize(d.reason)} · {money(d.disputeAmount, d.currency)} · response due {day(d.responseDueAt)}
                </p>
                {(d.raw as { claim?: string } | null)?.claim && <p className="text-muted-foreground text-xs">“{(d.raw as { claim: string }).claim}”</p>}
                {operator && d.status !== "RESOLVED" && !s.evidencePacks.some((p) => p.disputeId === d.id) && (
                  <ActionForm action={disputeResponseAction} fields={{ disputeId: d.id }} label="Prepare response (Resolution AI)" pendingLabel="Building the case file…" />
                )}
              </div>
            ))}
          </CardContent>
        </Card>
        <EvidencePacks packs={s.evidencePacks.filter((p) => p.kind !== "MSME_SAMADHAAN")} />
      </div>
    </div>
  );
}
