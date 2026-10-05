import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { discoverFiles } from "./discover.ts";

describe("discoverFiles", () => {
  let dir: string;

  async function seed(files: Record<string, string>): Promise<void> {
    for (const [file, content] of Object.entries(files)) {
      await mkdir(path.join(dir, file, ".."), { recursive: true });
      await writeFile(path.join(dir, file), content);
    }
  }

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "sill-discover-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("finds config-format files recursively with no args", async () => {
    await seed({
      "tsconfig.json": "{}",
      ".github/workflows/ci.yml": "",
      "settings.toml": "",
      "data.json5": "{}",
      "readme.md": "",
      "app.ts": "",
    });
    const files = await discoverFiles([], { cwd: dir, exclude: [] });
    expect(files).toEqual([
      ".github/workflows/ci.yml",
      "data.json5",
      "settings.toml",
      "tsconfig.json",
    ]);
  });

  it("skips node_modules and lockfiles by default", async () => {
    await seed({
      "node_modules/pkg/tsconfig.json": "{}",
      "package-lock.json": "{}",
      "pnpm-lock.yaml": "",
      "Cargo.lock": "",
      "ok.json": "{}",
    });
    const files = await discoverFiles([], { cwd: dir, exclude: [] });
    expect(files).toEqual(["ok.json"]);
  });

  it("honors the root .gitignore", async () => {
    await seed({
      ".gitignore": "generated/\n",
      "generated/out.json": "{}",
      "kept.json": "{}",
    });
    const files = await discoverFiles([], { cwd: dir, exclude: [] });
    expect(files).toEqual(["kept.json"]);
  });

  it("applies config excludes", async () => {
    await seed({ "fixtures/bad.json": "{}", "ok.json": "{}" });
    const files = await discoverFiles([], { cwd: dir, exclude: ["fixtures/**"] });
    expect(files).toEqual(["ok.json"]);
  });

  it("expands directory arguments and passes explicit files through", async () => {
    await seed({
      "sub/a.yaml": "",
      "sub/deep/b.toml": "",
      "package-lock.json": "{}",
      "other.json": "{}",
    });
    const files = await discoverFiles(["sub", "package-lock.json"], { cwd: dir, exclude: [] });
    expect(files).toEqual(["package-lock.json", "sub/a.yaml", "sub/deep/b.toml"]);
  });

  it("treats non-path arguments as glob patterns", async () => {
    await seed({ "a/x.json": "{}", "b/x.json": "{}", "a/y.yaml": "" });
    const files = await discoverFiles(["**/x.json"], { cwd: dir, exclude: [] });
    expect(files).toEqual(["a/x.json", "b/x.json"]);
  });
});
