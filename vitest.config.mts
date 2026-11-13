import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Igual que tsconfig: "@/..." es la raíz. "server-only" se vuelve un módulo vacío (las pruebas corren en Node,
  // que es justamente el servidor); así se pueden probar las acciones del servidor.
  resolve: {
    alias: {
      "@/": fileURLToPath(new URL("./", import.meta.url)),
      "server-only": fileURLToPath(new URL("./node_modules/server-only/empty.js", import.meta.url)),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    // npm run test:cobertura (corre en el CI). El piso está apenas debajo de lo medido (50 % de sentencias el
    // 2026-11-11, con las pruebas de las acciones del servidor): si una entrega baja la cobertura, el CI falla.
    // Subirlo a medida que se agreguen pruebas.
    coverage: {
      provider: "v8",
      include: ["lib/**", "app/**/*.ts"],
      // dibujo.ts pinta el video en un <canvas> y graba con MediaRecorder: solo corre en el navegador. Sus reglas
      // (escenas, tiempos, estilos) están en lib/redes/ y esas sí se prueban.
      exclude: ["app/panel/propiedades/[[]id]/redes/dibujo.ts"],
      reporter: ["text-summary", "json-summary"],
      reportsDirectory: ".salud/cobertura",
      thresholds: { statements: 48, branches: 40, functions: 47, lines: 50 },
    },
  },
});
