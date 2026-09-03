import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import globals from "globals";

const eslintConfig = defineConfig([
  ...nextVitals,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // OpenNext/Cloudflare build output (gitignored, like .next/). Generated
    // by `npm run cf:build`; not ours to lint. CI runs lint before build so
    // it never sees this, but a local cf:build leaves it behind.
    ".open-next/**",
    // Wrangler local dev/build cache (gitignored, like .open-next/).
    // `wrangler dev` / `npm run preview` leave a bundled worker-entry.js
    // under .wrangler/tmp/; it's generated, not ours to lint. CI runs lint
    // before any wrangler step so it never sees this.
    ".wrangler/**",
    // Sub-agent worktrees (PR #53 gitignore). Each agent worktree is a
    // full copy of the repo including its own .next/ build artifacts;
    // without this ignore, eslint walks them and duplicates every
    // source-file error N times.
    ".claude/worktrees/**",
    // Vitest coverage output (also gitignored). Generated files; not
    // ours to lint.
    "coverage/**",
  ]),
  /*
    `no-undef` — ON, and the reason is a shipped production crash.

    eslint-config-next does not enable it: the Next presets assume TypeScript
    is catching undefined identifiers. This repo is JavaScript with no
    TypeScript (see CLAUDE.md), so NOTHING was catching them, and a reference
    to a variable that does not exist linted clean, built clean, and deployed.

    It cost us: `ZoomableImage` in ListingLightbox.js called
    `useOverlayHistory({ onClose })` with no `onClose` in scope. That threw
    `ReferenceError` on every attempt to open the photo gallery and shipped in
    #433, so "open photo gallery" was dead on every listing page until #450.
    One default rule would have caught it before review.

    Globals come from the `globals` package rather than a hand-written list.
    A curated list is the failure mode here — one forgotten browser global
    produces a false positive on valid code, someone disables the rule, and we
    are back where we started. `globals` is now an explicit devDependency; it
    was already in the tree transitively, and depending on hoisting order for
    a lint gate is not a dependency.
  */
  {
    files: ["**/*.{js,jsx,mjs,cjs}"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        // Next injects these into route handlers and middleware at the edge.
        Request: "readonly",
        Response: "readonly",
        Headers: "readonly",
        fetch: "readonly",
      },
    },
    rules: {
      "no-undef": "error",
    },
  },

  // `react-hooks/set-state-in-effect` was downgraded to warn in PR #69
  // while we audited the existing patterns. The 4 legacy fetch-on-mount
  // sites are now annotated with explicit `eslint-disable-next-line`
  // comments + justifications, so the rule can be re-enabled at error
  // severity to catch new violations. Refactor to SWR/TanStack Query
  // is tracked separately.
]);

export default eslintConfig;
