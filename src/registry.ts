import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import type { AnySchemaObject } from "ajv";

import type { SchemaCache } from "./cache.ts";

export interface VendorStore {
  dir: string;
  /** Remote URL → filename under {@link dir}. */
  manifest: Record<string, string>;
}

export interface Registry {
  /** Normalize a schema reference from a file to an absolute URI. */
  resolveRef(ref: string, fromFile: string): string;
  /** Load and parse a schema document; also used as Ajv's loadSchema. */
  load(uri: string): Promise<AnySchemaObject>;
}

function resolveRef(ref: string, fromFile: string): string {
  if (/^https?:\/\//.test(ref)) return ref;
  if (ref.startsWith("file://")) return ref;
  const resolved = path.isAbsolute(ref) ? ref : path.resolve(path.dirname(fromFile), ref);
  return pathToFileURL(resolved).href;
}

export function createRegistry(opts: {
  cache: SchemaCache;
  vendor?: VendorStore | undefined;
}): Registry {
  const parsed = new Map<string, Promise<AnySchemaObject>>();

  async function loadNow(uri: string): Promise<AnySchemaObject> {
    if (uri.startsWith("file://")) {
      const text = await readFile(fileURLToPath(uri), "utf8");
      return JSON.parse(text) as AnySchemaObject;
    }
    const vendored = opts.vendor?.manifest[uri];
    if (opts.vendor !== undefined && vendored !== undefined) {
      const text = await readFile(path.join(opts.vendor.dir, vendored), "utf8");
      return JSON.parse(text) as AnySchemaObject;
    }
    const response = await opts.cache.fetchText(uri);
    return JSON.parse(response.body) as AnySchemaObject;
  }

  return {
    resolveRef,
    load(uri) {
      const key = uri.replace(/#.*$/, "");
      let promise = parsed.get(key);
      if (!promise) {
        promise = loadNow(key);
        parsed.set(key, promise);
      }
      return promise;
    },
  };
}
