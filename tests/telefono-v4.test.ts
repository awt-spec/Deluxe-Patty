import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { contraste } from "../lib/panel/colores-menu";
import { COLORES_TEXTO as C, peorContraste } from "../lib/panel/colores-texto";
import { accionAsistente } from "../lib/panel/barra";
import { desplazarHasta, haciaDonde } from "../app/panel/tiras";

const css = readFileSync(join(__dirname, "../app/globals.css"), "utf8");
const capa = css.slice(css.indexOf("Teléfono v4"));

describe("colores de letra (AA)", () => {
  it("el verde y los grises de letra pasan 4,5:1 sobre todos los fondos claros", () => {
    expect(peorContraste(C.verdeTexto)).toBeGreaterThanOrEqual(4.5);
    expect(peorContraste(C.grisTexto)).toBeGreaterThanOrEqual(4.5);
    expect(peorContraste(C.grisIos)).toBeGreaterThanOrEqual(4.5);
  });
  it("el verde de fondo lleva letra blanca legible; el de WhatsApp no alcanzaba", () => {
    expect(contraste("#ffffff", C.verdeFondo)).toBeGreaterThanOrEqual(4.5);
    expect(contraste("#ffffff", "#00a884")).toBeLessThan(4.5);
    expect(contraste("#ffffff", "#e9edef")).toBeLessThan(1.3); // fondo del botón deshabilitado
    expect(contraste(C.grisTexto, "#e9edef")).toBeGreaterThanOrEqual(4.5); // su letra
  });
  it("globals.css usa estas cifras en la capa Teléfono v4", () => {
    expect(capa).toContain(`--verde-texto: ${C.verdeTexto};`);
    expect(capa).toContain(`--verde-fondo: ${C.verdeFondo};`);
    expect(capa).toContain(`--suave: ${C.grisTexto};`);
    expect(capa).toContain(`--ios-gris: ${C.grisIos};`);
  });
});

describe("barra de abajo del teléfono", () => {
  it("ya no hay botón flotante de Patty en ningún css", () => {
    expect(css).not.toContain("patty-boton");
  });
  it("expone el alto de la barra (con la zona segura) y lo usa para el relleno del contenido", () => {
    expect(capa).toContain("--nav-alto: calc(64px + env(safe-area-inset-bottom));");
    expect(capa).toMatch(/\.panel \{\s*padding-bottom: calc\(var\(--nav-alto\) \+ 16px\);/);
    expect(capa).toMatch(/grid-template-columns: repeat\(5, minmax\(0, 1fr\)\)/);
  });
  it("el botón del centro abre el chat, lleva a su pantalla o queda marcado según dónde está", () => {
    expect(accionAsistente("/panel")).toBe("abrir");
    expect(accionAsistente("/panel/clientes/abc")).toBe("abrir");
    expect(accionAsistente("/panel/patty")).toBe("aqui");
    expect(accionAsistente("/panel/probar")).toBe("ir");
    expect(accionAsistente("/panel/conversaciones/123")).toBe("ir");
  });
});

describe("tiras de chips que se deslizan", () => {
  it("dice hacia dónde queda contenido", () => {
    expect(haciaDonde(0, 300, 300)).toBe("no");
    expect(haciaDonde(0, 300, 500)).toBe("derecha");
    expect(haciaDonde(200, 300, 500)).toBe("izquierda");
    expect(haciaDonde(100, 300, 500)).toBe("ambos");
  });
  it("trae el chip elegido a la vista solo si está fuera", () => {
    expect(desplazarHasta(0, 300, 20, 80)).toBeNull();
    expect(desplazarHasta(0, 300, 400, 80)).toBe(290);
    expect(desplazarHasta(0, 300, 260, 80)).toBe(150);
  });
});
