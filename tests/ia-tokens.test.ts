import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { aTokens, estadoTokens, estadoTokensDia, tokensDePresupuesto, topeEfectivo, TOKENS_POR_DOLAR } from "../lib/ia/tokens";
import { PALETA_ENERGIA as T, contraste } from "../lib/panel/colores-menu";

describe("unidades de IA (base de la energía): 1 dólar = 100 unidades", () => {
  it("convierte y redondea hacia abajo", () => {
    expect(TOKENS_POR_DOLAR).toBe(100);
    expect(aTokens(20)).toBe(2000);
    expect(aTokens(12.409)).toBe(1240);
    expect(aTokens(0.29)).toBe(29); // sin el error de coma flotante (0,29 × 100 = 28,999…)
    expect(aTokens(0.009)).toBe(0);
    expect(aTokens(-3)).toBe(0);
    expect(aTokens(Number.NaN)).toBe(0);
    expect(aTokens(null)).toBe(0);
  });

  it("estado normal: usados, restantes y porcentaje", () => {
    expect(estadoTokens({ gastoMesUsd: 12.4, topeMesUsd: 20 })).toEqual({ total: 2000, usados: 1240, restantes: 760, pct: 62, nivel: "bien" });
  });

  it("'poco' cuando lo que se ve es 15 % o menos; 16 % sigue 'bien'", () => {
    expect(estadoTokens({ gastoMesUsd: 17, topeMesUsd: 20 }).nivel).toBe("poco"); // quedan 300 = 15 %
    // Quedan 301 = 15,05 %: se ve «15 %», así que va en ámbar (antes salía verde con «15 %»). Usado + restante = 100.
    expect(estadoTokens({ gastoMesUsd: 16.99, topeMesUsd: 20 })).toMatchObject({ nivel: "poco", pct: 85 });
    expect(estadoTokens({ gastoMesUsd: 16.8, topeMesUsd: 20 })).toMatchObject({ nivel: "bien", pct: 84 }); // quedan 320 = 16 %
    expect(estadoTokens({ gastoMesUsd: 19.99, topeMesUsd: 20 })).toMatchObject({ restantes: 1, nivel: "poco" });
  });

  it("al tope o pasado: agotado, 0 restantes y 100 %", () => {
    expect(estadoTokens({ gastoMesUsd: 20, topeMesUsd: 20 })).toEqual({ total: 2000, usados: 2000, restantes: 0, pct: 100, nivel: "agotado" });
    expect(estadoTokens({ gastoMesUsd: 35.5, topeMesUsd: 20 })).toEqual({ total: 2000, usados: 2000, restantes: 0, pct: 100, nivel: "agotado" });
    // El freno compara dólares: 19,999 ya no deja nada aunque el redondeo diga 1999.
    expect(estadoTokens({ gastoMesUsd: 19.9999, topeMesUsd: 19.9999 }).nivel).toBe("agotado");
  });

  it("tope 0 = IA apagada: agotado con su mensaje", () => {
    const e = estadoTokens({ gastoMesUsd: 0, topeMesUsd: 0 });
    expect(e).toEqual({ total: 0, usados: 0, restantes: 0, pct: 100, nivel: "agotado" });
  });

  it("tope vacío del corredor = el de la plataforma; 0 propio gana; sin ninguno, sin_tope", () => {
    expect(topeEfectivo(null, 150)).toBe(150);
    expect(topeEfectivo(undefined, 150)).toBe(150);
    expect(topeEfectivo(0, 150)).toBe(0);
    expect(topeEfectivo(40, 150)).toBe(40);
    expect(topeEfectivo(null, null)).toBeNull();
    expect(estadoTokens({ gastoMesUsd: 3, topeMesUsd: topeEfectivo(null, 150) }).total).toBe(15000);
    expect(estadoTokens({ gastoMesUsd: 3, topeMesUsd: null })).toEqual({ total: 0, usados: 300, restantes: 0, pct: 0, nivel: "sin_tope" });
  });

  it("desde presupuesto_ia() y para el día", () => {
    expect(tokensDePresupuesto({ gastoMes: 1, topeMes: 150 })).toMatchObject({ total: 15000, usados: 100, nivel: "bien" });
    expect(estadoTokensDia({ gastoDiaUsd: 10, topeDiaUsd: 10 }).nivel).toBe("agotado");
  });
});

describe("colores de la barra de energía", () => {
  it("pasan AA: barra contra la pista y el blanco (3:1) y avisos (4,5:1)", () => {
    for (const c of [T.bien, T.poco, T.agotado]) {
      expect(contraste(c, "#ffffff")).toBeGreaterThanOrEqual(4.5);
      expect(contraste(c, T.pista)).toBeGreaterThanOrEqual(3);
    }
    expect(contraste(T.textoPoco, T.fondoPoco)).toBeGreaterThanOrEqual(4.5);
    expect(contraste(T.textoAgotado, T.fondoAgotado)).toBeGreaterThanOrEqual(4.5);
    expect(contraste(T.textoAgotado, "#ffffff")).toBeGreaterThanOrEqual(4.5);
  });

  it("globals.css usa exactamente esta paleta (--t-*)", () => {
    const css = readFileSync(join(__dirname, "../app/globals.css"), "utf8");
    const capa = css.slice(css.indexOf("Energía (app/panel/energia.tsx)"));
    for (const [nombre, valor] of Object.entries(T)) {
      expect(capa).toContain(`--t-${nombre.replace(/[A-Z]/g, (l) => `-${l.toLowerCase()}`)}: ${valor};`);
    }
  });
});
