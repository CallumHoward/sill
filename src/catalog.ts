import picomatch from "picomatch";

export interface CatalogEntry {
  name?: string;
  description?: string;
  url: string;
  fileMatch?: string[];
}

export interface CatalogMatch {
  schemaUri: string;
  pattern: string;
  catalogUrl: string;
}

interface Candidate {
  index: number;
  url: string;
  pattern: string;
}

interface ExtensionCandidate extends Candidate {
  /** Full suffix the basename must end with, e.g. ".cdx.json". */
  suffix: string;
}

interface GlobCandidate extends Candidate {
  isMatch: (path: string) => boolean;
}

const GLOB_METACHARS = /[*?[\]{}()!]/;

/** Lowest catalog index wins; earlier entries take priority. */
function better(a: Candidate | null, b: Candidate | undefined): Candidate | null {
  if (!b) return a;
  return a === null || b.index < a.index ? b : a;
}

/** SchemaStore-format catalog compiled for fast filename matching. */
export class CompiledCatalog {
  readonly catalogUrl: string;
  /** Literal basename patterns (no "/"), matched at any depth. */
  readonly #byBasename = new Map<string, Candidate>();
  /** Literal path patterns (with "/"), matched against the full relPath. */
  readonly #byPath = new Map<string, Candidate>();
  /** Bare-extension patterns (optionally `**`-prefixed), bucketed by final extension. */
  readonly #byExtension = new Map<string, ExtensionCandidate[]>();
  /** Everything else, in catalog order. */
  readonly #globs: GlobCandidate[] = [];

  constructor(catalogUrl: string, entries: CatalogEntry[]) {
    this.catalogUrl = catalogUrl;
    entries.forEach((entry, index) => {
      for (const pattern of entry.fileMatch ?? []) {
        this.#add(pattern, { index, url: entry.url, pattern });
      }
    });
  }

  // Called on instances returned to associate.ts / identify.ts; fallow misses instance dispatch.
  // fallow-ignore-next-line unused-class-member complexity
  match(relPath: string): CatalogMatch | null {
    const basename = relPath.slice(relPath.lastIndexOf("/") + 1);
    let best = better(null, this.#byBasename.get(basename));
    best = better(best, this.#byPath.get(relPath));

    const dot = basename.lastIndexOf(".");
    if (dot >= 0) {
      for (const candidate of this.#byExtension.get(basename.slice(dot + 1)) ?? []) {
        if (basename.endsWith(candidate.suffix)) best = better(best, candidate);
      }
    }

    for (const candidate of this.#globs) {
      // Sorted by index; nothing later can beat the current best.
      if (best !== null && candidate.index >= best.index) break;
      if (candidate.isMatch(relPath)) best = better(best, candidate);
    }

    return best === null
      ? null
      : { schemaUri: best.url, pattern: best.pattern, catalogUrl: this.catalogUrl };
  }

  #add(pattern: string, candidate: Candidate): void {
    if (pattern.startsWith("!")) return; // Negations are rare and unsupported.

    const bareExtension = /^(?:\*\*\/)?(\*\.[^*?[\]{}()!/]+)$/.exec(pattern);
    if (bareExtension) {
      const suffix = bareExtension[1]!.slice(1); // ".cdx.json"
      const key = suffix.slice(suffix.lastIndexOf(".") + 1);
      const bucket = this.#byExtension.get(key) ?? [];
      bucket.push({ ...candidate, suffix });
      this.#byExtension.set(key, bucket);
      return;
    }

    if (!GLOB_METACHARS.test(pattern)) {
      const map = pattern.includes("/") ? this.#byPath : this.#byBasename;
      if (!map.has(pattern)) map.set(pattern, candidate);
      return;
    }

    // Bare patterns match at any depth, mirroring editor fileMatch semantics.
    const normalized = pattern.includes("/") ? pattern : `**/${pattern}`;
    this.#globs.push({ ...candidate, isMatch: picomatch(normalized, { dot: true }) });
  }
}

function parseEntry(raw: unknown): CatalogEntry | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { url, fileMatch, name, description } = raw as Record<string, unknown>;
  if (typeof url !== "string") return null;
  return {
    url,
    name: typeof name === "string" ? name : undefined,
    description: typeof description === "string" ? description : undefined,
    fileMatch: Array.isArray(fileMatch)
      ? fileMatch.filter((p): p is string => typeof p === "string")
      : undefined,
  };
}

/** Parse a SchemaStore-format catalog document, skipping malformed entries. */
export function compileCatalog(catalogUrl: string, catalogJson: unknown): CompiledCatalog {
  const schemas =
    typeof catalogJson === "object" && catalogJson !== null
      ? (catalogJson as { schemas?: unknown }).schemas
      : undefined;
  const entries = Array.isArray(schemas)
    ? schemas.map(parseEntry).filter((entry): entry is CatalogEntry => entry !== null)
    : [];
  return new CompiledCatalog(catalogUrl, entries);
}
