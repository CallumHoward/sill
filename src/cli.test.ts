import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

const CLI = fileURLToPath(new URL("cli.ts", import.meta.url));

describe("cli flags", () => {
  let dir: string;
  const run = (...args: string[]) =>
    spawnSync(process.execPath, [CLI, ...args], {
      cwd: dir,
      encoding: "utf8",
      env: { ...process.env, SILL_CACHE_DIR: path.join(dir, ".cache") },
    });

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "sill-cli-"));
    await writeFile(path.join(dir, "unmatched.json"), "{}");
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("accepts --no-catalog, as documented", () => {
    const result = run("--no-catalog", "check");
    expect(result.stderr).not.toContain("Unknown option");
    expect(result.status).toBe(0);
  });

  it("rejects options it does not know", () => {
    const result = run("--nope", "check");
    expect(result.stderr).toContain("Unknown option");
    expect(result.status).not.toBe(0);
  });
});
