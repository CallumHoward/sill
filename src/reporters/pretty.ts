import process from "node:process";

import type { LineIndex } from "../util/line-index.ts";
import type { Reporter } from "./shared.ts";
import { positionFor, summaryLine } from "./shared.ts";

const RED = "31";
const DIM = "2";
const CYAN = "36";

export const prettyReporter: Reporter = {
  report(diagnostics, sources, summary) {
    const useColor = process.stdout.isTTY && process.env.NO_COLOR === undefined;
    const paint = (code: string, text: string): string =>
      useColor ? `\u001B[${code}m${text}\u001B[0m` : text;

    const indexes = new Map<string, LineIndex>();
    const blocks = diagnostics.map((d) => {
      const lines: string[] = [];
      const location = positionFor(d, sources, indexes);
      const where = location ? `${d.file}:${location.line}:${location.column}` : d.file;
      const at = d.instancePath === "" ? "root" : d.instancePath;
      lines.push(`${where}  ${paint(RED, d.message)}  [${d.keyword} at ${at}]`);

      if (d.span && location) {
        const source = sources.get(d.file) ?? "";
        const lineStart = d.span.offset - (location.column - 1);
        const lineEnd = endOfLine(source, d.span.offset);
        const sourceLine = source.slice(lineStart, lineEnd);
        const width = Math.max(1, Math.min(d.span.length, lineEnd - d.span.offset));
        const caret = `${" ".repeat(location.column - 1)}^${"~".repeat(width - 1)}`;
        lines.push(paint(DIM, `  ${sourceLine}`), paint(DIM, `  ${caret}`));
      }
      if (d.suggestion !== undefined) {
        lines.push(paint(CYAN, `  did you mean "${d.suggestion}"?`));
      }
      return lines.join("\n");
    });

    return [...blocks, summaryLine(diagnostics, summary)].join("\n\n");
  },
};

function endOfLine(source: string, offset: number): number {
  const next = source.indexOf("\n", offset);
  return next === -1 ? source.length : next;
}
