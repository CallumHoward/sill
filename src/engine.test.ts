import type { AnySchemaObject } from "ajv";
import { describe, expect, it, vi } from "vitest";

import { createEngine, dialectOf } from "./engine.ts";

describe("dialectOf", () => {
  it("detects each dialect from the meta-schema URI", () => {
    expect(dialectOf("https://json-schema.org/draft/2020-12/schema")).toBe("2020-12");
    expect(dialectOf("https://json-schema.org/draft/2019-09/schema")).toBe("2019-09");
    expect(dialectOf("http://json-schema.org/draft-07/schema#")).toBe("draft-07");
    expect(dialectOf("http://json-schema.org/draft-06/schema#")).toBe("draft-06");
    expect(dialectOf("http://json-schema.org/draft-04/schema#")).toBe("draft-04");
  });

  it("defaults to 2020-12 when unspecified", () => {
    expect(dialectOf(undefined)).toBe("2020-12");
  });
});

describe("createEngine", () => {
  const loadSchema = vi.fn<(uri: string) => Promise<AnySchemaObject>>();

  it("compiles and validates across dialects", async () => {
    const engine = createEngine({ loadSchema, validateFormats: true });
    const v2020 = await engine.compile("mem://a", {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: { port: { type: "integer" } },
    });
    expect(v2020({ port: 80 })).toBe(true);
    expect(v2020({ port: "80" })).toBe(false);

    const v04 = await engine.compile("mem://b", {
      $schema: "http://json-schema.org/draft-04/schema#",
      type: "object",
      required: ["name"],
    });
    expect(v04({})).toBe(false);
  });

  it("returns the same validator for repeat compiles of one URI", async () => {
    const engine = createEngine({ loadSchema, validateFormats: true });
    const schema = { type: "object" } as const;
    const first = await engine.compile("mem://same", schema);
    const second = await engine.compile("mem://same", schema);
    expect(second).toBe(first);
  });

  it("resolves remote $refs through loadSchema", async () => {
    loadSchema.mockResolvedValueOnce({ type: "string" });
    const engine = createEngine({ loadSchema, validateFormats: true });
    const validate = await engine.compile("https://example.com/root.json", {
      type: "object",
      properties: { name: { $ref: "https://example.com/name.json" } },
    });
    expect(loadSchema).toHaveBeenCalledWith("https://example.com/name.json");
    expect(validate({ name: "ok" })).toBe(true);
    expect(validate({ name: 1 })).toBe(false);
  });

  it("anchors relative $refs at the schema URI", async () => {
    loadSchema.mockImplementation((uri) =>
      uri === "https://example.com/nested/leaf.json"
        ? Promise.resolve({ type: "number" })
        : Promise.reject(new Error(`unexpected ${uri}`)),
    );
    const engine = createEngine({ loadSchema, validateFormats: true });
    const validate = await engine.compile("https://example.com/nested/root.json", {
      type: "object",
      properties: { n: { $ref: "./leaf.json" } },
    });
    expect(validate({ n: 5 })).toBe(true);
    expect(validate({ n: "5" })).toBe(false);
  });

  it("honors validateFormats: false", async () => {
    const engine = createEngine({ loadSchema, validateFormats: false });
    const validate = await engine.compile("mem://fmt", {
      type: "string",
      format: "uri",
    });
    expect(validate("definitely not a uri")).toBe(true);
  });
});
