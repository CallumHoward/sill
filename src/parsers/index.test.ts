import { describe, expect, it } from "vitest";

import { adapterForPath } from "./index.ts";

describe("adapterForPath", () => {
  it("dispatches on extension, case-insensitively", () => {
    expect(adapterForPath("tsconfig.json")?.format).toBe("json");
    expect(adapterForPath(".vscode/settings.JSONC")?.format).toBe("json");
    expect(adapterForPath("a/b.json5")?.format).toBe("json5");
    expect(adapterForPath(".github/workflows/ci.yml")?.format).toBe("yaml");
    expect(adapterForPath("config.yaml")?.format).toBe("yaml");
    expect(adapterForPath("Cargo.toml")?.format).toBe("toml");
  });

  it("returns null for unknown or missing extensions", () => {
    expect(adapterForPath("README.md")).toBeNull();
    expect(adapterForPath("Makefile")).toBeNull();
  });
});
