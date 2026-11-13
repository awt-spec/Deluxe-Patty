import { describe, expect, it } from "vitest";
import { nombreArchivo } from "../lib/panel/nombre-archivo";

describe("nombreArchivo", () => {
  it("quita barras y caracteres raros y pone la extensión", () => {
    expect(nombreArchivo('Casa: Escazú / "venta" <1>', "pdf")).toBe("Casa Escazú venta 1.pdf");
  });
  it("no duplica la extensión ni deja puntos al inicio", () => {
    expect(nombreArchivo("../../etc/passwd.pdf", "pdf")).toBe("etcpasswd.pdf");
    expect(nombreArchivo("Informe.PDF", "pdf")).toBe("Informe.pdf");
  });
  it("sin título usa uno por defecto y recorta lo largo", () => {
    expect(nombreArchivo("   ", "pdf")).toBe("Documento.pdf");
    expect(nombreArchivo(null, "png", "Imagen")).toBe("Imagen.png");
    expect(nombreArchivo("a".repeat(300), "pdf").length).toBe(84);
  });
});
