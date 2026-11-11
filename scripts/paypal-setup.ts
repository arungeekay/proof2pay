// Checks the PayPal sandbox keys and registers the webhook (plan Section 5 checklist; no dashboard step needed).
// Usage: npx tsx scripts/paypal-setup.ts [https://your-app.onrender.com]
// Prints PAYPAL_WEBHOOK_ID to put in .env and on Render.

import "dotenv/config";
import { ensureWebhook, WEBHOOK_EVENTS } from "@/lib/paypal/api";
import { paypalConfigured, paypalFetch } from "@/lib/paypal/client";

async function main() {
  if (!paypalConfigured()) throw new Error("Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET in .env first.");
  const invoices = await paypalFetch<{ total_items?: number }>("/v2/invoicing/invoices?page_size=1&total_required=true");
  console.log(`OAuth OK. Invoicing reachable (${invoices.total_items ?? 0} invoices on this sandbox account).`);

  const base = process.argv[2] ?? process.env.APP_BASE_URL;
  if (!base?.startsWith("https://")) {
    console.log("No public https URL given: skipping webhook registration. Rerun with the Render URL once deployed.");
    return;
  }
  const url = `${base.replace(/\/$/, "")}/api/paypal/webhooks`;
  const webhook = await ensureWebhook(url);
  console.log(`${webhook.created ? "Registered" : "Found"} webhook for ${url} (${WEBHOOK_EVENTS.length} events).`);
  console.log(`PAYPAL_WEBHOOK_ID=${webhook.id}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
