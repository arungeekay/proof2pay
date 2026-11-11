// PayPal webhook receiver (plan Section 5). Stores every event, verifies its signature with PayPal, and only then
// acts. Even a verified event is re-read from PayPal before a record is marked paid.

import { NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { audit } from "@/lib/agents/audit";
import { syncInvoiceFromPayPal } from "@/lib/agents/payment";
import { syncDispute } from "@/lib/agents/resolution";
import { db } from "@/lib/db";
import { verifyWebhookSignature } from "@/lib/paypal/api";

export const dynamic = "force-dynamic";

interface PayPalEvent {
  id: string;
  event_type: string;
  resource_type?: string;
  summary?: string;
  resource?: { id?: string; dispute_id?: string; invoice?: { id?: string } };
}

export async function POST(request: Request) {
  const raw = await request.text();
  let event: PayPalEvent;
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (!event.id || !event.event_type) return NextResponse.json({ error: "not a PayPal event" }, { status: 400 });

  const existing = await db.webhookEvent.findUnique({ where: { paypalEventId: event.id } });
  if (existing?.processedAt) return NextResponse.json({ status: "duplicate" });

  let verified = false;
  try {
    verified = await verifyWebhookSignature(request.headers, event);
  } catch (error) {
    console.error("[webhook] verification call failed", error);
  }
  const resourceId = event.resource?.invoice?.id ?? event.resource?.dispute_id ?? event.resource?.id ?? null;
  const stored = existing
    ? await db.webhookEvent.update({ where: { id: existing.id }, data: { signatureVerified: verified } })
    : await db.webhookEvent.create({
        data: {
          paypalEventId: event.id,
          eventType: event.event_type,
          resourceType: event.resource_type ?? null,
          resourceId,
          summary: event.summary ?? null,
          raw: event as unknown as Prisma.InputJsonValue,
          signatureVerified: verified,
        },
      });

  if (!verified) {
    await audit({ agent: "WEBHOOK", trigger: `webhook:${event.event_type}`, outcome: `Ignored: signature not verified (event ${event.id})` });
    // 200 so PayPal does not retry a request we will never trust.
    return NextResponse.json({ status: "unverified" });
  }

  let outcome = "recorded";
  try {
    if (event.event_type.startsWith("INVOICING.INVOICE.") && resourceId) {
      const invoice = await db.payPalInvoice.findUnique({ where: { paypalInvoiceId: resourceId } });
      outcome = invoice ? `invoice ${await syncInvoiceFromPayPal(invoice.id, `webhook:${event.event_type}`)}` : "no matching invoice";
    } else if (event.event_type.startsWith("CUSTOMER.DISPUTE.") && resourceId) {
      const dispute = await syncDispute(resourceId, `webhook:${event.event_type}`);
      outcome = `dispute ${dispute.status}`;
    } else if (event.event_type === "PAYMENT.CAPTURE.REFUNDED") {
      outcome = "refund confirmed by PayPal";
    }
    await db.webhookEvent.update({ where: { id: stored.id }, data: { processedAt: new Date(), processingError: null } });
    await audit({ agent: "WEBHOOK", trigger: `webhook:${event.event_type}`, evidenceRefs: [`webhook:${stored.id}`], outcome: `Verified event ${event.id}: ${outcome}` });
    return NextResponse.json({ status: "processed", outcome });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db.webhookEvent.update({ where: { id: stored.id }, data: { processingError: message } });
    await audit({ agent: "WEBHOOK", trigger: `webhook:${event.event_type}`, evidenceRefs: [`webhook:${stored.id}`], outcome: `Processing failed: ${message}` });
    // 500 so PayPal retries.
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
