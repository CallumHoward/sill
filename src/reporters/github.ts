import { LineIndex } from "../util/line-index.ts";
import type { Reporter } from "./shared.ts";
import { summaryLine } from "./shared.ts";

export const githubReporter: Reporter = {
  report(diagnostics, sources, summary) {
    const indexes = new Map<string, LineIndex>();
    const lines = diagnostics.map((d) => {
      let line = 1;
      let column = 1;
      const source = sources.get(d.file);
      if (d.span && source !== undefined) {
        let index = indexes.get(d.file);
        if (!index) {
          index = new LineIndex(source);
          indexes.set(d.file, index);
        }
        ({ line, column } = index.positionAt(d.span.offset));
      }
      const message =
        d.suggestion === undefined ? d.message : `${d.message}; did you mean "${d.suggestion}"?`;
      const props = [
        `file=${escapeProperty(d.file)}`,
        `line=${line}`,
        `col=${column}`,
        `title=${escapeProperty(`sill(${d.keyword})`)}`,
      ].join(",");
      return `::error ${props}::${escapeData(message)}`;
    });
    return [...lines, summaryLine(diagnostics, summary)].join("\n");
  },
};

// Escaping per GitHub's workflow-command spec: % first, then newlines
// (and , : for property values).
function escapeData(value: string): string {
  return value.replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A");
}

function escapeProperty(value: string): string {
  return escapeData(value).replaceAll(":", "%3A").replaceAll(",", "%2C");
}
