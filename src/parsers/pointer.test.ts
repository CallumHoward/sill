import { describe, expect, it } from "vitest";

import { pointerSegments } from "./pointer.ts";

describe("pointerSegments", () => {
  it("returns no segments for the root pointer", () => {
    expect(pointerSegments("")).toEqual([]);
  });

  it("splits and unescapes segments", () => {
    expect(pointerSegments("/a/b/0")).toEqual(["a", "b", "0"]);
    expect(pointerSegments("/a~1b/c~0d")).toEqual(["a/b", "c~d"]);
    // ~01 unescapes to the literal "~1", not "/" (RFC 6901 ordering).
    expect(pointerSegments("/a~01b")).toEqual(["a~1b"]);
  });

  it("preserves empty segments", () => {
    expect(pointerSegments("/")).toEqual([""]);
  });
});
