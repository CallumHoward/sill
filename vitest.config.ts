import process from "node:process";

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // In CI, also emit GitHub Actions annotations for failing tests.
    reporters: process.env.GITHUB_ACTIONS ? ["default", "github-actions"] : ["default"],
    // Restore vi.spyOn implementations and reset mock state after each test.
    restoreMocks: true,
    // Type tests (*.test-d.ts). Only spawns tsc when such files exist.
    typecheck: { enabled: true },
    coverage: {
      provider: "v8",
      // lcov feeds diff-cover (and editor coverage-gutters); text summarizes.
      reporter: ["text", "lcov"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts"],
    },
  },
});
