import { describe, expect, it } from "vitest";

import { caughtIssue } from "./test-helpers.ts";
import { yamlAdapter } from "./yaml.ts";

const WORKFLOW = `# yaml-language-server: $schema=https://json.schemastore.org/github-workflow.json
name: CI
on:
  push:
    branches: [main]
jobs:
  validate:
    runs-on: ubuntu-latest
`;

const MULTI_DOC = `---
name: first
---
name: second
items:
  - a
  - b
`;

describe("yamlAdapter", () => {
  it("parses YAML 1.2 so `on:` stays a string key", () => {
    const doc = yamlAdapter.parse(WORKFLOW)[0]!;
    const value = doc.value as Record<string, unknown>;
    expect(Object.keys(value)).toContain("on");
    expect(value.name).toBe("CI");
  });

  it("extracts the yaml-language-server modeline", () => {
    const doc = yamlAdapter.parse(WORKFLOW)[0]!;
    expect(doc.schemaRef).toBe("https://json.schemastore.org/github-workflow.json");
  });

  it("prefers the modeline over a top-level $schema key", () => {
    const text = `# yaml-language-server: $schema=https://from-modeline\n$schema: https://from-key\n`;
    expect(yamlAdapter.parse(text)[0]!.schemaRef).toBe("https://from-modeline");
  });

  it("falls back to a top-level $schema key", () => {
    expect(yamlAdapter.parse(`$schema: https://from-key\na: 1\n`)[0]!.schemaRef).toBe(
      "https://from-key",
    );
  });

  it("ignores a modeline-looking comment after content", () => {
    const text = `a: 1\n# yaml-language-server: $schema=https://late\n`;
    expect(yamlAdapter.parse(text)[0]!.schemaRef).toBeNull();
  });

  it("yields one ParsedDoc per document with working locate", () => {
    const docs = yamlAdapter.parse(MULTI_DOC);
    expect(docs).toHaveLength(2);
    expect(docs[0]!.value).toEqual({ name: "first" });

    const b = docs[1]!.locate("/items/1");
    expect(MULTI_DOC.slice(b!.offset, b!.offset + b!.length)).toBe("b");
  });

  it("locates nested keys and array indices", () => {
    const doc = yamlAdapter.parse(WORKFLOW)[0]!;
    const runsOn = doc.locate("/jobs/validate/runs-on");
    expect(WORKFLOW.slice(runsOn!.offset, runsOn!.offset + runsOn!.length)).toBe("ubuntu-latest");

    const branch = doc.locate("/on/push/branches/0");
    expect(WORKFLOW.slice(branch!.offset, branch!.offset + branch!.length)).toBe("main");

    expect(doc.locate("/jobs/missing")).toBeNull();
  });

  it("throws ParseIssue on malformed YAML", () => {
    const issue = caughtIssue(() => yamlAdapter.parse("a: [1, 2\nb: c\n"));
    expect(issue.span.length).toBeGreaterThan(0);
  });
});
