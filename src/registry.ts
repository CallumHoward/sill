import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
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

export function createRegistry(opts: { cache: SchemaCache; vendor?: VendorStore }): Registry {
  const parsed = new Map<string, Promise<AnySchemaObject>>();

  function resolveRef(ref: string, fromFile: string): string {
    if (/^https?:\/\//.test(ref)) return ref;
    if (ref.startsWith("file://")) return ref;
    const path = isAbsolute(ref) ? ref : resolve(dirname(fromFile), ref);
    return pathToFileURL(path).href;
  }

  async function loadNow(uri: string): Promise<AnySchemaObject> {
    if (uri.startsWith("file://")) {
      const text = await readFile(fileURLToPath(uri), "utf8");
      return JSON.parse(text) as AnySchemaObject;
    }
    const vendored = opts.vendor?.manifest[uri];
    if (vendored !== undefined) {
      const text = await readFile(join(opts.vendor!.dir, vendored), "utf8");
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
