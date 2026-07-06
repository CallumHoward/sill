import { ParseIssue } from "../types.ts";

/** Run a parse that must fail; return the ParseIssue for span assertions. */
export function caughtIssue(fn: () => unknown): ParseIssue {
  try {
    fn();
  } catch (err) {
    if (err instanceof ParseIssue) return err;
    throw new Error(`expected ParseIssue, got ${String(err)}`);
  }
  throw new Error("expected a ParseIssue, but nothing was thrown");
}
