import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PALETA_ADMIN as P } from "../lib/admin/colores";
import { contraste } from "../lib/panel/colores-menu";

describe("paleta de /admin", () => {
  it("el texto del contenido pasa AA (4,5:1) sobre el fondo, las tarjetas y el hover", () => {
    for (const fondo of [P.fondo, P.tarjeta, P.hover]) {
      expect(contraste(P.texto, fondo)).toBeGreaterThanOrEqual(7);
      expect(contraste(P.suave, fondo)).toBeGreaterThanOrEqual(4.5);
      expect(contraste(P.verde, fondo)).toBeGreaterThanOrEqual(4.5);
    }
    expect(contraste(P.sobreVerde, P.verde)).toBeGreaterThanOrEqual(4.5);
  });

  it("el menú oscuro pasa AA en reposo, hover y activo, y la insignia se lee", () => {
    for (const fondo of [P.lado, P.ladoHover]) {
      expect(contraste(P.ladoTexto, fondo)).toBeGreaterThanOrEqual(7);
      expect(contraste(P.ladoSuave, fondo)).toBeGreaterThanOrEqual(4.5);
    }
    expect(contraste(P.sobreLadoActivo, P.ladoActivo)).toBeGreaterThanOrEqual(4.5);
    expect(contraste(P.sobreInsignia, P.insignia)).toBeGreaterThanOrEqual(4.5);
  });

  it("las píldoras de estado pasan AA y los íconos de estado se distinguen (3:1)", () => {
    const pares: [string, string][] = [
      [P.bienTexto, P.bienFondo],
      [P.pocoTexto, P.pocoFondo],
      [P.malTexto, P.malFondo],
      [P.infoTexto, P.infoFondo],
      [P.grisTexto, P.grisFondo],
    ];
    for (const [t, f] of pares) expect(contraste(t, f)).toBeGreaterThanOrEqual(4.5);
    for (const c of [P.bien, P.poco, P.mal]) expect(contraste(c, P.tarjeta)).toBeGreaterThanOrEqual(3);
  });

  it("admin.css usa exactamente esta paleta", () => {
    const css = readFileSync(join(__dirname, "../app/admin/admin.css"), "utf8");
    for (const [nombre, valor] of Object.entries(P)) {
      const variable = `--ad-${nombre.replace(/[A-Z]/g, (l) => `-${l.toLowerCase()}`)}`;
      expect(css).toContain(`${variable}: ${valor};`);
    }
  });
});
