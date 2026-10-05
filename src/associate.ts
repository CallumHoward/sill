import picomatch from "picomatch";

import type { CompiledCatalog } from "./catalog.ts";
import type { SchemaMapping } from "./config.ts";
import type { Association, ParsedDocument } from "./types.ts";

export interface Associator {
  /**
   * Resolve a document's schema association. Precedence: inline reference → config mappings
   * (ordered, first match wins) → catalogs (in order).
   */
  associate(relativePath: string, doc: ParsedDocument): Association | null;
}

interface CompiledMapping {
  schema: string;
  pattern: string;
  isMatch(path: string): boolean;
}

function compileMapping(mapping: SchemaMapping): CompiledMapping[] {
  return mapping.files.map((file) => {
    // Bare filenames (no slash) match at any depth, mirroring catalog rules.
    const pattern = file.includes("/") ? file : `**/${file}`;
    return { schema: mapping.schema, pattern: file, isMatch: picomatch(pattern, { dot: true }) };
  });
}

export function createAssociator(opts: {
  mappings: SchemaMapping[];
  catalogs: CompiledCatalog[];
}): Associator {
  const compiled = opts.mappings.flatMap(compileMapping);

  return {
    associate(relativePath, document) {
      if (document.schemaRef !== null) {
        return { schemaUri: document.schemaRef, source: { kind: "inline" } };
      }
      for (const mapping of compiled) {
        if (mapping.isMatch(relativePath)) {
          return {
            schemaUri: mapping.schema,
            source: { kind: "config", pattern: mapping.pattern },
          };
        }
      }
      for (const catalog of opts.catalogs) {
        const match = catalog.match(relativePath);
        if (match) {
          return {
            schemaUri: match.schemaUri,
            source: { kind: "catalog", catalogUrl: match.catalogUrl, pattern: match.pattern },
          };
        }
      }
      return null;
    },
  };
}
