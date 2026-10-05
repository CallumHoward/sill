import process from "node:process";

import { afterEach, describe, expect, it, vi } from "vitest";

import { defaultCacheDirectory } from "./cache-dir.ts";

describe("defaultCacheDirectory", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("honors SILL_CACHE_DIR above everything", () => {
    vi.stubEnv("SILL_CACHE_DIR", "/custom/cache");
    expect(defaultCacheDirectory()).toBe("/custom/cache");
  });

  it("ends with a sill segment on every platform", () => {
    vi.stubEnv("SILL_CACHE_DIR", "");
    expect(defaultCacheDirectory().endsWith("sill")).toBe(true);
  });

  it("uses XDG_CACHE_HOME on linux", () => {
    // Only meaningful where the linux branch is reachable.
    if (process.platform === "darwin" || process.platform === "win32") return;
    vi.stubEnv("SILL_CACHE_DIR", "");
    vi.stubEnv("XDG_CACHE_HOME", "/xdg-cache");
    expect(defaultCacheDirectory()).toBe("/xdg-cache/sill");
  });
});
