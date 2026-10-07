import { defineConfig, globalIgnores } from "eslint/config";
import js from "@eslint/js";
import ts from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
export default defineConfig([
  globalIgnores([".next/**", "node_modules/**", "next-env.d.ts"]),
  js.configs.recommended,
  ...ts.configs.recommended,
  {
    files: ["components/**/*.tsx"],
    plugins: { "react-hooks": reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
]);
