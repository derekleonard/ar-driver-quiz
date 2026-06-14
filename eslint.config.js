import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/", "dev-dist/", "node_modules/"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  reactHooks.configs.flat.recommended,
  {
    rules: {
      // `catch {}` blocks that intentionally swallow are idiomatic here;
      // unused function args must still be cleaned up.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { caughtErrors: "none", argsIgnorePattern: "^_" },
      ],
      // Compiler-powered rule that bans Date.now() during render. The quiz
      // screens intentionally sample the clock at render time (streaks, due
      // counts) and feed it into pure display math; an extra render only
      // recomputes the same values a moment later.
      "react-hooks/purity": "off",
    },
  },
  {
    // Node scripts (no DOM, CommonJS-style globals).
    files: ["scripts/**/*.{mjs,ts}"],
    languageOptions: {
      globals: { console: "readonly", process: "readonly" },
    },
  },
);
