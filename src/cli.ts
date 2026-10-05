#!/usr/bin/env node
import process from "node:process";
import { parseArgs } from "node:util";

import packageJson from "../package.json" with { type: "json" };

const HELP = `sill — schema validation for config files

Usage:
  sill check [globs…]     Validate config files (default command)
  sill identify <file>    Explain which schema a file resolves to, and why
  sill vendor             Sync vendored schemas from the manifest
  sill cache clear        Delete the schema cache

Options:
  --reporter <name>   Output format: pretty | github | json (default: pretty,
                      or github when running in GitHub Actions)
  --offline           Never touch the network; use cache/vendored schemas only
  --no-catalog        Disable SchemaStore catalog fallback
  --config <path>     Explicit sill.config.jsonc path
  --cache-dir <path>  Override the schema cache directory
  --ttl <duration>    Schema cache freshness window (e.g. 12h, 30m)
  --concurrency <n>   Max parallel schema fetches (default: 12)
  --fail-on-unmatched Error on files with no schema association
  -h, --help          Show this help
  -v, --version       Show version
`;

export interface CliOptions {
  reporter?: string;
  offline: boolean;
  catalog: boolean;
  config?: string;
  cacheDir?: string;
  ttl?: string;
  concurrency: number;
  failOnUnmatched: boolean;
  /** URL to register in the vendor manifest (sill vendor --add). */
  add?: string;
}

async function main(): Promise<number> {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    options: {
      reporter: { type: "string" },
      offline: { type: "boolean", default: false },
      catalog: { type: "boolean", default: true },
      config: { type: "string" },
      "cache-dir": { type: "string" },
      ttl: { type: "string" },
      concurrency: { type: "string", default: "12" },
      "fail-on-unmatched": { type: "boolean", default: false },
      add: { type: "string" },
      help: { type: "boolean", short: "h", default: false },
      version: { type: "boolean", short: "v", default: false },
    },
  });

  if (values.version) {
    console.log(packageJson.version);
    return 0;
  }
  if (values.help) {
    console.log(HELP);
    return 0;
  }

  const concurrency = Number.parseInt(values.concurrency, 10);
  if (Number.isNaN(concurrency) || concurrency < 1) {
    console.error(`sill: invalid --concurrency "${values.concurrency}"`);
    return 2;
  }

  const options: CliOptions = {
    reporter: values.reporter,
    offline: values.offline,
    catalog: values.catalog,
    config: values.config,
    cacheDir: values["cache-dir"],
    ttl: values.ttl,
    concurrency,
    failOnUnmatched: values["fail-on-unmatched"],
    add: values.add,
  };

  const [command = "check", ...rest] = positionals;
  switch (command) {
    case "check": {
      const { runCheck } = await import("./commands/check.ts");
      return runCheck(rest, options);
    }
    case "identify": {
      const { runIdentify } = await import("./commands/identify.ts");
      return runIdentify(rest, options);
    }
    case "vendor": {
      const { runVendor } = await import("./commands/vendor.ts");
      return runVendor(rest, options);
    }
    case "cache": {
      const { runCache } = await import("./commands/cache.ts");
      return runCache(rest, options);
    }
    default: {
      console.error(`sill: unknown command "${command}"\n`);
      console.log(HELP);
      return 2;
    }
  }
}

try {
  process.exitCode = await main();
} catch (error: unknown) {
  console.error(error instanceof Error ? `sill: ${error.message}` : error);
  process.exitCode = 2;
}
