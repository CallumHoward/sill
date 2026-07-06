import { describe, expect, it } from "vitest";

import { compileCatalog } from "./catalog.ts";

const CATALOG_URL = "https://example.com/catalog.json";

const compile = (schemas: unknown) => compileCatalog(CATALOG_URL, { schemas });

describe("compileCatalog", () => {
  it("matches a literal basename at the root and nested", () => {
    const catalog = compile([
      { url: "https://s.test/tsconfig.json", fileMatch: ["tsconfig.json"] },
    ]);
    for (const path of ["tsconfig.json", "packages/app/tsconfig.json"]) {
      expect(catalog.match(path)).toEqual({
        schemaUri: "https://s.test/tsconfig.json",
        pattern: "tsconfig.json",
        catalogUrl: CATALOG_URL,
      });
    }
  });

  it("matches bare extension patterns", () => {
    const catalog = compile([{ url: "https://s.test/geo.json", fileMatch: ["*.geojson"] }]);
    expect(catalog.match("data/map.geojson")?.schemaUri).toBe("https://s.test/geo.json");
    expect(catalog.match("data/map.json")).toBeNull();
  });

  it("matches compound extension patterns like *.cdx.json", () => {
    const catalog = compile([{ url: "https://s.test/cdx.json", fileMatch: ["*.cdx.json"] }]);
    expect(catalog.match("sbom/app.cdx.json")?.schemaUri).toBe("https://s.test/cdx.json");
    expect(catalog.match("sbom/app.json")).toBeNull();
  });

  it("matches directory-anchored globs", () => {
    const catalog = compile([
      { url: "https://s.test/workflow.json", fileMatch: [".github/workflows/*.yml"] },
    ]);
    expect(catalog.match(".github/workflows/ci.yml")?.schemaUri).toBe(
      "https://s.test/workflow.json",
    );
    expect(catalog.match("other/.github/workflows/ci.yml")).toBeNull();
    expect(catalog.match(".github/workflows/nested/ci.yml")).toBeNull();
  });

  it("matches ** globs across depths", () => {
    const catalog = compile([
      { url: "https://s.test/app.json", fileMatch: ["**/.platform/applications.yaml"] },
    ]);
    expect(catalog.match(".platform/applications.yaml")?.schemaUri).toBe("https://s.test/app.json");
    expect(catalog.match("deep/dir/.platform/applications.yaml")?.schemaUri).toBe(
      "https://s.test/app.json",
    );
  });

  it("matches dotfiles with glob patterns", () => {
    const catalog = compile([{ url: "https://s.test/rc.json", fileMatch: [".babelrc*"] }]);
    expect(catalog.match("pkg/.babelrc")?.schemaUri).toBe("https://s.test/rc.json");
  });

  it("skips negation patterns", () => {
    const catalog = compile([{ url: "https://s.test/x.json", fileMatch: ["!excluded.json"] }]);
    expect(catalog.match("excluded.json")).toBeNull();
  });

  it("prefers the first matching entry regardless of bucket", () => {
    const catalog = compile([
      { url: "https://s.test/first.json", fileMatch: ["configs/*.json"] },
      { url: "https://s.test/second.json", fileMatch: ["special.json"] },
    ]);
    // Glob (entry 0) must beat the literal-basename hit (entry 1).
    expect(catalog.match("configs/special.json")?.schemaUri).toBe("https://s.test/first.json");
  });

  it("prefers the earlier literal over a later glob", () => {
    const catalog = compile([
      { url: "https://s.test/literal.json", fileMatch: ["config.json"] },
      { url: "https://s.test/glob.json", fileMatch: ["**/*.json"] },
    ]);
    expect(catalog.match("a/config.json")?.schemaUri).toBe("https://s.test/literal.json");
  });

  it("skips malformed entries and non-string patterns", () => {
    const catalog = compile([
      null,
      42,
      { fileMatch: ["orphan.json"] },
      { url: "https://s.test/ok.json", fileMatch: [7, "ok.json"] },
    ]);
    expect(catalog.match("orphan.json")).toBeNull();
    expect(catalog.match("ok.json")?.schemaUri).toBe("https://s.test/ok.json");
  });

  it("returns null for a catalog document without schemas", () => {
    expect(compileCatalog(CATALOG_URL, {}).match("anything.json")).toBeNull();
    expect(compileCatalog(CATALOG_URL, "garbage").match("anything.json")).toBeNull();
  });

  it("ignores entries without fileMatch", () => {
    const catalog = compile([{ url: "https://s.test/nomatch.json" }]);
    expect(catalog.match("nomatch.json")).toBeNull();
  });
});
