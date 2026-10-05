import { homedir } from "node:os";
import path from "node:path";
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

  it("uses LOCALAPPDATA on windows", () => {
    vi.stubEnv("SILL_CACHE_DIR", "");
    vi.stubEnv("LOCALAPPDATA", path.join("C:", "Local"));
    vi.spyOn(process, "platform", "get").mockReturnValue("win32");
    expect(defaultCacheDir()).toBe(path.join("C:", "Local", "sill"));
  });

  it("uses ~/Library/Caches on macOS", () => {
    vi.stubEnv("SILL_CACHE_DIR", "");
    vi.spyOn(process, "platform", "get").mockReturnValue("darwin");
    expect(defaultCacheDir()).toBe(path.join(homedir(), "Library", "Caches", "sill"));
  });

  it("uses XDG_CACHE_HOME on linux", () => {
    // Only meaningful where the linux branch is reachable.
    if (process.platform === "darwin" || process.platform === "win32") return;
    vi.stubEnv("SILL_CACHE_DIR", "");
    vi.stubEnv("XDG_CACHE_HOME", "/xdg-cache");
    expect(defaultCacheDir()).toBe("/xdg-cache/sill");
  });
});
