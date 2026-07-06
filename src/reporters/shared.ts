import type { Diagnostic } from "../types.ts";

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

export function summaryLine(diagnostics: Diagnostic[], summary: Summary): string {
  if (diagnostics.length === 0) {
    return `✓ ${summary.valid} file(s) valid (${summary.skipped} skipped) in ${summary.durationMs}ms`;
  }
  const files = new Set(diagnostics.map((d) => d.file)).size;
  return `✖ ${diagnostics.length} problem(s) in ${files} file(s) (checked ${summary.checked} files, skipped ${summary.skipped}) in ${summary.durationMs}ms`;
}
