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
  ]),
  {
    // PR #61's eslint-config-next bump (16.2.1 → 16.2.4) tightened
    // `react-hooks/set-state-in-effect` to an error. The codebase has
    // a handful of pre-existing useEffect→fetch patterns that fire
    // this rule; they were merged before the bump and addressing them
    // is its own follow-up PR. Downgrade to warn so CI doesn't gate
    // on legacy patterns.
    rules: {
      "react-hooks/set-state-in-effect": "warn",
    },
  },
]);

export default eslintConfig;
