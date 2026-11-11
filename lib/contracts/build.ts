// Builds the structured contract from a shipment. The clause wording is a fixed, human-written library;
// Contract AI only reviews it, flags issues and explains it (plan v2: "the AI does not invent legal terms").

import type { Business, Shipment } from "@/generated/prisma/client";
import { isoDay, num } from "@/lib/format";
import { ContractClausesSchema, type ContractClauses } from "./schema";

export const isDomestic = (shipment: Pick<Shipment, "originCountry" | "destinationCountry">) =>
  shipment.originCountry === "IN" && shipment.destinationCountry === "IN";

function party(business: Business) {
  return {
    name: business.name,
    country: business.country,
    ...(business.city ? { city: business.city } : {}),
    ...(business.paypalEmail ? { paypalEmail: business.paypalEmail } : {}),
  };
}

const window = (start: Date | null, end: Date | null) => ({
  start: isoDay(start ?? new Date()),
  end: isoDay(end ?? start ?? new Date()),
});

export function buildClauses(input: {
  shipment: Shipment;
  exporter: Business;
  carrier: Business;
  buyer: Business;
  insurance: ContractClauses["insurance"];
}): ContractClauses {
  const { shipment: s } = input;
  const domestic = isDomestic(s);
  const msmed = s.jurisdictionPreset === "IN_MSMED";
  const value = num(s.declaredValue);
  const freight = num(s.freightAmount);

  return ContractClausesSchema.parse({
    identities: { exporter: party(input.exporter), carrier: party(input.carrier), buyer: party(input.buyer) },
    cargo: { description: s.cargoDescription, quantity: s.quantity, unit: s.unit, declaredValue: value, currency: s.currency },
    liability: {
      goodsSafety: "Non-hazardous machined metal parts, packed to export standard with corrosion protection.",
      carrierLiabilityLimit: value,
      notes: "The carrier is liable for loss or damage in transit up to the declared value.",
    },
    delivery: {
      origin: `${s.originCity}, ${s.originCountry}`,
      destination: `${s.destinationCity}, ${s.destinationCountry}`,
      pickupWindow: window(s.pickupWindowStart, s.pickupWindowEnd),
      deliveryWindow: window(s.deliveryWindowStart, s.deliveryWindowEnd),
      acceptablePod:
        "POD signed by the consignee, naming the consignee, with delivery date and package count, plus at least one photo of the cargo on arrival.",
      conditionStandard: `All ${s.quantity} ${s.unit} delivered intact, dry and with seals unbroken. Damage must be noted on the POD.`,
    },
    payment: {
      freight: domestic
        ? { amount: freight, method: "MANUAL_RECORD", trigger: "Paid to the carrier within 7 days of verified delivery." }
        : { amount: freight, method: "PAYPAL_INVOICE_LINE", trigger: "Due with the goods invoice." },
      goods: domestic
        ? { amount: value, method: "MANUAL_RECORD", trigger: "Invoiced when delivery is verified; payment by bank transfer." }
        : {
            amount: value,
            method: "PAYPAL_INVOICE",
            trigger: "Invoiced to the buyer through PayPal once delivery is verified and an operator approves the invoice.",
          },
    },
    credit: {
      days: s.creditTermsDays,
      preset: s.jurisdictionPreset,
      startsFrom: "the date of verified delivery (acceptance of the goods)",
      lateInterest: msmed
        ? "Late payment attracts compound interest with monthly rests at three times the RBI bank rate (MSMED Act, 2006, section 16)."
        : "",
    },
    insurance: input.insurance,
    disputes: {
      objectionWindowDays: 7,
      evidenceRules: "Objections must cite the POD, delivery photos or the verification report.",
      forum: domestic
        ? "Disputes go first through Proof2Pay; unresolved delayed-payment claims may go to the MSE Facilitation Council (MSMED Act, 2006, section 18)."
        : "Disputes go first through Proof2Pay and PayPal dispute resolution.",
    },
    signatures: { requiredParties: ["EXPORTER", "BUYER"] },
  });
}
