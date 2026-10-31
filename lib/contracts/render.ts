import type { ContractClauses } from "./schema";

const money = (amount: number, currency: string) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);

const PARTY_LABEL = { EXPORTER: "Exporter", CARRIER: "Carrier", BUYER: "Buyer" } as const;

/** Markdown shown to the parties. Rendered from the clauses, never edited by hand. */
export function renderContractMarkdown(reference: string, version: number, c: ContractClauses): string {
  const { exporter, carrier, buyer } = c.identities;
  const currency = c.cargo.currency;
  const goodsMethod =
    c.payment.goods.method === "PAYPAL_INVOICE" ? "PayPal invoice" : "PayPal order (authorize, then capture)";

  return [
    `# Shipment contract ${reference} (version ${version})`,
    ``,
    `## 1. Parties`,
    `- **Exporter:** ${exporter.name}, ${[exporter.city, exporter.country].filter(Boolean).join(", ")}`,
    `- **Carrier:** ${carrier.name}, ${[carrier.city, carrier.country].filter(Boolean).join(", ")}`,
    `- **Buyer:** ${buyer.name}, ${[buyer.city, buyer.country].filter(Boolean).join(", ")}`,
    ``,
    `## 2. Cargo declaration`,
    `${c.cargo.quantity} ${c.cargo.unit} of ${c.cargo.description}, declared value ${money(c.cargo.declaredValue, currency)}.`,
    ``,
    `## 3. Goods safety and liability`,
    c.liability.goodsSafety,
    ``,
    `Carrier liability is limited to ${money(c.liability.carrierLiabilityLimit, currency)}.${c.liability.notes ? ` ${c.liability.notes}` : ""}`,
    ``,
    `## 4. Delivery conditions`,
    `- **Route:** ${c.delivery.origin} to ${c.delivery.destination}`,
    `- **Pickup window:** ${c.delivery.pickupWindow.start} to ${c.delivery.pickupWindow.end}`,
    `- **Delivery window:** ${c.delivery.deliveryWindow.start} to ${c.delivery.deliveryWindow.end}`,
    `- **Acceptable proof of delivery:** ${c.delivery.acceptablePod}`,
    `- **Condition standard:** ${c.delivery.conditionStandard}`,
    ``,
    `## 5. Payment terms`,
    `- **Freight (${money(c.payment.freight.amount, currency)}):** PayPal order authorized at acceptance of this contract. ${c.payment.freight.trigger}`,
    `- **Goods (${money(c.payment.goods.amount, currency)}):** ${goodsMethod}. ${c.payment.goods.trigger}`,
    ``,
    `## 6. Credit period`,
    `Net ${c.credit.days} days from ${c.credit.startsFrom}. ${c.credit.lateInterest}`.trim(),
    ``,
    `## 7. Insurance`,
    c.insurance
      ? `Cargo insured by ${c.insurance.insurer} (simulated), quote ${c.insurance.quoteReference}, cover ${money(c.insurance.coverageAmount, currency)}, premium ${money(c.insurance.premium, currency)}.`
      : `No cargo insurance.`,
    ``,
    `## 8. Disputes`,
    `Objections must be raised within ${c.disputes.objectionWindowDays} days of delivery. ${c.disputes.evidenceRules} ${c.disputes.forum}`,
    ``,
    `## 9. Signatures`,
    `Binding once accepted by: ${c.signatures.requiredParties.map((p) => PARTY_LABEL[p]).join(", ")}.`,
    ``,
  ].join("\n");
}
