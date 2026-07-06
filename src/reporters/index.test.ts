import { describe, expect, it } from "vitest";

import type { Diagnostic } from "../types.ts";
import type { Summary } from "./index.ts";
import { getReporter, resolveReporterName } from "./index.ts";

const SOURCE = '{\n  "level": "inof"\n}\n';

const enumDiagnostic: Diagnostic = {
  file: "test.json",
  message: "must be one of: debug, info, warn, error",
  keyword: "enum",
  instancePath: "/level",
  schemaPath: "#/properties/level/enum",
  span: { offset: 13, length: 6 },
  suggestion: "info",
};

const unlocatedDiagnostic: Diagnostic = {
  file: "other.yaml",
  message: "must be object",
  keyword: "type",
  instancePath: "",
  span: null,
};

const sources = new Map([["test.json", SOURCE]]);

const summary: Summary = { checked: 3, valid: 1, invalid: 2, skipped: 4, durationMs: 42 };

const cleanSummary: Summary = { checked: 3, valid: 3, invalid: 0, skipped: 1, durationMs: 7 };

describe("resolveReporterName", () => {
  it("honors an explicit valid name", () => {
    expect(resolveReporterName("json", {})).toBe("json");
  });

  it("throws on an unknown name", () => {
    expect(() => resolveReporterName("xml", {})).toThrow('unknown reporter "xml"');
  });

  it("defaults to github inside GitHub Actions", () => {
    expect(resolveReporterName(undefined, { GITHUB_ACTIONS: "true" })).toBe("github");
  });

  it("defaults to pretty elsewhere", () => {
    expect(resolveReporterName(undefined, {})).toBe("pretty");
  });
});

describe("pretty reporter", () => {
  it("renders location, message, code frame, and suggestion", () => {
    const out = getReporter("pretty").report([enumDiagnostic], sources, summary);
    expect(out).toContain(
      "test.json:2:12  must be one of: debug, info, warn, error  [enum at /level]",
    );
    expect(out).toContain('  "level": "inof"');
    expect(out).toContain("^~~~~~");
    expect(out).toContain('did you mean "info"?');
    expect(out).toContain("✖ 1 problem(s) in 1 file(s) (checked 3 files, skipped 4) in 42ms");
  });

  it("omits the code frame when there is no span or source", () => {
    const out = getReporter("pretty").report([unlocatedDiagnostic], sources, summary);
    expect(out).toContain("other.yaml  must be object  [type at root]");
    expect(out).not.toContain("^");
  });

  it("renders a success summary when clean", () => {
    const out = getReporter("pretty").report([], sources, cleanSummary);
    expect(out).toBe("✓ 3 file(s) valid (1 skipped) in 7ms");
  });
});

describe("github reporter", () => {
  it("emits workflow commands with line/col and title", () => {
    const out = getReporter("github").report([enumDiagnostic], sources, summary);
    expect(out).toContain(
      "::error file=test.json,line=2,col=12,title=sill(enum)::" +
        'must be one of: debug, info, warn, error; did you mean "info"?',
    );
  });

  it("defaults to 1:1 for unlocated diagnostics", () => {
    const out = getReporter("github").report([unlocatedDiagnostic], sources, summary);
    expect(out).toContain("::error file=other.yaml,line=1,col=1,title=sill(type)::must be object");
  });

  it("escapes %, newlines, and property separators", () => {
    const nasty: Diagnostic = {
      ...unlocatedDiagnostic,
      file: "a,b:c.json",
      message: "50% bad\nsecond line",
    };
    const out = getReporter("github").report([nasty], sources, summary);
    expect(out).toContain("file=a%2Cb%3Ac.json");
    expect(out).toContain("::50%25 bad%0Asecond line");
  });
});

describe("json reporter", () => {
  it("emits stable JSON with line/column resolved", () => {
    const out = getReporter("json").report([enumDiagnostic, unlocatedDiagnostic], sources, summary);
    const parsed = JSON.parse(out) as {
      diagnostics: { file: string; line: number | null; column: number | null }[];
      summary: Summary;
    };
    expect(parsed.diagnostics).toHaveLength(2);
    expect(parsed.diagnostics[0]).toMatchObject({ file: "test.json", line: 2, column: 12 });
    expect(parsed.diagnostics[1]).toMatchObject({ file: "other.yaml", line: null, column: null });
    expect(parsed.summary).toEqual(summary);
    expect(out.endsWith("\n")).toBe(true);
  });
});
