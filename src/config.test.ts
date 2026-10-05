import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { loadConfig, loadVendorStore, schemaMappings } from "./config.ts";

describe("config", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "sill-config-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  describe("loadConfig", () => {
    it("returns null when no config exists", async () => {
      expect(await loadConfig(dir)).toBeNull();
    });

    it("parses JSONC with comments and trailing commas", async () => {
      await writeFile(
        path.join(dir, "sill.config.jsonc"),
        `{
        // mappings
        "schemas": [{ "files": "*.json", "schema": "https://example.com/s.json" },],
      }`,
      );
      const loaded = await loadConfig(dir);
      expect(loaded?.dir).toBe(dir);
      expect(schemaMappings(loaded)).toEqual([
        { files: ["*.json"], schema: "https://example.com/s.json" },
      ]);
    });

    it("walks upward to find the nearest config", async () => {
      await writeFile(path.join(dir, "sill.config.json"), `{"exclude": ["x/**"]}`);
      const nested = path.join(dir, "a", "b");
      await mkdir(nested, { recursive: true });
      const loaded = await loadConfig(nested);
      expect(loaded?.config.exclude).toEqual(["x/**"]);
      expect(loaded?.dir).toBe(dir);
    });

    it("prefers .jsonc over .json in the same directory", async () => {
      await writeFile(path.join(dir, "sill.config.jsonc"), `{"catalog": false}`);
      await writeFile(path.join(dir, "sill.config.json"), `{"catalog": true}`);
      const loaded = await loadConfig(dir);
      expect(loaded?.config.catalog).toBe(false);
    });

    it("loads an explicit path relative to cwd", async () => {
      await writeFile(path.join(dir, "custom.jsonc"), `{"catalog": false}`);
      const loaded = await loadConfig(dir, "custom.jsonc");
      expect(loaded?.config.catalog).toBe(false);
    });

    it("rejects malformed shapes with a useful message", async () => {
      await writeFile(path.join(dir, "sill.config.json"), `{"schemas": [{"files": "*.json"}]}`);
      await expect(loadConfig(dir)).rejects.toThrow(/needs a "schema" string/);
    });

    it("rejects invalid JSONC", async () => {
      await writeFile(path.join(dir, "sill.config.json"), `{"schemas": `);
      await expect(loadConfig(dir)).rejects.toThrow(/invalid JSONC/);
    });
  });

  describe("loadVendorStore", () => {
    it("returns undefined when vendor mode is off", async () => {
      await writeFile(path.join(dir, "sill.config.json"), `{}`);
      expect(await loadVendorStore(await loadConfig(dir))).toBeUndefined();
    });

    it("reads the manifest from the vendor dir", async () => {
      await writeFile(path.join(dir, "sill.config.json"), `{"vendor": {}}`);
      await mkdir(path.join(dir, "schemas"));
      await writeFile(
        path.join(dir, "schemas", "manifest.json"),
        `{"https://example.com/s.json": "s.json"}`,
      );
      const store = await loadVendorStore(await loadConfig(dir));
      expect(store?.dir).toBe(path.join(dir, "schemas"));
      expect(store?.manifest).toEqual({ "https://example.com/s.json": "s.json" });
    });

    it("yields an empty manifest for a fresh vendor dir", async () => {
      await writeFile(path.join(dir, "sill.config.json"), `{"vendor": {"dir": "vendored"}}`);
      const store = await loadVendorStore(await loadConfig(dir));
      expect(store?.dir).toBe(path.join(dir, "vendored"));
      expect(store?.manifest).toEqual({});
    });
  });
});
