import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AGOTADO_TEXTO, aTokens, cifraTokens, estadoTokens, estadoTokensDia, textoTokens, tokensDePresupuesto, topeEfectivo, TOKENS_POR_DOLAR } from "../lib/ia/tokens";
import { PALETA_TOKENS as T, contraste } from "../lib/panel/colores-menu";

describe("tokens de IA: 1 dólar = 100 tokens", () => {
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

  it("'poco' con el 15 % o menos; justo arriba sigue 'bien'", () => {
    expect(estadoTokens({ gastoMesUsd: 17, topeMesUsd: 20 }).nivel).toBe("poco"); // quedan 300 = 15 %
    expect(estadoTokens({ gastoMesUsd: 16.99, topeMesUsd: 20 }).nivel).toBe("bien"); // quedan 301
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
    expect(textoTokens(e)).toBe(AGOTADO_TEXTO);
    expect(AGOTADO_TEXTO).toContain("la asistente deja los chats para ti");
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

  it("cifras con punto de miles y texto para el corredor (sin dinero)", () => {
    expect(cifraTokens(2000)).toBe("2.000");
    expect(cifraTokens(1240)).toBe("1.240");
    expect(cifraTokens(15000000)).toBe("15.000.000");
    expect(cifraTokens(999)).toBe("999");
    const t = textoTokens(estadoTokens({ gastoMesUsd: 12.4, topeMesUsd: 20 }));
    expect(t).toBe("Tokens de IA: 1.240 de 2.000 este mes");
    expect(t).not.toMatch(/\$|USD|dólar/);
  });
});

describe("colores de la barra de tokens", () => {
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
    const capa = css.slice(css.indexOf("Tokens de IA (app/panel/tokens-ia.tsx)"));
    for (const [nombre, valor] of Object.entries(T)) {
      expect(capa).toContain(`--t-${nombre.replace(/[A-Z]/g, (l) => `-${l.toLowerCase()}`)}: ${valor};`);
    }
  });
});
