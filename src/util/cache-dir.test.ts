import process from "node:process";

import { afterEach, describe, expect, it, vi } from "vitest";

import { defaultCacheDir } from "./cache-dir.ts";

describe("defaultCacheDir", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("honors SILL_CACHE_DIR above everything", () => {
    vi.stubEnv("SILL_CACHE_DIR", "/custom/cache");
    expect(defaultCacheDir()).toBe("/custom/cache");
  });

  it("ends with a sill segment on every platform", () => {
    vi.stubEnv("SILL_CACHE_DIR", "");
    expect(defaultCacheDir().endsWith("sill")).toBe(true);
  });

  it("uses XDG_CACHE_HOME on linux", () => {
    // Only meaningful where the linux branch is reachable.
    if (process.platform === "darwin" || process.platform === "win32") return;
    vi.stubEnv("SILL_CACHE_DIR", "");
    vi.stubEnv("XDG_CACHE_HOME", "/xdg-cache");
    expect(defaultCacheDir()).toBe("/xdg-cache/sill");
  });
});
