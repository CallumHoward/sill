/** A byte range in a source file. */
export interface Span {
  offset: number;
  length: number;
}

/** One parsed document. Files usually yield one; multi-document YAML streams yield several. */
export interface ParsedDoc {
  value: unknown;
  /** Inline schema reference (verbatim), or null if the document has none. */
  schemaRef: string | null;
  /**
   * Resolve a JSON pointer (Ajv instancePath) to the source span of that node. Returns null when
   * the path cannot be located.
   */
  locate(instancePath: string): Span | null;
}

/** Format-specific parser. Throws {@link ParseIssue} on malformed input. */
export interface ParserAdapter {
  format: "json" | "json5" | "yaml" | "toml";
  extensions: readonly string[];
  parse(text: string): ParsedDoc[];
}

/** A parse failure carrying the source location of the error. */
export class ParseIssue extends Error {
  readonly span: Span;

  constructor(message: string, span: Span) {
    super(message);
    this.name = "ParseIssue";
    this.span = span;
  }
}

/** How a file came to be associated with its schema. */
export type AssociationSource =
  | { kind: "inline" }
  | { kind: "config"; pattern: string; forced?: boolean }
  | { kind: "catalog"; catalogUrl: string; pattern: string };

export interface Association {
  schemaUri: string;
  source: AssociationSource;
}

/** A single validation finding, mapped back to the source file. */
export interface Diagnostic {
  file: string;
  message: string;
  /** JSON Schema keyword, or a sill-specific kind for non-schema failures. */
  keyword: string;
  instancePath: string;
  schemaPath?: string;
  span: Span | null;
  /** "Did you mean …?" candidate, when one is close enough. */
  suggestion?: string;
}

/** Sill.config.jsonc shape. */
export interface SillConfig {
  /** Stop the upward config-file search at this directory. */
  root?: boolean;
  exclude?: string[];
  /**
   * Ordered glob→schema mappings; first match wins. A mapping with `force: true` also beats a
   * file's own inline `$schema` reference, and every forced mapping is checked before any other.
   */
  schemas?: { files: string | string[]; schema: string; force?: boolean }[];
  /** Extra catalog URLs consulted before SchemaStore. */
  registries?: string[];
  /** Consult the SchemaStore catalog (default true). */
  catalog?: boolean;
  /** Hermetic mode: resolve remote schemas from this vendored directory. */
  vendor?: { dir?: string };
  /** Validate `format` keywords (default true). */
  validateFormats?: boolean;
}
