import { defineOxfmt } from "@wcmj/config-base/oxfmt";

// fixtures hold intentionally malformed/odd files; leave them byte-exact.
export default defineOxfmt({ ignorePatterns: [".claude/**", "fixtures/**", "pnpm-lock.yaml"] });
