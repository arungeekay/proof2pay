// Net-X credit-day clock with jurisdiction presets (plan Section 10).
// Pure functions. Dates are counted in whole UTC days.

import { PRESETS, rbiBankRatePct, type PresetId } from "./presets";

export { PRESETS, rbiBankRatePct, type PresetId, type PresetRules } from "./presets";

const DAY_MS = 86_400_000;

export function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function addDays(date: Date, days: number): Date {
  return new Date(startOfUtcDay(date).getTime() + days * DAY_MS);
}

/** Same day-of-month `months` later, clamped to the last day of a shorter month. */
function addMonths(date: Date, months: number): Date {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(date.getUTCDate(), lastDay)));
}

/** Whole days from `from` to `to`; negative when `to` is earlier. */
export function daysBetween(from: Date, to: Date): number {
  return Math.round((startOfUtcDay(to).getTime() - startOfUtcDay(from).getTime()) / DAY_MS);
}

const roundCents = (value: number) => Math.round(value * 100) / 100;

export interface ClockInput {
  /** Day the buyer accepted the goods, or deemed acceptance. */
  acceptanceDate: Date;
  /** Agreed credit period in days; null when the contract states none. */
  agreedDays: number | null;
  preset: PresetId;
  /** Overrides RBI_BANK_RATE_PCT. */
  bankRatePct?: number;
}

export type InterestRule =
  | { kind: "NONE" }
  | { kind: "COMPOUND_MONTHLY"; annualRatePct: number; accruesAfter: Date; basis: string };

export interface CapViolation {
  agreedDays: number;
  capDays: number;
  explanation: string;
}

export interface ClockResult {
  preset: PresetId;
  agreedDays: number;
  dueDate: Date;
  statutoryCapDays: number | null;
  statutoryDueDate: Date | null;
  /** Set when the agreed period exceeds the preset's cap. Contract AI must refuse to finalise such terms. */
  capViolation: CapViolation | null;
  interestRule: InterestRule;
}

export function computeClock(input: ClockInput): ClockResult {
  const rules = PRESETS[input.preset];
  if (input.agreedDays !== null && (!Number.isInteger(input.agreedDays) || input.agreedDays < 0)) {
    throw new RangeError(`agreedDays must be a non-negative integer, got ${input.agreedDays}`);
  }
  const agreedDays = input.agreedDays ?? rules.defaultDaysWhenUnwritten;
  if (agreedDays === null) {
    throw new RangeError(`${rules.label} needs an agreed credit period`);
  }
  const dueDate = addDays(input.acceptanceDate, agreedDays);

  if (rules.maxAgreedDays === null || rules.bankRateMultiplier === null) {
    return {
      preset: rules.id,
      agreedDays,
      dueDate,
      statutoryCapDays: null,
      statutoryDueDate: null,
      capViolation: null,
      interestRule: { kind: "NONE" },
    };
  }

  const capDays = rules.maxAgreedDays;
  const statutoryDueDate = addDays(input.acceptanceDate, Math.min(agreedDays, capDays));
  const capViolation =
    agreedDays > capDays
      ? {
          agreedDays,
          capDays,
          explanation:
            `Net ${agreedDays} exceeds the ${capDays}-day maximum credit period under section 15 of the ` +
            `MSMED Act, 2006, which applies because the supplier is a registered micro or small enterprise. ` +
            `Payment is legally due ${capDays} days after acceptance whatever the contract says, ` +
            `so the term must be ${capDays} days or fewer.`,
        }
      : null;
  const bankRate = input.bankRatePct ?? rbiBankRatePct();

  return {
    preset: rules.id,
    agreedDays,
    dueDate,
    statutoryCapDays: capDays,
    statutoryDueDate,
    capViolation,
    interestRule: {
      kind: "COMPOUND_MONTHLY",
      annualRatePct: Math.round(rules.bankRateMultiplier * bankRate * 1000) / 1000,
      accruesAfter: statutoryDueDate,
      basis: `Section 16: compound interest with monthly rests at ${rules.bankRateMultiplier}x the RBI bank rate (${bankRate}%)`,
    },
  };
}

/**
 * Interest owed on `principal` at `asOf`. Whole months after the due date compound monthly;
 * the remaining days accrue simple interest on the compounded amount (actual/365).
 */
export function computeInterest(principal: number, rule: InterestRule, asOf: Date): number {
  if (rule.kind === "NONE") return 0;
  const start = startOfUtcDay(rule.accruesAfter);
  const end = startOfUtcDay(asOf);
  if (end <= start) return 0;

  const annualRate = rule.annualRatePct / 100;
  let months = 0;
  while (addMonths(start, months + 1) <= end) months++;
  const remainderDays = daysBetween(addMonths(start, months), end);
  const accumulated = principal * (1 + annualRate / 12) ** months * (1 + (annualRate * remainderDays) / 365);
  return roundCents(accumulated - principal);
}

export type ClockStatus = "RUNNING" | "OVERDUE" | "PAID";

export function clockStatus(dueDate: Date, paidAt: Date | null, asOf: Date): ClockStatus {
  if (paidAt) return "PAID";
  return daysBetween(dueDate, asOf) > 0 ? "OVERDUE" : "RUNNING";
}

// Reminder cadence (plan Section 6.3): tone escalates from T-7 to T+15.
export const REMINDER_STAGES = ["T_MINUS_7", "T_MINUS_1", "T_PLUS_1", "T_PLUS_15"] as const;
export type ReminderStage = (typeof REMINDER_STAGES)[number];

const REMINDER_OFFSET_DAYS: Record<ReminderStage, number> = {
  T_MINUS_7: -7,
  T_MINUS_1: -1,
  T_PLUS_1: 1,
  T_PLUS_15: 15,
};

export function reminderSchedule(dueDate: Date): { stage: ReminderStage; date: Date }[] {
  return REMINDER_STAGES.map((stage) => ({ stage, date: addDays(dueDate, REMINDER_OFFSET_DAYS[stage]) }));
}

/**
 * The reminder to send at `asOf`: the latest stage whose date has arrived, unless it was already sent.
 * Earlier stages that were missed are skipped so a late run never sends a stale reminder.
 */
export function nextReminderStage(
  dueDate: Date,
  asOf: Date,
  sent: readonly ReminderStage[],
): ReminderStage | null {
  const today = startOfUtcDay(asOf);
  const latest = reminderSchedule(dueDate)
    .filter((reminder) => reminder.date <= today)
    .at(-1);
  if (!latest || sent.includes(latest.stage)) return null;
  return latest.stage;
}
