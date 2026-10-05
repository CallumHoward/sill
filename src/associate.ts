import picomatch from "picomatch";

import type { CompiledCatalog } from "./catalog.ts";
import type { SchemaMapping } from "./config.ts";
import type { Association, ParsedDoc } from "./types.ts";

export interface Associator {
  /**
   * Resolve a document's schema association. Precedence: forced config mappings → inline reference
   * → config mappings (ordered, first match wins) → catalogs (in order).
   */
  associate(relPath: string, doc: ParsedDoc): Association | null;
}

interface CompiledMapping {
  schema: string;
  pattern: string;
  forced: boolean;
  isMatch(path: string): boolean;
}

function compileMapping(mapping: SchemaMapping): CompiledMapping[] {
  return mapping.files.map((file) => {
    // Bare filenames (no slash) match at any depth, mirroring catalog rules.
    const pattern = file.includes("/") ? file : `**/${file}`;
    return {
      schema: mapping.schema,
      pattern: file,
      forced: mapping.force === true,
      isMatch: picomatch(pattern, { dot: true }),
    };
  });
}

export function createAssociator(opts: {
  mappings: SchemaMapping[];
  catalogs: CompiledCatalog[];
}): Associator {
  const compiled = opts.mappings.flatMap(compileMapping);
  // Forced mappings are policy: they are checked as a group before anything else, so an earlier
  // broad mapping cannot shadow one and hand the file back to its own inline reference.
  const forced = compiled.filter((mapping) => mapping.forced);

  return {
    associate(relPath, doc) {
      for (const mapping of forced) {
        if (mapping.isMatch(relPath)) {
          return {
            schemaUri: mapping.schema,
            source: { kind: "config", pattern: mapping.pattern, forced: true },
          };
        }
      }
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
