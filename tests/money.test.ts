import { describe, it, expect } from "vitest";
import { addMinor, subMinor, sumMinor, parseMajorToMinor, minorToMajor, formatMoney } from "@/lib/money";

describe("money utility — integer minor units, no float error", () => {
  it("adds minor units exactly", () => {
    expect(addMinor(10, 20, 30)).toBe(60);
    expect(subMinor(100, 45)).toBe(55);
    expect(sumMinor([1, 2, 3, 4])).toBe(10);
  });

  it("rejects non-integer minor amounts", () => {
    expect(() => addMinor(10.5)).toThrow();
  });

  it("parses major strings to minor units (rounds half up)", () => {
    expect(parseMajorToMinor("1,250")).toBe(125000);
    expect(parseMajorToMinor("1250.50")).toBe(125050);
    expect(parseMajorToMinor("0.005")).toBe(1); // half-up
    expect(parseMajorToMinor("0.004")).toBe(0);
    expect(parseMajorToMinor("")).toBeNull();
    expect(parseMajorToMinor("abc")).toBeNull();
    expect(parseMajorToMinor("-5")).toBeNull();
  });

  it("survives adversarial amounts with no float drift", () => {
    // 0.1 + 0.2 in the classic float trap — done in minor units.
    const a = parseMajorToMinor("0.10")!;
    const b = parseMajorToMinor("0.20")!;
    expect(addMinor(a, b)).toBe(30);
    expect(minorToMajor(addMinor(a, b))).toBe(0.3);

    // Large value summed many times.
    const big = parseMajorToMinor("999999.99")!;
    let total = 0;
    for (let i = 0; i < 1000; i++) total = addMinor(total, big);
    expect(total).toBe(99999999000);
  });

  it("formats to a clean display string", () => {
    expect(formatMoney(125000, { symbol: "Rs" })).toBe("Rs 1,250");
    expect(formatMoney(125050, { symbol: "Rs" })).toBe("Rs 1,250.50");
    expect(formatMoney(0, { symbol: "Rs" })).toBe("Rs 0");
    expect(formatMoney(-5000, { symbol: "Rs" })).toBe("-Rs 50");
    expect(formatMoney(5000, { symbol: "Rs", signed: true })).toBe("+Rs 50");
  });
});
