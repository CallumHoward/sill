import { evaluate, type MemberNode, parse, type ValueNode } from "@humanwhocodes/momoa";

import { ParseIssue, type ParsedDoc, type ParserAdapter, type Span } from "../types.ts";
import { pointerSegments } from "./pointer.ts";

function memberName(member: MemberNode): string {
  return member.name.type === "String" ? member.name.value : member.name.name;
}

function childNode(node: ValueNode, segment: string): ValueNode | null {
  if (node.type === "Object") {
    for (const member of node.members) {
      if (memberName(member) === segment) return member.value;
    }
    return null;
  }
  if (node.type === "Array") {
    const index = Number(segment);
    if (!Number.isInteger(index) || index < 0) return null;
    return node.elements[index]?.value ?? null;
  }
  return null;
}

function nodeSpan(node: ValueNode): Span | null {
  if (!node.range) return null;
  return { offset: node.range[0], length: node.range[1] - node.range[0] };
}

export const json5Adapter: ParserAdapter = {
  format: "json5",
  extensions: [".json5"],
  parse(text: string): ParsedDoc[] {
    let body: ValueNode;
    try {
      body = parse(text, { mode: "json5", ranges: true }).body;
    } catch (error) {
      const { message, offset } = error as { message: string; offset?: number };
      throw new ParseIssue(`invalid JSON5: ${message}`, { offset: offset ?? 0, length: 1 });
    }
    const schemaNode = body.type === "Object" ? childNode(body, "$schema") : null;
    return [
      {
        value: evaluate(body),
        schemaRef: schemaNode?.type === "String" ? schemaNode.value : null,
        locate(instancePath: string): Span | null {
          let node: ValueNode | null = body;
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
