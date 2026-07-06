import { defineConfig } from "oxlint";

export default defineConfig({
  plugins: ["typescript", "unicorn", "oxc", "import", "vitest", "promise", "jsdoc"],
  jsPlugins: [{ name: "check-file", specifier: "eslint-plugin-check-file" }],
  categories: {
    correctness: "error",
  },
  env: {
    builtin: true,
  },
  ignorePatterns: ["dist", "fixtures"],
  rules: {
    "unicorn/filename-case": ["error", { case: "kebabCase" }],
    "unicorn/no-null": "off",

    "typescript/no-floating-promises": "error",
    "typescript/no-misused-promises": "error",
    "typescript/await-thenable": "error",
    "typescript/switch-exhaustiveness-check": "error",
    "typescript/no-unnecessary-condition": "warn",

    "import/no-cycle": "error",

    "check-file/filename-blocklist": [
      "error",
      {
        "**/*.js": "*.ts",
        "**/*.jsx": "*.tsx",
        "**/*.mjs": "*.ts",
        "**/*.cjs": "*.ts",
        "**/__test*/**": "co-located *.test.ts (no __tests__ dirs)",
      },
    ],

    "check-file/filename-naming-convention": [
      "error",
      {
        "src/**/*.ts": "+([^.])?(.@(test|test-d|d))",
        "*.ts": "+([^.])?(.@(config|d))",
      },
      { ignoreMiddleExtensions: false },
    ],

    "jsdoc/check-tag-names": "error",
    "jsdoc/check-property-names": "error",
    "jsdoc/check-access": "error",
    "jsdoc/empty-tags": "error",
    "jsdoc/implements-on-classes": "error",
  },
  overrides: [
    {
      files: ["**/*.test.ts"],
      rules: {
        "vitest/require-top-level-describe": "error",
        "vitest/consistent-test-it": ["error", { fn: "it", withinDescribe: "it" }],
        "vitest/no-identical-title": "error",
        "vitest/no-commented-out-tests": "warn",
        "vitest/no-duplicate-hooks": "error",
        "vitest/prefer-hooks-in-order": "error",
        "vitest/prefer-hooks-on-top": "error",
        "vitest/require-hook": "error",
      },
    },
  ],
});
