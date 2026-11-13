import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PALETA_MENU as P, contraste } from "../lib/panel/colores-menu";

describe("paleta del menú lateral (WhatsApp claro)", () => {
  it("el texto pasa AA (4,5:1) sobre el fondo, el hover, la pastilla activa y las burbujas", () => {
    expect(contraste(P.texto, P.fondo)).toBeGreaterThanOrEqual(7);
    expect(contraste(P.texto, P.hover)).toBeGreaterThanOrEqual(7);
    expect(contraste(P.suave, P.fondo)).toBeGreaterThanOrEqual(4.5);
    expect(contraste(P.suave, P.hover)).toBeGreaterThanOrEqual(4.5);
    expect(contraste(P.verde, P.fondo)).toBeGreaterThanOrEqual(4.5); // títulos de grupo
    expect(contraste(P.sobreActivo, P.activo)).toBeGreaterThanOrEqual(4.5);
    expect(contraste(P.sobreVerde, P.verde)).toBeGreaterThanOrEqual(4.5);
    expect(contraste(P.sobreBurbuja, P.burbuja)).toBeGreaterThanOrEqual(4.5);
    expect(contraste(P.sobreBurbujaSuave, P.burbujaSuave)).toBeGreaterThanOrEqual(4.5);
    expect(contraste(P.sobreGlobo, P.globo)).toBeGreaterThanOrEqual(4.5);
  });

  it("el anillo de foco y el botón verde se distinguen del fondo (3:1)", () => {
    expect(contraste(P.verde, P.fondo)).toBeGreaterThanOrEqual(3);
    expect(contraste(P.verde, P.activo)).toBeGreaterThanOrEqual(3);
  });

  it("globals.css usa exactamente esta paleta (sin colores de la marca)", () => {
    const css = readFileSync(join(__dirname, "../app/globals.css"), "utf8");
    const capa = css.slice(css.indexOf("Menú lateral v3"));
    for (const [nombre, valor] of Object.entries(P)) {
      const variable = `--m-${nombre.replace(/[A-Z]/g, (l) => `-${l.toLowerCase()}`)}`;
      expect(capa).toContain(`${variable}: ${valor};`);
    }
    expect(capa).not.toMatch(/--principal|--onyx|--crema/);
  });

  it("blanco y negro dan 21:1", () => {
    expect(contraste("#ffffff", "#000000")).toBeCloseTo(21, 1);
  });
});
