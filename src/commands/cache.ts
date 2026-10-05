import packageJson from "../../package.json" with { type: "json" };
import { SchemaCache } from "../cache.ts";
import type { CliOptions } from "../cli.ts";
import { defaultCacheDirectory } from "../util/cache-dir.ts";

export async function runCache(args: string[], options: CliOptions): Promise<number> {
  const [subcommand] = args;
  const cacheDirectory = options.cacheDir ?? defaultCacheDirectory();
  if (subcommand === "clear") {
    const cache = new SchemaCache({
      cacheDir: cacheDirectory,
      ttlMs: 0,
      offline: true,
      concurrency: 1,
      userAgent: `sill/${packageJson.version}`,
    });
    await cache.clear();
    console.log(`cleared ${cacheDirectory}`);
    return 0;
  }
  console.error(`sill cache: unknown subcommand "${subcommand ?? ""}" (expected: clear)`);
  return 2;
}
