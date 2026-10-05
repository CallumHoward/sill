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

  it("reports schemas that cannot be loaded", async () => {
    await write(
      "sill.config.json",
      '{"catalog":false,"schemas":[{"files":"good.json","schema":"./missing.json"}]}',
    );
    await write("good.json", '{"name":"x"}');
    expect(await runCheck([], options())).toBe(1);
  });
});
