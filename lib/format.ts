// Display helpers shared by pages and agents.

type Numeric = number | string | { toString(): string } | null | undefined;

export const num = (value: Numeric): number => (value === null || value === undefined ? 0 : Number(value.toString()));

export function money(amount: Numeric, currency = "USD"): string {
  return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", { style: "currency", currency }).format(num(amount));
}

export const isoDay = (date: Date) => date.toISOString().slice(0, 10);

export function day(date: Date | null | undefined): string {
  if (!date) return "–";
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(date);
}

export function dateTime(date: Date | null | undefined): string {
  if (!date) return "–";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  }).format(date);
}

export const round2 = (value: number) => Math.round(value * 100) / 100;

export function humanize(value: string): string {
  return value.toLowerCase().replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}
