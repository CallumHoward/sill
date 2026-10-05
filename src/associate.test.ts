import { describe, expect, it } from "vitest";

import { createAssociator } from "./associate.ts";
import type { CompiledCatalog } from "./catalog.ts";
import type { ParsedDoc } from "./types.ts";

function doc(schemaRef: string | null = null): ParsedDoc {
  return { value: {}, schemaRef, locate: () => null };
}

function fakeCatalog(url: string, matches: Record<string, string>): CompiledCatalog {
  return {
    catalogUrl: url,
    match: (relPath: string) => {
      const schemaUri = matches[relPath];
      return schemaUri === undefined ? null : { schemaUri, pattern: relPath, catalogUrl: url };
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

describe("createAssociator with forced mappings", () => {
  const forced = {
    files: ["pnpm-workspace.yaml"],
    schema: "./policy.json",
    force: true,
  };

  it("beats an inline reference", () => {
    const associator = createAssociator({ mappings: [forced], catalogs: [] });
    const result = associator.associate(
      "pnpm-workspace.yaml",
      doc("https://example.com/open.json"),
    );
    expect(result?.schemaUri).toBe("./policy.json");
    expect(result?.source).toEqual({
      kind: "config",
      pattern: "pnpm-workspace.yaml",
      forced: true,
    });
  });

  it("beats an earlier non-forced mapping that also matches", () => {
    const broad = { files: ["*.yaml"], schema: "https://example.com/broad.json" };
    const associator = createAssociator({ mappings: [broad, forced], catalogs: [] });
    const result = associator.associate(
      "pnpm-workspace.yaml",
      doc("https://example.com/open.json"),
    );
    expect(result?.schemaUri).toBe("./policy.json");
  });

  it("uses the first forced mapping that matches", () => {
    const other = { files: ["*.yaml"], schema: "./other.json", force: true };
    const associator = createAssociator({ mappings: [forced, other], catalogs: [] });
    expect(associator.associate("pnpm-workspace.yaml", doc())?.schemaUri).toBe("./policy.json");
    expect(associator.associate("other.yaml", doc())?.schemaUri).toBe("./other.json");
  });

  it("leaves files it does not match to inline references", () => {
    const associator = createAssociator({ mappings: [forced], catalogs: [] });
    const result = associator.associate("lefthook.yml", doc("https://example.com/open.json"));
    expect(result?.source).toEqual({ kind: "inline" });
  });

  it("keeps non-forced mappings below inline references", () => {
    const plain = { files: ["pnpm-workspace.yaml"], schema: "./policy.json" };
    const associator = createAssociator({ mappings: [plain], catalogs: [] });
    const result = associator.associate(
      "pnpm-workspace.yaml",
      doc("https://example.com/open.json"),
    );
    expect(result?.source).toEqual({ kind: "inline" });
  });
});
