import { describe, expect, it } from "vitest";

import { didYouMean, levenshtein, propertyCandidates } from "./suggest.ts";

describe("levenshtein", () => {
  it("returns 0 for identical strings", () => {
    expect(levenshtein("abc", "abc")).toBe(0);
  });

  it("counts single-char edits", () => {
    expect(levenshtein("kitten", "sitten")).toBe(1);
    expect(levenshtein("kitten", "sitting")).toBe(3);
  });

  it("handles empty strings", () => {
    expect(levenshtein("", "abc")).toBe(3);
    expect(levenshtein("abc", "")).toBe(3);
  });
});

describe("didYouMean", () => {
  it("accepts a close candidate", () => {
    expect(didYouMean("timeuot", ["timeout", "retries"])).toBe("timeout");
  });

  it("matches case-insensitively but returns the candidate as-is", () => {
    expect(didYouMean("TIMEOUT", ["timeout"])).toBe("timeout");
  });

  it("rejects candidates beyond the distance budget", () => {
    expect(didYouMean("zzz", ["timeout", "retries"])).toBeUndefined();
  });

  it("rejects short near-total rewrites (distance*2 > length)", () => {
    expect(didYouMean("ab", ["xy"])).toBeUndefined();
  });

  it("prefers the closest candidate, first on ties", () => {
    expect(didYouMean("warn", ["warm", "wars", "info"])).toBe("warm");
  });
});

describe("propertyCandidates", () => {
  it("collects direct properties", () => {
    const schema = { properties: { a: {}, b: {} } };
    expect(propertyCandidates(schema, schema).sort()).toEqual(["a", "b"]);
  });

  it("recurses through allOf", () => {
    const schema = { allOf: [{ properties: { a: {} } }, { properties: { b: {} } }] };
    expect(propertyCandidates(schema, schema).sort()).toEqual(["a", "b"]);
  });

  it("resolves local $refs against the root schema", () => {
    const root = {
      definitions: { base: { properties: { fromRef: {} } } },
      properties: { direct: {} },
    };
    const schema = { $ref: "#/definitions/base", properties: { own: {} } };
    expect(propertyCandidates(schema, root).sort()).toEqual(["fromRef", "own"]);
  });

  it("survives $ref cycles", () => {
    const root: Record<string, unknown> = { properties: { a: {} } };
    root.$ref = "#";
    expect(propertyCandidates(root, root)).toEqual(["a"]);
  });

  it("returns empty for non-object schemas", () => {
    expect(propertyCandidates(true, true)).toEqual([]);
  });
});
