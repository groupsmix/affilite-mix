import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  {
    // `custom-worker.ts` at the repo root is a Cloudflare Workers entrypoint
    // that lives outside the main `tsconfig.json` include (see
    // `tsconfig.worker.json`). ESLint's projectService can't parse it under
    // the main tsconfig, so we skip it here — it is still type-checked via
    // `npm run typecheck:worker`.
    ignores: [".open-next/**", ".next/**", "custom-worker.ts"],
  },
  ...compat.extends("next/core-web-vitals"),
  {
    files: ["**/*.ts", "**/*.tsx"],
    plugins: { "@typescript-eslint": tseslint },
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: __dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-floating-promises": "warn",
      "@typescript-eslint/no-misused-promises": "warn",
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/require-await": "off",
    },
  },
];

export default eslintConfig;
