import { describe, expect, it } from "vitest";

import { externalRefs, filenameFor } from "./vendor.ts";

describe("externalRefs", () => {
  it("collects absolute refs and resolves relative ones against the base", () => {
    const schema = {
      properties: {
        a: { $ref: "https://example.com/other.json" },
        b: { $ref: "./sibling.json" },
        c: { $ref: "#/definitions/local" },
      },
      items: [{ $ref: "../up.json#/defs/x" }],
    };
    const refs = externalRefs(schema, "https://example.com/nested/root.json");
    expect(refs.toSorted()).toEqual([
      "https://example.com/nested/sibling.json",
      "https://example.com/other.json",
      "https://example.com/up.json",
    ]);
  });

  it("dedupes, drops fragments, and excludes the base itself", () => {
    const schema = {
      a: { $ref: "https://example.com/s.json#/a" },
      b: { $ref: "https://example.com/s.json#/b" },
      self: { $ref: "https://example.com/root.json#/x" },
    };
    expect(externalRefs(schema, "https://example.com/root.json")).toEqual([
      "https://example.com/s.json",
    ]);
  });

  it("ignores non-http refs and unresolvable values", () => {
    const schema = { a: { $ref: "ftp://example.com/x" }, b: { $ref: "" } };
    expect(externalRefs(schema, "https://example.com/root.json")).toEqual([]);
  });
});

describe("filenameFor", () => {
  it("derives a name from the URL path", () => {
    expect(filenameFor("https://json.schemastore.org/tsconfig.json", {})).toBe("tsconfig.json");
  });

  it("sanitizes odd characters and defaults empty paths", () => {
    expect(filenameFor("https://example.com/a%20b.json", {})).toBe("a-20b.json");
    expect(filenameFor("https://example.com/", {})).toBe("schema.json");
  });

  it("suffixes on collision with existing manifest names", () => {
    const manifest = { "https://x.test/tsconfig.json": "tsconfig.json" };
    expect(filenameFor("https://y.test/tsconfig.json", manifest)).toBe("tsconfig-1.json");
  });
});
