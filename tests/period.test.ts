import { describe, it, expect } from "vitest";
import { monthRange, inRange, currentMonth, todayIso, formatDateLabel, monthGrid } from "@/lib/period";

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

  it("lays out a Monday-first month grid with leading/trailing blanks", () => {
    // Jan 2024 starts on a Monday — no leading blanks.
    const jan = monthGrid({ year: 2024, month: 1 });
    expect(jan.every((w) => w.length === 7)).toBe(true);
    expect(jan[0][0]).toBe("2024-01-01");
    const janDays = jan.flat().filter(Boolean);
    expect(janDays).toHaveLength(31);
    expect(janDays[janDays.length - 1]).toBe("2024-01-31");

    // Feb 2024 starts on a Thursday (Monday-index 3) — three leading blanks.
    const feb = monthGrid({ year: 2024, month: 2 });
    expect(feb[0][0]).toBeNull();
    expect(feb[0][1]).toBeNull();
    expect(feb[0][2]).toBeNull();
    expect(feb[0][3]).toBe("2024-02-01");
    expect(feb.flat().filter(Boolean)).toHaveLength(29); // leap year
  });
});
