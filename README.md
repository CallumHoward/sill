# sill

Schema validation for config files. Respects `$schema`, falls back to the
[SchemaStore](https://www.schemastore.org/) catalog, and understands the
formats configs actually come in: **JSON, JSONC, JSON5, YAML (multi-document),
and TOML** — with error messages that point at the exact line and column.

> A sill is the beam at the base of a window frame — the piece that keeps the
> structure true. ([lintel](https://github.com/lintel-rs/lintel), the beam
> above, inspired parts of this design.)

```sh
npx @wcmj/sill check          # validate every config file in the repo
```

Runs on Node ≥ 20.19, Bun, and Deno.

## Why

Editors already validate `tsconfig.json`, workflow YAML, and friends via the
JSON/YAML language servers — but nothing enforces the same checks in CI. The
existing CLIs each miss a piece: [v8r](https://github.com/chris48s/v8r)
deliberately ignores `$schema`; `check-jsonschema` validates one schema per
invocation; `ajv-cli` is unmaintained and JSONC-blind. sill does what the
language servers do, repo-wide, in one pass:

1. **Forced mappings** — config mappings marked `"force": true` (see
   [Enforcing a policy](#enforcing-a-policy)); checked first, as a group.
2. **Inline reference** — a `$schema` property, a
   `# yaml-language-server: $schema=<url>` modeline, or a TOML
   `#:schema <url>` directive.
3. **Config mappings** — ordered glob→schema pairs in
   `sill.config.jsonc`; first match wins.
4. **Catalog fallback** — filename matching against your registries, then the
   SchemaStore catalog.

Files that match nothing are skipped silently (use `--fail-on-unmatched` to
change that, and `sill identify <file>` to see why a file resolved the way it
did).

## Commands

| Command                | Purpose                                                            |
| ---------------------- | ------------------------------------------------------------------ |
| `sill check [globs…]`  | Validate discovered (or given) config files                        |
| `sill identify <file>` | Explain the association chain for one file                         |
| `sill vendor`          | Vendor remote schemas (incl. transitive `$ref`s) for hermetic runs |
| `sill cache clear`     | Delete the schema cache                                            |

Key flags: `--reporter pretty|github|json` (auto-selects `github` in Actions),
`--offline`, `--no-catalog`, `--fail-on-unmatched`, `--ttl 12h`,
`--concurrency 12`, `--cache-dir`, `--config`.

Exit codes: `0` clean, `1` findings, `2` usage/internal error.

## Configuration

`sill.config.jsonc` (or `.json`), found by walking up from the working
directory. All fields optional; the file itself is optional too.

```jsonc
{
  "$schema": "https://raw.githubusercontent.com/CallumHoward/sill/main/sill.config.schema.json",
  // Globs excluded from discovery (node_modules, .git, and lockfiles are
  // always excluded).
  "exclude": ["fixtures/**"],
  // Ordered glob→schema mappings; first match wins. Bare filenames match at
  // any depth. Relative schema paths resolve against this file. Add
  // "force": true to beat a file's own inline schema reference.
  "schemas": [
    {
      "files": ".fallowrc.json",
      "schema": "https://raw.githubusercontent.com/fallow-rs/fallow/main/schema.json",
    },
  ],
  // Extra SchemaStore-format catalogs, consulted before SchemaStore itself.
  "registries": [],
  // Set false to disable the SchemaStore fallback entirely.
  "catalog": true,
  // Hermetic mode: resolve remote schemas from ./schemas (see below).
  "vendor": {},
  // Set false to skip JSON Schema `format` keyword validation.
  "validateFormats": true,
}
```

## Caching and hermetic CI

By default sill fetches schemas over HTTPS with an on-disk cache
(`~/.cache/sill` or platform equivalent; `$SILL_CACHE_DIR` overrides): 12 h
TTL, ETag revalidation, and **stale-on-error** — a network hiccup serves the
last known copy rather than failing the build.

For fully deterministic, offline CI, vendor the schemas instead:

```sh
sill vendor --add https://json.schemastore.org/github-workflow.json
git add schemas/            # manifest.json + vendored copies (incl. transitive $refs)
sill check --offline        # never touches the network
```

`sill vendor` re-fetches everything in `schemas/manifest.json` and walks each
schema's `$ref` closure, so review diffs show exactly what changed upstream.

## Enforcing a policy

By default a file's own `$schema` wins, as it does in editors. That is wrong for
a policy check: anyone who can edit the file could add a one-line modeline
pointing at a permissive schema. Mark the mapping `"force": true` and its
schema applies regardless of what the file says about itself:

```jsonc
// sill-policy.jsonc
{
  "catalog": false,
  "schemas": [{ "files": "pnpm-workspace.yaml", "schema": "./pnpm-workspace.json", "force": true }],
}
```

```sh
sill check --config sill-policy.jsonc pnpm-workspace.yaml
```

Forced mappings are checked first, as a group, so an earlier broad mapping
cannot shadow one. `sill identify <file>` reports `(config wins, forced)` and
notes any inline reference it ignored. The file's own `$schema` key is still
part of the data being validated, so a schema with `additionalProperties:
false` will report it.

The check is only as strong as what the author of the file cannot change:

- Keep the sill config, the forced schema (prefer a local path over a URL), and
  the CI command out of reach, for example with CODEOWNERS.
- Name policed files on the command line (`sill check pnpm-workspace.yaml`).
  Discovery by glob honours `.gitignore` and `exclude`, so an ignored file is
  never checked; files named explicitly are always checked.
- `--offline` with `sill vendor` keeps a remote schema from changing under you.

## CI recipe (GitHub Actions)

```yaml
- run: npx @wcmj/sill check
  # In Actions, failures surface as inline ::error annotations automatically.
```

## Programmatic use

```ts
import type { Diagnostic, SillConfig } from "@wcmj/sill";
```

The CLI is the primary interface; the library surface is currently types-only
and will grow as it stabilizes.

## Design notes

- **Span-mapped errors**: every parser keeps its CST, so Ajv's `instancePath`
  is resolved to a real source range (line/column), the way the JSON and YAML
  language servers do it — not by text-searching for key names.
- **Compile once**: files are grouped by resolved schema URI; each schema is
  fetched and compiled a single time per run.
- **Dialect-aware**: draft-04 through 2020-12, auto-selected per schema from
  its `$schema`, via per-dialect Ajv instances.
- **Friendlier failures**: `anyOf`/`oneOf` errors keep only the
  closest-matching branch; unexpected properties get per-property errors with
  "did you mean …?" suggestions.

## License

MIT
