// Demo seed (plan Section 3): the cast, 20 historical shipments and SH-1042 as a draft.
// Wipes every table first. Historical PayPal ids are prefixed SEED- and were never sent to PayPal.

import "dotenv/config";
import { Prisma, type Business, type User } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import {
  addDays,
  clockStatus,
  computeClock,
  computeInterest,
  reminderSchedule,
  startOfUtcDay,
  type ReminderStage,
} from "@/lib/credit-clock";
import { renderContractMarkdown } from "@/lib/contracts/render";
import { ContractClausesSchema, type ContractClauses } from "@/lib/contracts/schema";
import { hashContent } from "@/lib/hash";
import {
  BUSINESSES,
  DEMO_SHIPMENT,
  HISTORY,
  TRACKING_PREFIX,
  TRANSIT_DAYS,
  USERS,
  type BusinessKey,
  type BuyerKey,
  type Historical,
} from "./seed-data";

type UserKey = keyof typeof USERS;

interface Cast {
  businesses: Record<BusinessKey, Business>;
  users: Record<UserKey, User>;
}

const BUYER_USER: Record<BuyerKey, UserKey> = { northwind: "buyer", harbourside: "harbourside", rhein: "rhein" };

const NOW = new Date();
const TODAY = startOfUtcDay(NOW);

/** `date`'s UTC day at hh:mm. */
function at(date: Date, hours: number, minutes = 0): Date {
  const result = startOfUtcDay(date);
  result.setUTCHours(hours, minutes);
  return result;
}

const minutesAfter = (date: Date, minutes: number) => new Date(date.getTime() + minutes * 60_000);
const isoDay = (date: Date) => date.toISOString().slice(0, 10);
const round2 = (value: number) => Math.round(value * 100) / 100;
const usd = (amount: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);

function party(business: Business) {
  return {
    name: business.name,
    country: business.country,
    ...(business.city ? { city: business.city } : {}),
    ...(business.paypalEmail ? { paypalEmail: business.paypalEmail } : {}),
  };
}

function buildClauses(
  h: Historical,
  parties: { exporter: Business; carrier: Business; buyer: Business },
  windows: { pickup: [Date, Date]; delivery: [Date, Date] },
  insurance: ContractClauses["insurance"],
): ContractClauses {
  const msmed = h.preset === "IN_MSMED";
  return ContractClausesSchema.parse({
    identities: { exporter: party(parties.exporter), carrier: party(parties.carrier), buyer: party(parties.buyer) },
    cargo: { description: h.cargo, quantity: h.qty, unit: h.unit, declaredValue: h.value, currency: "USD" },
    liability: {
      goodsSafety: "Non-hazardous machined metal parts, packed to export standard with corrosion protection.",
      carrierLiabilityLimit: h.value,
      notes: "The carrier is liable for loss or damage in transit up to the declared value.",
    },
    delivery: {
      origin: "Chennai, IN",
      destination: `${parties.buyer.city}, ${parties.buyer.country}`,
      pickupWindow: { start: isoDay(windows.pickup[0]), end: isoDay(windows.pickup[1]) },
      deliveryWindow: { start: isoDay(windows.delivery[0]), end: isoDay(windows.delivery[1]) },
      acceptablePod:
        "POD signed by the consignee, naming the consignee, with delivery date and package count, plus at least two photos of the cargo on arrival.",
      conditionStandard: `All ${h.qty} ${h.unit} delivered intact, dry and with seals unbroken.`,
    },
    payment: {
      freight: {
        amount: h.freight,
        method: "PAYPAL_ORDER_AUTHORIZE_CAPTURE",
        trigger: "Captured when delivery is verified; paid out to the carrier once the goods invoice is settled.",
      },
      goods: {
        amount: h.value,
        method: "PAYPAL_INVOICE",
        trigger: "Invoiced to the buyer through PayPal when delivery is verified.",
      },
    },
    credit: {
      days: h.creditDays,
      preset: h.preset,
      startsFrom: "the date of verified delivery (acceptance of the goods)",
      lateInterest: msmed
        ? "Late payment attracts compound interest with monthly rests at three times the RBI bank rate (MSMED Act, 2006, section 16)."
        : "",
    },
    insurance,
    disputes: {
      objectionWindowDays: 7,
      evidenceRules: "Objections must cite the POD, delivery photos or the verification report.",
      forum: "Disputes go first through Proof2Pay and PayPal dispute resolution.",
    },
    signatures: { requiredParties: ["EXPORTER", "BUYER"] },
  });
}

function verificationReport(h: Historical, buyer: Business, deliveredAt: Date, verifiedAt: Date) {
  const d = h.discrepancy;
  return {
    status: d ? ("VERIFIED_WITH_DISCREPANCY" as const) : ("VERIFIED" as const),
    confidence: d ? (d.severity === "MAJOR" ? 0.91 : 0.82) : 0.95 + (h.n % 4) / 100,
    extractedJson: {
      consignee: buyer.name,
      signaturePresent: d?.field !== "signature",
      deliveredOn: isoDay(deliveredAt),
      quantityReceived: h.qty,
      conditionNotes: d?.field === "condition" ? d.observed : "No damage noted",
    },
    discrepancies: d ? [d] : [],
    summary: d
      ? `POD matches consignee, quantity and date, with one discrepancy: ${d.observed.toLowerCase()}.`
      : "POD matches the contract: consignee, quantity, condition and delivery date all agree.",
    createdAt: verifiedAt,
  };
}

function reminderCopy(stage: ReminderStage, reference: string, amount: string, due: string, msmed: boolean) {
  switch (stage) {
    case "T_MINUS_7":
      return { tone: "friendly", subject: `${reference}: invoice due ${due}`, body: `A reminder that the ${amount} invoice for ${reference} is due on ${due}.` };
    case "T_MINUS_1":
      return { tone: "courteous", subject: `${reference}: invoice due tomorrow`, body: `The ${amount} invoice for ${reference} falls due tomorrow, ${due}.` };
    case "T_PLUS_1":
      return {
        tone: "firm",
        subject: `${reference}: invoice overdue`,
        body: `The ${amount} invoice for ${reference} was due on ${due} and is now overdue.${msmed ? " Interest under section 16 of the MSMED Act, 2006 accrues from today." : ""}`,
      };
    case "T_PLUS_15":
      return {
        tone: "formal",
        subject: `${reference}: invoice 15 days overdue`,
        body: `The ${amount} invoice for ${reference} is 15 days past its due date of ${due}.${msmed ? " Statutory interest is accruing and the supplier may refer the matter to MSME Samadhaan." : ""}`,
      };
  }
}

async function createHistorical(h: Historical, { businesses, users }: Cast) {
  const exporter = businesses.exporter;
  const carrier = businesses[h.carrier];
  const buyer = businesses[h.buyer];
  const buyerUser = users[BUYER_USER[h.buyer]];
  const reference = `SH-${h.n}`;

  const deliveredAt = at(addDays(TODAY, -h.deliveredDaysAgo), 14, 30);
  const verifiedAt = at(deliveredAt, 16);
  const pickedUpAt = at(addDays(deliveredAt, -TRANSIT_DAYS[buyer.country]), 9);
  const acceptedAt = at(addDays(pickedUpAt, -3), 11);
  const pickup: [Date, Date] = [addDays(pickedUpAt, -1), addDays(pickedUpAt, 1)];
  const delivery: [Date, Date] = [addDays(deliveredAt, -3), addDays(deliveredAt, 2)];

  const clock = computeClock({ acceptanceDate: deliveredAt, agreedDays: h.creditDays, preset: h.preset });
  const paidAt = h.paidDaysAfterDue === null ? null : at(addDays(clock.dueDate, h.paidDaysAfterDue), 10, 15);
  if (paidAt && paidAt > NOW) throw new Error(`${reference}: payment date falls in the future; fix seed-data.ts`);

  const insurance = h.insured
    ? {
        insurer: "Simulated Insurer",
        quoteReference: `SIM-Q-${h.n}`,
        coverageAmount: h.value,
        premium: round2(h.value * 0.004),
        simulated: true as const,
      }
    : null;
  const clauses = buildClauses(h, { exporter, carrier, buyer }, { pickup, delivery }, insurance);
  const hash = hashContent(clauses);
  const trackingNumber = `${TRACKING_PREFIX[h.carrier]}${h.n}00`;

  const shipment = await db.shipment.create({
    data: {
      reference,
      exporterId: exporter.id,
      carrierId: carrier.id,
      buyerId: buyer.id,
      cargoDescription: h.cargo,
      quantity: h.qty,
      unit: h.unit,
      declaredValue: h.value,
      freightAmount: h.freight,
      originCity: "Chennai",
      originCountry: "IN",
      destinationCity: buyer.city ?? "",
      destinationCountry: buyer.country,
      pickupWindowStart: pickup[0],
      pickupWindowEnd: pickup[1],
      deliveryWindowStart: delivery[0],
      deliveryWindowEnd: delivery[1],
      creditTermsDays: h.creditDays,
      jurisdictionPreset: h.preset,
      insuranceRequested: Boolean(h.insured),
      carrierTrackingNumber: trackingNumber,
      pickedUpAt,
      deliveredAt,
      status: paidAt ? "CLOSED" : "INVOICED",
      seeded: true,
      createdAt: at(addDays(pickedUpAt, -6), 10),
      contracts: {
        create: {
          version: 1,
          clausesJson: clauses,
          markdown: renderContractMarkdown(reference, 1, clauses),
          hash,
          jurisdictionPreset: h.preset,
          creditDays: h.creditDays,
          goodsSettlement: "INVOICE",
          flagsJson: [],
          status: "ACCEPTED",
          finalisedAt: acceptedAt,
          createdAt: addDays(acceptedAt, -1),
          acceptances: {
            create: [
              { party: "EXPORTER", userId: users.exporter.id, hash, acceptedAt: minutesAfter(acceptedAt, -120) },
              { party: "BUYER", userId: buyerUser.id, hash, acceptedAt },
            ],
          },
        },
      },
      verificationReports: { create: verificationReport(h, buyer, deliveredAt, verifiedAt) },
      auditEvents: {
        create: {
          agent: "SYSTEM",
          trigger: "seed:historical",
          reasoning: "Historical shipment loaded by the demo seed. Its PayPal ids carry the SEED- prefix and were never sent to PayPal.",
          outcome: "SEEDED",
        },
      },
    },
    include: { contracts: true },
  });

  const policy = insurance
    ? await db.insurancePolicy.create({
        data: {
          shipmentId: shipment.id,
          contractId: shipment.contracts[0].id,
          insurerName: insurance.insurer,
          quoteReference: insurance.quoteReference,
          coverageAmount: insurance.coverageAmount,
          premium: insurance.premium,
          termsJson: { cover: "All risks in transit, warehouse to warehouse", deductible: 0 },
          status: "EXPIRED",
          createdAt: addDays(acceptedAt, -1),
        },
      })
    : null;

  const order = await db.payPalOrder.create({
    data: {
      shipmentId: shipment.id,
      paypalOrderId: `SEED-ORDER-${h.n}`,
      intent: "AUTHORIZE",
      purpose: "FREIGHT",
      status: "COMPLETED",
      amount: h.freight,
      authorizationId: `SEED-AUTH-${h.n}`,
      authorizationStatus: "CAPTURED",
      authorizedAt: acceptedAt,
      createdAt: acceptedAt,
      captures: {
        create: {
          paypalCaptureId: `SEED-CAPTURE-${h.n}`,
          status: "COMPLETED",
          amount: h.freight,
          capturedAt: verifiedAt,
          createdAt: verifiedAt,
        },
      },
    },
    include: { captures: true },
  });
  const capture = order.captures[0];
  await db.payPalTracking.create({
    data: {
      shipmentId: shipment.id,
      captureId: capture.id,
      transactionId: capture.paypalCaptureId,
      trackingNumber,
      carrierName: carrier.name,
      status: "DELIVERED",
      createdAt: verifiedAt,
    },
  });

  // Reminders were sent at 09:00 UTC on each stage date until the invoice was paid (or until now).
  const settledOrNow = paidAt ?? NOW;
  const msmed = h.preset === "IN_MSMED";
  const reminders = reminderSchedule(clock.dueDate)
    .map(({ stage, date }) => ({ stage, sentAt: at(date, 9) }))
    .filter(({ sentAt }) => sentAt < settledOrNow)
    .map(({ stage, sentAt }) => ({
      stage,
      ...reminderCopy(stage, reference, usd(h.value), isoDay(clock.dueDate), msmed),
      channel: "PAYPAL_INVOICE_REMINDER",
      sentAt,
      createdAt: sentAt,
    }));
  const refunded = h.dispute?.outcome === "RESOLVED_BUYER_FAVOUR";

  const invoice = await db.payPalInvoice.create({
    data: {
      shipmentId: shipment.id,
      paypalInvoiceId: `SEED-INV-${h.n}`,
      invoiceNumber: `SEED-${reference}-G`,
      purpose: "GOODS",
      status: refunded ? "PARTIALLY_REFUNDED" : paidAt ? "PAID" : "SENT",
      amount: h.value,
      recipientEmail: buyer.paypalEmail ?? "",
      sentAt: verifiedAt,
      dueDate: clock.dueDate,
      paidAt,
      paymentReference: paidAt ? `SEED-TXN-${h.n}` : null,
      createdAt: verifiedAt,
      creditClock: {
        create: {
          preset: h.preset,
          acceptanceDate: deliveredAt,
          agreedDays: clock.agreedDays,
          statutoryCapDays: clock.statutoryCapDays,
          dueDate: clock.dueDate,
          statutoryDueDate: clock.statutoryDueDate,
          status: clockStatus(clock.dueDate, paidAt, NOW),
          paidAt,
          interestRatePct: clock.interestRule.kind === "COMPOUND_MONTHLY" ? clock.interestRule.annualRatePct : null,
          interestAccrued: computeInterest(h.value, clock.interestRule, settledOrNow),
          createdAt: verifiedAt,
          reminders: { create: reminders },
        },
      },
    },
  });

  if (paidAt) {
    const proposedAt = minutesAfter(paidAt, 5);
    const approvedAt = minutesAfter(paidAt, 95);
    const approval = await db.approvalRequest.create({
      data: {
        agent: "PAYMENT_AI",
        actionType: "PAYOUT",
        shipmentId: shipment.id,
        summary: `Pay ${carrier.name} ${usd(h.freight)} freight for ${reference}`,
        payload: { receiverEmail: carrier.paypalEmail, amount: h.freight, currency: "USD" },
        status: "EXECUTED",
        decidedById: users.manager.id,
        decidedAt: approvedAt,
        executedAt: approvedAt,
        executionResult: { payoutBatchId: `SEED-PAYOUT-${h.n}` },
        createdAt: proposedAt,
      },
    });
    await db.payPalPayout.create({
      data: {
        shipmentId: shipment.id,
        senderBatchId: `SEED-BATCH-${h.n}`,
        payoutBatchId: `SEED-PAYOUT-${h.n}`,
        payoutItemId: `SEED-ITEM-${h.n}`,
        receiverEmail: carrier.paypalEmail ?? "",
        amount: h.freight,
        status: "SUCCESS",
        approvalRequestId: approval.id,
        createdAt: approvedAt,
      },
    });
  }

  if (h.dispute && paidAt) {
    const openedAt = at(addDays(paidAt, 3), 13);
    const resolvedAt = at(addDays(openedAt, 20), 12);
    if (resolvedAt > NOW) throw new Error(`${reference}: dispute resolves in the future; fix seed-data.ts`);

    const dispute = await db.payPalDispute.create({
      data: {
        shipmentId: shipment.id,
        paypalDisputeId: `SEED-DISPUTE-${h.n}`,
        reason: h.dispute.reason,
        status: "RESOLVED",
        disputeAmount: h.dispute.amount,
        disputedTransactionId: `SEED-TXN-${h.n}`,
        responseDueAt: addDays(openedAt, 10),
        outcome: h.dispute.outcome,
        openedAt,
        resolvedAt,
        raw: { claim: h.dispute.claim, resolutionNote: h.dispute.resolutionNote },
        createdAt: openedAt,
      },
    });
    const request = await db.refundRequest.create({
      data: {
        shipmentId: shipment.id,
        disputeId: dispute.id,
        requestedById: buyerUser.id,
        amount: h.dispute.amount,
        reason: h.dispute.claim,
        status: refunded ? "EXECUTED" : "REJECTED",
        createdAt: openedAt,
      },
    });

    if (refunded) {
      const approvedAt = minutesAfter(resolvedAt, -60);
      await db.approvalRequest.create({
        data: {
          agent: "RESOLUTION_AI",
          actionType: "REFUND",
          shipmentId: shipment.id,
          summary: `Refund ${usd(h.dispute.amount)} to ${buyer.name} for ${reference}`,
          payload: { refundRequestId: request.id, amount: h.dispute.amount, currency: "USD" },
          status: "EXECUTED",
          decidedById: users.manager.id,
          decidedAt: approvedAt,
          executedAt: approvedAt,
          executionResult: { paypalRefundId: `SEED-REFUND-${h.n}` },
          createdAt: addDays(openedAt, 2),
        },
      });
      await db.payPalRefund.create({
        data: {
          paypalRefundId: `SEED-REFUND-${h.n}`,
          invoiceId: invoice.id,
          refundRequestId: request.id,
          amount: h.dispute.amount,
          status: "COMPLETED",
          reason: h.dispute.resolutionNote,
          createdAt: approvedAt,
        },
      });
      if (policy) {
        await db.insuranceClaim.create({
          data: {
            policyId: policy.id,
            claimReference: `SIM-C-${h.n}`,
            amountClaimed: h.dispute.amount,
            amountApproved: h.dispute.amount,
            reason: h.dispute.claim,
            status: "APPROVED",
            decisionNote: "Damage recorded at delivery inspection; within cover.",
            decidedAt: addDays(resolvedAt, 5),
            createdAt: resolvedAt,
          },
        });
      }
    }
  }
}

async function createDemoShipment({ businesses }: Cast) {
  const d = DEMO_SHIPMENT;
  const buyer = businesses[d.buyer];
  const pickupStart = at(addDays(TODAY, 2), 6);
  const deliveryStart = at(addDays(pickupStart, TRANSIT_DAYS[buyer.country]), 6);
  await db.shipment.create({
    data: {
      reference: d.reference,
      exporterId: businesses.exporter.id,
      carrierId: businesses[d.carrier].id,
      buyerId: buyer.id,
      cargoDescription: d.cargo,
      quantity: d.qty,
      unit: d.unit,
      declaredValue: d.value,
      freightAmount: d.freight,
      originCity: "Chennai",
      originCountry: "IN",
      destinationCity: buyer.city ?? "",
      destinationCountry: buyer.country,
      pickupWindowStart: pickupStart,
      pickupWindowEnd: at(addDays(pickupStart, 1), 18),
      deliveryWindowStart: deliveryStart,
      deliveryWindowEnd: at(addDays(deliveryStart, 4), 18),
      creditTermsDays: d.creditDays,
      jurisdictionPreset: d.preset,
      insuranceRequested: d.insuranceRequested,
      status: "DRAFT",
    },
  });
}

async function wipe() {
  const tables = Object.values(Prisma.ModelName)
    .map((name) => `"${name}"`)
    .join(", ");
  await db.$executeRawUnsafe(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`);
}

async function main() {
  if (process.env.DEMO_MODE !== "true") {
    throw new Error("Seeding wipes every table. Set DEMO_MODE=true to confirm.");
  }
  await wipe();

  const businesses = {} as Cast["businesses"];
  for (const key of Object.keys(BUSINESSES) as BusinessKey[]) {
    businesses[key] = await db.business.create({ data: BUSINESSES[key] });
  }
  const users = {} as Cast["users"];
  for (const key of Object.keys(USERS) as UserKey[]) {
    const { business, ...user } = USERS[key];
    users[key] = await db.user.create({ data: { ...user, businessId: businesses[business].id } });
  }
  const cast = { businesses, users };

  for (const h of HISTORY) await createHistorical(h, cast);
  await createDemoShipment(cast);

  const [shipments, invoices, disputes, approvals] = await Promise.all([
    db.shipment.count(),
    db.payPalInvoice.count(),
    db.payPalDispute.count(),
    db.approvalRequest.count(),
  ]);
  console.log(
    `Seeded ${Object.keys(businesses).length} businesses, ${Object.keys(users).length} users, ` +
      `${shipments} shipments (${HISTORY.length} historical + ${DEMO_SHIPMENT.reference} draft), ` +
      `${invoices} invoices, ${disputes} disputes, ${approvals} approval records.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
