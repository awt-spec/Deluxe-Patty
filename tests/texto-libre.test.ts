import { describe, expect, it } from "vitest";
import { leerAjustes, leerBloqueo, leerPropiedad } from "../lib/panel/formularios";
import { LIMITES, limpiarTexto, textoLibre } from "../lib/panel/texto-libre";
import { leerPedido } from "../lib/sitio/publico";

const u = (...cs: number[]) => String.fromCodePoint(...cs);
const campos = (datos: Record<string, string>) => ({ get: (k: string) => datos[k] ?? null });

describe("limpiarTexto: sin caracteres de control ni de dirección", () => {
  it("quita U+202E y los demás bidi, ancho cero y control; deja saltos de línea, tildes y emojis compuestos", () => {
    expect(limpiarTexto(`abc${u(0x202e)}def`)).toBe("abcdef");
    for (const c of [0x202a, 0x202b, 0x202c, 0x202d, 0x2066, 0x2067, 0x2068, 0x2069, 0x200b, 0x200e, 0x200f, 0x061c, 0xfeff, 0x0000, 0x0007, 0x001b, 0x007f]) {
      expect(limpiarTexto(`a${u(c)}b`), c.toString(16)).toBe("ab");
    }
    expect(limpiarTexto("línea 1\r\nlínea 2\ttab")).toBe("línea 1\nlínea 2\ttab");
    const familia = `${u(0x1f468)}${u(0x200d)}${u(0x1f469)}${u(0x200d)}${u(0x1f467)}`;
    expect(limpiarTexto(`Ñandú ${familia}`)).toBe(`Ñandú ${familia}`);
  });

  it("textoLibre avisa cuando pasa del tope (no corta a escondidas)", () => {
    expect(textoLibre("  hola  ", 10, "El tono")).toEqual({ ok: true, valor: "hola" });
    expect(textoLibre("   ", 10, "El tono")).toEqual({ ok: true, valor: null });
    expect(textoLibre("x".repeat(1501), LIMITES.tono, "El tono")).toEqual({ ok: false, motivo: "El tono es muy largo: hasta 1.500 letras (tiene 1.501)." });
  });
});

describe("topes y limpieza en los formularios", () => {
  it("la descripción de una casa tiene tope de 6.000 y se limpia", () => {
    const casa = { codigo: "DP-1", titulo: "Casa", tipo: "casa", operacion: "venta", precio: "450000" };
    expect(leerPropiedad(campos({ ...casa, descripcion: "x".repeat(6001) }))).toMatchObject({ ok: false, motivo: expect.stringMatching(/descripción es muy larga|descripción es muy largo/) });
    expect(leerPropiedad(campos({ ...casa, descripcion: `Linda${u(0x202e)} casa` }))).toMatchObject({ ok: true, valor: { descripcion: "Linda casa" } });
  });

  it("el motivo de un rato apartado tiene tope de 300", () => {
    const f = { fecha_desde: "2030-01-10", motivo: "m".repeat(301) };
    expect(leerBloqueo(campos(f), "America/Costa_Rica", new Date("2026-11-15T12:00:00Z"))).toMatchObject({ ok: false, motivo: expect.stringMatching(/motivo/) });
  });

  it("ajustes: tono con tope, comisión 0 es 0 y vacía es 5, precios con formato de Costa Rica", () => {
    const base = { tono: "Cordial", comision_pct: "0", precio_min: "150.000", precio_max: "1.250.000,00", hora_plan: "07:30" };
    expect(leerAjustes(campos(base))).toMatchObject({
      errores: {},
      valores: { comision_pct: 0, precio_busqueda_min: 150_000, precio_busqueda_max: 1_250_000, hora_plan_dia: "07:30" },
    });
    expect(leerAjustes(campos({ ...base, comision_pct: "" })).valores.comision_pct).toBe(5);
    expect(leerAjustes(campos({ ...base, tono: "x".repeat(1501) })).errores.tono).toMatch(/1\.500/);
    expect(leerAjustes(campos({ ...base, comision_pct: "50" })).errores.comision_pct).toMatch(/0 a 20/);
    expect(leerAjustes(campos({ ...base, precio_min: "2000000" })).errores.precio_busqueda_min).toMatch(/mínimo/);
    expect(leerAjustes(campos({ ...base, hora_plan: "25:00" })).errores.hora_plan_dia).toBeTruthy();
    expect(leerAjustes(campos({ ...base, reglas: Array.from({ length: 31 }, (_, i) => `tema ${i}`).join("\n") })).errores.reglas_escalamiento).toBeTruthy();
  });
});

describe("sitio público: nombre y notas sin caracteres de dirección", () => {
  it("leerPedido limpia el nombre y el comentario", () => {
    const r = leerPedido({ acepta: true, nombre: `Ana${u(0x202e)} Pérez`, telefono: "8888-0001", inicio: "2026-11-20T16:00:00.000Z", notas: `Voy${u(0x2066)} con mi esposo` });
    expect(r).toMatchObject({ ok: true, pedido: { nombre: "Ana Pérez", notas: "Voy con mi esposo" } });
  });
});
