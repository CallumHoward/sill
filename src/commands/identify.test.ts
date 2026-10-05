import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CliOptions } from "../cli.ts";
import { runIdentify } from "./identify.ts";

describe("runIdentify", () => {
  let dir: string;
  let output: string[];
  const options = (overrides: Partial<CliOptions> = {}): CliOptions => ({
    offline: false,
    catalog: true,
    concurrency: 1,
    failOnUnmatched: false,
    cacheDir: path.join(dir, ".cache"),
    ...overrides,
  });

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "sill-identify-"));
    vi.spyOn(process, "cwd").mockReturnValue(dir);
    output = [];
    vi.spyOn(console, "log").mockImplementation((line: unknown) => {
      output.push(String(line));
    });
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("requires a file argument", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await runIdentify([], options())).toBe(2);
    expect(error).toHaveBeenCalledWith(expect.stringContaining("expected a file argument"));
  });

  it("reports unsupported formats", async () => {
    expect(await runIdentify(["notes.txt"], options())).toBe(0);
    expect(output[0]).toContain("unsupported format");
  });

  it("accepts a custom cache ttl", async () => {
    await writeFile(path.join(dir, "a.json"), '{"$schema":"./s.json"}');
    expect(await runIdentify(["a.json"], options({ ttl: "1h" }))).toBe(0);
  });

  it("prefers an inline $schema reference", async () => {
    await writeFile(path.join(dir, "a.json"), '{"$schema":"./s.json"}');
    expect(await runIdentify(["a.json"], options())).toBe(0);
    expect(output.join("\n")).toContain("(inline wins)");
  });

  it("reports a matching config mapping", async () => {
    await writeFile(
      path.join(dir, "sill.config.json"),
      '{"schemas":[{"files":"a.json","schema":"./s.json"}]}',
    );
    await writeFile(path.join(dir, "a.json"), "{}");
    expect(await runIdentify(["a.json"], options())).toBe(0);
    expect(output.join("\n")).toContain("(config wins)");
  });

  it("explains when the catalog is disabled", async () => {
    await writeFile(path.join(dir, "sill.config.json"), '{"catalog":false}');
    await writeFile(path.join(dir, "a.json"), "{}");
    expect(await runIdentify(["a.json"], options())).toBe(0);
    expect(output.join("\n")).toContain("catalog: disabled");
    expect(output.join("\n")).toContain("no schema association");
  });

  it("reports a registry catalog match", async () => {
    await writeFile(
      path.join(dir, "sill.config.json"),
      '{"registries":["https://registry.test/catalog.json"]}',
    );
    await writeFile(path.join(dir, "tool.json"), "{}");
    const catalog = {
      schemas: [{ url: "https://registry.test/tool.schema.json", fileMatch: ["tool.json"] }],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(() => Promise.resolve(Response.json(catalog))),
    );
    expect(await runIdentify(["tool.json"], options())).toBe(0);
    expect(output.join("\n")).toContain("https://registry.test/tool.schema.json (catalog wins)");
  });

  it("reports unreachable catalogs and no association", async () => {
    await writeFile(path.join(dir, "a.json"), "{}");
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(() => Promise.reject(new Error("offline"))),
    );
    expect(await runIdentify(["a.json"], options())).toBe(0);
    expect(output.join("\n")).toContain("unavailable");
    expect(output.at(-1)).toContain("no schema association");
  });
});
