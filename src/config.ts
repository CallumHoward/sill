import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";

import { type ParseError, parse as parseJsonc, printParseErrorCode } from "jsonc-parser";

import type { VendorStore } from "./registry.ts";
import type { SillConfig } from "./types.ts";

const CONFIG_FILENAMES = ["sill.config.jsonc", "sill.config.json"];

export interface LoadedConfig {
  config: SillConfig;
  /** Directory containing the config file; mappings resolve relative to it. */
  dir: string;
  path: string;
}

/** Normalized glob→schema mapping (files always an array). */
export interface SchemaMapping {
  files: string[];
  schema: string;
}

function assertShape(value: unknown, path: string): SillConfig {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${path}: config must be an object`);
  }
  const config = value as SillConfig;
  for (const mapping of config.schemas ?? []) {
    if (typeof mapping.schema !== "string" || mapping.schema === "") {
      throw new Error(`${path}: every schemas[] entry needs a "schema" string`);
    }
    const files = Array.isArray(mapping.files) ? mapping.files : [mapping.files];
    if (files.length === 0 || files.some((f) => typeof f !== "string")) {
      throw new Error(`${path}: every schemas[] entry needs "files" glob string(s)`);
    }
  }
  return config;
}

async function readConfigFile(path: string): Promise<SillConfig> {
  const text = await readFile(path, "utf8");
  const errors: ParseError[] = [];
  const value: unknown = parseJsonc(text, errors, { allowTrailingComma: true });
  const [e] = errors;
  if (e) {
    throw new Error(
      `${path}: invalid JSONC (${printParseErrorCode(e.error)} at offset ${e.offset})`,
    );
  }
  return assertShape(value, path);
}

/**
 * Locate and parse the nearest sill config. Walks upward from cwd unless an explicit path is given;
 * returns null when none exists.
 */
export async function loadConfig(cwd: string, explicitPath?: string): Promise<LoadedConfig | null> {
  if (explicitPath !== undefined) {
    const path = isAbsolute(explicitPath) ? explicitPath : resolve(cwd, explicitPath);
    return { config: await readConfigFile(path), dir: dirname(path), path };
  }
  let dir = resolve(cwd);
  for (;;) {
    for (const name of CONFIG_FILENAMES) {
      const path = join(dir, name);
      try {
        return { config: await readConfigFile(path), dir, path };
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      }
    }
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export function schemaMappings(loaded: LoadedConfig | null): SchemaMapping[] {
  return (loaded?.config.schemas ?? []).map((m) => ({
    files: Array.isArray(m.files) ? m.files : [m.files],
    schema: m.schema,
  }));
}

/** Load the vendor manifest when the config enables hermetic mode. */
export async function loadVendorStore(
  loaded: LoadedConfig | null,
): Promise<VendorStore | undefined> {
  if (!loaded?.config.vendor) return undefined;
  const dir = resolve(loaded.dir, loaded.config.vendor.dir ?? "schemas");
  const manifestPath = join(dir, "manifest.json");
  try {
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Record<string, string>;
    return { dir, manifest };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return { dir, manifest: {} };
    throw err;
  }
}
