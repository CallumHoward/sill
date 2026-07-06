import { describe, expect, it } from "vitest";

import { LineIndex } from "./line-index.ts";

describe("LineIndex", () => {
  const text = "ab\ncd\n\nef";
  const index = new LineIndex(text);

  it("maps the first character to 1:1", () => {
    expect(index.positionAt(0)).toEqual({ line: 1, column: 1 });
  });

  it("maps within the first line", () => {
    expect(index.positionAt(1)).toEqual({ line: 1, column: 2 });
  });

  it("maps a newline to the end of its line", () => {
    expect(index.positionAt(2)).toEqual({ line: 1, column: 3 });
  });

  it("maps the start of a later line", () => {
    expect(index.positionAt(3)).toEqual({ line: 2, column: 1 });
  });

  it("maps an empty line", () => {
    expect(index.positionAt(6)).toEqual({ line: 3, column: 1 });
  });

  it("maps the last character", () => {
    expect(index.positionAt(8)).toEqual({ line: 4, column: 2 });
  });

  it("clamps offsets past the end", () => {
    expect(index.positionAt(999)).toEqual({ line: 4, column: 3 });
  });

  it("clamps negative offsets", () => {
    expect(index.positionAt(-5)).toEqual({ line: 1, column: 1 });
  });

  it("handles empty text", () => {
    expect(new LineIndex("").positionAt(0)).toEqual({ line: 1, column: 1 });
  });
});
