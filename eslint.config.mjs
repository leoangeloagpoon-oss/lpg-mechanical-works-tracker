import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    "dist/**",
    ".vinext/**",
    ".wrangler/**",
    ".sites-runtime/**",
    "outputs/**",
    "work/**",
  ]),
  {
    files: ["app/tracker.tsx", "app/editor.tsx", "app/activity-workspace.tsx", "app/bulk-dialog.tsx", "app/api/**/*.ts"],
    rules: {
      // These files bridge server-validated JSON records to dynamic editor
      // state, where record shapes are enforced by the zod schemas in
      // app/model.ts. Explicit `any` annotations stay visible as warnings
      // without blocking CI; all other rules still apply to these files.
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
]);

export default eslintConfig;
