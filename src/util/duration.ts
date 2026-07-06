const UNITS: Record<string, number> = { ms: 1, s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };

/** Parse "12h" / "30m" / "45s" / "500ms" / bare-number-of-ms durations. */
export function parseDuration(input: string): number {
  const match = /^(\d+(?:\.\d+)?)(ms|s|m|h|d)?$/.exec(input.trim());
  if (!match) throw new Error(`invalid duration "${input}" (expected e.g. 12h, 30m, 45s)`);
  const [, num, unit = "ms"] = match;
  return Number(num) * UNITS[unit]!;
}
