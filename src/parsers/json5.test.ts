import { describe, expect, it } from "vitest";

import { json5Adapter } from "./json5.ts";
import { caughtIssue } from "./test-helpers.ts";

const SAMPLE = `{
  // unquoted keys, single quotes, trailing comma
  $schema: 'https://example.com/schema.json',
  items: [1, 2, { name: 'x' },],
}`;

describe("json5Adapter", () => {
  it("parses JSON5 syntax", () => {
    const doc = json5Adapter.parse(SAMPLE)[0]!;
    expect(doc.value).toEqual({
      $schema: "https://example.com/schema.json",
      items: [1, 2, { name: "x" }],
    });
  });

  it("extracts $schema from identifier or string keys", () => {
    expect(json5Adapter.parse(SAMPLE)[0]!.schemaRef).toBe("https://example.com/schema.json");
    expect(json5Adapter.parse(`{"$schema": "https://s"}`)[0]!.schemaRef).toBe("https://s");
  });

  it("throws ParseIssue on malformed input", () => {
    const issue = caughtIssue(() => json5Adapter.parse("{ bad"));
    expect(issue.span.offset).toBeGreaterThanOrEqual(0);
  });

  it("locates nested keys and array indices", () => {
    const doc = json5Adapter.parse(SAMPLE)[0]!;
    const name = doc.locate("/items/2/name");
    expect(SAMPLE.slice(name!.offset, name!.offset + name!.length)).toBe("'x'");
    expect(doc.locate("/missing")).toBeNull();
  });

  it("locates the root", () => {
    const doc = json5Adapter.parse(`[1]`)[0]!;
    expect(doc.locate("")).toEqual({ offset: 0, length: 3 });
  });
});
