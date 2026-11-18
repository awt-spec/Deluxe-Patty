import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { agotadoEnergia, energiaDePresupuesto, estadoEnergia, subtextoEnergia, textoEnergia, tituloEnergia } from "../lib/ia/energia";

describe("energía de la asistente (lo que ve el corredor)", () => {
  it("restante en %, redondeado hacia abajo, y usado", () => {
    expect(estadoEnergia({ gastoMesUsd: 12.4, topeMesUsd: 20 })).toEqual({ restante: 38, usado: 62, nivel: "bien" });
    expect(estadoEnergia({ gastoMesUsd: 0, topeMesUsd: 20 })).toEqual({ restante: 100, usado: 0, nivel: "bien" });
    // 2/3 queda 66,6…: se muestra 66, nunca más de lo que hay.
    expect(estadoEnergia({ gastoMesUsd: 0.01, topeMesUsd: 0.03 }).restante).toBe(66);
  });

  it("mismos umbrales que antes: poco con 15 % o menos, agotado al tope", () => {
    expect(estadoEnergia({ gastoMesUsd: 17, topeMesUsd: 20 })).toMatchObject({ restante: 15, nivel: "poco" });
    // 15,05 % se ve «15 %»: ámbar, como dice la regla (antes salía «15 %» en verde).
    expect(estadoEnergia({ gastoMesUsd: 16.99, topeMesUsd: 20 })).toMatchObject({ restante: 15, nivel: "poco" });
    expect(estadoEnergia({ gastoMesUsd: 127.4, topeMesUsd: 150 })).toMatchObject({ restante: 15, nivel: "poco" });
    expect(estadoEnergia({ gastoMesUsd: 16.8, topeMesUsd: 20 })).toMatchObject({ restante: 16, nivel: "bien" });
    expect(estadoEnergia({ gastoMesUsd: 19.99, topeMesUsd: 20 })).toMatchObject({ restante: 0, nivel: "poco" });
    expect(estadoEnergia({ gastoMesUsd: 20, topeMesUsd: 20 })).toEqual({ restante: 0, usado: 100, nivel: "agotado" });
    expect(estadoEnergia({ gastoMesUsd: 50, topeMesUsd: 20 })).toEqual({ restante: 0, usado: 100, nivel: "agotado" });
  });

  it("tope 0 = IA apagada = agotado; sin tope = sin_tope", () => {
    expect(estadoEnergia({ gastoMesUsd: 0, topeMesUsd: 0 })).toEqual({ restante: 0, usado: 100, nivel: "agotado" });
    expect(estadoEnergia({ gastoMesUsd: 3, topeMesUsd: null })).toEqual({ restante: 100, usado: 0, nivel: "sin_tope" });
  });

  it("siempre entre 0 y 100", () => {
    for (const [g, t] of [[-5, 20], [0, 1e9], [1e9, 1e9], [3, 150]] as const) {
      const e = estadoEnergia({ gastoMesUsd: g, topeMesUsd: t });
      expect(e.restante).toBeGreaterThanOrEqual(0);
      expect(e.restante).toBeLessThanOrEqual(100);
    }
  });

  it("desde presupuesto_ia()", () => {
    expect(energiaDePresupuesto({ gastoMes: 57, topeMes: 150 })).toEqual({ restante: 62, usado: 38, nivel: "bien" });
  });

  it("textos del corredor: con el nombre de la asistente, sin dinero ni tokens", () => {
    const bien = estadoEnergia({ gastoMesUsd: 57, topeMesUsd: 150 });
    expect(textoEnergia(bien, "Patty")).toBe("Energía de Patty: 62 %");
    expect(subtextoEnergia(bien, "Patty")).toBe("Te queda 62 % este mes");
    expect(tituloEnergia(null)).toBe("Energía de Patty");
    expect(tituloEnergia(" Ana ")).toBe("Energía de Ana");
    const poco = estadoEnergia({ gastoMesUsd: 140, topeMesUsd: 150 });
    expect(subtextoEnergia(poco, "Patty")).toBe("Le queda poca energía a Patty este mes");
    const agotado = estadoEnergia({ gastoMesUsd: 150, topeMesUsd: 150 });
    expect(subtextoEnergia(agotado, "Patty")).toBe("Patty se quedó sin energía este mes: los chats quedan para ti. Habla con soporte.");
    expect(agotadoEnergia()).toContain("Patty se quedó sin energía");
    for (const e of [bien, poco, agotado]) expect(textoEnergia(e) + subtextoEnergia(e)).not.toMatch(/token|\$|USD|dólar/i);
  });

  it("la batería del panel es un SVG con relleno proporcional, sin emoji", () => {
    const iconos = readFileSync(join(__dirname, "../app/panel/iconos.tsx"), "utf8");
    expect(iconos).toContain("export function IconoBateria");
    const energia = readFileSync(join(__dirname, "../app/panel/energia.tsx"), "utf8");
    expect(energia).toContain("IconoBateria");
    expect(energia).not.toMatch(/token/i);
  });
});
