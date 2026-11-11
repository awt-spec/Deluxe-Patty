import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // npm run test:cobertura (corre en el CI). El piso está apenas debajo de lo medido el 2026-11-11: si una
    // entrega baja la cobertura, el CI falla. Subirlo a medida que se agreguen pruebas (las acciones del panel y
    // de /admin todavía no tienen).
    coverage: {
      provider: "v8",
      include: ["lib/**", "app/**/*.ts"],
      reporter: ["text-summary", "json-summary"],
      reportsDirectory: ".salud/cobertura",
      thresholds: { statements: 40, branches: 35, functions: 40, lines: 41 },
    },
  },
});
