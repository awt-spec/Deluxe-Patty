import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Reglas de Next (Core Web Vitals) y de TypeScript. Corre en el CI (npm run lint) antes de unir.
export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Variables y parámetros que empiezan con _ son a propósito sin usar (por ejemplo, para descartar un campo).
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", destructuredArrayIgnorePattern: "^_" }],
    },
  },
  {
    // Páginas y marcos de app/ son Server Components (ninguno lleva "use client"): se dibujan una vez por pedido,
    // así que leer el reloj (Date.now) al armar la página es correcto. La regla es para componentes del navegador.
    files: ["app/**/page.tsx", "app/**/layout.tsx"],
    rules: { "react-hooks/purity": "off" },
  },
  {
    // La ficha PDF usa el <Image> de @react-pdf/renderer, que no tiene atributo alt (no es HTML).
    files: ["lib/fichas/**/*.tsx"],
    rules: { "jsx-a11y/alt-text": "off" },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "public/**", ".salud/**", "node_modules/**"]),
]);
