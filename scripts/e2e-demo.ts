// End-to-end check of the three demo scenarios, driving the agents directly (no browser).
// Runs against whatever DATABASE_URL points at and changes the demo data: run `npm run db:seed` afterwards to reset.
// Usage: npm run e2e -- <pod.png> [photo.png]

import "dotenv/config";
import { readFileSync } from "node:fs";
import { acceptContract, changeCreditTerms } from "@/lib/agents/contract";
import { markPickedUp, verifyDelivery } from "@/lib/agents/delivery";
import { decideApproval } from "@/lib/agents/execute";
import { draftReminder, prepareMsmePack, sendReminder, simulateMockPayment, syncInvoiceFromPayPal } from "@/lib/agents/payment";
import { prepareDisputeResponse, requestRefund, simulateDispute } from "@/lib/agents/resolution";
import { db } from "@/lib/db";
import { paypalConfigured } from "@/lib/paypal/client";

const [podPath, photoPath] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const user = (email: string) => db.user.findUniqueOrThrow({ where: { email }, include: { business: true } });
const log = (step: string, detail: unknown) => console.log(`✔ ${step}:`, typeof detail === "string" ? detail : JSON.stringify(detail));

async function approveAll(shipmentId: string, manager: Awaited<ReturnType<typeof user>>, type?: string) {
  const pending = await db.approvalRequest.findMany({ where: { shipmentId, status: "PENDING", ...(type ? { actionType: type as never } : {}) } });
  for (const a of pending) log(`approve ${a.actionType}`, `${a.summary} -> ${await decideApproval(a.id, true, "e2e", manager)}`);
  return pending.length;
}

async function main() {
  const [exporter, carrier, buyer, manager] = await Promise.all([
    user("rahul@marina-exports.example"),
    user("dinesh@example-freight.example"),
    user("laura@northwind-imports.example"),
    user("kavitha@marina-exports.example"),
  ]);
  const demo = await db.shipment.findUniqueOrThrow({ where: { reference: "SH-1042" } });
  console.log(`PayPal: ${paypalConfigured() ? "sandbox" : "mocked"}; Gemini model ${process.env.GEMINI_MODEL}`);

  // Scenario 1
  log("MSMED rule (Net 60)", await changeCreditTerms(demo.id, 60, exporter));
  log("redraft at Net 30", await changeCreditTerms(demo.id, 30, exporter));
  const contract = await db.contract.findFirstOrThrow({ where: { shipmentId: demo.id, status: "PENDING_ACCEPTANCE" } });
  log("exporter accepts", await acceptContract(contract.id, exporter));
  log("buyer accepts", await acceptContract(contract.id, buyer));
  log("pickup", await markPickedUp(demo.id, carrier));
  const files = [
    { name: "pod.png", mimeType: "image/png", base64: readFileSync(podPath).toString("base64"), type: "POD" as const },
    ...(photoPath ? [{ name: "photo.png", mimeType: "image/png", base64: readFileSync(photoPath).toString("base64"), type: "PHOTO" as const }] : []),
  ];
  log("Delivery AI", await verifyDelivery(demo.id, files, carrier));
  const report = await db.verificationReport.findFirstOrThrow({ where: { shipmentId: demo.id }, orderBy: { createdAt: "desc" } });
  log("verification summary", report.summary);
  await approveAll(demo.id, manager, "INVOICE_SEND");
  const invoice = await db.payPalInvoice.findFirstOrThrow({ where: { shipmentId: demo.id } });
  log("invoice", `${invoice.paypalInvoiceId} ${invoice.status} due ${invoice.dueDate?.toISOString().slice(0, 10)} payer link ${invoice.payerViewUrl ?? "-"}`);
  if (invoice.paypalInvoiceId.startsWith("MOCK-")) {
    await simulateMockPayment(invoice.id, buyer);
  } else {
    log("sync (unpaid expected)", await syncInvoiceFromPayPal(invoice.id, "e2e"));
    console.log("Live invoice: pay it as the sandbox buyer, then rerun scenario 3 from the UI.");
    return;
  }
  log("paid", (await db.shipment.findUniqueOrThrow({ where: { id: demo.id } })).status);

  // Scenario 3
  log("Resolution AI", await requestRefund(demo.id, { amount: 400, reason: "One carton (no. 17) arrived dented and two parts inside are scratched. We ask for $400." }, buyer));
  const rec = await db.recommendation.findFirstOrThrow({ where: { shipmentId: demo.id }, orderBy: { createdAt: "desc" } });
  log("recommendation", `${rec.decision} ${rec.amount}: ${rec.reasoning}`);
  await approveAll(demo.id, manager, "REFUND");
  await approveAll(demo.id, manager, "INSURANCE_CLAIM");
  const disputeId = await simulateDispute(demo.id, buyer);
  log("dispute pack", await prepareDisputeResponse(disputeId, manager));
  await approveAll(demo.id, manager, "DISPUTE_EVIDENCE");

  // Scenario 2
  const domestic = await db.shipment.findUniqueOrThrow({ where: { reference: "SH-1039" }, include: { paypalInvoices: true } });
  const domesticInvoice = domestic.paypalInvoices[0];
  log("reminder", await draftReminder(domesticInvoice.id, manager));
  const reminder = await db.paymentReminder.findFirstOrThrow({ where: { stage: "FINAL_NOTICE", creditClock: { invoiceId: domesticInvoice.id } } });
  log("final notice", `${reminder.subject} | ${reminder.body.slice(0, 160)}…`);
  await sendReminder(reminder.id, manager);
  const packId = await prepareMsmePack(domestic.id, manager);
  const pack = await db.evidencePack.findUniqueOrThrow({ where: { id: packId } });
  log("MSME pack", pack.markdown.split("\n").slice(0, 22).join("\n"));

  const events = await db.auditEvent.findMany({ where: { trigger: { not: "seed:historical" } }, orderBy: { createdAt: "asc" } });
  console.log(`\n${events.length} audit events:`);
  for (const e of events) console.log(` - ${e.agent} ${e.trigger} ${e.model ? `[${e.model}]` : ""} ${e.outcome ?? e.proposedAction ?? ""}`.slice(0, 220));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
