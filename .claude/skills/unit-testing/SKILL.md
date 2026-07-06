---
name: unit-testing
description: Conventions for writing unit tests in this repository (Vitest + React Testing Library, with jest-dom and vitest-axe matchers). Use whenever writing, modifying, or reviewing a unit test — any `*.test.ts` / `*.test.tsx` file. Covers preferred matchers (e.g. toBeVisible over toBeInTheDocument), query strategy (avoid matching by user-facing copy), describe-block structure, and the fail-first workflow.
---

# Unit testing

Stack: **Vitest** + **React Testing Library** (jsdom). `vitest-setup.ts`
registers jest-dom matchers and RTL `cleanup` globally (no per-file setup),
and **exports** a configured `vitest-axe` `axe` helper that tests import
where needed. Co-locate tests as `*.test.tsx` next to the code under test.

## Rules

1. **Prefer the extended (jest-dom) matchers.** Reach for the most specific
   matcher the assertion allows — e.g. `toBeVisible()` over
   `toBeInTheDocument()`, `toBeDisabled()` over reading an attribute,
   `toHaveValue()` over inspecting `.value`. They assert intent, not just
   presence.

2. **Do not nest `describe` blocks.** One top-level `describe` per test file.
   If grouping tempts you to nest, split into separate files or rely on clear
   `it` descriptions instead.

3. **Do not query or assert by user-facing copy.** Text is brittle — a wording
   change should not break a test. Query by role / accessible name / label
   (`getByRole`, `getByLabelText`) or an explicit `data-testid`, and assert on
   logical behaviour (state, emitted callbacks, what the user can do), not on
   exact strings. Treat copy as data, not as the contract under test.

4. **Make every test fail before you make it pass.** Before considering a test
   done, prove it exercises the behaviour: break the implementation or invert
   the assertion, watch it go red, then restore it and watch it go green. A
   test that has never failed proves nothing.

## Accessibility

The `axe` helper from `vitest-setup.ts` runs axe-core against a rendered node.
Pass the RTL `container` (a DOM node), not its `innerHTML`:

```tsx
import { render } from "@testing-library/react";
import { expect, it } from "vitest";

import { axe } from "../../vitest-setup";

it("has no accessibility violations", async () => {
  const { container } = render(<MyComponent />);

  expect(await axe(container)).toHaveNoViolations();
});
```

## Commands

```bash
pnpm test          # vitest run
pnpm test -- --watch
```
