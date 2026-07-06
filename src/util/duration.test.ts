import { describe, expect, it } from "vitest";

import { parseDuration } from "./duration.ts";

describe("parseDuration", () => {
  it("parses unit suffixes", () => {
    expect(parseDuration("12h")).toBe(12 * 3_600_000);
    expect(parseDuration("30m")).toBe(1_800_000);
    expect(parseDuration("45s")).toBe(45_000);
    expect(parseDuration("500ms")).toBe(500);
    expect(parseDuration("2d")).toBe(2 * 86_400_000);
  });

  it("treats bare numbers as milliseconds", () => {
    expect(parseDuration("250")).toBe(250);
  });

  it("accepts fractional values and surrounding whitespace", () => {
    expect(parseDuration(" 1.5h ")).toBe(5_400_000);
  });

  it("rejects malformed input", () => {
    expect(() => parseDuration("soon")).toThrow(/invalid duration/);
    expect(() => parseDuration("10 h")).toThrow(/invalid duration/);
    expect(() => parseDuration("")).toThrow(/invalid duration/);
  });
});
