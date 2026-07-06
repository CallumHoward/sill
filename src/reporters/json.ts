import { LineIndex } from "../util/line-index.ts";
import type { Reporter } from "./shared.ts";

export const jsonReporter: Reporter = {
  report(diagnostics, sources, summary) {
    const indexes = new Map<string, LineIndex>();
    const rows = diagnostics.map((d) => {
      let line: number | null = null;
      let column: number | null = null;
      const source = sources.get(d.file);
      if (d.span && source !== undefined) {
        let index = indexes.get(d.file);
        if (!index) {
          index = new LineIndex(source);
          indexes.set(d.file, index);
        }
        const position = index.positionAt(d.span.offset);
        line = position.line;
        column = position.column;
      }
      return {
        file: d.file,
        message: d.message,
        keyword: d.keyword,
        instancePath: d.instancePath,
        schemaPath: d.schemaPath,
        line,
        column,
        suggestion: d.suggestion,
      };
    });
    return `${JSON.stringify({ diagnostics: rows, summary }, null, 2)}\n`;
  },
};
