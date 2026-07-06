import type { Diagnostic } from "../types.ts";
import { LineIndex, type Position } from "../util/line-index.ts";

export interface Summary {
  checked: number;
  valid: number;
  invalid: number;
  skipped: number;
  durationMs: number;
}

export interface Reporter {
  report(diagnostics: Diagnostic[], sources: ReadonlyMap<string, string>, summary: Summary): string;
}

/** Resolve a diagnostic's span to a line/column, caching one LineIndex per file. */
export function positionFor(
  d: Diagnostic,
  sources: ReadonlyMap<string, string>,
  indexes: Map<string, LineIndex>,
): Position | null {
  if (!d.span) return null;
  const source = sources.get(d.file);
  if (source === undefined) return null;
  let index = indexes.get(d.file);
  if (!index) {
    index = new LineIndex(source);
    indexes.set(d.file, index);
  }
  return index.positionAt(d.span.offset);
}

export function summaryLine(diagnostics: Diagnostic[], summary: Summary): string {
  if (diagnostics.length === 0) {
    return `✓ ${summary.valid} file(s) valid (${summary.skipped} skipped) in ${summary.durationMs}ms`;
  }
  const files = new Set(diagnostics.map((d) => d.file)).size;
  return `✖ ${diagnostics.length} problem(s) in ${files} file(s) (checked ${summary.checked} files, skipped ${summary.skipped}) in ${summary.durationMs}ms`;
}
