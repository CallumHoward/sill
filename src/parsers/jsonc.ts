import {
  getNodeValue,
  type Node,
  type ParseError,
  parseTree,
  printParseErrorCode,
} from "jsonc-parser";

import { ParseIssue, type ParsedDoc, type ParserAdapter, type Span } from "../types.ts";
import { pointerSegments } from "./pointer.ts";

function nodeSpan(node: Node): Span {
  return { offset: node.offset, length: node.length };
}

// fallow-ignore-next-line complexity
function childNode(node: Node, segment: string): Node | null {
  if (node.type === "object") {
    for (const property of node.children ?? []) {
      const [key, value] = property.children ?? [];
      if (key?.value === segment) return value ?? null;
    }
    return null;
  }
  if (node.type === "array") {
    const index = Number(segment);
    if (!Number.isInteger(index) || index < 0) return null;
    return node.children?.[index] ?? null;
  }
  return null;
}

function schemaRefOf(root: Node | undefined): string | null {
  if (!root || root.type !== "object") return null;
  const node = childNode(root, "$schema");
  return node?.type === "string" ? (node.value as string) : null;
}

export const jsoncAdapter: ParserAdapter = {
  format: "json",
  extensions: [".json", ".jsonc"],
  parse(text: string): ParsedDoc[] {
    const errors: ParseError[] = [];
    const root = parseTree(text, errors, { allowTrailingComma: true, allowEmptyContent: true });
    const first = errors[0];
    if (first) {
      throw new ParseIssue(`invalid JSON: ${printParseErrorCode(first.error)}`, {
        offset: first.offset,
        length: Math.max(1, first.length),
      });
    }
    return [
      {
        value: root === undefined ? undefined : (getNodeValue(root) as unknown),
        schemaRef: schemaRefOf(root),
        locate(instancePath: string): Span | null {
          let node: Node | null = root ?? null;
          for (const segment of pointerSegments(instancePath)) {
            if (!node) return null;
            node = childNode(node, segment);
          }
          return node ? nodeSpan(node) : null;
        },
      },
    ];
  },
};
