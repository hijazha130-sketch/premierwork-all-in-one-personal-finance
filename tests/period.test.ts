import { describe, it, expect } from "vitest";
import { monthRange, inRange, currentMonth, todayIso, formatDateLabel } from "@/lib/period";

describe("period utility", () => {
  it("computes an inclusive month range including leap/short months", () => {
    expect(monthRange({ year: 2026, month: 2 })).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(monthRange({ year: 2024, month: 2 })).toEqual({ from: "2024-02-01", to: "2024-02-29" });
    expect(monthRange({ year: 2026, month: 9 })).toEqual({ from: "2026-09-01", to: "2026-09-30" });
  });

  it("inRange is inclusive of both ends", () => {
    const r = monthRange({ year: 2026, month: 9 });
    expect(inRange("2026-09-01", r)).toBe(true);
    expect(inRange("2026-09-30", r)).toBe(true);
    expect(inRange("2026-08-31", r)).toBe(false);
    expect(inRange("2026-10-01", r)).toBe(false);
  });

  it("today and current month are consistent", () => {
    const t = todayIso(new Date(2026, 8, 17));
    expect(t).toBe("2026-09-17");
    expect(currentMonth(new Date(2026, 8, 17))).toEqual({ year: 2026, month: 9 });
  });

  it("formats a friendly date label", () => {
    expect(formatDateLabel("2026-09-17", "en-US")).toMatch(/Sep/);
  });
});
