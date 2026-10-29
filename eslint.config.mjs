import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Backend AWS: proyecto aparte con su propio tooling.
    "aws-backend/**",
    // Skills de Claude Code (el kit de fun-isometric tiene su propio estilo; el que usa la app está en src/stickers).
    ".claude/**",
  ]),
]);

export default eslintConfig;
