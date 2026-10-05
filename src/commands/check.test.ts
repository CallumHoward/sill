import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CliOptions } from "../cli.ts";
import { runCheck } from "./check.ts";

describe("runCheck", () => {
  let dir: string;
  const options = (overrides: Partial<CliOptions> = {}): CliOptions => ({
    reporter: "json",
    offline: true,
    catalog: false,
    concurrency: 1,
    failOnUnmatched: false,
    cacheDir: path.join(dir, ".cache"),
    ...overrides,
  });
  const write = (name: string, content: string) => writeFile(path.join(dir, name), content);

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "sill-check-"));
    vi.spyOn(process, "cwd").mockReturnValue(dir);
    vi.spyOn(console, "log").mockImplementation(() => {});
    await write("schema.json", '{"type":"object","required":["name"]}');
    await write(
      "sill.config.json",
      '{"catalog":false,"schemas":[{"files":["good.json","bad.json","broken.json"],"schema":"./schema.json"}]}',
    );
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("passes when every mapped file is valid", async () => {
    await write("good.json", '{"name":"x"}');
    expect(await runCheck([], options())).toBe(0);
  });

  it("fails when a mapped file violates its schema", async () => {
    await write("good.json", '{"name":"x"}');
    await write("bad.json", "{}");
    expect(await runCheck([], options())).toBe(1);
  });

  it("fails on files that cannot be parsed", async () => {
    await write("broken.json", '{"name": ');
    expect(await runCheck([], options())).toBe(1);
  });

  it("only fails on unmatched files when asked to", async () => {
    await write("good.json", '{"name":"x"}');
    await write("other.json", "{}");
    expect(await runCheck([], options())).toBe(0);
    expect(await runCheck([], options({ failOnUnmatched: true }))).toBe(1);
  });

  it("validates against an inline $schema reference", async () => {
    await write("inline.json", '{"$schema":"./schema.json"}');
    expect(await runCheck(["inline.json"], options())).toBe(1);
    await write("inline.json", '{"$schema":"./schema.json","name":"x"}');
    expect(await runCheck(["inline.json"], options())).toBe(0);
  });

  it("honors a custom cache ttl", async () => {
    await write("good.json", '{"name":"x"}');
    expect(await runCheck([], options({ ttl: "1h" }))).toBe(0);
  });

  it("validates against catalog matches", async () => {
    await write("sill.config.json", '{"registries":["https://registry.test/catalog.json"]}');
    await write("tool.json", "{}");
    const catalog = {
      schemas: [{ url: "https://registry.test/tool.schema.json", fileMatch: ["tool.json"] }],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>((input) =>
        Promise.resolve(
          typeof input === "string" && input.endsWith("catalog.json")
            ? Response.json(catalog)
            : Response.json({ type: "object", required: ["name"] }),
        ),
      ),
    );
    expect(await runCheck(["tool.json"], options({ catalog: true, offline: false }))).toBe(1);
  });

  it("warns when a catalog cannot be loaded and keeps going", async () => {
    await write("sill.config.json", '{"registries":["https://registry.test/catalog.json"]}');
    await write("tool.json", "{}");
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(() => Promise.reject(new Error("offline"))),
    );
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await runCheck(["tool.json"], options({ catalog: true, offline: false }))).toBe(0);
    expect(error).toHaveBeenCalledWith(expect.stringContaining("could not load catalog"));
  });

  it("reports schemas that cannot be loaded", async () => {
    await write(
      "sill.config.json",
      '{"catalog":false,"schemas":[{"files":"good.json","schema":"./missing.json"}]}',
    );
    await write("good.json", '{"name":"x"}');
    expect(await runCheck([], options())).toBe(1);
  });
});
