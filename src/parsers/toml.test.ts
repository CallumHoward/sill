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
    const document = tomlAdapter.parse(SAMPLE)[0]!;
    expect(document.value).toEqual({
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
    const document = tomlAdapter.parse(SAMPLE)[0]!;

    const name = document.locate("/package/name");
    expect(SAMPLE.slice(name!.offset, name!.offset + name!.length)).toBe(`"demo"`);

    const workspace = document.locate("/package/edition/workspace");
    expect(SAMPLE.slice(workspace!.offset, workspace!.offset + workspace!.length)).toBe("true");

    const feature = document.locate("/dependencies/serde/features/0");
    expect(SAMPLE.slice(feature!.offset, feature!.offset + feature!.length)).toBe(`"derive"`);
  });

  it("locates arrays of tables by index", () => {
    const document = tomlAdapter.parse(SAMPLE)[0]!;
    const second = document.locate("/bin/1/name");
    const text = SAMPLE.slice(second!.offset, second!.offset + second!.length);
    expect(text).toBe(`"two"`);
    expect(document.locate("/bin/2/name")).toBeNull();
  });

  it("locates the root and returns null for missing paths", () => {
    const document = tomlAdapter.parse(SAMPLE)[0]!;
    expect(document.locate("")).not.toBeNull();
    expect(document.locate("/missing/deep")).toBeNull();
  });

  it("throws ParseIssue on malformed TOML", () => {
    const issue = caughtIssue(() => tomlAdapter.parse("a = "));
    expect(issue.name).toBe("ParseIssue");
  });
});
