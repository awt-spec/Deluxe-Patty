import { describe, expect, it } from "vitest";
import { categoriaDeTema, diferenciaPalabras, fraseEstado, listaPreparacion, MINIMO_ENSENADO } from "@/app/panel/cerebro/resumen";

describe("categoriaDeTema", () => {
  it("reconoce cada categoría por sus palabras, sin tildes ni mayúsculas", () => {
    expect(categoriaDeTema("¿Aceptan MASCOTAS en los alquileres?")).toBe("mascotas");
    expect(categoriaDeTema("¿Se puede pagar con crédito bancario?")).toBe("pagos");
    expect(categoriaDeTema("¿Cuánto es la comisión?")).toBe("pagos");
    expect(categoriaDeTema("¿Se puede visitar el sábado?")).toBe("visitas");
    expect(categoriaDeTema("¿En qué zonas trabajan?")).toBe("zonas");
    expect(categoriaDeTema("¿Cuántos parqueos tiene?")).toBe("casas");
    expect(categoriaDeTema("¿Habla inglés?")).toBe("otros");
  });

  it("lo más específico gana: perros en un apartamento es de mascotas", () => {
    expect(categoriaDeTema("¿El apartamento de Santa Ana acepta perros?")).toBe("mascotas");
  });

  it("no confunde un pedazo de otra palabra (hora dentro de ahora)", () => {
    expect(categoriaDeTema("¿Y ahora qué sigue?")).toBe("otros");
  });

  it("si el tema no dice nada, mira la respuesta", () => {
    expect(categoriaDeTema("¿Lo de siempre?", "Sí, con depósito de un mes.")).toBe("pagos");
  });
});

describe("diferenciaPalabras", () => {
  const marcadas = (ps: { texto: string; cambio: boolean }[]) => ps.filter((p) => p.cambio).map((p) => p.texto);

  it("marca solo las palabras que cambiaron y conserva el texto", () => {
    const d = diferenciaPalabras("Hola, la casa cuesta 300 mil.", "Hola, la casa cuesta 280 mil dólares.");
    expect(marcadas(d.antes)).toEqual(["300"]);
    expect(marcadas(d.despues)).toEqual(["280", "dólares."]);
    expect(d.antes.map((p) => p.texto).join("")).toBe("Hola, la casa cuesta 300 mil.");
    expect(d.despues.map((p) => p.texto).join("")).toBe("Hola, la casa cuesta 280 mil dólares.");
  });

  it("junta palabras seguidas que cambiaron, con su espacio", () => {
    const d = diferenciaPalabras("Le escribo mañana", "Le escribo hoy mismo en la tarde");
    expect(marcadas(d.despues)).toEqual(["hoy mismo en la tarde"]);
  });

  it("no marca por mayúsculas, tildes ni puntuación pegada", () => {
    const d = diferenciaPalabras("claro que si", "Claro que sí.");
    expect(marcadas(d.antes)).toEqual([]);
    expect(marcadas(d.despues)).toEqual([]);
  });

  it("textos iguales o vacíos no marcan nada", () => {
    expect(marcadas(diferenciaPalabras("igual", "igual").despues)).toEqual([]);
    expect(diferenciaPalabras("", "")).toEqual({ antes: [], despues: [] });
  });

  it("con textos enormes no resalta (no se pone lenta)", () => {
    const largo = Array.from({ length: 600 }, (_, i) => `p${i}`).join(" ");
    const d = diferenciaPalabras(largo, `${largo} fin`);
    expect(d.despues).toEqual([{ texto: `${largo} fin`, cambio: false }]);
  });
});

describe("fraseEstado", () => {
  it("resume con plurales y singulares", () => {
    expect(fraseEstado("Patty", { sabe: 4, correcciones: 1, preguntas: 2 })).toBe(
      "Patty sabe 4 cosas que le enseñaste, aprendió de 1 corrección y tiene 2 preguntas para ti.",
    );
    expect(fraseEstado("Patty", { sabe: 1, correcciones: 0, preguntas: 0 })).toBe(
      "Patty sabe 1 cosa que le enseñaste, todavía no tiene correcciones y no tiene preguntas pendientes.",
    );
  });

  it("sin nada todavía, anima a empezar", () => {
    expect(fraseEstado("Ana", { sabe: 0, correcciones: 0, preguntas: 0 })).toMatch(/^Ana todavía no sabe nada tuyo/);
  });
});

describe("listaPreparacion", () => {
  const base = { casas: [{ precio: 100, fotos: 3 }], franjas: 5, tono: "Cercana", temasCorredor: 3, sabe: MINIMO_ENSENADO, preguntas: 0 };

  it("todo listo: 7 de 7", () => {
    const l = listaPreparacion(base);
    expect(l).toHaveLength(7);
    expect(l.every((r) => r.listo)).toBe(true);
  });

  it("vacío total: solo las preguntas están al día", () => {
    const l = listaPreparacion({ casas: [], franjas: 0, tono: " ", temasCorredor: 0, sabe: 0, preguntas: 0 });
    expect(l.filter((r) => r.listo).map((r) => r.clave)).toEqual(["preguntas"]);
  });

  it("dice cuántas casas no tienen precio o fotos y cuántas preguntas esperan", () => {
    const l = listaPreparacion({ ...base, casas: [{ precio: null, fotos: 2 }, { precio: 5, fotos: 0 }, { precio: 5, fotos: 1 }], preguntas: 1, sabe: 2 });
    const r = Object.fromEntries(l.map((x) => [x.clave, x]));
    expect(r.fichas.listo).toBe(false);
    expect(r.fichas.detalle).toBe("2 casas no tienen precio o fotos");
    expect(r.preguntas.detalle).toBe("1 pregunta espera tu respuesta");
    expect(r.ensenado).toMatchObject({ listo: false, detalle: "Lleva 2 cosas" });
  });

  it("cada renglón lleva a una pantalla del panel", () => {
    for (const r of listaPreparacion(base)) expect(r.href.startsWith("/panel/")).toBe(true);
  });
});
