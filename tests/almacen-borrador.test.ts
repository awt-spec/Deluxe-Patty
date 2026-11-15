import { describe, expect, it } from "vitest";
import { casaGuardada, leerAlmacen, turnosGuardados, turnoValido } from "@/lib/panel/almacen";
import { campoGuardable, claveBorrador, mismosValores, paraGuardar, validarBorrador, validarTextoGuardado, VIDA_BORRADOR_MS } from "@/lib/panel/borrador";

function almacen(inicial: Record<string, string> = {}) {
  const datos = new Map(Object.entries(inicial));
  return {
    datos,
    getItem: (k: string) => datos.get(k) ?? null,
    removeItem: (k: string) => void datos.delete(k),
  };
}

describe("historial de Patty guardado en el navegador", () => {
  const bueno = { autor: "corredor", texto: "hola", hora: "2026-11-15T10:00:00.000Z", adjuntos: [{ tipo: "imagen", nombre: "a.jpg", miniatura: "data:image/jpeg;base64,AAA" }] };

  it("el caso de QA (H-08): elementos que no son turnos se descartan en vez de romper la pantalla", () => {
    const r = turnosGuardados([{ rol: "x", texto: null, adjuntos: 5 }, null, 7, { texto: { x: 1 } }, bueno]);
    expect(r?.turnos).toEqual([bueno]);
    expect(r?.limpiar).toBe(true);
  });
  it("[null, 7] queda vacío y se pide reescribir", () => {
    expect(turnosGuardados([null, 7])).toEqual({ turnos: [], limpiar: true });
  });
  it("lo que no es un arreglo no sirve", () => {
    expect(turnosGuardados({ a: 1 })).toBeNull();
    expect(turnosGuardados("x")).toBeNull();
  });
  it("revisa cada campo: adjuntos, casa, pdf, png, id y hora", () => {
    expect(turnoValido({ autor: "asistente", texto: "x", adjuntos: "no" })).toBeNull();
    expect(turnoValido({ autor: "asistente", texto: "x", adjuntos: [{ tipo: "exe", nombre: "a" }] })).toBeNull();
    expect(turnoValido({ autor: "asistente", texto: "x", casa: [1] })).toBeNull();
    expect(turnoValido({ autor: "asistente", texto: "x", pdf: 3 })).toBeNull();
    expect(turnoValido({ autor: "asistente", texto: "x", id: {} })).toBeNull();
    expect(turnoValido({ autor: "asistente", texto: "x", pdf: null, png: "Lámina", casa: ["a"], id: "casa-1" })).toEqual({
      autor: "asistente",
      texto: "x",
      pdf: null,
      png: "Lámina",
      casa: ["a"],
      id: "casa-1",
    });
    // Una hora que no es fecha se deja fuera (se pintaría "Invalid Date"); una miniatura de afuera, también.
    expect(turnoValido({ autor: "corredor", texto: "x", hora: "ayer", adjuntos: [{ tipo: "imagen", nombre: "a", miniatura: "https://evil.example/x.png" }] })).toEqual({
      autor: "corredor",
      texto: "x",
      adjuntos: [{ tipo: "imagen", nombre: "a" }],
    });
  });
  it("conserva solo los últimos", () => {
    const muchos = Array.from({ length: 50 }, (_, i) => ({ autor: "corredor", texto: String(i) }));
    expect(turnosGuardados(muchos, 40)?.turnos[0].texto).toBe("10");
  });
  it("la casa en curso: mensajes válidos, ficha objeto o nula", () => {
    expect(casaGuardada({ ficha: null, mensajes: [{ autor: "corredor", texto: "agrega" }], tarjeta: null })).toEqual({
      ficha: null,
      mensajes: [{ autor: "corredor", texto: "agrega" }],
      tarjeta: null,
    });
    expect(casaGuardada({ ficha: "x", mensajes: [] })).toBeNull();
    expect(casaGuardada({ ficha: null, mensajes: [null] })).toBeNull();
    expect(casaGuardada({ ficha: null, mensajes: [], tarjeta: 5 })).toBeNull();
    expect(casaGuardada([])).toBeNull();
  });
});

describe("leerAlmacen", () => {
  const validar = (v: unknown) => turnosGuardados(v);
  it("JSON roto: borra la clave y sigue", () => {
    const a = almacen({ k: "{roto" });
    expect(leerAlmacen(a, "k", validar)).toBeNull();
    expect(a.datos.has("k")).toBe(false);
  });
  it("forma equivocada: borra la clave", () => {
    const a = almacen({ k: '{"turnos":1}' });
    expect(leerAlmacen(a, "k", validar)).toBeNull();
    expect(a.datos.has("k")).toBe(false);
  });
  it("sin nada guardado o sin almacén: null sin lanzar", () => {
    expect(leerAlmacen(almacen(), "k", validar)).toBeNull();
    expect(leerAlmacen(null, "k", validar)).toBeNull();
    const roto = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      removeItem: () => {},
    };
    expect(leerAlmacen(roto, "k", validar)).toBeNull();
  });
  it("lo válido vuelve tal cual", () => {
    const a = almacen({ k: JSON.stringify([{ autor: "corredor", texto: "hola" }]) });
    expect(leerAlmacen(a, "k", validar)?.turnos).toEqual([{ autor: "corredor", texto: "hola" }]);
    expect(a.datos.has("k")).toBe(true);
  });
});

describe("borradores de formularios", () => {
  const ahora = Date.parse("2026-11-15T12:00:00Z");
  it("nunca guarda contraseñas, archivos, ocultos ni botones", () => {
    for (const type of ["password", "file", "hidden", "submit", "button", "reset", "image"]) expect(campoGuardable({ name: "x", type })).toBe(false);
    expect(campoGuardable({ name: "tono", type: "textarea" })).toBe(true);
    expect(campoGuardable({ name: "hora", type: "time" })).toBe(true);
    expect(campoGuardable({ name: "", type: "text" })).toBe(false);
    expect(campoGuardable({ name: "x", type: "text", disabled: true })).toBe(false);
    expect(campoGuardable({ name: "x", type: "text", sinBorrador: true })).toBe(false);
  });
  it("la clave es por pantalla y formulario", () => {
    expect(claveBorrador("/panel/ajustes", "ajustes")).toBe("borrador:/panel/ajustes:ajustes");
  });
  it("valida la forma y vence en un día", () => {
    const b = paraGuardar({ tono: ["Cercano"], zonas: ["a", "b"] }, ahora);
    expect(validarBorrador(JSON.parse(JSON.stringify(b)), ahora + 1000)).toEqual(b);
    expect(validarBorrador(b, ahora + VIDA_BORRADOR_MS + 1)).toBeNull();
    expect(validarBorrador({ t: ahora, v: { tono: "no es lista" } }, ahora)).toBeNull();
    expect(validarBorrador({ t: ahora, v: { tono: [1] } }, ahora)).toBeNull();
    expect(validarBorrador({ v: {} }, ahora)).toBeNull();
    expect(validarBorrador(null, ahora)).toBeNull();
  });
  it("si lo guardado es igual a lo que ya muestra la página, no hay nada que reponer", () => {
    expect(mismosValores({ a: ["1"] }, { a: ["1"] })).toBe(true);
    expect(mismosValores({ a: ["1"] }, { a: ["2"] })).toBe(false);
    expect(mismosValores({ a: [] }, {})).toBe(true);
    expect(mismosValores({ a: ["1"], b: ["x"] }, { a: ["1"] })).toBe(false);
  });
  it("recorta valores enormes", () => {
    expect(paraGuardar({ tono: ["x".repeat(30_000)] }, ahora).v.tono[0]).toHaveLength(20_000);
  });
  it("texto suelto (campos con estado)", () => {
    expect(validarTextoGuardado({ t: ahora, texto: "el martes de 2 a 4" }, ahora)).toBe("el martes de 2 a 4");
    expect(validarTextoGuardado({ t: ahora - VIDA_BORRADOR_MS - 1, texto: "x" }, ahora)).toBeNull();
    expect(validarTextoGuardado({ t: ahora, texto: 5 }, ahora)).toBeNull();
  });
});
