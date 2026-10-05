import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import packageJson from "../../package.json" with { type: "json" };
import type { CliOptions } from "../cli.ts";
import { loadConfig } from "../config.ts";

const MAX_DEPTH = 10;

/**
 * Sync vendored schemas: fetch every manifest URL, then walk the transitive $ref closure so
 * vendored validation never needs the network.
 */
export async function runVendor(_args: string[], options: CliOptions): Promise<number> {
  const cwd = process.cwd();
  const loaded = await loadConfig(cwd, options.config);
  const dir = path.resolve(loaded?.dir ?? cwd, loaded?.config.vendor?.dir ?? "schemas");
  const manifestPath = path.join(dir, "manifest.json");

  let manifest: Record<string, string>;
  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Record<string, string>;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    manifest = {};
  }

  const add = options.add;
  if (add !== undefined) {
    if (!/^https?:\/\//.test(add)) {
      console.error("sill vendor --add: expected a schema URL");
      return 2;
    }
    if (!(add in manifest)) manifest[add] = filenameFor(add, manifest);
  }
  if (Object.keys(manifest).length === 0) {
    console.error(
      `sill vendor: no manifest entries (${manifestPath}). Seed one with: sill vendor --add <url>`,
    );
    return 2;
  }

  await mkdir(dir, { recursive: true });
  const fetched = new Map<string, unknown>();
  // BFS over the $ref closure; newly discovered refs join the manifest.
  let frontier = Object.keys(manifest);
  for (let depth = 0; frontier.length > 0 && depth < MAX_DEPTH; depth += 1) {
    const discovered: string[] = [];
    await Promise.all(
      frontier.map(async (url) => {
        if (fetched.has(url)) return;
        const schema = await fetchSchema(url);
        fetched.set(url, schema);
        for (const ref of externalRefs(schema, url)) {
          if (!(ref in manifest)) {
            manifest[ref] = filenameFor(ref, manifest);
            discovered.push(ref);
          }
        }
      }),
    );
    frontier = discovered;
  }

  const sortedManifest = Object.fromEntries(
    Object.entries(manifest).toSorted(([a], [b]) => a.localeCompare(b)),
  );
  await Promise.all(
    Object.entries(sortedManifest).map(async ([url, name]) => {
      const schema = fetched.get(url);
      if (schema === undefined) return;
      await writeFile(path.join(dir, name), `${JSON.stringify(schema, null, 2)}\n`);
    }),
  );
  await writeFile(manifestPath, `${JSON.stringify(sortedManifest, null, 2)}\n`);

  console.log(`vendored ${fetched.size} schema(s) into ${dir}`);
  return 0;
}

async function fetchSchema(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: { "user-agent": `sill/${packageJson.version}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`GET ${url} → ${response.status}`);
  return response.json();
}

/** Collect absolute forms of every external (non-fragment) $ref in a schema. */
export function externalRefs(schema: unknown, baseUrl: string): string[] {
  const references = new Set<string>();
  // fallow-ignore-next-line complexity
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (node === null || typeof node !== "object") return;
    for (const [key, value] of Object.entries(node)) {
      if (key === "$ref" && typeof value === "string" && !value.startsWith("#")) {
        try {
          const abs = new URL(value, baseUrl);
          abs.hash = "";
          if (abs.protocol === "http:" || abs.protocol === "https:") references.add(abs.href);
        } catch {
          // Unresolvable ref — leave it for validation-time errors.
        }
      } else {
        walk(value);
      }
    }
  };
  walk(schema);
  references.delete(baseUrl);
  return [...references];
}

/** Derive a unique, filesystem-safe filename for a schema URL. */
export function filenameFor(url: string, manifest: Record<string, string>): string {
  const taken = new Set(Object.values(manifest));
  const base =
    new URL(url).pathname
      .split("/")
      .findLast(Boolean)
      ?.replaceAll(/[^\w.-]/g, "-")
      .replace(/\.json$/i, "") || "schema";
  for (let n = 0; ; n += 1) {
    const candidate = n === 0 ? `${base}.json` : `${base}-${n}.json`;
    if (!taken.has(candidate)) return candidate;
  }
}
