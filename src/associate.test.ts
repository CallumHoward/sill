import { describe, expect, it } from "vitest";

import { createAssociator } from "./associate.ts";
import type { CompiledCatalog } from "./catalog.ts";
import type { ParsedDocument } from "./types.ts";

function doc(schemaRef: string | null = null): ParsedDocument {
  return { value: {}, schemaRef, locate: () => null };
}

function fakeCatalog(url: string, matches: Record<string, string>): CompiledCatalog {
  return {
    catalogUrl: url,
    match: (relativePath: string) => {
      const schemaUri = matches[relativePath];
      return schemaUri === undefined ? null : { schemaUri, pattern: relativePath, catalogUrl: url };
    },
  } as unknown as CompiledCatalog;
}

describe("createAssociator", () => {
  const mappings = [
    { files: ["configs/*.json"], schema: "https://example.com/a.json" },
    { files: ["*.json"], schema: "https://example.com/b.json" },
  ];
  const catalog = fakeCatalog("https://cat.test/catalog.json", {
    "tsconfig.json": "https://example.com/tsconfig.json",
  });

  it("inline reference wins over everything", () => {
    const associator = createAssociator({ mappings, catalogs: [catalog] });
    const result = associator.associate("tsconfig.json", doc("./local.schema.json"));
    expect(result).toEqual({
      schemaUri: "./local.schema.json",
      source: { kind: "inline" },
    });
  });

  it("config mappings beat catalogs, first match wins", () => {
    const associator = createAssociator({ mappings, catalogs: [catalog] });
    const result = associator.associate("configs/app.json", doc());
    expect(result?.schemaUri).toBe("https://example.com/a.json");
    expect(result?.source).toEqual({ kind: "config", pattern: "configs/*.json" });
  });

  it("bare filename mappings match at any depth", () => {
    const associator = createAssociator({
      mappings: [{ files: ["lefthook.yml"], schema: "https://example.com/lefthook.json" }],
      catalogs: [],
    });
    expect(associator.associate("deep/nested/lefthook.yml", doc())?.schemaUri).toBe(
      "https://example.com/lefthook.json",
    );
  });

  it("falls back to catalogs in order", () => {
    const first = fakeCatalog("https://first.test/c.json", {});
    const associator = createAssociator({ mappings: [], catalogs: [first, catalog] });
    const result = associator.associate("tsconfig.json", doc());
    expect(result?.source).toEqual({
      kind: "catalog",
      catalogUrl: "https://cat.test/catalog.json",
      pattern: "tsconfig.json",
    });
  });

  it("returns null when nothing matches", () => {
    const associator = createAssociator({ mappings: [], catalogs: [] });
    expect(associator.associate("mystery.json", doc())).toBeNull();
  });
});
