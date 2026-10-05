import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { sha256Hex } from "./util/hash.ts";
import { Semaphore } from "./util/semaphore.ts";

export interface CachedResponse {
  body: string;
  fromCache: boolean;
  /** True when the body is past its TTL (offline or stale-on-error fallback). */
  stale: boolean;
}

export interface SchemaCacheOptions {
  cacheDir: string;
  ttlMs: number;
  offline: boolean;
  concurrency: number;
  userAgent: string;
  /** Time source seam for tests; defaults to Date.now. */
  now?: () => number;
}

interface Envelope {
  url: string;
  etag?: string;
  fetchedAt: number;
  body: string;
}

const FETCH_TIMEOUT_MS = 10_000;

/**
 * Disk + in-memory cache for schema/catalog documents. One atomic JSON envelope per URL; ETag
 * revalidation; serves stale content when offline or when the network fails.
 */
export class SchemaCache {
  readonly #opts: Required<SchemaCacheOptions>;
  readonly #inflight = new Map<string, Promise<CachedResponse>>();
  readonly #semaphore: Semaphore;

  constructor(opts: SchemaCacheOptions) {
    this.#opts = { ...opts, now: opts.now ?? Date.now };
    this.#semaphore = new Semaphore(opts.concurrency);
  }

  async fetchText(url: string): Promise<CachedResponse> {
    // Single flight per URL per run; repeat callers share the result.
    let pending = this.#inflight.get(url);
    if (!pending) {
      pending = this.#fetchUncached(url);
      this.#inflight.set(url, pending);
    }
    return pending;
  }

  async clear(): Promise<void> {
    await rm(this.#opts.cacheDir, { recursive: true, force: true });
  }

  async #fetchUncached(url: string): Promise<CachedResponse> {
    const envelope = await this.#read(url);
    if (envelope && this.#opts.now() - envelope.fetchedAt < this.#opts.ttlMs) {
      return { body: envelope.body, fromCache: true, stale: false };
    }
    if (this.#opts.offline) {
      if (envelope) return { body: envelope.body, fromCache: true, stale: true };
      throw new Error(`offline and ${url} is not cached — run once online or vendor it`);
    }
    try {
      return await this.#semaphore.run(() => this.#revalidate(url, envelope));
    } catch (error) {
      if (envelope) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`sill: using stale cache for ${url} (${message})`);
        return { body: envelope.body, fromCache: true, stale: true };
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`failed to fetch ${url}: ${message}`, { cause: error });
    }
  }

  async #revalidate(url: string, envelope: Envelope | null): Promise<CachedResponse> {
    const response = await fetch(url, {
      headers: {
        "user-agent": this.#opts.userAgent,
        ...(envelope?.etag ? { "if-none-match": envelope.etag } : {}),
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (response.status === 304 && envelope) {
      await this.#write({ ...envelope, fetchedAt: this.#opts.now() });
      return { body: envelope.body, fromCache: true, stale: false };
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = await response.text();
    await this.#write({
      url,
      etag: response.headers.get("etag") ?? undefined,
      fetchedAt: this.#opts.now(),
      body,
    });
    return { body, fromCache: false, stale: false };
  }

  #path(url: string): string {
    return path.join(this.#opts.cacheDir, `${sha256Hex(url)}.json`);
  }

  async #read(url: string): Promise<Envelope | null> {
    try {
      const raw = await readFile(this.#path(url), "utf8");
      const parsed = JSON.parse(raw) as Envelope;
      if (typeof parsed.body !== "string" || typeof parsed.fetchedAt !== "number") return null;
      return parsed;
    } catch {
      return null; // Missing or corrupt entries are cache misses.
    }
  }

  async #write(envelope: Envelope): Promise<void> {
    await mkdir(this.#opts.cacheDir, { recursive: true });
    const path = this.#path(envelope.url);
    const tmp = `${path}.tmp-${crypto.randomUUID()}`;
    await writeFile(tmp, JSON.stringify(envelope), "utf8");
    await rename(tmp, path);
  }
}
