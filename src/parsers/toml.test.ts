import { describe, expect, it } from "vitest";

import { caughtIssue } from "./test-helpers.ts";
import { tomlAdapter } from "./toml.ts";

const SAMPLE = `#:schema https://json.schemastore.org/cargo.json
[package]
name = "demo"
edition.workspace = true

[dependencies]
serde = { version = "1", features = ["derive"] }

[[bin]]
name = "one"

[[bin]]
name = "two"
`;

describe("tomlAdapter", () => {
  it("parses tables, dotted keys, inline tables, and arrays of tables", () => {
    const doc = tomlAdapter.parse(SAMPLE)[0]!;
    expect(doc.value).toEqual({
      package: { name: "demo", edition: { workspace: true } },
      dependencies: { serde: { version: "1", features: ["derive"] } },
      bin: [{ name: "one" }, { name: "two" }],
    });
  });

  it("extracts the #:schema directive from leading comments", () => {
    expect(tomlAdapter.parse(SAMPLE)[0]!.schemaRef).toBe("https://json.schemastore.org/cargo.json");
    expect(tomlAdapter.parse(`# :schema https://spaced\na = 1\n`)[0]!.schemaRef).toBe(
      "https://spaced",
    );
  });

  it("ignores a directive after the first content line", () => {
    expect(tomlAdapter.parse(`a = 1\n#:schema https://late\n`)[0]!.schemaRef).toBeNull();
  });

  it("locates values through tables and dotted keys", () => {
    const doc = tomlAdapter.parse(SAMPLE)[0]!;

    const name = doc.locate("/package/name");
    expect(SAMPLE.slice(name!.offset, name!.offset + name!.length)).toBe(`"demo"`);

    const workspace = doc.locate("/package/edition/workspace");
    expect(SAMPLE.slice(workspace!.offset, workspace!.offset + workspace!.length)).toBe("true");

    const feature = doc.locate("/dependencies/serde/features/0");
    expect(SAMPLE.slice(feature!.offset, feature!.offset + feature!.length)).toBe(`"derive"`);
  });

  it("locates arrays of tables by index", () => {
    const doc = tomlAdapter.parse(SAMPLE)[0]!;
    const second = doc.locate("/bin/1/name");
    const text = SAMPLE.slice(second!.offset, second!.offset + second!.length);
    expect(text).toBe(`"two"`);
    expect(doc.locate("/bin/2/name")).toBeNull();
  });

  it("locates the root and returns null for missing paths", () => {
    const doc = tomlAdapter.parse(SAMPLE)[0]!;
    expect(doc.locate("")).not.toBeNull();
    expect(doc.locate("/missing/deep")).toBeNull();
  });

  it("throws ParseIssue on malformed TOML", () => {
    const issue = caughtIssue(() => tomlAdapter.parse("a = "));
    expect(issue.name).toBe("ParseIssue");
  });
});
