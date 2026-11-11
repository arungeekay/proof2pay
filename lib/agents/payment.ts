// Payment AI (plan Section 6.3, v2 scope). Proposes the invoice after verified delivery (an operator approves
// sending it), sends it through PayPal Invoicing, runs the credit clock, drafts reminders, and reconciles payment.
// An invoice is marked paid only from PayPal's own record (verified webhook or a read of the invoice), or, for
// Indian domestic trade that PayPal cannot settle, from an operator's manually verified record.

import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { audit } from "@/lib/agents/audit";
import { recordTrust } from "@/lib/agents/trust";
import { proposeAction } from "@/lib/approvals";
import { isDomestic } from "@/lib/contracts/build";
import {
  clockStatus,
  computeClock,
  computeInterest,
  daysBetween,
  nextReminderStage,
  PRESETS,
  reminderSchedule,
  type ReminderStage,
} from "@/lib/credit-clock";
import { db } from "@/lib/db";
import { day, isoDay, money, num, round2 } from "@/lib/format";
import { auditModel, generateJson } from "@/lib/llm";
import { addTracker, createAndSendInvoice, getInvoice, remindInvoice } from "@/lib/paypal/api";
import { isMockId, paypalConfigured } from "@/lib/paypal/client";
import type { SessionUser } from "@/lib/session";

export interface InvoiceProposal {
  channel: "PAYPAL" | "MANUAL_RECORD";
  invoiceNumber: string;
  currency: string;
  invoiceDate: string;
  acceptanceDate: string;
  dueDate: string;
  statutoryDueDate: string | null;
  agreedDays: number;
  recipientName: string;
  recipientEmail: string;
  items: { name: string; description: string; quantity: number; unitAmount: number }[];
  total: number;
  note: string;
}

const requireOperator = (actor: SessionUser) => {
  if (actor.role !== "MANAGER" && actor.role !== "EXPORTER") throw new Error("Only the exporter's operators can do this.");
};

export async function proposeInvoice(shipmentId: string, trigger: string) {
  const shipment = await db.shipment.findUniqueOrThrow({
    where: { id: shipmentId },
    include: { buyer: true, exporter: true, contracts: { where: { status: "ACCEPTED" }, take: 1 }, verificationReports: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  const contract = shipment.contracts[0];
  const report = shipment.verificationReports[0];
  if (!contract || !report || !shipment.deliveredAt) throw new Error("Invoice needs an accepted contract and a verified delivery.");

  const domestic = isDomestic(shipment);
  const clock = computeClock({ acceptanceDate: shipment.deliveredAt, agreedDays: contract.creditDays, preset: contract.jurisdictionPreset });
  const value = num(shipment.declaredValue);
  const freight = num(shipment.freightAmount);
  const items = [
    { name: `${shipment.cargoDescription} (${shipment.reference})`, description: `${shipment.quantity} ${shipment.unit}, contract v${contract.version}`, quantity: shipment.quantity, unitAmount: round2(value / shipment.quantity) },
    ...(!domestic && freight > 0 ? [{ name: `Freight ${shipment.originCity} to ${shipment.destinationCity}`, description: "Per contract section 5", quantity: 1, unitAmount: freight }] : []),
  ];
  const total = round2(items.reduce((sum, item) => sum + item.quantity * item.unitAmount, 0));
  const proposal: InvoiceProposal = {
    channel: domestic ? "MANUAL_RECORD" : "PAYPAL",
    invoiceNumber: `P2P-${shipment.reference}-${Date.now().toString(36).toUpperCase()}`,
    currency: shipment.currency,
    invoiceDate: isoDay(new Date()),
    acceptanceDate: isoDay(shipment.deliveredAt),
    dueDate: isoDay(clock.dueDate),
    statutoryDueDate: clock.statutoryDueDate ? isoDay(clock.statutoryDueDate) : null,
    agreedDays: clock.agreedDays,
    recipientName: shipment.buyer.name,
    recipientEmail: domestic ? (shipment.buyer.paypalEmail ?? "accounts@buyer.example") : (process.env.PAYPAL_SANDBOX_BUYER_EMAIL || shipment.buyer.paypalEmail || ""),
    items,
    total,
    note:
      `Shipment ${shipment.reference}, delivered and verified on ${day(shipment.deliveredAt)}. Contract hash ${contract.hash.slice(0, 12)}. ` +
      `Due ${day(clock.dueDate)} (Net ${clock.agreedDays} from acceptance).` +
      (clock.interestRule.kind === "COMPOUND_MONTHLY" ? ` Late payment attracts interest under MSMED Act s.16 at ${clock.interestRule.annualRatePct}% a year.` : ""),
  };
  const discrepancies = (report.discrepancies as unknown[]).length;
  await proposeAction({
    agent: "PAYMENT_AI",
    actionType: "INVOICE_SEND",
    shipmentId,
    summary: `${domestic ? "Issue" : "Send PayPal"} invoice ${money(total, shipment.currency)} to ${shipment.buyer.name}, due ${day(clock.dueDate)}`,
    payload: proposal as unknown as Prisma.InputJsonValue,
    reasoning:
      `Delivery verified (${report.status}, confidence ${report.confidence}). Credit clock starts on acceptance, ${day(shipment.deliveredAt)}; ` +
      `contract v${contract.version} sets Net ${clock.agreedDays}, so the invoice is due ${day(clock.dueDate)}.` +
      (clock.statutoryDueDate ? ` ${PRESETS.IN_MSMED.label}: statutory due date ${day(clock.statutoryDueDate)}.` : "") +
      (discrepancies ? ` The verification report has ${discrepancies} discrepancy(ies); the buyer can object within the contract's window, so the invoice is for the contracted value.` : "") +
      (domestic ? " Domestic Indian sale: PayPal cannot settle it, so the invoice is issued as a record and payment will be manually verified." : ""),
    trigger,
    evidenceRefs: [`verification:${report.id}`, `contract:${contract.id}`],
  });
}

/** Executes an approved INVOICE_SEND. */
export async function executeInvoiceSend(approvalId: string, payload: InvoiceProposal, actor: SessionUser) {
  const approval = await db.approvalRequest.findUniqueOrThrow({ where: { id: approvalId }, include: { shipment: { include: { exporter: true, contracts: { where: { status: "ACCEPTED" }, take: 1 } } } } });
  const shipment = approval.shipment!;
  const contract = shipment.contracts[0];
  const sent =
    payload.channel === "PAYPAL"
      ? await createAndSendInvoice({
          invoiceNumber: payload.invoiceNumber,
          reference: shipment.reference,
          currency: payload.currency,
          invoiceDate: payload.invoiceDate,
          dueDate: payload.dueDate,
          invoicerBusinessName: shipment.exporter.name,
          recipientBusinessName: payload.recipientName,
          recipientEmail: payload.recipientEmail,
          items: payload.items,
          note: payload.note,
          terms: `Proof2Pay contract ${shipment.reference} v${contract.version}, hash ${contract.hash}.`,
        })
      : { id: `MANUAL-${payload.invoiceNumber}`, status: "SENT", payerViewUrl: null, mocked: false, raw: { channel: "MANUAL_RECORD" } };

  const acceptance = new Date(`${payload.acceptanceDate}T00:00:00Z`);
  const clock = computeClock({ acceptanceDate: acceptance, agreedDays: payload.agreedDays, preset: contract.jurisdictionPreset });
  const invoice = await db.payPalInvoice.create({
    data: {
      shipmentId: shipment.id,
      paypalInvoiceId: sent.id,
      invoiceNumber: payload.invoiceNumber,
      purpose: "GOODS",
      channel: payload.channel,
      status: sent.status,
      amount: payload.total,
      currency: payload.currency,
      recipientEmail: payload.recipientEmail,
      payerViewUrl: sent.payerViewUrl,
      sentAt: new Date(),
      dueDate: clock.dueDate,
      raw: sent.raw as Prisma.InputJsonValue,
      creditClock: {
        create: {
          preset: contract.jurisdictionPreset,
          acceptanceDate: acceptance,
          agreedDays: clock.agreedDays,
          statutoryCapDays: clock.statutoryCapDays,
          dueDate: clock.dueDate,
          statutoryDueDate: clock.statutoryDueDate,
          interestRatePct: clock.interestRule.kind === "COMPOUND_MONTHLY" ? clock.interestRule.annualRatePct : null,
        },
      },
    },
  });
  await db.shipment.update({ where: { id: shipment.id }, data: { status: "INVOICED" } });
  await audit({
    agent: "PAYMENT_AI",
    trigger: `approval:${approvalId}`,
    shipmentId: shipment.id,
    actorUserId: actor.id,
    approvalRequestId: approvalId,
    evidenceRefs: [`invoice:${invoice.id}`],
    outcome:
      payload.channel === "PAYPAL"
        ? `${sent.mocked ? "PayPal mocked: " : ""}PayPal invoice ${sent.id} sent to ${payload.recipientEmail}; credit clock running to ${day(clock.dueDate)}`
        : `Domestic invoice ${payload.invoiceNumber} issued (manual record); credit clock running to ${day(clock.dueDate)}`,
  });
  return { invoiceId: invoice.id, paypalInvoiceId: sent.id, mocked: sent.mocked };
}

/** Reads the invoice from PayPal and applies a payment PayPal reports. Called by the webhook and the Sync button. */
export async function syncInvoiceFromPayPal(invoiceId: string, trigger: string) {
  const invoice = await db.payPalInvoice.findUniqueOrThrow({ where: { id: invoiceId } });
  if (invoice.channel !== "PAYPAL") throw new Error("Domestic invoices are not on PayPal.");
  if (isMockId(invoice.paypalInvoiceId) || invoice.paypalInvoiceId.startsWith("SEED-")) throw new Error("This invoice was never sent to PayPal (mocked or seeded).");
  const state = await getInvoice(invoice.paypalInvoiceId);
  await db.payPalInvoice.update({ where: { id: invoiceId }, data: { status: state.status, payerViewUrl: state.payerViewUrl ?? invoice.payerViewUrl, raw: state.raw as Prisma.InputJsonValue } });
  if (state.status === "PAID" && !invoice.paidAt) {
    await applyInvoicePaid(invoiceId, { transactionId: state.transactionId, paidAt: state.paidAt ?? new Date(), source: "paypal", trigger });
    return "PAID";
  }
  await audit({ agent: "PAYMENT_AI", trigger, shipmentId: invoice.shipmentId, evidenceRefs: [`invoice:${invoiceId}`], outcome: `PayPal reports invoice status ${state.status}` });
  return state.status;
}

export async function applyInvoicePaid(
  invoiceId: string,
  input: { transactionId: string | null; paidAt: Date; source: "paypal" | "manual" | "mock"; trigger: string; actorUserId?: string; note?: string },
) {
  const invoice = await db.payPalInvoice.findUniqueOrThrow({
    where: { id: invoiceId },
    include: { creditClock: true, shipment: { include: { carrier: true } } },
  });
  if (invoice.paidAt) return;
  const clock = invoice.creditClock;
  const interest =
    clock?.interestRatePct && clock.statutoryDueDate
      ? computeInterest(num(invoice.amount), { kind: "COMPOUND_MONTHLY", annualRatePct: num(clock.interestRatePct), accruesAfter: clock.statutoryDueDate, basis: "MSMED s.16" }, input.paidAt)
      : 0;

  await db.$transaction([
    db.payPalInvoice.update({ where: { id: invoiceId }, data: { status: "PAID", paidAt: input.paidAt, paymentReference: input.transactionId } }),
    ...(clock ? [db.creditClock.update({ where: { id: clock.id }, data: { status: "PAID", paidAt: input.paidAt, interestAccrued: interest } })] : []),
    db.shipment.update({ where: { id: invoice.shipmentId }, data: { status: "PAID" } }),
  ]);
  const late = clock ? daysBetween(clock.dueDate, input.paidAt) : 0;
  await audit({
    agent: input.source === "manual" ? "OPERATOR" : input.source === "paypal" ? "WEBHOOK" : "SYSTEM",
    trigger: input.trigger,
    shipmentId: invoice.shipmentId,
    actorUserId: input.actorUserId,
    evidenceRefs: [`invoice:${invoiceId}`, ...(input.transactionId ? [`paypal-transaction:${input.transactionId}`] : [])],
    outcome:
      (input.source === "paypal"
        ? `PayPal confirms invoice paid (transaction ${input.transactionId})`
        : input.source === "manual"
          ? `Payment recorded as a manually verified record: ${input.note ?? ""}`
          : `PayPal mocked: simulated buyer payment`) +
      (late > 0 ? `; ${late} days late${interest ? `, MSMED interest ${money(interest, invoice.currency)}` : ""}` : "; on time"),
  });

  // Attach delivery proof to the PayPal transaction (strengthens the seller's position in a dispute).
  const shipment = invoice.shipment;
  if (invoice.channel === "PAYPAL" && input.transactionId && shipment.carrierTrackingNumber) {
    try {
      const tracker = await addTracker({ transactionId: input.transactionId, trackingNumber: shipment.carrierTrackingNumber, carrierName: shipment.carrier.name });
      await db.payPalTracking.create({
        data: {
          shipmentId: shipment.id,
          transactionId: input.transactionId,
          trackingNumber: shipment.carrierTrackingNumber,
          carrierName: shipment.carrier.name,
          status: "DELIVERED",
          paypalTrackerId: tracker.trackerId,
          raw: tracker.raw as Prisma.InputJsonValue,
        },
      });
      await audit({
        agent: "DELIVERY_AI",
        trigger: "payment:confirmed",
        shipmentId: shipment.id,
        outcome: `${tracker.mocked ? "PayPal mocked: " : ""}Tracking ${shipment.carrierTrackingNumber} (DELIVERED) added to PayPal transaction ${input.transactionId}`,
      });
    } catch (error) {
      await audit({ agent: "DELIVERY_AI", trigger: "payment:confirmed", shipmentId: shipment.id, outcome: `Add Tracking failed: ${String(error)}` });
    }
  }
  await recordTrust([shipment.buyerId, shipment.carrierId], `payment:${invoiceId}`);
}

export async function simulateMockPayment(invoiceId: string, actor: SessionUser) {
  const invoice = await db.payPalInvoice.findUniqueOrThrow({ where: { id: invoiceId } });
  if (paypalConfigured() && !isMockId(invoice.paypalInvoiceId)) throw new Error("This invoice is live in the PayPal sandbox: pay it there as the buyer.");
  if (!isMockId(invoice.paypalInvoiceId)) throw new Error("Only mocked PayPal invoices can be paid by simulation.");
  await applyInvoicePaid(invoiceId, { transactionId: `MOCK-TXN-${Date.now().toString(36).toUpperCase()}`, paidAt: new Date(), source: "mock", trigger: "user:simulate_payment", actorUserId: actor.id });
}

export async function recordManualPayment(invoiceId: string, input: { bankReference: string; paidOn: string }, actor: SessionUser) {
  requireOperator(actor);
  const invoice = await db.payPalInvoice.findUniqueOrThrow({ where: { id: invoiceId } });
  if (invoice.channel !== "MANUAL_RECORD") throw new Error("PayPal invoices are marked paid only by PayPal.");
  if (!input.bankReference.trim()) throw new Error("Enter the bank transfer reference you checked.");
  const paidAt = new Date(`${input.paidOn}T12:00:00Z`);
  if (Number.isNaN(paidAt.getTime()) || paidAt > new Date()) throw new Error("Enter the date the money arrived (not in the future).");
  await applyInvoicePaid(invoiceId, {
    transactionId: `BANK-${input.bankReference.trim()}`,
    paidAt,
    source: "manual",
    trigger: "user:record_manual_payment",
    actorUserId: actor.id,
    note: `bank reference ${input.bankReference.trim()}, checked by ${actor.name}`,
  });
}

// ---------------------------------------------------------------------------
// Reminders
// ---------------------------------------------------------------------------

const ReminderSchema = z.object({
  subject: z.string(),
  body: z.string().describe("Plain text, under 120 words, no threats, no legal conclusions beyond the facts given"),
  tone: z.enum(["friendly", "courteous", "firm", "formal"]),
});

const STAGE_TONE: Record<ReminderStage | "FINAL_NOTICE", string> = {
  T_MINUS_7: "friendly",
  T_MINUS_1: "courteous",
  T_PLUS_1: "firm",
  T_PLUS_15: "formal",
  FINAL_NOTICE: "formal",
};

export async function draftReminder(invoiceId: string, actor: SessionUser) {
  requireOperator(actor);
  const invoice = await db.payPalInvoice.findUniqueOrThrow({
    where: { id: invoiceId },
    include: { creditClock: { include: { reminders: true } }, shipment: { include: { buyer: true, exporter: true } } },
  });
  const clock = invoice.creditClock;
  if (!clock || invoice.paidAt) throw new Error("No running credit clock on this invoice.");
  const now = new Date();
  const sent = clock.reminders.map((r) => r.stage).filter((s): s is ReminderStage => s !== "FINAL_NOTICE");
  let stage: ReminderStage | "FINAL_NOTICE" | null = nextReminderStage(clock.dueDate, now, sent);
  const overdueDays = daysBetween(clock.dueDate, now);
  if (!stage && overdueDays > 15 && !clock.reminders.some((r) => r.stage === "FINAL_NOTICE")) stage = "FINAL_NOTICE";
  if (!stage) {
    const next = reminderSchedule(clock.dueDate).find((r) => r.date > now && !sent.includes(r.stage));
    throw new Error(next ? `No reminder is due yet. The next one (${next.stage}) is due on ${day(next.date)}.` : "Every reminder stage has been used.");
  }
  const interest =
    clock.interestRatePct && clock.statutoryDueDate
      ? computeInterest(num(invoice.amount), { kind: "COMPOUND_MONTHLY", annualRatePct: num(clock.interestRatePct), accruesAfter: clock.statutoryDueDate, basis: "MSMED s.16" }, now)
      : 0;
  const facts = {
    stage,
    supplier: invoice.shipment.exporter.name,
    buyer: invoice.shipment.buyer.name,
    shipment: invoice.shipment.reference,
    invoiceNumber: invoice.invoiceNumber,
    amount: money(invoice.amount, invoice.currency),
    dueDate: day(clock.dueDate),
    daysOverdue: Math.max(0, overdueDays),
    msmed: clock.preset === "IN_MSMED",
    statutoryInterestToDate: interest ? money(interest, invoice.currency) : null,
    interestRatePct: clock.interestRatePct ? num(clock.interestRatePct) : null,
    previousReminders: clock.reminders.length,
  };
  const draft = await generateJson({
    system:
      "You are Payment AI inside Proof2Pay. Draft a payment reminder from a small supplier to a business customer. " +
      "Use only the facts given. Be professional; escalate tone with the stage. For a FINAL_NOTICE under MSMED, state that the supplier " +
      "may refer the claim to the MSE Facilitation Council, without threatening or claiming any outcome.",
    prompt: `Facts: ${JSON.stringify(facts)}\nTone for this stage: ${STAGE_TONE[stage]}.`,
    schema: ReminderSchema,
    sample: {
      subject: `${invoice.shipment.reference}: invoice ${invoice.invoiceNumber} ${overdueDays > 0 ? `${overdueDays} days overdue` : `due ${day(clock.dueDate)}`}`,
      body:
        `Dear ${invoice.shipment.buyer.name} accounts team,\n\nOur invoice ${invoice.invoiceNumber} for ${facts.amount} (shipment ${invoice.shipment.reference}) ` +
        (overdueDays > 0 ? `was due on ${facts.dueDate} and is ${overdueDays} days overdue.` : `is due on ${facts.dueDate}.`) +
        (interest ? ` Under section 16 of the MSMED Act, 2006, interest of ${facts.statutoryInterestToDate} has accrued to date.` : "") +
        (stage === "FINAL_NOTICE" ? " If payment is not received within 7 days, we may refer the matter to the MSE Facilitation Council." : "") +
        `\n\nRegards,\n${invoice.shipment.exporter.name}`,
      tone: STAGE_TONE[stage] as "formal",
    },
  });
  const reminder = await db.paymentReminder.create({
    data: {
      creditClockId: clock.id,
      stage,
      tone: draft.data.tone,
      subject: draft.data.subject,
      body: draft.data.body,
      channel: invoice.channel === "PAYPAL" ? "PAYPAL_INVOICE_REMINDER" : "EMAIL_STUB",
    },
  });
  await audit({
    agent: "PAYMENT_AI",
    trigger: "user:draft_reminder",
    shipmentId: invoice.shipmentId,
    actorUserId: actor.id,
    evidenceRefs: [`invoice:${invoiceId}`, `reminder:${reminder.id}`],
    reasoning: `Stage ${stage}: ${facts.daysOverdue} days overdue${interest ? `, statutory interest ${facts.statutoryInterestToDate}` : ""}.`,
    proposedAction: `Send reminder "${draft.data.subject}"`,
    outcome: "DRAFTED",
    model: auditModel(draft),
  });
  return { stage, source: draft.source };
}

export async function sendReminder(reminderId: string, actor: SessionUser) {
  requireOperator(actor);
  const reminder = await db.paymentReminder.findUniqueOrThrow({ where: { id: reminderId }, include: { creditClock: { include: { invoice: true } } } });
  if (reminder.sentAt) throw new Error("Already sent.");
  const invoice = reminder.creditClock.invoice;
  let outcome: string;
  if (reminder.channel === "PAYPAL_INVOICE_REMINDER" && !isMockId(invoice.paypalInvoiceId) && !invoice.paypalInvoiceId.startsWith("SEED-")) {
    await remindInvoice(invoice.paypalInvoiceId, reminder.subject, reminder.body);
    outcome = `Reminder sent through PayPal for invoice ${invoice.paypalInvoiceId}`;
  } else {
    outcome = reminder.channel === "EMAIL_STUB" ? "Reminder logged as sent (email delivery is not connected in this demo)" : "PayPal mocked: reminder logged";
  }
  await db.paymentReminder.update({ where: { id: reminderId }, data: { sentAt: new Date() } });
  await audit({ agent: "PAYMENT_AI", trigger: "user:send_reminder", shipmentId: invoice.shipmentId, actorUserId: actor.id, evidenceRefs: [`reminder:${reminderId}`], outcome });
}

/** Refreshes interest and status on every unpaid clock (called when the receivables page loads). */
export async function refreshClocks() {
  const now = new Date();
  const clocks = await db.creditClock.findMany({ where: { status: { in: ["RUNNING", "OVERDUE"] } }, include: { invoice: true } });
  for (const clock of clocks) {
    const status = clockStatus(clock.dueDate, null, now);
    const interest =
      clock.interestRatePct && clock.statutoryDueDate
        ? computeInterest(num(clock.invoice.amount), { kind: "COMPOUND_MONTHLY", annualRatePct: num(clock.interestRatePct), accruesAfter: clock.statutoryDueDate, basis: "MSMED s.16" }, now)
        : 0;
    if (status !== clock.status || interest !== num(clock.interestAccrued)) {
      await db.creditClock.update({ where: { id: clock.id }, data: { status, interestAccrued: interest } });
    }
  }
}

// ---------------------------------------------------------------------------
// MSME delayed-payment evidence package
// ---------------------------------------------------------------------------

const MsmeNarrativeSchema = z.object({
  statementOfFacts: z.string().describe("Neutral, chronological statement of facts in 120-200 words; no legal conclusions"),
  chronology: z.array(z.object({ date: z.string(), event: z.string(), source: z.string() })),
  missingDocuments: z.array(z.string()).describe("Documents a facilitation council would expect that are not in the record"),
});

export async function prepareMsmePack(shipmentId: string, actor: SessionUser) {
  requireOperator(actor);
  const shipment = await db.shipment.findUniqueOrThrow({
    where: { id: shipmentId },
    include: {
      exporter: true,
      buyer: true,
      contracts: { where: { status: "ACCEPTED" }, include: { acceptances: { include: { user: true } } }, take: 1 },
      verificationReports: { orderBy: { createdAt: "desc" }, take: 1 },
      paypalInvoices: { include: { creditClock: { include: { reminders: { orderBy: { createdAt: "asc" } } } } } },
    },
  });
  const contract = shipment.contracts[0];
  const report = shipment.verificationReports[0];
  const invoice = shipment.paypalInvoices.find((i) => i.creditClock);
  const clock = invoice?.creditClock;
  if (!contract || !invoice || !clock) throw new Error("Needs an accepted contract and an invoice with a credit clock.");
  if (clock.preset !== "IN_MSMED") throw new Error("The MSME package applies to the IN_MSMED preset only.");
  const now = invoice.paidAt ?? new Date();
  const overdue = daysBetween(clock.dueDate, now);
  if (overdue <= 0) throw new Error("The invoice is not past its due date.");
  const interest = clock.interestRatePct && clock.statutoryDueDate
    ? computeInterest(num(invoice.amount), { kind: "COMPOUND_MONTHLY", annualRatePct: num(clock.interestRatePct), accruesAfter: clock.statutoryDueDate, basis: "MSMED s.16" }, now)
    : 0;

  const record = {
    supplier: { name: shipment.exporter.name, msmeRegistered: shipment.exporter.msmeRegistered, udyam: shipment.exporter.udyamNumber ?? "not recorded" },
    buyer: { name: shipment.buyer.name, gstin: shipment.buyer.gstin ?? "not recorded" },
    contract: { version: contract.version, hash: contract.hash, creditDays: contract.creditDays, acceptances: contract.acceptances.map((a) => ({ party: a.party, by: a.user.name, at: a.acceptedAt.toISOString() })) },
    delivery: report ? { verifiedOn: report.createdAt.toISOString(), status: report.status, summary: report.summary } : null,
    invoice: { number: invoice.invoiceNumber, amount: money(invoice.amount, invoice.currency), sentAt: invoice.sentAt?.toISOString(), channel: invoice.channel },
    clock: { acceptanceDate: isoDay(clock.acceptanceDate), dueDate: isoDay(clock.dueDate), statutoryDueDate: clock.statutoryDueDate ? isoDay(clock.statutoryDueDate) : null, daysOverdue: overdue, interestRatePct: num(clock.interestRatePct), interestToDate: money(interest, invoice.currency) },
    reminders: clock.reminders.map((r) => ({ stage: r.stage, subject: r.subject, sentAt: r.sentAt?.toISOString() ?? "drafted, not sent" })),
  };
  const narrative = await generateJson({
    system:
      "You are Payment AI inside Proof2Pay, preparing a delayed-payment evidence package for an Indian micro or small supplier. " +
      "Write neutrally from the record only. Do not invent documents, registration numbers, deadlines or outcomes. This is not a legal filing.",
    prompt: `Record: ${JSON.stringify(record)}`,
    schema: MsmeNarrativeSchema,
    sample: {
      statementOfFacts:
        `${record.supplier.name} supplied ${shipment.quantity} ${shipment.unit} of ${shipment.cargoDescription} to ${record.buyer.name} under contract ${shipment.reference} v${contract.version}, accepted by both parties. ` +
        `Delivery was verified on ${day(report?.createdAt)}. Invoice ${invoice.invoiceNumber} for ${record.invoice.amount} fell due on ${day(clock.dueDate)} and remains unpaid ${overdue} days later. ` +
        `${record.reminders.length} reminders are on record. Interest under section 16 of the MSMED Act, 2006 is computed at ${record.clock.interestRatePct}% a year, compounded monthly: ${record.clock.interestToDate} to date.`,
      chronology: [
        { date: record.contract.acceptances[0]?.at.slice(0, 10) ?? "", event: "Contract accepted", source: `contract v${contract.version}` },
        { date: record.clock.acceptanceDate, event: "Goods delivered and accepted", source: "verification report" },
        { date: record.clock.dueDate, event: "Payment due", source: "credit clock" },
      ],
      missingDocuments: shipment.exporter.udyamNumber ? [] : ["Udyam registration certificate of the supplier"],
    },
  });

  const markdown = [
    `# Delayed-payment evidence package: ${shipment.reference}`,
    ``,
    `> Prepared by Proof2Pay from its records. **Not a government filing.** The supplier decides whether to submit it to the MSE Facilitation Council through MSME Samadhaan (samadhaan.msme.gov.in) or MSME ODR (odr.msme.gov.in).`,
    ``,
    `## Parties`,
    `- **Supplier:** ${record.supplier.name} (registered micro or small enterprise: ${record.supplier.msmeRegistered ? "yes" : "no"}; Udyam: ${record.supplier.udyam})`,
    `- **Buyer:** ${record.buyer.name} (GSTIN: ${record.buyer.gstin})`,
    ``,
    `## Amount claimed`,
    `| Item | Value |`,
    `|---|---|`,
    `| Principal (invoice ${invoice.invoiceNumber}) | ${record.invoice.amount} |`,
    `| Date of acceptance | ${day(clock.acceptanceDate)} |`,
    `| Agreed credit period | ${clock.agreedDays} days |`,
    `| Due date | ${day(clock.dueDate)} |`,
    `| Statutory due date (s.15) | ${day(clock.statutoryDueDate)} |`,
    `| Days overdue | ${overdue} |`,
    `| Interest rate (s.16: 3x RBI bank rate) | ${record.clock.interestRatePct}% a year, compounded monthly |`,
    `| Interest to ${day(now)} | ${record.clock.interestToDate} |`,
    ``,
    `## Statement of facts`,
    narrative.data.statementOfFacts,
    ``,
    `## Chronology`,
    ...narrative.data.chronology.map((c) => `- **${c.date}:** ${c.event} _(source: ${c.source})_`),
    ``,
    `## Documents in this package`,
    `1. Contract ${shipment.reference} v${contract.version}, SHA-256 \`${contract.hash}\`, accepted by ${record.contract.acceptances.map((a) => `${a.by} (${a.party.toLowerCase()}, ${a.at.slice(0, 10)})`).join(" and ")}`,
    `2. Delivery verification report: ${report ? `${report.status}, ${report.summary}` : "none"}`,
    `3. Invoice ${invoice.invoiceNumber} (${invoice.channel === "MANUAL_RECORD" ? "domestic invoice, payment tracked as a manual record" : "PayPal invoice"})`,
    `4. Reminder history: ${record.reminders.length ? record.reminders.map((r) => `${r.stage} (${r.sentAt.slice(0, 10)})`).join(", ") : "none"}`,
    ``,
    ...(narrative.data.missingDocuments.length ? [`## Still needed`, ...narrative.data.missingDocuments.map((d) => `- ${d}`), ``] : []),
    `_Interest computed by the Proof2Pay credit-clock engine (lib/credit-clock). Check the RBI bank rate on the filing date._`,
  ].join("\n");

  const pack = await db.evidencePack.create({
    data: {
      shipmentId,
      kind: "MSME_SAMADHAAN",
      status: "READY",
      markdown,
      filesJson: [
        { label: `Contract v${contract.version}`, url: `/shipments/${shipmentId}#contract`, type: "contract" },
        ...(report ? [{ label: "Verification report", url: `/shipments/${shipmentId}#delivery`, type: "verification" }] : []),
        { label: `Invoice ${invoice.invoiceNumber}`, url: `/shipments/${shipmentId}#payment`, type: "invoice" },
      ],
    },
  });
  await audit({
    agent: "PAYMENT_AI",
    trigger: "user:prepare_msme_pack",
    shipmentId,
    actorUserId: actor.id,
    evidenceRefs: [`evidence-pack:${pack.id}`, `contract:${contract.id}`, `invoice:${invoice.id}`],
    reasoning: `${overdue} days overdue; interest to date ${record.clock.interestToDate}.`,
    outcome: "MSME evidence package prepared (not filed)",
    model: auditModel(narrative),
  });
  return pack.id;
}

