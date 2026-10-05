import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SchemaCache, type SchemaCacheOptions } from "./cache.ts";

const URL_A = "https://example.com/schema.json";

describe("SchemaCache", () => {
  let cacheDir: string;
  let currentTime: number;

  // Deterministic time via the `now` seam instead of fake timers, so real
  // fs promises and fetch mocks resolve normally.
  const makeCache = (overrides: Partial<SchemaCacheOptions> = {}) =>
    new SchemaCache({
      cacheDir,
      ttlMs: 1000,
      offline: false,
      concurrency: 4,
      userAgent: "sill-test",
      now: () => currentTime,
      ...overrides,
    });

  beforeEach(async () => {
    cacheDir = await mkdtemp(path.join(tmpdir(), "sill-cache-"));
    currentTime = 1_000_000;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches on a cold miss and writes an envelope", async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response('{"a":1}', { status: 200, headers: { etag: '"v1"' } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await makeCache().fetchText(URL_A);
    expect(result).toEqual({ body: '{"a":1}', fromCache: false, stale: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const files = await readdir(cacheDir);
    expect(files).toHaveLength(1);
    const envelope = JSON.parse(await readFile(path.join(cacheDir, files[0]!), "utf8")) as {
      url: string;
      etag: string;
      fetchedAt: number;
      body: string;
    };
    expect(envelope).toEqual({
      url: URL_A,
      etag: '"v1"',
      fetchedAt: currentTime,
      body: '{"a":1}',
    });
  });

  it("serves a fresh envelope without touching the network", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => new Response("first", { status: 200 })),
    );
    await makeCache().fetchText(URL_A);

    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    currentTime += 500; // still within ttl
    const result = await makeCache().fetchText(URL_A);
    expect(result).toEqual({ body: "first", fromCache: true, stale: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("revalidates a stale envelope and refreshes the TTL on 304", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(
        async () => new Response("first", { status: 200, headers: { etag: '"v1"' } }),
      ),
    );
    await makeCache().fetchText(URL_A);

    currentTime += 2000; // past ttl
    const revalidate = vi.fn<typeof fetch>(async (_url, init?: RequestInit) => {
      expect(new Headers(init?.headers).get("if-none-match")).toBe('"v1"');
      return new Response(null, { status: 304 });
    });
    vi.stubGlobal("fetch", revalidate);
    const result = await makeCache().fetchText(URL_A);
    expect(result).toEqual({ body: "first", fromCache: true, stale: false });
    expect(revalidate).toHaveBeenCalledTimes(1);

    // The 304 refreshed fetchedAt: a new instance sees a fresh entry.
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    const again = await makeCache().fetchText(URL_A);
    expect(again.stale).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("falls back to stale content when the network fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => new Response("first", { status: 200 })),
    );
    await makeCache().fetchText(URL_A);

    currentTime += 2000;
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => {
        throw new Error("ECONNREFUSED");
      }),
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await makeCache().fetchText(URL_A);
    expect(result).toEqual({ body: "first", fromCache: true, stale: true });
    expect(warn).toHaveBeenCalledOnce();
  });

  it("falls back to stale content on a non-ok status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => new Response("first", { status: 200 })),
    );
    await makeCache().fetchText(URL_A);

    currentTime += 2000;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 503 })),
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await makeCache().fetchText(URL_A);
    expect(result.stale).toBe(true);
    expect(warn).toHaveBeenCalledOnce();
  });

  it("serves stale entries offline without fetching", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => new Response("first", { status: 200 })),
    );
    await makeCache().fetchText(URL_A);

    currentTime += 2000;
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    const result = await makeCache({ offline: true }).fetchText(URL_A);
    expect(result).toEqual({ body: "first", fromCache: true, stale: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws a clear error for an uncached URL offline", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    await expect(makeCache({ offline: true }).fetchText(URL_A)).rejects.toThrow(
      `offline and ${URL_A} is not cached`,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("propagates cold-miss network failures with the URL", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => {
        throw new Error("ECONNREFUSED");
      }),
    );
    await expect(makeCache().fetchText(URL_A)).rejects.toThrow(`failed to fetch ${URL_A}`);
  });

  it("shares one network flight across concurrent callers", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return new Response("slow", { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const cache = makeCache();
    const [a, b, c] = await Promise.all([
      cache.fetchText(URL_A),
      cache.fetchText(URL_A),
      cache.fetchText(URL_A),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(a.body).toBe("slow");
    expect(b).toEqual(a);
    expect(c).toEqual(a);
  });

  it("treats a corrupt envelope as a miss", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => new Response("first", { status: 200 })),
    );
    const cache = makeCache();
    await cache.fetchText(URL_A);

    const files = await readdir(cacheDir);
    const { writeFile } = await import("node:fs/promises");
    await writeFile(path.join(cacheDir, files[0]!), "not json", "utf8");

    const fetchMock = vi.fn<typeof fetch>(async () => new Response("second", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await makeCache().fetchText(URL_A);
    expect(result).toEqual({ body: "second", fromCache: false, stale: false });
  });

  it("clear() removes the cache directory", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => new Response("first", { status: 200 })),
    );
    const cache = makeCache();
    await cache.fetchText(URL_A);
    await cache.clear();
    await expect(readdir(cacheDir)).rejects.toThrow(/ENOENT/);
  });
});
