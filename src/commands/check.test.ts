import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CliOptions } from "../cli.ts";
import { runCheck } from "./check.ts";

describe("runCheck", () => {
  let dir: string;
  let output: string[];
  const options = (overrides: Partial<CliOptions> = {}): CliOptions => ({
    reporter: "json",
    offline: true,
    catalog: false,
    concurrency: 1,
    failOnUnmatched: false,
    cacheDir: path.join(dir, ".cache"),
    ...overrides,
  });
  const write = (name: string, content: string) => writeFile(path.join(dir, name), content);
  /** A config mapping `files` to a schema requiring the two supply-chain policy keys. */
  const writePolicy = async (mapping: { force: boolean; files?: string }) => {
    await write("policy.json", '{"type":"object","required":["minimumReleaseAge","trustPolicy"]}');
    await write(
      "sill.config.json",
      JSON.stringify({
        catalog: false,
        schemas: [
          {
            files: mapping.files ?? "pnpm-workspace.yaml",
            schema: "./policy.json",
            force: mapping.force,
          },
        ],
      }),
    );
  };

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "sill-check-"));
    vi.spyOn(process, "cwd").mockReturnValue(dir);
    output = [];
    vi.spyOn(console, "log").mockImplementation((line: unknown) => {
      output.push(String(line));
    });
    await write("schema.json", '{"type":"object","required":["name"]}');
    await write(
      "sill.config.json",
      '{"catalog":false,"schemas":[{"files":["good.json","bad.json","broken.json"],"schema":"./schema.json"}]}',
    );
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("passes when every mapped file is valid", async () => {
    await write("good.json", '{"name":"x"}');
    expect(await runCheck([], options())).toBe(0);
  });

  it("fails when a mapped file violates its schema", async () => {
    await write("good.json", '{"name":"x"}');
    await write("bad.json", "{}");
    expect(await runCheck([], options())).toBe(1);
  });

  it("fails on files that cannot be parsed", async () => {
    await write("broken.json", '{"name": ');
    expect(await runCheck([], options())).toBe(1);
  });

  it("only fails on unmatched files when asked to", async () => {
    await write("good.json", '{"name":"x"}');
    await write("other.json", "{}");
    expect(await runCheck([], options())).toBe(0);
    expect(await runCheck([], options({ failOnUnmatched: true }))).toBe(1);
  });

  it("validates against an inline $schema reference", async () => {
    await write("inline.json", '{"$schema":"./schema.json"}');
    expect(await runCheck(["inline.json"], options())).toBe(1);
    await write("inline.json", '{"$schema":"./schema.json","name":"x"}');
    expect(await runCheck(["inline.json"], options())).toBe(0);
  });

  it("honors a custom cache ttl", async () => {
    await write("good.json", '{"name":"x"}');
    expect(await runCheck([], options({ ttl: "1h" }))).toBe(0);
  });

  it("validates against catalog matches", async () => {
    await write("sill.config.json", '{"registries":["https://registry.test/catalog.json"]}');
    await write("tool.json", "{}");
    const catalog = {
      schemas: [{ url: "https://registry.test/tool.schema.json", fileMatch: ["tool.json"] }],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>((input) =>
        Promise.resolve(
          typeof input === "string" && input.endsWith("catalog.json")
            ? Response.json(catalog)
            : Response.json({ type: "object", required: ["name"] }),
        ),
      ),
    );
    expect(await runCheck(["tool.json"], options({ catalog: true, offline: false }))).toBe(1);
  });

  it("warns when a catalog cannot be loaded and keeps going", async () => {
    await write("sill.config.json", '{"registries":["https://registry.test/catalog.json"]}');
    await write("tool.json", "{}");
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(() => Promise.reject(new Error("offline"))),
    );
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await runCheck(["tool.json"], options({ catalog: true, offline: false }))).toBe(0);
    expect(error).toHaveBeenCalledWith(expect.stringContaining("could not load catalog"));
  });

  it("lets a forced mapping beat a YAML modeline pointing at a permissive schema", async () => {
    await writePolicy({ force: true });
    await write("permissive.json", "{}");
    await write(
      "pnpm-workspace.yaml",
      "# yaml-language-server: $schema=./permissive.json\npackages:\n  - x\n",
    );
    expect(await runCheck(["pnpm-workspace.yaml"], options())).toBe(1);
    const report = output.join("\n");
    expect(report).toContain("minimumReleaseAge");
    expect(report).toContain("trustPolicy");
  });

  it("keeps the inline reference when the mapping is not forced", async () => {
    await writePolicy({ force: false });
    await write("permissive.json", "{}");
    await write(
      "pnpm-workspace.yaml",
      "# yaml-language-server: $schema=./permissive.json\npackages:\n  - x\n",
    );
    expect(await runCheck(["pnpm-workspace.yaml"], options())).toBe(0);
  });

  it("lets a forced mapping beat a JSON $schema key", async () => {
    await writePolicy({ force: true, files: "data.json" });
    await write("permissive.json", "{}");
    await write("data.json", '{"$schema":"./permissive.json"}');
    expect(await runCheck(["data.json"], options())).toBe(1);
  });

  it("lets a forced mapping beat a TOML schema directive", async () => {
    await writePolicy({ force: true, files: "data.toml" });
    await write("permissive.json", "{}");
    await write("data.toml", '#:schema ./permissive.json\nname = "x"\n');
    expect(await runCheck(["data.toml"], options())).toBe(1);
  });

  it("validates a compliant file against the forced schema", async () => {
    await writePolicy({ force: true });
    await write(
      "pnpm-workspace.yaml",
      "# yaml-language-server: $schema=./permissive.json\nminimumReleaseAge: 10080\ntrustPolicy: no-downgrade\n",
    );
    expect(await runCheck(["pnpm-workspace.yaml"], options())).toBe(0);
  });

  it("reports schemas that cannot be loaded", async () => {
    await write(
      "sill.config.json",
      '{"catalog":false,"schemas":[{"files":"good.json","schema":"./missing.json"}]}',
    );
    await write("good.json", '{"name":"x"}');
    expect(await runCheck([], options())).toBe(1);
  });
});
