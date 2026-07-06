import picomatch from "picomatch";

import type { CompiledCatalog } from "./catalog.ts";
import type { SchemaMapping } from "./config.ts";
import type { Association, ParsedDoc } from "./types.ts";

export interface Associator {
  /**
   * Resolve a document's schema association. Precedence: inline reference → config mappings
   * (ordered, first match wins) → catalogs (in order).
   */
  associate(relPath: string, doc: ParsedDoc): Association | null;
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
    associate(relPath, doc) {
      if (doc.schemaRef !== null) {
        return { schemaUri: doc.schemaRef, source: { kind: "inline" } };
      }
      for (const mapping of compiled) {
        if (mapping.isMatch(relPath)) {
          return {
            schemaUri: mapping.schema,
            source: { kind: "config", pattern: mapping.pattern },
          };
        }
      }
      for (const catalog of opts.catalogs) {
        const match = catalog.match(relPath);
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
