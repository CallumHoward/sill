import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import ignoreFactory from "ignore";
import { glob } from "tinyglobby";

const EXTENSIONS = "{json,jsonc,json5,yaml,yml,toml}";

const DEFAULT_IGNORE = ["**/node_modules/**", "**/.git/**"];

// Machine-generated lockfiles: huge, and validating them is pure cost.
// An explicit file argument still includes them.
const LOCKFILE_IGNORE = [
  "**/package-lock.json",
  "**/pnpm-lock.yaml",
  "**/deno.lock",
  "**/bun.lock",
  "**/composer.lock",
  "**/Cargo.lock",
  "**/flake.lock",
];

/**
 * Resolve positional arguments to candidate files (repo-relative POSIX paths). No arguments → every
 * config-format file under cwd, honoring the root .gitignore. Explicit file arguments bypass ignore
 * rules.
 */
export async function discoverFiles(
  args: string[],
  opts: { cwd: string; exclude: string[] },
): Promise<string[]> {
  const ignore = [...DEFAULT_IGNORE, ...LOCKFILE_IGNORE, ...opts.exclude];
  const patterns: string[] = [];
  const literal: string[] = [];

  for (const argument of args) {
    const kind = await pathKind(path.join(opts.cwd, argument));
    if (kind === "dir") patterns.push(`${argument.replace(/\/+$/, "")}/**/*.${EXTENSIONS}`);
    else if (kind === "file") literal.push(argument.replaceAll("\\", "/"));
    else patterns.push(argument);
  }
  if (args.length === 0) patterns.push(`**/*.${EXTENSIONS}`);

  let matched: string[] = [];
  if (patterns.length > 0) {
    matched = await glob(patterns, { cwd: opts.cwd, ignore, dot: true });
    matched = await applyGitignore(matched, opts.cwd);
  }
  return [...new Set([...literal, ...matched])].sort();
}

async function pathKind(path: string): Promise<"dir" | "file" | "none"> {
  try {
    return (await stat(path)).isDirectory() ? "dir" : "file";
  } catch {
    return "none";
  }
}

async function applyGitignore(paths: string[], cwd: string): Promise<string[]> {
  let gitignore: string;
  try {
    gitignore = await readFile(path.join(cwd, ".gitignore"), "utf8");
  } catch {
    return paths;
  }
  const matcher = ignoreFactory().add(gitignore);
  return paths.filter((p) => !matcher.ignores(p));
}
