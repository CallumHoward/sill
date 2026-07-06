// fallow-ignore-file unused-file
import { defineConfig } from "oxfmt";

export default defineConfig({
  jsdoc: true,
  sortImports: true,
  // fixtures hold intentionally malformed/odd files; leave them byte-exact.
  ignorePatterns: [".claude/**", "fixtures/**", "pnpm-lock.yaml"],
});
