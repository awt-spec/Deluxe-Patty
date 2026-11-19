import { describe, expect, it } from "vitest";
import { casaNombrada, filtrarCasas, pideHerramienta, rutaImagenRedes, type CasaHerramienta } from "../lib/panel/herramientas-patty";

// Herramientas del chat de Patty que resuelve el código: qué pide el mensaje y de qué casa.

const casas: CasaHerramienta[] = [
  { id: "a", codigo: "DP-01AB2C", titulo: "Casa en Escazú con piscina", zona: "Escazú", portada: null, fotos: 8 },
  { id: "b", codigo: "P-002", titulo: "Apartamento en Santa Ana", zona: "Santa Ana", portada: null, fotos: 3 },
  { id: "c", codigo: "P-003", titulo: "Lote en Santa Ana", zona: "Santa Ana", portada: null, fotos: 0 },
];

describe("pideHerramienta", () => {
  it.each([
    ["Hazme un post de la casa de Escazú", "post"],
    ["armame una historia para instagram de DP-01AB2C", "historia"],
    ["Genera el video de la casa de Santa Ana", "video"],
    ["dame la ficha en PDF del apartamento", "ficha"],
    ["pásame las fotos de la casa de Escazú", "fotos"],
    ["Quiero un reel de la casa", "video"],
  ])("«%s» → %s", (texto, esperado) => {
    expect(pideHerramienta(texto)).toBe(esperado);
  });

  it.each([
    "¿Cómo hago la ficha en PDF?",
    "¿Dónde está el video de la casa?",
    "Sube estas fotos al sitio",
    "¿Qué tengo hoy?",
    "La ficha del cliente dice que quiere 3 cuartos",
    "",
  ])("«%s» no es una herramienta", (texto) => {
    expect(pideHerramienta(texto)).toBeNull();
  });
});

describe("casaNombrada", () => {
  it("por código, con o sin guion", () => {
    expect(casaNombrada("post de DP-01AB2C", casas)?.id).toBe("a");
    expect(casaNombrada("ficha de la p002", casas)?.id).toBe("b");
  });

  it("por título o zona si es una sola", () => {
    expect(casaNombrada("hazme un post de la casa de Escazú", casas)?.id).toBe("a");
    expect(casaNombrada("el video del apartamento de Santa Ana", casas)?.id).toBe("b");
  });

  it("con empate o sin pistas no elige (pregunta)", () => {
    expect(casaNombrada("la de Santa Ana", casas)).toBeNull();
    expect(casaNombrada("hazme un post", casas)).toBeNull();
  });

  it("el buscador encuentra sin tildes", () => {
    expect(filtrarCasas(casas, "escazu").map((c) => c.id)).toEqual(["a"]);
    expect(filtrarCasas(casas, "").length).toBe(3);
  });

  it("las rutas de diseño son del panel", () => {
    expect(rutaImagenRedes("a", "historia", true)).toBe("/panel/propiedades/a/redes/imagen?formato=historia&descargar=1");
  });
});
