import { homedir } from "node:os";
import { join } from "node:path";
import process from "node:process";

/** Per-OS default schema-cache directory, overridable via $SILL_CACHE_DIR. */
export function defaultCacheDir(): string {
  const override = process.env.SILL_CACHE_DIR;
  if (override) return override;
  if (process.platform === "darwin") return join(homedir(), "Library", "Caches", "sill");
  if (process.platform === "win32") {
    return join(process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local"), "sill");
  }
  return join(process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache"), "sill");
}
