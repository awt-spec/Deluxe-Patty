import { describe, expect, it } from "vitest";
import { separarPasos } from "../app/panel/guia";

describe("Patty guía en pantalla", () => {
  it("separa los pasos del texto que se lee", () => {
    const r = separarPasos("Se cambia en Ajustes. Te llevo.\n<<ir /panel/ajustes>>\n<<señalar ajustes-hora-plan | Aquí eliges la hora>>\n<<escribir ajustes-hora-plan | 06:30>>");
    expect(r.texto).toBe("Se cambia en Ajustes. Te llevo.");
    expect(r.pasos).toEqual([
      { tipo: "ir", ruta: "/panel/ajustes" },
      { tipo: "señalar", lugar: "ajustes-hora-plan", texto: "Aquí eliges la hora" },
      { tipo: "escribir", lugar: "ajustes-hora-plan", texto: "06:30" },
    ]);
  });

  it("solo va a pantallas del panel y a lugares con nombre válido", () => {
    const r = separarPasos("<<ir https://otro.sitio/robar>>\n<<ir /api/google/conectar>>\n<<tocar a[href]>>\n<<tocar nav-agenda>>");
    expect(r.pasos).toEqual([{ tipo: "tocar", lugar: "nav-agenda" }]);
    expect(r.texto).toBe("");
  });
});
