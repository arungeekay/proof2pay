import { ArrowRight } from "lucide-react";
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
  switchPersona,
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
import { ShipmentWorkspace } from "@/components/shipment-workspace";
import { SimTag, StatusBadge, Tag } from "@/components/status";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ContractReview } from "@/lib/agents/contract";
import type { Discrepancy } from "@/lib/agents/delivery-match";
import { computeInterest, daysBetween } from "@/lib/credit-clock";
import { db } from "@/lib/db";
import { dateTime, day, humanize, isoDay, money, num, ROLE_LABEL } from "@/lib/format";
import { isMockId, paypalConfigured } from "@/lib/paypal/client";
import { canApprove, currentUser, listPersonas, type SessionUser } from "@/lib/session";
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
  { label: "Contract drafted", tab: "contract", statuses: ["CONTRACT_PENDING"] },
  { label: "Both parties accepted", tab: "contract", statuses: ["CONTRACTED"] },
  { label: "Picked up", tab: "delivery", statuses: ["IN_TRANSIT", "VERIFICATION_FAILED"] },
  { label: "Delivery verified", tab: "delivery", statuses: ["VERIFIED"] },
  { label: "Invoice sent", tab: "payment", statuses: ["INVOICED"] },
  { label: "Paid (confirmed)", tab: "payment", statuses: ["PAID", "DISPUTED", "CLOSED"] },
];

function stepIndex(status: string) {
  return status === "DRAFT" ? -1 : STEPS.findIndex((step) => step.statuses.includes(status));
}

type TabId = "contract" | "delivery" | "payment" | "resolution";
type Persona = Awaited<ReturnType<typeof listPersonas>>[number];

/** What happens next on this shipment, the tab where it happens, and the person to switch to when it is someone else's turn. */
interface Guide {
  text: string;
  tab: TabId;
  switchTo?: Persona;
}

function guide(s: Shipment, user: SessionUser, personas: Persona[]): Guide {
  const find = (role: Persona["role"], businessId: string) => personas.find((p) => p.role === role && p.businessId === businessId);
  const exporter = find("EXPORTER", s.exporterId);
  const manager = find("MANAGER", s.exporterId) ?? exporter;
  const buyer = find("BUYER", s.buyerId);
  const carrier = find("CARRIER", s.carrierId);
  const operator = canApprove(user) && user.businessId === s.exporterId;
  const isCarrier = user.businessId === s.carrierId;
  const isBuyer = user.businessId === s.buyerId && user.role === "BUYER";

  const pending = s.approvalRequests.filter((a) => a.status === "PENDING");
  if (pending.length) {
    const tab: TabId = pending[0].actionType === "INVOICE_SEND" ? "payment" : "resolution";
    return operator
      ? { text: `The AI has prepared an action and needs your decision. Check it below, then click Approve or Reject: ${pending[0].summary}.`, tab }
      : { text: `The AI has prepared an action: ${pending[0].summary}. Nothing happens until the finance manager approves it.`, tab, switchTo: manager };
  }

  const failed = s.approvalRequests.find((a) => a.status === "FAILED");
  if (failed) {
    const tab: TabId = failed.actionType === "INVOICE_SEND" ? "payment" : "resolution";
    return operator
      ? { text: `An approved action did not go through: ${failed.summary}. The reason is shown in red below. Click Retry to try again.`, tab }
      : { text: `An approved action did not go through: ${failed.summary}. The finance manager can retry it.`, tab, switchTo: manager };
  }

  switch (s.status) {
    case "DRAFT":
      return operator
        ? { text: "Click “Draft contract” below. Contract AI writes the contract from the shipment details and checks it for problems.", tab: "contract" }
        : { text: "The exporter starts by drafting the contract.", tab: "contract", switchTo: exporter };
    case "CONTRACT_PENDING": {
      const contract = s.contracts.find((c) => c.status === "PENDING_ACCEPTANCE");
      if (!contract) {
        return operator
          ? { text: "This draft breaks a legal rule (see the red flag on the right). Change the credit period and redraft.", tab: "contract" }
          : { text: "The draft breaks a legal rule. The exporter has to change the terms and redraft.", tab: "contract", switchTo: exporter };
      }
      const accepted = contract.acceptances.map((a) => a.party);
      const missing = (["EXPORTER", "BUYER"] as const).filter((p) => !accepted.includes(p));
      const mine = user.businessId === s.exporterId ? "EXPORTER" : isBuyer ? "BUYER" : null;
      if (mine && missing.includes(mine)) return { text: `Read the contract, then click “Accept as ${mine.toLowerCase()}” on the right.`, tab: "contract" };
      if (!missing.length) return { text: "Both parties have accepted the contract.", tab: "contract" };
      return { text: `The contract is waiting for the ${missing[0].toLowerCase()} to accept it.`, tab: "contract", switchTo: missing[0] === "EXPORTER" ? exporter : buyer };
    }
    case "CONTRACTED":
      return isCarrier
        ? { text: "Both parties have accepted. Click “Confirm pickup” below once you have collected the cargo.", tab: "delivery" }
        : { text: "Both parties have accepted. The carrier collects the cargo next.", tab: "delivery", switchTo: carrier };
    case "IN_TRANSIT":
    case "VERIFICATION_FAILED":
      return isCarrier
        ? { text: "Upload the signed proof of delivery and photos below (or click “Generate demo POD and photos”), then “Upload and verify”. Delivery AI checks them against the contract.", tab: "delivery" }
        : { text: "The cargo is on its way. The carrier uploads the proof of delivery next.", tab: "delivery", switchTo: carrier };
    case "INVOICED": {
      const invoice = s.paypalInvoices[0];
      if (invoice?.channel === "MANUAL_RECORD") {
        return operator
          ? { text: "This invoice is unpaid. Below you can draft a reminder with AI, prepare the MSME evidence package, or record a payment you have checked with the bank.", tab: "payment" }
          : { text: "This invoice is unpaid. The finance manager can send reminders and prepare the evidence package.", tab: "payment", switchTo: manager };
      }
      if (invoice && isMockId(invoice.paypalInvoiceId)) return { text: "PayPal is mocked here: click “Simulate buyer payment” below.", tab: "payment" };
      return {
        text: "The invoice is with the buyer. To pay it, open the link “Open the PayPal invoice as the buyer” below in a private window and log in with the PayPal sandbox buyer account. Then click “Sync from PayPal”.",
        tab: "payment",
      };
    }
    case "PAID": {
      const refundable = s.paypalInvoices.some((i) => i.paidAt && i.channel === "PAYPAL");
      if (s.refundRequests.length) return { text: "Paid, and the refund request has been dealt with. The details are below.", tab: "resolution" };
      if (isBuyer && refundable) return { text: "Paid. If something is wrong with the goods, report it below and Resolution AI will assess the claim (story 3).", tab: "resolution" };
      return refundable
        ? { text: "Paid and confirmed by PayPal. Trust profiles are updated. To try story 3 (damaged goods), continue as the buyer and report a problem.", tab: "payment", switchTo: buyer }
        : { text: "Paid and recorded. Trust profiles are updated.", tab: "payment" };
    }
    case "DISPUTED": {
      const responded = s.evidencePacks.some((p) => p.kind === "DISPUTE_RESPONSE" && p.status === "SUBMITTED");
      if (responded) return { text: "The dispute response has been sent. PayPal decides the outcome and this page updates when it does.", tab: "resolution" };
      return operator
        ? { text: "The buyer has opened a dispute. Click “Prepare response” below and Resolution AI builds the case file for you to approve.", tab: "resolution" }
        : { text: "A dispute is open. The finance manager prepares the response.", tab: "resolution", switchTo: manager };
    }
    default:
      return { text: "Nothing to do on this shipment right now.", tab: "payment" };
  }
}

export default async function ShipmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [s, user, personas] = await Promise.all([load(id), currentUser(), listPersonas()]);
  if (!s) notFound();
  const operator = canApprove(user) && user.businessId === s.exporterId;
  const pending = s.approvalRequests.filter((a) => a.status === "PENDING" || a.status === "FAILED");
  const next = guide(s, user, personas);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-mono text-2xl font-semibold">{s.reference}</h1>
          <StatusBadge status={s.status} />
          {s.seeded && <Tag>pre-loaded demo record</Tag>}
          {s.destinationCountry === "IN" && <SimTag>domestic: manual payment record</SimTag>}
        </div>
        <p className="text-muted-foreground text-sm">
          {s.quantity} {s.unit} of {s.cargoDescription}, {s.originCity} to {s.destinationCity}. Goods {money(s.declaredValue, s.currency)}, freight {money(s.freightAmount, s.currency)}, payment
          due {s.creditTermsDays} days after delivery{s.jurisdictionPreset === "IN_MSMED" && " (India’s MSME late-payment law applies)"}.
        </p>
        <p className="text-sm">
          Exporter <Link className="text-primary hover:underline" href={`/trust/${s.exporterId}`}>{s.exporter.name}</Link> · Carrier{" "}
          <Link className="text-primary hover:underline" href={`/trust/${s.carrierId}`}>{s.carrier.name}</Link> · Buyer{" "}
          <Link className="text-primary hover:underline" href={`/trust/${s.buyerId}`}>{s.buyer.name}</Link>
        </p>
      </div>

      <ShipmentWorkspace
        key={`${next.tab}-${user.id}`}
        steps={STEPS.map(({ label, tab }) => ({ label, tab }))}
        done={stepIndex(s.status)}
        initialTab={next.tab}
        top={
          <>
            <Alert className="border-primary/40 bg-primary/5">
              <AlertTitle className="flex flex-wrap items-center gap-2">
                What happens next
                <span className="text-muted-foreground text-xs font-normal">
                  You are viewing as {user.name} ({ROLE_LABEL[user.role]})
                </span>
              </AlertTitle>
              <AlertDescription className="flex flex-col gap-3">
                <p className="text-foreground text-sm">{next.text}</p>
                {next.switchTo && next.switchTo.id !== user.id && (
                  <form action={switchPersona}>
                    <input type="hidden" name="userId" value={next.switchTo.id} />
                    <Button type="submit" size="sm">
                      Continue as {next.switchTo.name} ({ROLE_LABEL[next.switchTo.role]}) <ArrowRight />
                    </Button>
                  </form>
                )}
              </AlertDescription>
            </Alert>

            {pending.length > 0 && operator && (
              <Card className="border-amber-300">
                <CardHeader>
                  <CardTitle>Needs your approval</CardTitle>
                  <CardDescription>The AI only proposes. Nothing is sent to PayPal or the insurer until you approve it here.</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  {pending.map((a) => (
                    <ApprovalItem key={a.id} approval={a} canDecide={operator} />
                  ))}
                </CardContent>
              </Card>
            )}
          </>
        }
        panels={[
          { id: "contract", label: "1. Contract", content: <ContractTab s={s} user={user} operator={operator} /> },
          { id: "delivery", label: "2. Delivery", content: <DeliveryTab s={s} user={user} /> },
          { id: "payment", label: "3. Payment", content: <PaymentTab s={s} user={user} operator={operator} /> },
          { id: "resolution", label: "Problems and refunds", content: <ResolutionTab s={s} user={user} operator={operator} /> },
          { id: "audit", label: `History (${s.auditEvents.length})`, content: <AuditList events={s.auditEvents} /> },
        ]}
      />
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
        {contract && (
          <Card>
            <CardHeader>
              <CardTitle>Acceptance</CardTitle>
              <CardDescription>Both sides accept exactly the same text (the SHA-256 code above the contract is its fingerprint). The AI never signs.</CardDescription>
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
        {operator && editable && (
          <Card>
            <CardHeader>
              <CardTitle>Contract AI</CardTitle>
              <CardDescription>Writes the contract from the shipment details using fixed, human-written clauses, then flags problems and explains each section.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <ActionForm action={draftContractAction} fields={{ shipmentId: s.id }} label={contract ? "Redraft" : "Draft contract"} pendingLabel="Contract AI is drafting…" />
              <ActionForm action={changeTermsAction} fields={{ shipmentId: s.id }} label="Change and redraft" variant="outline" pendingLabel="Redrafting…">
                <Label htmlFor="days" className="text-xs">
                  Days the buyer has to pay. Try 60 to see the legal limit of 45 days block it.
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
                AI review <SourceTag source={review.source} model={review.model} />
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

const STAGE_LABEL: Record<string, string> = {
  T_MINUS_7: "7 days before the due date",
  T_MINUS_1: "1 day before the due date",
  T_PLUS_1: "1 day overdue",
  T_PLUS_15: "15 days overdue",
  FINAL_NOTICE: "Final notice",
};

/** Plain wording for a reminder stage such as T_MINUS_7. */
const stageLabel = (stage: string) => STAGE_LABEL[stage] ?? humanize(stage);

/** What Delivery AI read from the proof of delivery, in the order shown. */
const POD_FIELDS = [
  ["consigneeName", "Received by"],
  ["signaturePresent", "Signed"],
  ["deliveredOn", "Delivered on"],
  ["quantityReceived", "Quantity received"],
  ["damagedUnits", "Damaged units"],
  ["conditionNotes", "Condition notes"],
  ["sealIntact", "Seal intact"],
] as const;

function plainValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "–";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (key === "deliveredOn" && typeof value === "string" && !Number.isNaN(Date.parse(value))) return day(new Date(value));
  return String(value);
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
                What the AI found <StatusBadge status={r.status} /> <Tag>AI confidence {Math.round(r.confidence * 100)}%</Tag>
                {x.source === "sample" && <SimTag>sample AI output</SimTag>}
              </CardTitle>
              <CardDescription>{r.summary}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <table className="text-sm">
                <tbody>
                  {POD_FIELDS.map(([k, label]) =>
                    k in x ? (
                      <tr key={k} className="border-b last:border-0">
                        <td className="text-muted-foreground py-1 pr-3 text-xs">{label}</td>
                        <td className="py-1">{plainValue(k, x[k])}</td>
                      </tr>
                    ) : null,
                  )}
                </tbody>
              </table>
              <div className="flex flex-col gap-2">
                {discrepancies.length === 0 && <p className="text-sm text-emerald-700">Everything matches the contract.</p>}
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
                    Counts the days until payment is due, starting when the goods were accepted ({day(clock.acceptanceDate)}). {clock.preset === "IN_MSMED" ? "MSMED Act, 2006: s.15 caps credit at 45 days; s.16 interest at 3x the RBI bank rate, compounded monthly." : "Generic Net terms."}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-2 text-sm">
                  {!inv.paidAt && daysLeft !== null && (
                    <div className={cn("text-3xl font-semibold tabular-nums", daysLeft < 0 && "text-red-700")}>
                      {daysLeft >= 0 ? `${daysLeft} days left` : `${-daysLeft} days overdue`}
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span>Due date ({clock.agreedDays} days after delivery)</span>
                    <span>{day(clock.dueDate)}</span>
                  </div>
                  {clock.statutoryDueDate && (
                    <div className="flex justify-between">
                      <span>Latest due date the law allows</span>
                      <span>{day(clock.statutoryDueDate)}</span>
                    </div>
                  )}
                  {clock.interestRatePct && (
                    <div className="flex justify-between">
                      <span>Late-payment interest so far ({num(clock.interestRatePct)}% a year)</span>
                      <span className={cn(interest > 0 && "font-medium text-red-700")}>{money(interest, inv.currency)}</span>
                    </div>
                  )}
                  <div className="mt-2 flex flex-col gap-1">
                    <span className="text-xs font-medium">Reminders</span>
                    {clock.reminders.length === 0 && <span className="text-muted-foreground text-xs">None yet. Schedule: 7 and 1 days before, 1 and 15 days after the due date.</span>}
                    {clock.reminders.map((r) => (
                      <details key={r.id} className="rounded border px-2 py-1 text-xs">
                        <summary className="cursor-pointer">
                          {stageLabel(r.stage)} · {r.tone.toLowerCase()} tone · {r.sentAt ? `sent ${day(r.sentAt)}` : "draft, not sent"} · {r.channel === "EMAIL_STUB" ? "email" : "PayPal reminder"}
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
                        <ActionForm key={r.id} action={sendReminderAction} fields={{ reminderId: r.id }} label={`Send reminder: ${stageLabel(r.stage).toLowerCase()}`} />
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
      {s.paypalInvoices.some((i) => i.channel === "PAYPAL") && (
        <Link href="/paypal" className="text-primary text-sm hover:underline">
          See all PayPal transactions →
        </Link>
      )}
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
