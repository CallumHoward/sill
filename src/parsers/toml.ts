import { type AST, getStaticTOMLValue, ParseError, parseTOML } from "toml-eslint-parser";

import { ParseIssue, type ParsedDoc, type ParserAdapter, type Span } from "../types.ts";
import { leadingCommentRef } from "./leading-comment.ts";
import { pointerSegments } from "./pointer.ts";

// Taplo convention: `#:schema <uri>` (or `# :schema <uri>`) in leading comments.
const SCHEMA_DIRECTIVE = /^#\s*:schema\s+(\S+)/;

function keyName(key: AST.TOMLBare | AST.TOMLQuoted): string {
  return key.type === "TOMLBare" ? key.name : key.value;
}

function rangeSpan(node: { range: AST.Range }): Span {
  return { offset: node.range[0], length: node.range[1] - node.range[0] };
}

/**
 * TOML values have no single containing node per JSON pointer (tables are headers, dotted keys are
 * implicit), so build a pointer→span index up front.
 */
function buildIndex(top: AST.TOMLTopLevelTable): Map<string, Span> {
  const index = new Map<string, Span>();
  const setIfAbsent = (path: string[], span: Span): void => {
    const key = JSON.stringify(path);
    if (!index.has(key)) index.set(key, span);
  };

  const visitContent = (path: string[], node: AST.TOMLContentNode): void => {
    setIfAbsent(path, rangeSpan(node));
    if (node.type === "TOMLArray") {
      node.elements.forEach((element, i) => {
        visitContent([...path, String(i)], element);
      });
    } else if (node.type === "TOMLInlineTable") {
      for (const kv of node.body) visitKeyValue(path, kv);
    }
  };

  const visitKeyValue = (parent: string[], kv: AST.TOMLKeyValue): void => {
    const segments = kv.key.keys.map(keyName);
    // Dotted keys create implicit tables; point intermediate paths at the key.
    for (let i = 1; i < segments.length; i++) {
      setIfAbsent([...parent, ...segments.slice(0, i)], rangeSpan(kv.key.keys[i - 1]!));
    }
    visitContent([...parent, ...segments], kv.value);
  };

  setIfAbsent([], rangeSpan(top));
  for (const item of top.body) {
    if (item.type === "TOMLKeyValue") {
      visitKeyValue([], item);
    } else {
      // [table] / [[array-of-tables]]: resolvedKey carries array indices.
      const path = item.resolvedKey.map(String);
      for (let i = 1; i <= path.length; i++) {
        setIfAbsent(path.slice(0, i), rangeSpan(item.key));
      }
      for (const kv of item.body) visitKeyValue(path, kv);
    }
  }
  return index;
}

export const tomlAdapter: ParserAdapter = {
  format: "toml",
  extensions: [".toml"],
  parse(text: string): ParsedDoc[] {
    let ast: AST.TOMLProgram;
    try {
      ast = parseTOML(text);
    } catch (err) {
      if (err instanceof ParseError) {
        throw new ParseIssue(`invalid TOML: ${err.message}`, { offset: err.index, length: 1 });
      }
      throw err;
    }
    const index = buildIndex(ast.body[0]);
    return [
      {
        value: getStaticTOMLValue(ast),
        schemaRef: leadingCommentRef(text, SCHEMA_DIRECTIVE),
        locate(instancePath: string): Span | null {
          return index.get(JSON.stringify(pointerSegments(instancePath))) ?? null;
        },
      },
    ];
  },
};
