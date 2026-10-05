import Ajv from "ajv";
import type { ErrorObject } from "ajv";
import { describe, expect, it } from "vitest";

import type { ConvertContext } from "./diagnostics.ts";
import { convertErrors } from "./diagnostics.ts";
import type { ParsedDocument, Span } from "./types.ts";

function errorsFor(schema: object, instance: unknown): ErrorObject[] {
  const ajv = new Ajv({ allErrors: true, strict: false });
  const validate = ajv.compile(schema);
  expect(validate(instance)).toBe(false);
  return validate.errors ?? [];
}

function stubDoc(value: unknown, spans: Record<string, Span> = {}): ParsedDocument {
  return {
    value,
    schemaRef: null,
    locate: (path) => spans[path] ?? null,
  };
}

function context(
  schema: object,
  instance: unknown,
  overrides: Partial<ConvertContext> = {},
): ConvertContext {
  return {
    file: "test.json",
    doc: stubDoc(instance),
    rootSchema: schema,
    inlineJsonSchemaKey: false,
    ...overrides,
  };
}

describe("convertErrors", () => {
  it("keeps only the best anyOf branch and drops the parent", () => {
    const schema = {
      type: "object",
      anyOf: [{ required: ["a"] }, { required: ["b", "c", "d"] }],
    };
    const out = convertErrors(errorsFor(schema, {}), context(schema, {}));
    expect(out).toHaveLength(1);
    expect(out[0]!.keyword).toBe("required");
    expect(out[0]!.message).toContain("'a'");
    expect(out.some((d) => d.keyword === "anyOf")).toBe(false);
  });

  it("does the same for oneOf", () => {
    const schema = {
      type: "object",
      oneOf: [{ required: ["a"] }, { required: ["b", "c", "d"] }],
    };
    const out = convertErrors(errorsFor(schema, {}), context(schema, {}));
    expect(out).toHaveLength(1);
    expect(out[0]!.keyword).toBe("required");
    expect(out.some((d) => d.keyword === "oneOf")).toBe(false);
  });

  it("resolves nested anyOf innermost-first", () => {
    const schema = {
      anyOf: [
        { anyOf: [{ type: "string" }, { type: "number" }] },
        { type: "object", required: ["x", "y", "z"] },
      ],
    };
    const out = convertErrors(errorsFor(schema, true), context(schema, true));
    expect(out).toHaveLength(1);
    expect(out[0]!.keyword).toBe("type");
    expect(out[0]!.schemaPath).toBe("#/anyOf/0/anyOf/0/type");
  });

  it("keeps the parent when a failing anyOf has no child errors", () => {
    // Both branches fail via `not`, which produces no child errors of its own
    // beyond the not keyword; craft a parent-only case by filtering children.
    const schema = { anyOf: [{ required: ["a"] }] };
    const parentOnly = errorsFor(schema, {}).filter((e) => e.keyword === "anyOf");
    const out = convertErrors(parentOnly, context(schema, {}));
    expect(out).toHaveLength(1);
    expect(out[0]!.keyword).toBe("anyOf");
  });

  it("splits additionalProperties with span and suggestion", () => {
    const schema = {
      type: "object",
      properties: { timeout: {}, retries: {} },
      additionalProperties: false,
    };
    const instance = { timeuot: 1 };
    const spans = { "/timeuot": { offset: 4, length: 9 } };
    const out = convertErrors(
      errorsFor(schema, instance),
      context(schema, instance, { doc: stubDoc(instance, spans) }),
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.message).toBe('unexpected property "timeuot"');
    expect(out[0]!.span).toEqual({ offset: 4, length: 9 });
    expect(out[0]!.suggestion).toBe("timeout");
  });

  it("collects property candidates through allOf for suggestions", () => {
    const schema = {
      type: "object",
      allOf: [{ properties: { verbose: {} } }],
      additionalProperties: false,
    };
    const instance = { verbsoe: true };
    const out = convertErrors(errorsFor(schema, instance), context(schema, instance));
    expect(out[0]!.suggestion).toBe("verbose");
  });

  it("drops the root $schema key noise for inline JSON associations", () => {
    const schema = { type: "object", properties: { a: {} }, additionalProperties: false };
    const instance = { $schema: "https://example.com/s.json", a: 1 };
    const errors = errorsFor(schema, instance);
    expect(convertErrors(errors, context(schema, instance, { inlineJsonSchemaKey: true }))).toEqual(
      [],
    );
    expect(
      convertErrors(errors, context(schema, instance, { inlineJsonSchemaKey: false })),
    ).toHaveLength(1);
  });

  it("formats enum errors with a suggestion", () => {
    const schema = {
      type: "object",
      properties: { level: { enum: ["debug", "info", "warn", "error"] } },
    };
    const instance = { level: "inof" };
    const out = convertErrors(errorsFor(schema, instance), context(schema, instance));
    expect(out).toHaveLength(1);
    expect(out[0]!.message).toBe("must be one of: debug, info, warn, error");
    expect(out[0]!.suggestion).toBe("info");
  });

  it("truncates long enum lists", () => {
    const allowed = Array.from({ length: 10 }, (_, index) => `v${index}`);
    const schema = { type: "object", properties: { x: { enum: allowed } } };
    const instance = { x: "nope-not-close" };
    const out = convertErrors(errorsFor(schema, instance), context(schema, instance));
    expect(out[0]!.message).toBe("must be one of: v0, v1, v2, v3, v4, v5, v6, v7, … (2 more)");
    expect(out[0]!.suggestion).toBeUndefined();
  });

  it("stringifies non-string enum values", () => {
    const schema = { type: "object", properties: { x: { enum: [1, "two", null] } } };
    const instance = { x: "three" };
    const out = convertErrors(errorsFor(schema, instance), context(schema, instance));
    expect(out[0]!.message).toBe("must be one of: 1, two, null");
  });

  it("dedupes identical findings", () => {
    const schema = { type: "object", allOf: [{ required: ["a"] }, { required: ["a"] }] };
    const out = convertErrors(errorsFor(schema, {}), context(schema, {}));
    expect(out).toHaveLength(1);
  });

  it("sorts by span offset with unlocated diagnostics last", () => {
    const schema = {
      type: "object",
      properties: { a: { type: "string" }, b: { type: "string" }, c: { type: "string" } },
    };
    const instance = { a: 1, b: 2, c: 3 };
    const spans = {
      "/a": { offset: 10, length: 1 },
      "/b": { offset: 2, length: 1 },
    };
    const out = convertErrors(
      errorsFor(schema, instance),
      context(schema, instance, { doc: stubDoc(instance, spans) }),
    );
    expect(out.map((d) => d.instancePath)).toEqual(["/b", "/a", "/c"]);
  });

  it("falls back to the parent span when the exact path is unlocatable", () => {
    const schema = {
      type: "object",
      properties: { nested: { type: "object", properties: { x: { type: "number" } } } },
    };
    const instance = { nested: { x: "s" } };
    const spans = { "/nested": { offset: 5, length: 20 } };
    const out = convertErrors(
      errorsFor(schema, instance),
      context(schema, instance, { doc: stubDoc(instance, spans) }),
    );
    expect(out[0]!.span).toEqual({ offset: 5, length: 20 });
  });
});
