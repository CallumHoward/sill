import { readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import process from "node:process";

import packageJson from "../../package.json" with { type: "json" };
import { createAssociator } from "../associate.ts";
import { SchemaCache } from "../cache.ts";
import { compileCatalog } from "../catalog.ts";
import type { CliOptions } from "../cli.ts";
import { type LoadedConfig, loadConfig, loadVendorStore, schemaMappings } from "../config.ts";
import { adapterForPath } from "../parsers/index.ts";
import { createRegistry } from "../registry.ts";
import { defaultCacheDir } from "../util/cache-dir.ts";
import { parseDuration } from "../util/duration.ts";

const SCHEMASTORE_CATALOG = "https://www.schemastore.org/api/json/catalog.json";

export async function runIdentify(args: string[], options: CliOptions): Promise<number> {
  const [file] = args;
  if (file === undefined) {
    console.error("sill identify: expected a file argument");
    return 2;
  }
  const cwd = process.cwd();
  const absPath = resolve(cwd, file);
  const relPath = relative(cwd, absPath).replaceAll("\\", "/");

  const adapter = adapterForPath(file);
  if (!adapter) {
    console.log(`${relPath}: unsupported format (expected json/jsonc/json5/yaml/toml)`);
    return 0;
  }

  const loaded = await loadConfig(cwd, options.config);
  const cache = buildCache(options);
  const registry = createRegistry({ cache, vendor: await loadVendorStore(loaded) });

  const text = await readFile(absPath, "utf8");
  const [doc] = adapter.parse(text);

  console.log(relPath);
  if (doc?.schemaRef !== null && doc?.schemaRef !== undefined) {
    console.log(`  inline reference: ${doc.schemaRef}`);
    console.log(`  → ${registry.resolveRef(doc.schemaRef, absPath)} (inline wins)`);
    return 0;
  }
  console.log("  inline reference: none");

  if (printConfigMapping(relPath, loaded)) return 0;

  const catalogEnabled = options.catalog && (loaded?.config.catalog ?? true);
  if (!catalogEnabled) {
    console.log("  catalog: disabled");
    console.log("  → no schema association");
    return 0;
  }
  await printCatalogChain(relPath, loaded, cache);
  return 0;
}

function buildCache(options: CliOptions): SchemaCache {
  return new SchemaCache({
    cacheDir: options.cacheDir ?? defaultCacheDir(),
    ttlMs: options.ttl !== undefined ? parseDuration(options.ttl) : 12 * 3_600_000,
    offline: options.offline,
    concurrency: options.concurrency,
    userAgent: `sill/${packageJson.version}`,
  });
}

/** Print the config-mapping step; returns true when a config mapping wins. */
function printConfigMapping(relPath: string, loaded: LoadedConfig | null): boolean {
  const bareDoc = { value: null, schemaRef: null, locate: () => null };
  const configMatch = createAssociator({
    mappings: schemaMappings(loaded),
    catalogs: [],
  }).associate(relPath, bareDoc);
  if (configMatch && configMatch.source.kind === "config") {
    console.log(`  config mapping: "${configMatch.source.pattern}" (${loaded?.path})`);
    console.log(`  → ${configMatch.schemaUri} (config wins)`);
    return true;
  }
  console.log(`  config mapping: none${loaded ? ` (${loaded.path})` : " (no config file)"}`);
  return false;
}

/** Try each catalog in priority order, printing the first match or the fall-through. */
async function printCatalogChain(
  relPath: string,
  loaded: LoadedConfig | null,
  cache: SchemaCache,
): Promise<void> {
  const urls = [...(loaded?.config.registries ?? []), SCHEMASTORE_CATALOG];
  for (const url of urls) {
    try {
      const response = await cache.fetchText(url);
      const match = compileCatalog(url, JSON.parse(response.body)).match(relPath);
      if (match) {
        console.log(`  catalog: ${url} matched "${match.pattern}"`);
        console.log(`  → ${match.schemaUri} (catalog wins)`);
        return;
      }
      console.log(`  catalog: ${url} — no match`);
    } catch (err) {
      console.log(`  catalog: ${url} — unavailable (${(err as Error).message})`);
    }
  }
  console.log("  → no schema association");
}
