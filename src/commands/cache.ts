import packageJson from "../../package.json" with { type: "json" };
import { SchemaCache } from "../cache.ts";
import type { CliOptions } from "../cli.ts";
import { defaultCacheDir } from "../util/cache-dir.ts";

export async function runCache(args: string[], options: CliOptions): Promise<number> {
  const [subcommand] = args;
  const cacheDir = options.cacheDir ?? defaultCacheDir();
  if (subcommand === "clear") {
    const cache = new SchemaCache({
      cacheDir,
      ttlMs: 0,
      offline: true,
      concurrency: 1,
      userAgent: `sill/${packageJson.version}`,
    });
    await cache.clear();
    console.log(`cleared ${cacheDir}`);
    return 0;
  }
  console.error(`sill cache: unknown subcommand "${subcommand ?? ""}" (expected: clear)`);
  return 2;
}
