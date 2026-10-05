import { homedir } from "node:os";
import path from "node:path";
import process from "node:process";

/** Per-OS default schema-cache directory, overridable via $SILL_CACHE_DIR. */
export function defaultCacheDir(): string {
  const override = process.env["SILL_CACHE_DIR"];
  if (override) return override;
  if (process.platform === "darwin") return path.join(homedir(), "Library", "Caches", "sill");
  if (process.platform === "win32") {
    return path.join(
      process.env["LOCALAPPDATA"] ?? path.join(homedir(), "AppData", "Local"),
      "sill",
    );
  }
  return path.join(process.env["XDG_CACHE_HOME"] ?? path.join(homedir(), ".cache"), "sill");
}
