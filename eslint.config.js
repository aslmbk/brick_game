import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  globalIgnores(["dist", "public"]),
  {
    files: ["**/*.{js,jsx}"],
    extends: [js.configs.recommended, reactHooks.configs.flat.recommended, reactRefresh.configs.vite],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.name='useGame'][arguments.length=0]",
          message: "useGame() needs a selector, otherwise the component re-renders on every game tick.",
        },
      ],
    },
  },
  {
    // the 3D scene mutates three.js objects and per-frame state outside render by design (R3F)
    files: ["src/scene/**"],
    rules: { "react-hooks/immutability": "off", "react-hooks/refs": "off" },
  },
]);
