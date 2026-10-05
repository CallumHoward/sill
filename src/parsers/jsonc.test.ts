import { describe, expect, it } from "vitest";

import { jsoncAdapter } from "./jsonc.ts";
import { caughtIssue } from "./test-helpers.ts";

const TSCONFIG_STYLE = `{
  // compiler settings
  "$schema": "https://json.schemastore.org/tsconfig",
  "compilerOptions": {
    "strict": true,
    "lib": ["ES2022", "DOM"],
  },
}`;

describe("jsoncAdapter", () => {
  it("parses JSON with comments and trailing commas", () => {
    const doc = jsoncAdapter.parse(TSCONFIG_STYLE)[0]!;
    expect(doc.value).toEqual({
      $schema: "https://json.schemastore.org/tsconfig",
      compilerOptions: { strict: true, lib: ["ES2022", "DOM"] },
    });
  });

  it("extracts a top-level $schema reference", () => {
    const doc = jsoncAdapter.parse(TSCONFIG_STYLE)[0]!;
    expect(doc.schemaRef).toBe("https://json.schemastore.org/tsconfig");
  });

  it("returns null schemaRef when $schema is absent or not a string", () => {
    expect(jsoncAdapter.parse(`{"a": 1}`)[0]!.schemaRef).toBeNull();
    expect(jsoncAdapter.parse(`{"$schema": 42}`)[0]!.schemaRef).toBeNull();
  });

  it("throws ParseIssue with a span on malformed input", () => {
    const issue = caughtIssue(() => jsoncAdapter.parse(`{"a": }`));
    expect(issue.span.offset).toBeGreaterThan(0);
  });

  it("locates the root, nested keys, and array indices", () => {
    const doc = jsoncAdapter.parse(TSCONFIG_STYLE)[0]!;
    expect(doc.locate("")).toEqual({ offset: 0, length: TSCONFIG_STYLE.length });

    const strict = doc.locate("/compilerOptions/strict");
    expect(strict).not.toBeNull();
    expect(TSCONFIG_STYLE.slice(strict!.offset, strict!.offset + strict!.length)).toBe("true");

    const dom = doc.locate("/compilerOptions/lib/1");
    expect(TSCONFIG_STYLE.slice(dom!.offset, dom!.offset + dom!.length)).toBe(`"DOM"`);
  });

  it("unescapes ~0 and ~1 pointer segments", () => {
    const text = `{"a/b": {"c~d": 7}}`;
    const doc = jsoncAdapter.parse(text)[0]!;
    const span = doc.locate("/a~1b/c~0d");
    expect(text.slice(span!.offset, span!.offset + span!.length)).toBe("7");
  });

  it("returns null for missing paths", () => {
    const doc = jsoncAdapter.parse(TSCONFIG_STYLE)[0]!;
    expect(doc.locate("/nope")).toBeNull();
    expect(doc.locate("/compilerOptions/lib/9")).toBeNull();
    expect(doc.locate("/compilerOptions/lib/x")).toBeNull();
  });
});
