import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";

import packageJson from "../../package.json" with { type: "json" };
import { type Associator, createAssociator } from "../associate.ts";
import { SchemaCache } from "../cache.ts";
import { type CompiledCatalog, compileCatalog } from "../catalog.ts";
import type { CliOptions } from "../cli.ts";
import { type LoadedConfig, loadConfig, loadVendorStore, schemaMappings } from "../config.ts";
import { convertErrors } from "../diagnostics.ts";
import { discoverFiles } from "../discover.ts";
import { createEngine } from "../engine.ts";
import { adapterForPath } from "../parsers/index.ts";
import { createRegistry, type Registry } from "../registry.ts";
import { getReporter, resolveReporterName, type Summary } from "../reporters/index.ts";
import { type Association, type Diagnostic, ParseIssue, type ParsedDoc } from "../types.ts";
import { defaultCacheDir } from "../util/cache-dir.ts";
import { parseDuration } from "../util/duration.ts";
import { Semaphore } from "../util/semaphore.ts";

const SCHEMASTORE_CATALOG = "https://www.schemastore.org/api/json/catalog.json";
const DEFAULT_TTL_MS = 12 * 3_600_000;

interface Target {
  file: string;
  doc: ParsedDoc;
  association: Association;
  schemaUri: string;
}

export async function runCheck(args: string[], options: CliOptions): Promise<number> {
  const started = Date.now();
  const cwd = process.cwd();
  const loaded = await loadConfig(cwd, options.config);

  const cache = new SchemaCache({
    cacheDir: options.cacheDir ?? defaultCacheDir(),
    ttlMs: options.ttl !== undefined ? parseDuration(options.ttl) : DEFAULT_TTL_MS,
    offline: options.offline,
    concurrency: options.concurrency,
    userAgent: `sill/${packageJson.version}`,
  });
  const registry = createRegistry({ cache, vendor: await loadVendorStore(loaded) });

  const files = await discoverFiles(args, { cwd, exclude: loaded?.config.exclude ?? [] });
  const sources = new Map<string, string>();
  const diagnostics: Diagnostic[] = [];
  const skipped: string[] = [];
  const invalidFiles = new Set<string>();
  const checkedFiles = new Set<string>();

  const reads = new Semaphore(64);
  const parsedFiles = await Promise.all(
    files.map(async (file) => {
      const adapter = adapterForPath(file);
      if (!adapter) return null;
      const text = await reads.run(() => readFile(resolve(cwd, file), "utf8"));
      sources.set(file, text);
      try {
        return { file, docs: adapter.parse(text) };
      } catch (err) {
        if (err instanceof ParseIssue) {
          diagnostics.push({
            file,
            message: err.message,
            keyword: "parse",
            instancePath: "",
            span: err.span,
          });
          invalidFiles.add(file);
          checkedFiles.add(file);
          return null;
        }
        throw err;
      }
    }),
  );

  const associator = await buildAssociator(parsedFiles, loaded, cache, options);

  // Group by resolved schema URI so each schema loads and compiles once.
  const groups = new Map<string, Target[]>();
  for (const parsed of parsedFiles) {
    if (!parsed) continue;
    let associated = false;
    for (const doc of parsed.docs) {
      const association = associator.associate(parsed.file, doc);
      if (!association) continue;
      associated = true;
      const schemaUri = resolveAssociation(association, parsed.file, loaded, registry, cwd);
      const target: Target = { file: parsed.file, doc, association, schemaUri };
      const group = groups.get(schemaUri);
      if (group) group.push(target);
      else groups.set(schemaUri, [target]);
    }
    if (!associated) skipped.push(parsed.file);
  }

  const engine = createEngine({
    loadSchema: (uri) => registry.load(uri),
    validateFormats: loaded?.config.validateFormats ?? true,
  });

  await Promise.all(
    [...groups.entries()].map(async ([schemaUri, targets]) => {
      let validate;
      let rootSchema: unknown;
      try {
        rootSchema = await registry.load(schemaUri);
        validate = await engine.compile(schemaUri, rootSchema as Record<string, unknown>);
      } catch (err) {
        for (const target of targets) {
          diagnostics.push({
            file: target.file,
            message: `could not load schema ${schemaUri}: ${(err as Error).message}`,
            keyword: "schema-load",
            instancePath: "",
            span: null,
          });
          invalidFiles.add(target.file);
          checkedFiles.add(target.file);
        }
        return;
      }
      for (const target of targets) {
        checkedFiles.add(target.file);
        const value = target.doc.value;
        // Computed before validate() narrows `value` via its type guard.
        const hasSchemaKey =
          typeof value === "object" && value !== null && Object.hasOwn(value, "$schema");
        if (validate(value)) continue;
        const converted = convertErrors(validate.errors ?? [], {
          file: target.file,
          doc: target.doc,
          rootSchema,
          inlineJsonSchemaKey: target.association.source.kind === "inline" && hasSchemaKey,
        });
        if (converted.length > 0) invalidFiles.add(target.file);
        diagnostics.push(...converted);
      }
    }),
  );

  if (options.failOnUnmatched) {
    for (const file of skipped) {
      diagnostics.push({
        file,
        message: "no schema association (inline, config, or catalog)",
        keyword: "unmatched",
        instancePath: "",
        span: null,
      });
      invalidFiles.add(file);
    }
  }

  const summary: Summary = {
    checked: checkedFiles.size,
    valid: [...checkedFiles].filter((f) => !invalidFiles.has(f)).length,
    invalid: invalidFiles.size,
    skipped: skipped.length,
    durationMs: Date.now() - started,
  };
  const reporter = getReporter(resolveReporterName(options.reporter, process.env));
  const output = reporter.report(diagnostics, sources, summary);
  if (output !== "") console.log(output);

  return diagnostics.length > 0 ? 1 : 0;
}

/**
 * Inline refs resolve relative to the referencing file, config mappings relative to the config
 * file, catalog refs are already absolute.
 */
function resolveAssociation(
  association: Association,
  file: string,
  loaded: LoadedConfig | null,
  registry: Registry,
  cwd: string,
): string {
  switch (association.source.kind) {
    case "inline":
      return registry.resolveRef(association.schemaUri, resolve(cwd, file));
    case "config":
      return registry.resolveRef(
        association.schemaUri,
        loaded?.path ?? resolve(cwd, "sill.config.jsonc"),
      );
    case "catalog":
      return association.schemaUri;
  }
}

/** Fetch and compile catalogs only when some file actually needs them. */
async function buildAssociator(
  parsedFiles: ({ file: string; docs: ParsedDoc[] } | null)[],
  loaded: LoadedConfig | null,
  cache: SchemaCache,
  options: CliOptions,
): Promise<Associator> {
  const mappings = schemaMappings(loaded);
  const withoutCatalogs = createAssociator({ mappings, catalogs: [] });

  const catalogEnabled = options.catalog && (loaded?.config.catalog ?? true);
  if (!catalogEnabled) return withoutCatalogs;
  const anyUnmatched = parsedFiles.some(
    (p) => p && p.docs.some((doc) => withoutCatalogs.associate(p.file, doc) === null),
  );
  if (!anyUnmatched) return withoutCatalogs;

  const urls = [...(loaded?.config.registries ?? []), SCHEMASTORE_CATALOG];
  const catalogs = await Promise.all(
    urls.map(async (url): Promise<CompiledCatalog | null> => {
      try {
        const response = await cache.fetchText(url);
        return compileCatalog(url, JSON.parse(response.body));
      } catch (err) {
        console.error(`sill: warning: could not load catalog ${url}: ${(err as Error).message}`);
        return null;
      }
    }),
  );
  return createAssociator({
    mappings,
    catalogs: catalogs.filter((c): c is CompiledCatalog => c !== null),
  });
}
