import { describe, expect, it } from "vitest";
import { lineaAhora, momentoDelDia } from "../lib/agenda/formato";
import { respuestaPattyDemo } from "../lib/asistente/cerebro-demo";
import { contextoPatty } from "../lib/panel/patty";

const CR = "America/Costa_Rica";

describe("momento del día", () => {
  it("madrugada, tarde y noche según la hora local", () => {
    expect(momentoDelDia(new Date("2026-11-18T11:34:00Z"), CR)).toBe("madrugada"); // 5:34 CR
    expect(momentoDelDia(new Date("2026-11-18T20:00:00Z"), CR)).toBe("tarde"); // 14:00
    expect(momentoDelDia(new Date("2026-11-19T03:00:00Z"), CR)).toBe("noche"); // 21:00
    expect(momentoDelDia(new Date("2026-11-18T15:00:00Z"), CR)).toBe("mañana"); // 9:00
  });
  it("respeta la zona", () => {
    const t = new Date("2026-11-18T11:34:00Z");
    expect(momentoDelDia(t, "UTC")).toBe("mañana");
    expect(lineaAhora(t, "Europe/Madrid")).toContain("(tarde)");
  });
  it("la línea Ahora trae día, año, hora y momento", () => {
    expect(lineaAhora(new Date("2026-11-18T11:34:00Z"), CR)).toBe(
      "Ahora: miércoles 18 de noviembre de 2026, 5:34 a. m. (madrugada), hora de Costa Rica.",
    );
  });
});

describe("contexto de Patty", () => {
  it("incluye la línea Ahora y la demo usa la fecha de hoy", async () => {
    const corredor = { id: "c1", nombre_contacto: "Pati", zona_horaria: CR, zona_base: null } as never;
    const vacio = { data: [], error: null };
    const q: Record<string, unknown> = {};
    const cadena: unknown = new Proxy(q, { get: (_t, k) => (k === "then" ? (f: (v: unknown) => unknown) => f(vacio) : () => cadena) });
    const db = { from: () => cadena } as never;
    const deps = { repo: { datosPlan: async () => ({}), propiedadesActivas: async () => [] }, ahora: () => new Date() } as never;
    const ctx = await contextoPatty(deps, db, corredor, new Date("2026-11-18T11:34:00Z"));
    expect(ctx).toContain("Ahora: miércoles 18 de noviembre de 2026, 5:34 a. m. (madrugada), hora de Costa Rica.");
    const demo = respuestaPattyDemo(ctx, "qué tengo hoy");
    expect(demo).toContain("miércoles 18 de noviembre");
    expect(demo).not.toContain("Buenos días");
  });
});
