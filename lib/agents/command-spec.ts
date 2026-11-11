// Pure parts of the command center: the query spec Gemini fills in, and the keyword fallback.

import { z } from "zod";

const DATASETS = ["shipments", "invoices", "disputes", "approvals", "audit"] as const;

export const QuerySpecSchema = z.object({
  title: z.string().describe("Short title for the result table"),
  dataset: z.enum(DATASETS),
  filters: z.object({
    textContains: z.string().nullable().describe("Business name, shipment reference or agent to match, or null"),
    minAmount: z.number().nullable().describe("Minimum value/amount in the row's own currency, or null"),
    currency: z.enum(["USD", "INR"]).nullable(),
    overdueOnly: z.boolean().describe("Only unpaid invoices past their due date"),
    disputedOnly: z.boolean().describe("Only shipments with a dispute or refund request"),
    insuredOnly: z.boolean().describe("Only shipments with a (simulated) insurance policy"),
    statusIn: z.array(z.string()).describe("Status values to keep (upper case, e.g. PAID, PENDING); empty for all"),
    lastDays: z.number().int().nullable().describe("Only records from the last N days, or null"),
  }),
  explanation: z.string().describe("One sentence saying how the question was interpreted"),
});

export type QuerySpec = z.infer<typeof QuerySpecSchema>;

export interface Column {
  field: string;
  headerName: string;
  kind: "text" | "money" | "number" | "date" | "link";
}

export interface CommandResult {
  title: string;
  explanation: string;
  source: "live" | "sample";
  model: string;
  columns: Column[];
  rows: Record<string, string | number | boolean | null>[];
  totals: Record<string, number>;
}

/** Keyword interpretation used when Gemini is unavailable (labelled as sample output in the UI). */
export function keywordSpec(question: string): QuerySpec {
  const q = question.toLowerCase().replace(/(\d),(\d)/g, "$1$2");
  const amount = q.match(/(\d+(?:\.\d+)?)\s*(k|thousand|lakh)?/);
  const minAmount = amount ? Number(amount[1]) * (amount[2] === "lakh" ? 100_000 : amount[2] ? 1000 : 1) : null;
  const dataset: QuerySpec["dataset"] = /approv/.test(q)
    ? "approvals"
    : /audit|agent|decision/.test(q)
      ? "audit"
      : /dispute/.test(q) && !/shipment/.test(q)
        ? "disputes"
        : /invoice|overdue|receivable|interest|unpaid/.test(q)
          ? "invoices"
          : "shipments";
  return {
    title: question.slice(0, 80),
    dataset,
    filters: {
      textContains: q.match(/northwind|harbourside|rhein|kaveri|bluewater|example freight|sh-\d{4}/)?.[0] ?? null,
      minAmount: minAmount && minAmount >= 100 ? minAmount : null,
      currency: /₹|inr|rupee|lakh/.test(q) ? "INR" : /\$|usd|dollar/.test(q) ? "USD" : null,
      overdueOnly: /overdue|late|unpaid/.test(q),
      disputedOnly: /disput|refund/.test(q) && dataset === "shipments",
      insuredOnly: /insur/.test(q),
      statusIn: /pending/.test(q) ? ["PENDING"] : [],
      lastDays: /today/.test(q) ? 1 : /this week|last 7/.test(q) ? 7 : null,
    },
    explanation: "Interpreted by keyword matching because Gemini was unavailable.",
  };
}

