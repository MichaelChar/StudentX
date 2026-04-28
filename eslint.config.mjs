import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = defineConfig([
  ...nextVitals,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Sub-agent worktrees (PR #53 gitignore). Each agent worktree is a
    // full copy of the repo including its own .next/ build artifacts;
    // without this ignore, eslint walks them and duplicates every
    // source-file error N times.
    ".claude/worktrees/**",
    // Vitest coverage output (also gitignored). Generated files; not
    // ours to lint.
    "coverage/**",
  ]),
  // `react-hooks/set-state-in-effect` was downgraded to warn in PR #69
  // while we audited the existing patterns. The 4 legacy fetch-on-mount
  // sites are now annotated with explicit `eslint-disable-next-line`
  // comments + justifications, so the rule can be re-enabled at error
  // severity to catch new violations. Refactor to SWR/TanStack Query
  // is tracked separately.
]);

export default eslintConfig;
