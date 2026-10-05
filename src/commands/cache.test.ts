import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CliOptions } from "../cli.ts";
import { runCache } from "./cache.ts";

describe("runCache", () => {
  let cacheDir: string;
  const options = (): CliOptions => ({
    offline: false,
    catalog: true,
    concurrency: 1,
    failOnUnmatched: false,
    cacheDir,
  });

  beforeEach(async () => {
    cacheDir = await mkdtemp(path.join(tmpdir(), "sill-cache-cmd-"));
  });

  afterEach(async () => {
    await rm(cacheDir, { recursive: true, force: true });
  });

  it("clears the cache directory", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    expect(await runCache(["clear"], options())).toBe(0);
    expect(log).toHaveBeenCalledWith(`cleared ${cacheDir}`);
  });

  it("rejects unknown subcommands", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await runCache(["nope"], options())).toBe(2);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('unknown subcommand "nope"'));
  });
});
