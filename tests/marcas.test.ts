import path from "node:path";
import { describe, expect, it } from "vitest";
import { rutaDeMarca } from "../lib/marcas/archivo";

describe("rutaDeMarca", () => {
  it("arma la ruta dentro de marcas/", () => {
    expect(rutaDeMarca("marcas/deluxe/logo-onyx.jpg")).toBe(path.join(process.cwd(), "marcas", "deluxe", "logo-onyx.jpg"));
    expect(rutaDeMarca("./marcas/deluxe/logo-onyx.jpg")).toBe(path.join(process.cwd(), "marcas", "deluxe", "logo-onyx.jpg"));
  });

  it("nunca sale de marcas/ ni acepta rutas raras", () => {
    for (const malo of ["../.env", "marcas/../.env", "marcas/deluxe/../../.env", "marcas/../../etc/passwd", "/etc/passwd", "marcas/deluxe", "marcas/a/b/c.jpg", "otra/deluxe/logo.jpg", "marcas/deluxe/..jpg", "marcas/.oculto/logo.jpg"]) {
      expect(rutaDeMarca(malo), malo).toBeNull();
    }
  });
});
