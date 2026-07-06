import type { LineIndex } from "../util/line-index.ts";
import type { Reporter } from "./shared.ts";
import { positionFor } from "./shared.ts";

export const jsonReporter: Reporter = {
  report(diagnostics, sources, summary) {
    const indexes = new Map<string, LineIndex>();
    const rows = diagnostics.map((d) => {
      const position = positionFor(d, sources, indexes);
      return {
        file: d.file,
        message: d.message,
        keyword: d.keyword,
        instancePath: d.instancePath,
        schemaPath: d.schemaPath,
        line: position?.line ?? null,
        column: position?.column ?? null,
        suggestion: d.suggestion,
      };
    });
    return `${JSON.stringify({ diagnostics: rows, summary }, null, 2)}\n`;
  },
};
