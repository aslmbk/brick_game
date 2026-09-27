module.exports = {
  root: true,
  env: { browser: true, es2022: true },
  extends: [
    "eslint:recommended",
    "plugin:react/recommended",
    "plugin:react/jsx-runtime",
    "plugin:react-hooks/recommended",
  ],
  ignorePatterns: ["dist", "public", ".eslintrc.cjs"],
  parserOptions: { ecmaVersion: "latest", sourceType: "module" },
  settings: { react: { version: "18.2" } },
  plugins: ["react-refresh"],
  rules: {
    "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
    "react/prop-types": "off",
    "react/no-unknown-property": "off", // three.js props on R3F elements
    "no-restricted-syntax": [
      "error",
      {
        selector: "CallExpression[callee.name='useGame'][arguments.length=0]",
        message: "useGame() needs a selector, otherwise the component re-renders on every game tick.",
      },
    ],
  },
};
