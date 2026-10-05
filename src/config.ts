import { readFile } from "node:fs/promises";
import path from "node:path";

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
  /** Beats a file's inline schema reference (policy checks); see SillConfig. */
  force?: boolean;
}

const MAPPING_KEYS = new Set(["files", "schema", "force"]);

// fallow-ignore-next-line complexity
function assertShape(value: unknown, file: string): SillConfig {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${file}: config must be an object`);
  }
  const config = value as SillConfig;
  for (const mapping of config.schemas ?? []) {
    // A typo like "forced" would otherwise silently weaken a policy check.
    for (const key of Object.keys(mapping)) {
      if (!MAPPING_KEYS.has(key)) {
        throw new Error(`${file}: unknown key "${key}" in a schemas[] entry`);
      }
    }
    if (mapping.force !== undefined && typeof mapping.force !== "boolean") {
      throw new Error(`${file}: schemas[] "force" must be a boolean`);
    }
    if (typeof mapping.schema !== "string" || mapping.schema === "") {
      throw new Error(`${file}: every schemas[] entry needs a "schema" string`);
    }
    const files = Array.isArray(mapping.files) ? mapping.files : [mapping.files];
    if (files.length === 0 || files.some((f) => typeof f !== "string")) {
      throw new Error(`${file}: every schemas[] entry needs "files" glob string(s)`);
    }
  }
  return config;
}

async function readConfigFile(file: string): Promise<SillConfig> {
  const text = await readFile(file, "utf8");
  const errors: ParseError[] = [];
  const value: unknown = parseJsonc(text, errors, { allowTrailingComma: true });
  const [e] = errors;
  if (e) {
    throw new Error(
      `${file}: invalid JSONC (${printParseErrorCode(e.error)} at offset ${e.offset})`,
    );
  }
  return assertShape(value, file);
}

/**
 * Locate and parse the nearest sill config. Walks upward from cwd unless an explicit path is given;
 * returns null when none exists.
 */
export async function loadConfig(cwd: string, explicitPath?: string): Promise<LoadedConfig | null> {
  if (explicitPath !== undefined) {
    const file = path.isAbsolute(explicitPath) ? explicitPath : path.resolve(cwd, explicitPath);
    return { config: await readConfigFile(file), dir: path.dirname(file), path: file };
  }
  let dir = path.resolve(cwd);
  for (;;) {
    for (const name of CONFIG_FILENAMES) {
      const file = path.join(dir, name);
      try {
        return { config: await readConfigFile(file), dir, path: file };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export function schemaMappings(loaded: LoadedConfig | null): SchemaMapping[] {
  return (loaded?.config.schemas ?? []).map((m) => ({
    files: Array.isArray(m.files) ? m.files : [m.files],
    schema: m.schema,
    ...(m.force === true ? { force: true } : {}),
  }));
}

/** Load the vendor manifest when the config enables hermetic mode. */
export async function loadVendorStore(
  loaded: LoadedConfig | null,
): Promise<VendorStore | undefined> {
  if (!loaded?.config.vendor) return undefined;
  const dir = path.resolve(loaded.dir, loaded.config.vendor.dir ?? "schemas");
  const manifestPath = path.join(dir, "manifest.json");
  try {
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Record<string, string>;
    return { dir, manifest };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { dir, manifest: {} };
    throw error;
  }
}
