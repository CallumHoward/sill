import { githubReporter } from "./github.ts";
import { jsonReporter } from "./json.ts";
import { prettyReporter } from "./pretty.ts";
import type { Reporter } from "./shared.ts";

export type { Reporter, Summary } from "./shared.ts";

export type ReporterName = "pretty" | "github" | "json";

const REPORTERS: Record<ReporterName, Reporter> = {
  pretty: prettyReporter,
  github: githubReporter,
  json: jsonReporter,
};

export function getReporter(name: ReporterName): Reporter {
  return REPORTERS[name];
}

export function resolveReporterName(
  explicit: string | undefined,
  env: NodeJS.ProcessEnv,
): ReporterName {
  if (explicit !== undefined) {
    if (explicit in REPORTERS) return explicit as ReporterName;
    throw new Error(`unknown reporter "${explicit}" (expected pretty, github, or json)`);
  }
  return env["GITHUB_ACTIONS"] === "true" ? "github" : "pretty";
}
