import json from "@eslint/json";
import mozilla from "eslint-plugin-mozilla";
import tseslint from "typescript-eslint";
import globals from "globals";

export default tseslint.config(
  ...mozilla.configs["flat/recommended"],
  tseslint.configs.recommendedTypeChecked,
  {
    files: ["*/src/**/*.ts"],
    rules: {
      "no-debugger": "error",
      "prefer-const": "error",
      "no-var": "error",
      eqeqeq: ["error", "always"],
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          varsIgnorePattern: "^_",
          argsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
    },
    languageOptions: {
      globals: {
        ...globals.browser,
        ...mozilla.environments["browser-window"].globals,
      },
      parserOptions: {
        project: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ["*/tests/**/*.test.ts", "*/tests/**/*.spec.ts"],
    rules: {
      "no-console": "off",
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  {
    files: ["package.json", "*/package.json"],
    language: "json/json",
    ...json.configs.recommended,
  },
  {
    ignores: ["*/dist/"],
  }
);
