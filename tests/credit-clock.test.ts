import { describe, expect, it } from "vitest";
import {
  clockStatus,
  computeClock,
  computeInterest,
  nextReminderStage,
  reminderSchedule,
} from "@/lib/credit-clock";

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const iso = (date: Date | null) => date?.toISOString().slice(0, 10) ?? null;

describe("computeClock: IN_MSMED", () => {
  it("dues Net 30 thirty days after acceptance, with no cap violation", () => {
    const clock = computeClock({ acceptanceDate: day("2026-11-05"), agreedDays: 30, preset: "IN_MSMED", bankRatePct: 5.5 });
    expect(iso(clock.dueDate)).toBe("2026-12-05");
    expect(iso(clock.statutoryDueDate)).toBe("2026-12-05");
    expect(clock.statutoryCapDays).toBe(45);
    expect(clock.capViolation).toBeNull();
  });

  it("allows exactly 45 days", () => {
    const clock = computeClock({ acceptanceDate: day("2026-11-05"), agreedDays: 45, preset: "IN_MSMED", bankRatePct: 5.5 });
    expect(clock.capViolation).toBeNull();
    expect(iso(clock.statutoryDueDate)).toBe("2026-12-20");
  });

  it("flags terms above 45 days and caps the statutory due date", () => {
    const clock = computeClock({ acceptanceDate: day("2026-11-05"), agreedDays: 60, preset: "IN_MSMED", bankRatePct: 5.5 });
    expect(iso(clock.dueDate)).toBe("2027-01-04");
    expect(iso(clock.statutoryDueDate)).toBe("2026-12-20");
    expect(clock.capViolation).toMatchObject({ agreedDays: 60, capDays: 45 });
    expect(clock.capViolation?.explanation).toContain("section 15");
  });

  it("applies 15 days when no period is written", () => {
    const clock = computeClock({ acceptanceDate: day("2026-11-05"), agreedDays: null, preset: "IN_MSMED", bankRatePct: 5.5 });
    expect(clock.agreedDays).toBe(15);
    expect(iso(clock.dueDate)).toBe("2026-11-20");
  });

  it("sets interest at three times the bank rate, accruing after the statutory due date", () => {
    const clock = computeClock({ acceptanceDate: day("2026-11-05"), agreedDays: 30, preset: "IN_MSMED", bankRatePct: 5.5 });
    expect(clock.interestRule).toMatchObject({ kind: "COMPOUND_MONTHLY", annualRatePct: 16.5 });
    if (clock.interestRule.kind === "COMPOUND_MONTHLY") {
      expect(iso(clock.interestRule.accruesAfter)).toBe("2026-12-05");
    }
  });

  it("counts from the UTC day, ignoring the time of acceptance", () => {
    const clock = computeClock({
      acceptanceDate: new Date("2026-11-05T22:45:00Z"),
      agreedDays: 30,
      preset: "IN_MSMED",
      bankRatePct: 5.5,
    });
    expect(iso(clock.dueDate)).toBe("2026-12-05");
  });

  it("rejects negative or fractional days", () => {
    expect(() => computeClock({ acceptanceDate: day("2026-11-05"), agreedDays: -1, preset: "IN_MSMED" })).toThrow(RangeError);
    expect(() => computeClock({ acceptanceDate: day("2026-11-05"), agreedDays: 2.5, preset: "IN_MSMED" })).toThrow(RangeError);
  });
});

describe("computeClock: GENERIC", () => {
  it("has no cap and no statutory interest", () => {
    const clock = computeClock({ acceptanceDate: day("2026-11-05"), agreedDays: 90, preset: "GENERIC" });
    expect(iso(clock.dueDate)).toBe("2027-02-03");
    expect(clock.statutoryDueDate).toBeNull();
    expect(clock.capViolation).toBeNull();
    expect(clock.interestRule).toEqual({ kind: "NONE" });
  });

  it("requires an agreed period", () => {
    expect(() => computeClock({ acceptanceDate: day("2026-11-05"), agreedDays: null, preset: "GENERIC" })).toThrow(RangeError);
  });
});

describe("computeInterest", () => {
  const rule = {
    kind: "COMPOUND_MONTHLY" as const,
    annualRatePct: 16.5,
    accruesAfter: day("2026-01-01"),
    basis: "test",
  };

  it("is zero on or before the due date", () => {
    expect(computeInterest(12_000, rule, day("2025-12-20"))).toBe(0);
    expect(computeInterest(12_000, rule, day("2026-01-01"))).toBe(0);
  });

  it("charges one month at the monthly rate", () => {
    expect(computeInterest(12_000, rule, day("2026-02-01"))).toBe(165);
  });

  it("compounds with monthly rests", () => {
    // 12000 * (1.01375^2 - 1) = 332.26875
    expect(computeInterest(12_000, rule, day("2026-03-01"))).toBe(332.27);
  });

  it("accrues part months as simple interest", () => {
    // 12000 * 0.165 * 10 / 365 = 54.2466
    expect(computeInterest(12_000, rule, day("2026-01-11"))).toBe(54.25);
  });

  it("clamps month ends so 31 Jan + 1 month is 28 Feb", () => {
    const endOfMonth = { ...rule, accruesAfter: day("2026-01-31") };
    expect(computeInterest(12_000, endOfMonth, day("2026-02-28"))).toBe(165);
  });

  it("is zero under the GENERIC preset", () => {
    expect(computeInterest(12_000, { kind: "NONE" }, day("2027-01-01"))).toBe(0);
  });
});

describe("clockStatus", () => {
  const due = day("2026-12-05");
  it("is running up to and including the due date", () => {
    expect(clockStatus(due, null, new Date("2026-12-05T23:00:00Z"))).toBe("RUNNING");
  });
  it("is overdue the day after", () => {
    expect(clockStatus(due, null, day("2026-12-06"))).toBe("OVERDUE");
  });
  it("is paid once a payment date exists", () => {
    expect(clockStatus(due, day("2026-12-20"), day("2026-12-25"))).toBe("PAID");
  });
});

describe("reminders", () => {
  const due = day("2026-12-05");

  it("schedules T-7, T-1, T+1 and T+15", () => {
    expect(reminderSchedule(due).map((r) => [r.stage, iso(r.date)])).toEqual([
      ["T_MINUS_7", "2026-11-28"],
      ["T_MINUS_1", "2026-12-04"],
      ["T_PLUS_1", "2026-12-06"],
      ["T_PLUS_15", "2026-12-20"],
    ]);
  });

  it("sends nothing before T-7", () => {
    expect(nextReminderStage(due, day("2026-11-27"), [])).toBeNull();
  });

  it("sends the stage that has arrived, once", () => {
    expect(nextReminderStage(due, day("2026-11-28"), [])).toBe("T_MINUS_7");
    expect(nextReminderStage(due, day("2026-11-30"), ["T_MINUS_7"])).toBeNull();
  });

  it("skips missed earlier stages", () => {
    expect(nextReminderStage(due, day("2026-12-07"), [])).toBe("T_PLUS_1");
  });
});
