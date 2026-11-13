import { describe, expect, it } from "vitest";
import { MARCA_DELUXE } from "../lib/fichas/marca";
import { NEUTRO, coloresMenu, contraste, mezclar, variablesMenu } from "../lib/panel/colores-menu";

const cumpleAA = (c: ReturnType<typeof coloresMenu>) => {
  expect(contraste(c.texto, c.fondo)).toBeGreaterThanOrEqual(7);
  expect(contraste(c.suave, c.fondo)).toBeGreaterThanOrEqual(4.5);
  expect(contraste(c.texto, c.activo)).toBeGreaterThanOrEqual(4.5);
  expect(contraste(c.texto, c.hover)).toBeGreaterThanOrEqual(4.5);
  expect(contraste(c.suave, c.fondo2)).toBeGreaterThanOrEqual(4.5);
  expect(contraste(c.acento, c.fondo)).toBeGreaterThanOrEqual(3);
  expect(contraste(c.sobreAcento, c.acento)).toBeGreaterThanOrEqual(4.5);
};

describe("coloresMenu", () => {
  it("Deluxe: fondo onyx, acento dorado y texto crema", () => {
    const c = coloresMenu(MARCA_DELUXE.colores);
    expect(c.deMarca).toBe(true);
    expect(c.fondo).toBe("#1a1308");
    expect(c.acento).toBe("#d4af6a");
    expect(c.texto).toBe("#f5f0e8");
    // Sobre el dorado va el onyx, no el blanco.
    expect(c.sobreAcento).toBe("#1a1308");
    cumpleAA(c);
  });

  it("sin marca: neutro verde-carbón con el verde de WhatsApp", () => {
    for (const m of [null, undefined, {}, { profundo: "no es un color" }]) {
      const c = coloresMenu(m);
      expect(c.deMarca).toBe(false);
      expect(c.fondo).toBe(NEUTRO.fondo);
      expect(c.acento).toBe(NEUTRO.acento);
      cumpleAA(c);
    }
  });

  it("una marca con profundo claro cae al neutro oscuro (y no usa su acento)", () => {
    const c = coloresMenu({ profundo: "#e8eef5", principal: "#d4af6a", base: "#ffffff" });
    expect(c.deMarca).toBe(false);
    expect(c.fondo).toBe(NEUTRO.fondo);
    expect(c.acento).toBe(NEUTRO.acento);
    cumpleAA(c);
  });

  it("un acento que no se distingue del fondo se cambia por el verde", () => {
    const c = coloresMenu({ profundo: "#101820", principal: "#1c2836", base: "#f0f0f0" });
    expect(c.fondo).toBe("#101820");
    expect(c.acento).toBe(NEUTRO.acento);
    cumpleAA(c);
  });

  it("un claro de marca sin contraste se cambia por blanco; acepta hex de 3 cifras", () => {
    const c = coloresMenu({ profundo: "#123", principal: "#fc0", base: "#556677" });
    expect(c.fondo).toBe("#112233");
    expect(c.texto).toBe("#ffffff");
    expect(c.acento).toBe("#ffcc00");
    cumpleAA(c);
  });

  it("variables CSS del menú", () => {
    const v = variablesMenu(coloresMenu(null));
    expect(Object.keys(v)).toEqual(expect.arrayContaining(["--m-fondo", "--m-acento", "--m-suave", "--m-sobre-acento"]));
  });
});

describe("contraste y mezclar", () => {
  it("blanco y negro dan 21:1; mezclar a la mitad", () => {
    expect(contraste("#ffffff", "#000000")).toBeCloseTo(21, 1);
    expect(contraste("#zzz", "#000")).toBe(1);
    expect(mezclar("#000000", "#ffffff", 0.5)).toBe("#808080");
  });
});
