import { ParseIssue } from "../types.ts";

/** Run a parse that must fail; return the ParseIssue for span assertions. */
export function caughtIssue(fn: () => unknown): ParseIssue {
  try {
    fn();
  } catch (error) {
    if (error instanceof ParseIssue) return error;
    throw new Error(`expected ParseIssue, got ${String(error)}`);
  }
  throw new Error("expected a ParseIssue, but nothing was thrown");
}
