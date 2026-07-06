import { isMap, isSeq, type Node as YamlNode, parseAllDocuments } from "yaml";

import { ParseIssue, type ParsedDoc, type ParserAdapter, type Span } from "../types.ts";
import { pointerSegments } from "./pointer.ts";

// Editor convention: `# yaml-language-server: $schema=<uri>` in leading comments.
const MODELINE = /^\s*#\s*yaml-language-server:\s*\$schema=(\S+)/;

/** Scan the comment lines before the first content line for a modeline. */
function leadingModeline(text: string): string | null {
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === "") continue;
    if (!trimmed.startsWith("#")) break;
    const match = MODELINE.exec(line);
    if (match) return match[1] ?? null;
  }
  return null;
}

function spanOf(node: unknown): Span | null {
  const range = (node as YamlNode).range;
  if (!range) return null;
  return { offset: range[0], length: range[1] - range[0] };
}

function inlineSchemaRef(value: unknown): string | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const ref = (value as Record<string, unknown>).$schema;
  return typeof ref === "string" ? ref : null;
}

export const yamlAdapter: ParserAdapter = {
  format: "yaml",
  extensions: [".yaml", ".yml"],
  parse(text: string): ParsedDoc[] {
    // The modeline is file-scoped: it applies to every document in the stream.
    const modeline = leadingModeline(text);
    return parseAllDocuments(text).map((doc) => {
      const error = doc.errors[0];
      if (error) {
        throw new ParseIssue(`invalid YAML: ${error.message}`, {
          offset: error.pos[0],
          length: Math.max(1, error.pos[1] - error.pos[0]),
        });
      }
      const value = doc.toJS() as unknown;
      return {
        value,
        schemaRef: modeline ?? inlineSchemaRef(value),
        locate(instancePath: string): Span | null {
          let node: unknown = doc.contents;
          for (const segment of pointerSegments(instancePath)) {
            if (isMap(node)) {
              // Keys may be non-string scalars (e.g. `404:`); retry numerically.
              node =
                node.get(segment, true) ??
                (/^-?\d+$/.test(segment) ? node.get(Number(segment), true) : undefined);
            } else if (isSeq(node)) {
              const index = Number(segment);
              if (!Number.isInteger(index) || index < 0) return null;
              node = node.get(index, true);
            } else {
              return null;
            }
            if (node === undefined || node === null) return null;
          }
          return spanOf(node);
        },
      };
    });
  },
};
