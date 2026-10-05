import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SchemaCache } from "./cache.ts";
import { createRegistry } from "./registry.ts";

describe("createRegistry", () => {
  let dir: string;
  const fetchText = vi.fn<SchemaCache["fetchText"]>();
  const cache = { fetchText } as unknown as SchemaCache;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "sill-registry-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("passes http(s) and file:// references through unchanged", () => {
    const registry = createRegistry({ cache });
    expect(registry.resolveRef("https://example.com/s.json", "/a/b.json")).toBe(
      "https://example.com/s.json",
    );
    expect(registry.resolveRef("file:///x/s.json", "/a/b.json")).toBe("file:///x/s.json");
  });

  it("resolves relative references against the referencing file", () => {
    const registry = createRegistry({ cache });
    expect(registry.resolveRef("./s.json", path.join(dir, "nested", "b.json"))).toBe(
      pathToFileURL(path.join(dir, "nested", "s.json")).href,
    );
  });

  it("converts absolute paths to file URLs", () => {
    const registry = createRegistry({ cache });
    const absolute = path.join(dir, "s.json");
    expect(registry.resolveRef(absolute, "/ignored/b.json")).toBe(pathToFileURL(absolute).href);
  });

  it("loads local schemas and memoizes per URI, ignoring fragments", async () => {
    const file = path.join(dir, "s.json");
    await writeFile(file, '{"type":"object"}');
    const registry = createRegistry({ cache });
    const uri = pathToFileURL(file).href;
    const first = registry.load(uri);
    expect(registry.load(`${uri}#/definitions/a`)).toBe(first);
    expect(await first).toEqual({ type: "object" });
  });

  it("prefers the vendored copy over the network", async () => {
    await writeFile(path.join(dir, "vendored.json"), '{"type":"string"}');
    const registry = createRegistry({
      cache,
      vendor: { dir, manifest: { "https://example.com/s.json": "vendored.json" } },
    });
    expect(await registry.load("https://example.com/s.json")).toEqual({ type: "string" });
    expect(fetchText).not.toHaveBeenCalled();
  });

  it("falls back to the cache for remote schemas", async () => {
    fetchText.mockResolvedValue({ body: '{"type":"number"}', fromCache: false, stale: false });
    const registry = createRegistry({ cache, vendor: { dir, manifest: {} } });
    expect(await registry.load("https://example.com/other.json")).toEqual({ type: "number" });
    expect(fetchText).toHaveBeenCalledWith("https://example.com/other.json");
  });
});
