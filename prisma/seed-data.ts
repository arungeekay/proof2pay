// Demo cast and history for prisma/seed.ts. All names are fictional; emails use the reserved .example domain.

export const BUSINESSES = {
  exporter: {
    name: "Marina Precision Exports Pvt Ltd",
    isExporter: true,
    country: "IN",
    city: "Chennai",
    paypalEmail: "exporter@marina-exports.example",
    msmeRegistered: true,
    verified: true,
  },
  exampleFreight: {
    name: "Example Freight Ltd",
    isCarrier: true,
    country: "IN",
    city: "Chennai",
    paypalEmail: "payouts@example-freight.example",
    verified: true,
  },
  bluewater: {
    name: "Bluewater Cargo Lines Pte Ltd",
    isCarrier: true,
    country: "SG",
    city: "Singapore",
    paypalEmail: "payouts@bluewater-cargo.example",
    verified: true,
  },
  northwind: {
    name: "Northwind Imports Inc",
    isBuyer: true,
    country: "US",
    city: "Chicago",
    paypalEmail: "ap@northwind-imports.example",
    verified: true,
  },
  harbourside: {
    name: "Harbourside Trading Ltd",
    isBuyer: true,
    country: "GB",
    city: "Felixstowe",
    paypalEmail: "accounts@harbourside-trading.example",
    verified: true,
  },
  rhein: {
    name: "Rhein Industrial Supply GmbH",
    isBuyer: true,
    country: "DE",
    city: "Duisburg",
    paypalEmail: "buchhaltung@rhein-industrial.example",
    verified: true,
  },
} as const;

export type BusinessKey = keyof typeof BUSINESSES;
export type BuyerKey = "northwind" | "harbourside" | "rhein";
export type CarrierKey = "exampleFreight" | "bluewater";

/** The four role-switcher personas come first; the rest sign historical contracts. */
export const USERS = {
  exporter: { name: "Rahul Menon", email: "rahul@marina-exports.example", role: "EXPORTER", business: "exporter" },
  carrier: { name: "Dinesh Kumar", email: "dinesh@example-freight.example", role: "CARRIER", business: "exampleFreight" },
  buyer: { name: "Laura Chen", email: "laura@northwind-imports.example", role: "BUYER", business: "northwind" },
  manager: { name: "Kavitha Subramanian", email: "kavitha@marina-exports.example", role: "MANAGER", business: "exporter" },
  harbourside: { name: "Tom Hughes", email: "tom@harbourside-trading.example", role: "BUYER", business: "harbourside" },
  rhein: { name: "Katrin Weber", email: "katrin@rhein-industrial.example", role: "BUYER", business: "rhein" },
  bluewater: { name: "Wei Ling Tan", email: "weiling@bluewater-cargo.example", role: "CARRIER", business: "bluewater" },
} as const;

/** Sea transit from Chennai, in days, by destination country. */
export const TRANSIT_DAYS: Record<string, number> = { US: 38, GB: 28, DE: 30 };

export const TRACKING_PREFIX: Record<CarrierKey, string> = { exampleFreight: "EFL", bluewater: "BCL" };

export type Discrepancy = {
  field: string;
  expected: string;
  observed: string;
  severity: "MINOR" | "MAJOR";
  note: string;
}

export type HistoricalDispute = {
  reason: string;
  claim: string;
  amount: number;
  outcome: "RESOLVED_BUYER_FAVOUR" | "RESOLVED_SELLER_FAVOUR";
  resolutionNote: string;
}

export interface Historical {
  n: number;
  buyer: BuyerKey;
  carrier: CarrierKey;
  cargo: string;
  qty: number;
  unit: "cartons" | "crates";
  value: number;
  freight: number;
  deliveredDaysAgo: number;
  creditDays: number;
  preset: "IN_MSMED" | "GENERIC";
  /** Days after the due date the goods invoice was paid; negative is early, null is still unpaid. */
  paidDaysAfterDue: number | null;
  insured?: boolean;
  discrepancy?: Discrepancy;
  dispute?: HistoricalDispute;
}

// 20 shipments before SH-1042. Mix: 17 settled (3 late, 2 disputed), 1 overdue, 1 running, plus one
// minor POD discrepancy, so trust profiles span low and medium confidence.
export const HISTORY: Historical[] = [
  { n: 1022, buyer: "northwind", carrier: "exampleFreight", cargo: "flanged couplings", qty: 30, unit: "cartons", value: 9400, freight: 720, deliveredDaysAgo: 175, creditDays: 30, preset: "IN_MSMED", paidDaysAfterDue: -2 },
  { n: 1023, buyer: "northwind", carrier: "exampleFreight", cargo: "hydraulic fittings", qty: 25, unit: "cartons", value: 7800, freight: 640, deliveredDaysAgo: 168, creditDays: 30, preset: "IN_MSMED", paidDaysAfterDue: 0 },
  { n: 1024, buyer: "harbourside", carrier: "exampleFreight", cargo: "valve stems", qty: 24, unit: "cartons", value: 6800, freight: 830, deliveredDaysAgo: 160, creditDays: 30, preset: "IN_MSMED", paidDaysAfterDue: 12 },
  { n: 1025, buyer: "northwind", carrier: "exampleFreight", cargo: "precision shafts", qty: 18, unit: "crates", value: 14200, freight: 1050, deliveredDaysAgo: 150, creditDays: 45, preset: "IN_MSMED", paidDaysAfterDue: -5, insured: true },
  { n: 1026, buyer: "harbourside", carrier: "bluewater", cargo: "pipe flanges", qty: 30, unit: "cartons", value: 9200, freight: 910, deliveredDaysAgo: 145, creditDays: 30, preset: "IN_MSMED", paidDaysAfterDue: 0 },
  { n: 1027, buyer: "northwind", carrier: "exampleFreight", cargo: "valve bodies", qty: 35, unit: "cartons", value: 11600, freight: 880, deliveredDaysAgo: 138, creditDays: 30, preset: "IN_MSMED", paidDaysAfterDue: 6, insured: true },
  { n: 1028, buyer: "northwind", carrier: "bluewater", cargo: "bearing housings", qty: 22, unit: "cartons", value: 8900, freight: 700, deliveredDaysAgo: 131, creditDays: 30, preset: "IN_MSMED", paidDaysAfterDue: -1 },
  {
    n: 1029, buyer: "harbourside", carrier: "exampleFreight", cargo: "machined collars", qty: 20, unit: "cartons", value: 5600, freight: 780, deliveredDaysAgo: 125, creditDays: 30, preset: "IN_MSMED", paidDaysAfterDue: -3, insured: true,
    discrepancy: {
      field: "condition",
      expected: "Cartons intact and dry",
      observed: "2 of 20 cartons water damaged",
      severity: "MAJOR",
      note: "Damage noted on the POD by the consignee and visible in delivery photos.",
    },
    dispute: {
      reason: "MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED",
      claim: "Two cartons of collars arrived water damaged and unusable.",
      amount: 560,
      outcome: "RESOLVED_BUYER_FAVOUR",
      resolutionNote: "Damage was recorded at delivery; refunded the pro-rata value of two cartons.",
    },
  },
  { n: 1030, buyer: "northwind", carrier: "exampleFreight", cargo: "gear blanks", qty: 40, unit: "cartons", value: 12750, freight: 900, deliveredDaysAgo: 118, creditDays: 30, preset: "IN_MSMED", paidDaysAfterDue: -3, insured: true },
  {
    n: 1031, buyer: "northwind", carrier: "exampleFreight", cargo: "machined brackets", qty: 50, unit: "cartons", value: 6300, freight: 560, deliveredDaysAgo: 110, creditDays: 30, preset: "IN_MSMED", paidDaysAfterDue: 0,
    dispute: {
      reason: "MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED",
      claim: "Four brackets reported out of tolerance.",
      amount: 504,
      outcome: "RESOLVED_SELLER_FAVOUR",
      resolutionNote: "Signed POD and the pre-shipment inspection record matched the contract specification.",
    },
  },
  { n: 1032, buyer: "harbourside", carrier: "exampleFreight", cargo: "threaded bushings", qty: 26, unit: "cartons", value: 7400, freight: 820, deliveredDaysAgo: 103, creditDays: 45, preset: "IN_MSMED", paidDaysAfterDue: 25 },
  { n: 1033, buyer: "northwind", carrier: "exampleFreight", cargo: "pump impellers", qty: 20, unit: "crates", value: 15400, freight: 1120, deliveredDaysAgo: 96, creditDays: 45, preset: "IN_MSMED", paidDaysAfterDue: -4, insured: true },
  { n: 1034, buyer: "rhein", carrier: "exampleFreight", cargo: "turned pins", qty: 40, unit: "cartons", value: 5200, freight: 940, deliveredDaysAgo: 90, creditDays: 60, preset: "GENERIC", paidDaysAfterDue: -2 },
  {
    n: 1035, buyer: "northwind", carrier: "bluewater", cargo: "flange adaptors", qty: 28, unit: "cartons", value: 9950, freight: 760, deliveredDaysAgo: 82, creditDays: 30, preset: "IN_MSMED", paidDaysAfterDue: 0,
    discrepancy: {
      field: "signature",
      expected: "Consignee signature on POD",
      observed: "Signature box blank",
      severity: "MINOR",
      note: "Consignee confirmed receipt of all 28 cartons by email the same day.",
    },
  },
  { n: 1036, buyer: "harbourside", carrier: "exampleFreight", cargo: "hydraulic manifolds", qty: 12, unit: "crates", value: 10900, freight: 990, deliveredDaysAgo: 78, creditDays: 30, preset: "IN_MSMED", paidDaysAfterDue: 0, insured: true },
  { n: 1037, buyer: "northwind", carrier: "exampleFreight", cargo: "CNC-turned spindles", qty: 16, unit: "crates", value: 13300, freight: 980, deliveredDaysAgo: 70, creditDays: 30, preset: "IN_MSMED", paidDaysAfterDue: -2, insured: true },
  { n: 1038, buyer: "rhein", carrier: "exampleFreight", cargo: "machined plates", qty: 18, unit: "crates", value: 8100, freight: 1010, deliveredDaysAgo: 64, creditDays: 60, preset: "GENERIC", paidDaysAfterDue: 0 },
  { n: 1039, buyer: "harbourside", carrier: "bluewater", cargo: "spacer rings", qty: 30, unit: "cartons", value: 4900, freight: 700, deliveredDaysAgo: 58, creditDays: 30, preset: "IN_MSMED", paidDaysAfterDue: null },
  { n: 1040, buyer: "northwind", carrier: "exampleFreight", cargo: "coupling sleeves", qty: 32, unit: "cartons", value: 8450, freight: 690, deliveredDaysAgo: 46, creditDays: 30, preset: "IN_MSMED", paidDaysAfterDue: -1 },
  { n: 1041, buyer: "northwind", carrier: "exampleFreight", cargo: "machined end caps", qty: 26, unit: "cartons", value: 7200, freight: 610, deliveredDaysAgo: 22, creditDays: 30, preset: "IN_MSMED", paidDaysAfterDue: null },
];

/** The live demo shipment (plan Section 3). Seeded as a draft so the demo starts at "Draft contract". */
export const DEMO_SHIPMENT = {
  reference: "SH-1042",
  buyer: "northwind",
  carrier: "exampleFreight",
  cargo: "machined parts",
  qty: 40,
  unit: "cartons",
  value: 12000,
  freight: 850,
  creditDays: 30,
  preset: "IN_MSMED",
  insuranceRequested: true,
} as const;
