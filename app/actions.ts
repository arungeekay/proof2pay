"use server";

// Server actions behind every button. Each returns { ok, message } for <ActionForm> to show.

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { acceptContract, changeCreditTerms, draftContract } from "@/lib/agents/contract";
import { MAX_FILE_BYTES, markPickedUp, verifyDelivery, type UploadedFile } from "@/lib/agents/delivery";
import { decideApproval } from "@/lib/agents/execute";
import {
  draftReminder,
  prepareMsmePack,
  recordManualPayment,
  sendReminder,
  simulateMockPayment,
  syncInvoiceFromPayPal,
} from "@/lib/agents/payment";
import { prepareDisputeResponse, requestRefund, simulateDispute, syncDisputes } from "@/lib/agents/resolution";
import { db } from "@/lib/db";
import { currentUser, SESSION_COOKIE } from "@/lib/session";

export type ActionResult = { ok: boolean; message: string } | null;

const field = (form: FormData, name: string) => String(form.get(name) ?? "");

async function run(work: () => Promise<string>): Promise<ActionResult> {
  try {
    const message = await work();
    revalidatePath("/", "layout");
    return { ok: true, message };
  } catch (error) {
    console.error(error);
    revalidatePath("/", "layout");
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}

const sampleNote = (source: string) => (source === "sample" ? " (Gemini unavailable: sample output, labelled)" : "");

export async function switchPersona(form: FormData) {
  const user = await db.user.findUnique({ where: { id: field(form, "userId") } });
  if (user) (await cookies()).set(SESSION_COOKIE, user.id, { httpOnly: true, sameSite: "lax", path: "/" });
  revalidatePath("/", "layout");
}

export async function draftContractAction(_: ActionResult, form: FormData) {
  return run(async () => {
    const result = await draftContract(field(form, "shipmentId"), await currentUser());
    return `Contract v${result.version} drafted with ${result.flags} flag(s)${result.blocked ? "; a blocking flag stops acceptance" : ""}${sampleNote(result.source)}.`;
  });
}

export async function changeTermsAction(_: ActionResult, form: FormData) {
  return run(async () => {
    const result = await changeCreditTerms(field(form, "shipmentId"), Number(field(form, "days")), await currentUser());
    return `Redrafted as v${result.version}${result.blocked ? ": blocked by the MSMED rule" : ""}.`;
  });
}

export async function acceptContractAction(_: ActionResult, form: FormData) {
  return run(async () => {
    const result = await acceptContract(field(form, "contractId"), await currentUser());
    return result.complete ? "Both parties have accepted. The contract is final." : `Accepted as ${result.party.toLowerCase()}. Waiting for the other party.`;
  });
}

export async function pickupAction(_: ActionResult, form: FormData) {
  return run(async () => `Picked up. Tracking ${await markPickedUp(field(form, "shipmentId"), await currentUser())}.`);
}

export async function uploadPodAction(_: ActionResult, form: FormData) {
  return run(async () => {
    const files: UploadedFile[] = [];
    for (const [name, type] of [["pod", "POD"], ["photos", "PHOTO"]] as const) {
      for (const entry of form.getAll(name)) {
        if (!(entry instanceof File) || entry.size === 0) continue;
        if (entry.size > MAX_FILE_BYTES) throw new Error(`${entry.name} is over 4 MB.`);
        files.push({ name: entry.name, mimeType: entry.type, base64: Buffer.from(await entry.arrayBuffer()).toString("base64"), type });
      }
    }
    const result = await verifyDelivery(field(form, "shipmentId"), files, await currentUser());
    return `Delivery AI: ${result.status.replace(/_/g, " ").toLowerCase()}, ${result.discrepancies} discrepanc${result.discrepancies === 1 ? "y" : "ies"}${sampleNote(result.source)}.${result.status !== "FAILED" ? " Payment AI proposed the invoice for approval." : ""}`;
  });
}

export async function decideApprovalAction(_: ActionResult, form: FormData) {
  return run(async () => decideApproval(field(form, "approvalId"), field(form, "decision") === "approve", field(form, "note"), await currentUser()));
}

export async function syncInvoiceAction(_: ActionResult, form: FormData) {
  return run(async () => `PayPal reports: ${await syncInvoiceFromPayPal(field(form, "invoiceId"), "user:sync_from_paypal")}.`);
}

export async function simulatePaymentAction(_: ActionResult, form: FormData) {
  return run(async () => {
    await simulateMockPayment(field(form, "invoiceId"), await currentUser());
    return "PayPal mocked: payment simulated.";
  });
}

export async function manualPaymentAction(_: ActionResult, form: FormData) {
  return run(async () => {
    await recordManualPayment(field(form, "invoiceId"), { bankReference: field(form, "bankReference"), paidOn: field(form, "paidOn") }, await currentUser());
    return "Payment recorded as a manually verified record.";
  });
}

export async function draftReminderAction(_: ActionResult, form: FormData) {
  return run(async () => {
    const result = await draftReminder(field(form, "invoiceId"), await currentUser());
    return `Reminder (${result.stage}) drafted${sampleNote(result.source)}. Review it, then send.`;
  });
}

export async function sendReminderAction(_: ActionResult, form: FormData) {
  return run(async () => {
    await sendReminder(field(form, "reminderId"), await currentUser());
    return "Reminder sent.";
  });
}

export async function msmePackAction(_: ActionResult, form: FormData) {
  return run(async () => {
    await prepareMsmePack(field(form, "shipmentId"), await currentUser());
    return "MSME evidence package prepared. It is not filed anywhere.";
  });
}

export async function requestRefundAction(_: ActionResult, form: FormData) {
  return run(async () => {
    const result = await requestRefund(field(form, "shipmentId"), { amount: Number(field(form, "amount")), reason: field(form, "reason") }, await currentUser());
    return `Resolution AI recommends: ${result.decision.toLowerCase()}${result.amount ? ` ${result.amount}` : ""}${sampleNote(result.source)}. ${result.amount ? "Sent to the approval queue." : ""}`;
  });
}

export async function syncDisputesAction() {
  return run(async () => `${await syncDisputes("user:sync_disputes")} dispute(s) read from PayPal.`);
}

export async function simulateDisputeAction(_: ActionResult, form: FormData) {
  return run(async () => {
    await simulateDispute(field(form, "shipmentId"), await currentUser());
    return "Dispute replayed (simulated, labelled).";
  });
}

export async function disputeResponseAction(_: ActionResult, form: FormData) {
  return run(async () => {
    await prepareDisputeResponse(field(form, "disputeId"), await currentUser());
    return "Evidence pack prepared and sent to the approval queue.";
  });
}

export type CommandState = ({ ok: true } & import("@/lib/agents/command").CommandResult) | { ok: false; message: string } | null;

export async function commandCenterAction(_: CommandState, form: FormData): Promise<CommandState> {
  try {
    const { askCommandCenter } = await import("@/lib/agents/command");
    return { ok: true, ...(await askCommandCenter(field(form, "question"), await currentUser())) };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}

let lastReset = 0;

export async function resetDemoAction(): Promise<ActionResult> {
  return run(async () => {
    if (process.env.DEMO_MODE !== "true") throw new Error("Reset is available only in DEMO_MODE.");
    if (Date.now() - lastReset < 60_000) throw new Error("The demo was reset less than a minute ago.");
    lastReset = Date.now();
    const { seedDemo } = await import("@/prisma/seed");
    await seedDemo();
    (await cookies()).delete(SESSION_COOKIE);
    return "Demo data reset: SH-1042 is a draft again and SH-1039 is overdue.";
  });
}
