// Delivery AI (plan Section 6.2). Gemini vision reads the POD and photos; lib/agents/delivery-match.ts
// compares the reading with the contract. A verified delivery starts the credit clock and hands over to Payment AI.

import type { Prisma } from "@/generated/prisma/client";
import { audit } from "@/lib/agents/audit";
import { consigneeMatches, matchDelivery, PodExtractionSchema, type PodExtraction } from "@/lib/agents/delivery-match";
import { proposeInvoice } from "@/lib/agents/payment";
import type { ContractClauses } from "@/lib/contracts/schema";
import { startOfUtcDay } from "@/lib/credit-clock";
import { db } from "@/lib/db";
import { isoDay } from "@/lib/format";
import { auditModel, generateJson } from "@/lib/llm";
import type { SessionUser } from "@/lib/session";

export const ACCEPTED_MIME = ["image/png", "image/jpeg", "image/webp", "application/pdf"];
export const MAX_FILE_BYTES = 4 * 1024 * 1024;

export interface UploadedFile {
  name: string;
  mimeType: string;
  base64: string;
  type: "POD" | "PHOTO";
}

const SYSTEM = `You are Delivery AI inside Proof2Pay. You read a proof of delivery (POD) and delivery photos for a B2B shipment.
Extract only what is visibly written or shown. Do not guess: use null when a field is absent or unreadable.
Count a package as damaged if the receiver's remarks or a photo show it dented, crushed, wet, torn or opened.`;

export async function markPickedUp(shipmentId: string, actor: SessionUser) {
  const shipment = await db.shipment.findUniqueOrThrow({ where: { id: shipmentId }, include: { carrier: true } });
  if (actor.businessId !== shipment.carrierId) throw new Error("Only the carrier confirms pickup.");
  if (shipment.status !== "CONTRACTED") throw new Error(`Shipment is ${shipment.status}; pickup follows an accepted contract.`);
  const prefix = shipment.carrier.name.split(" ").map((word) => word[0]).join("").slice(0, 3).toUpperCase();
  const trackingNumber = shipment.carrierTrackingNumber ?? `${prefix}${shipment.reference.replace("SH-", "")}00`;
  await db.shipment.update({
    where: { id: shipmentId },
    data: { status: "IN_TRANSIT", pickedUpAt: new Date(), carrierTrackingNumber: trackingNumber },
  });
  await audit({ agent: "OPERATOR", trigger: "user:confirm_pickup", shipmentId, actorUserId: actor.id, outcome: `Picked up; tracking ${trackingNumber}` });
  return trackingNumber;
}

function sampleExtraction(buyerName: string, quantity: number, photos: number): PodExtraction {
  return {
    documentType: "proof of delivery",
    readability: "CLEAR",
    consigneeName: buyerName,
    signaturePresent: true,
    deliveredOn: isoDay(new Date()),
    quantityReceived: quantity,
    damagedUnits: 1,
    conditionNotes: "1 carton dented at one corner, contents not inspected",
    sealIntact: true,
    photoObservations: Array.from({ length: photos }, (_, i) => (i === 0 ? "Pallet of cartons, one carton with a dented corner" : "Cartons stacked on pallet")),
  };
}

export async function verifyDelivery(shipmentId: string, files: UploadedFile[], actor: SessionUser) {
  const shipment = await db.shipment.findUniqueOrThrow({
    where: { id: shipmentId },
    include: { buyer: true, contracts: { where: { status: "ACCEPTED" }, take: 1 } },
  });
  if (actor.businessId !== shipment.carrierId) throw new Error("Only the carrier uploads delivery evidence.");
  if (!["IN_TRANSIT", "VERIFICATION_FAILED"].includes(shipment.status)) throw new Error(`Shipment is ${shipment.status}; confirm pickup first.`);
  const contract = shipment.contracts[0];
  if (!contract) throw new Error("No accepted contract.");
  if (!files.some((file) => file.type === "POD")) throw new Error("Upload the signed POD.");
  for (const file of files) {
    if (!ACCEPTED_MIME.includes(file.mimeType)) throw new Error(`${file.name}: use PNG, JPEG, WebP or PDF.`);
  }
  const clauses = contract.clausesJson as unknown as ContractClauses;

  const evidence = [];
  for (const file of files) {
    evidence.push(
      await db.deliveryEvidence.create({
        data: {
          shipmentId,
          type: file.type,
          url: `data:${file.mimeType};base64,${file.base64}`,
          fileName: file.name,
          mimeType: file.mimeType,
          uploadedById: actor.id,
        },
      }),
    );
  }
  const photos = files.filter((file) => file.type === "PHOTO").length;

  const reading = await generateJson({
    system: SYSTEM,
    prompt:
      `The first file is the POD; the rest are delivery photos (${photos}). ` +
      `For context only (do not copy into the answer unless you see it): the contract expects consignee "${shipment.buyer.name}" and ` +
      `${shipment.quantity} ${shipment.unit}. Report what the documents actually show.`,
    schema: PodExtractionSchema,
    images: [...files].sort((a, b) => (a.type === "POD" ? -1 : b.type === "POD" ? 1 : 0)).map((file) => ({ mimeType: file.mimeType, base64: file.base64 })),
    sample: sampleExtraction(shipment.buyer.name, shipment.quantity, photos),
  });

  const match = matchDelivery(reading.data, {
    buyerName: shipment.buyer.name,
    quantity: shipment.quantity,
    unit: shipment.unit,
    deliveryWindowEnd: clauses.delivery.deliveryWindow.end,
  });
  const today = isoDay(new Date());
  const podDate = reading.data.deliveredOn;
  const deliveredAt = podDate && /^\d{4}-\d{2}-\d{2}$/.test(podDate) && podDate <= today ? new Date(`${podDate}T12:00:00Z`) : new Date();

  const summary =
    match.status === "FAILED"
      ? `Delivery could not be verified: ${match.discrepancies.filter((d) => d.severity === "MAJOR").map((d) => d.note).join(" ")}`
      : match.discrepancies.length
        ? `POD matches the consignee and contract, with ${match.discrepancies.length} discrepanc${match.discrepancies.length > 1 ? "ies" : "y"}: ${match.discrepancies.map((d) => d.observed.replace(/\.+$/, "")).join("; ")}.`
        : "POD matches the contract: consignee, quantity, condition and date all agree.";

  const report = await db.verificationReport.create({
    data: {
      shipmentId,
      status: match.status,
      confidence: match.confidence,
      extractedJson: { ...reading.data, consigneeMatches: consigneeMatches(reading.data.consigneeName, shipment.buyer.name), source: reading.source },
      discrepancies: match.discrepancies as unknown as Prisma.InputJsonValue,
      summary,
    },
  });
  await db.deliveryEvidence.updateMany({ where: { id: { in: evidence.map((e) => e.id) } }, data: { extractedJson: { reportId: report.id } } });
  await db.shipment.update({
    where: { id: shipmentId },
    data: match.status === "FAILED" ? { status: "VERIFICATION_FAILED" } : { status: "VERIFIED", deliveredAt: startOfUtcDay(deliveredAt) },
  });
  await audit({
    agent: "DELIVERY_AI",
    trigger: "user:upload_pod",
    shipmentId,
    actorUserId: actor.id,
    evidenceRefs: [`verification:${report.id}`, ...evidence.map((e) => `${e.type.toLowerCase()}:${e.id}`), `contract:${contract.id}`],
    reasoning: summary,
    confidence: match.confidence,
    outcome: match.status,
    model: auditModel(reading),
    metadata: { extraction: reading.data, sampleNote: reading.note ?? null } as Prisma.InputJsonValue,
  });

  if (match.status !== "FAILED") await proposeInvoice(shipmentId, `verification:${report.id}`);
  return { status: match.status, discrepancies: match.discrepancies.length, source: reading.source };
}
