import { describe, expect, it } from "vitest";
import {
  MAX_TEXTO_CALIFICACION,
  cosasEnsenadas,
  escribioSuVersion,
  fraseEnsenadas,
  fraseGuardado,
  fraseResumen,
  notaValida,
  pedidoValido,
  queGuardar,
  recortar,
  resumenPrueba,
  type PedidoCalificacion,
} from "@/lib/simulador/calificar";

const ORIGINAL = "La casa tiene 3 habitaciones y está en Santa Ana.";
const pedido = (p: Partial<PedidoCalificacion>): PedidoCalificacion => ({
  motivo: "tono",
  pregunta: "¿Cuántos cuartos tiene la casa de Santa Ana?",
  original: ORIGINAL,
  texto: ORIGINAL,
  guardarEnLoQueSabe: true,
  ...p,
});

describe("Qué se guarda al calificar una respuesta de prueba", () => {
  it("con su versión: corrección (antes = la asistente, después = el corredor)", () => {
    const plan = queGuardar(pedido({ texto: "¡Hola! Tiene 3 cuartos, en Santa Ana. ¿Le gustaría verla?" }));
    expect(plan.correccion).toEqual({ original: ORIGINAL, corregido: "¡Hola! Tiene 3 cuartos, en Santa Ana. ¿Le gustaría verla?" });
    expect(plan.conocimiento).toBeNull();
    expect(plan.duda).toBeNull();
  });

  it("el texto precargado sin cambios (o solo con espacios distintos) no es una corrección", () => {
    expect(queGuardar(pedido({ texto: `  ${ORIGINAL.replace(/ /g, "   ")} ` })).correccion).toBeNull();
    expect(queGuardar(pedido({ texto: "" })).correccion).toBeNull();
    expect(cosasEnsenadas(queGuardar(pedido({ texto: "" })))).toBe(0);
  });

  it("dato equivocado con el dato correcto: corrección y, si lo pide, lo que sabe (tema = pregunta del cliente)", () => {
    const plan = queGuardar(pedido({ motivo: "dato", texto: "Tiene 4 habitaciones." }));
    expect(plan.correccion).not.toBeNull();
    expect(plan.conocimiento).toEqual({ tema: "¿Cuántos cuartos tiene la casa de Santa Ana?", respuesta: "Tiene 4 habitaciones." });
    expect(cosasEnsenadas(plan)).toBe(2);
    expect(queGuardar(pedido({ motivo: "dato", texto: "Tiene 4 habitaciones.", guardarEnLoQueSabe: false })).conocimiento).toBeNull();
  });

  it("le faltó información y no escribió nada: duda pendiente con la pregunta del cliente, sin corrección", () => {
    const plan = queGuardar(pedido({ motivo: "falta", texto: ORIGINAL }));
    expect(plan.duda).toBe("¿Cuántos cuartos tiene la casa de Santa Ana?");
    expect(plan.correccion).toBeNull();
    expect(plan.conocimiento).toBeNull();
  });

  it("el tono sin texto no guarda nada (no hay de qué aprender)", () => {
    expect(cosasEnsenadas(queGuardar(pedido({ motivo: "tono" })))).toBe(0);
    expect(queGuardar(pedido({ motivo: "otra" })).duda).toBeNull();
  });

  it("debió pasármelo: nada, solo el aviso de Ajustes", () => {
    const plan = queGuardar(pedido({ motivo: "pasarmelo", texto: "Eso se lo paso a Patricia." }));
    expect(plan).toEqual({ correccion: null, conocimiento: null, duda: null, irAAjustes: true });
    expect(fraseGuardado(plan)).toMatch(/Ajustes/);
  });

  it("sin la pregunta del cliente no hay tema: ni lo que sabe ni duda", () => {
    expect(queGuardar(pedido({ motivo: "falta", pregunta: "" })).duda).toBeNull();
    expect(queGuardar(pedido({ motivo: "dato", pregunta: " ", texto: "Son 4." })).conocimiento).toBeNull();
  });

  it("recorta: textos a 1.000 caracteres y el tema a 300", () => {
    const plan = queGuardar(pedido({ motivo: "dato", pregunta: "p".repeat(900), texto: "x".repeat(5000) }));
    expect(plan.correccion?.corregido.length).toBe(MAX_TEXTO_CALIFICACION);
    expect(plan.conocimiento?.tema.length).toBe(300);
    expect(recortar("  hola\r\nmundo  ")).toBe("hola\nmundo");
  });
});

describe("El pedido viene del navegador", () => {
  it("motivo desconocido o sin respuesta original: no sirve", () => {
    expect(pedidoValido({ motivo: "borrar_todo", original: "x" })).toBeNull();
    expect(pedidoValido({ motivo: "tono", original: "  " })).toBeNull();
    expect(pedidoValido(null)).toBeNull();
  });

  it("guardarEnLoQueSabe solo con true y los textos recortados", () => {
    const p = pedidoValido({ motivo: "dato", original: "a", texto: "b".repeat(3000), pregunta: 42, guardarEnLoQueSabe: "sí" });
    expect(p).toMatchObject({ motivo: "dato", pregunta: "42", guardarEnLoQueSabe: false });
    expect(p?.texto.length).toBe(MAX_TEXTO_CALIFICACION);
  });

  it("escribioSuVersion ignora mayúsculas y espacios", () => {
    expect(escribioSuVersion("Hola, sí.", "hola,   SÍ.")).toBe(false);
    expect(escribioSuVersion("Hola, sí.", "Hola, claro.")).toBe(true);
  });
});

describe("Resumen de la prueba", () => {
  it("cuenta bien, por mejorar y lo enseñado", () => {
    const r = resumenPrueba({ a: { valor: "bien" }, b: { valor: "bien" }, c: { valor: "mal", motivo: "dato", ensenadas: 2 }, d: undefined });
    expect(r).toEqual({ total: 3, bien: 2, mal: 1, ensenadas: 2 });
    expect(fraseResumen(r)).toBe("Calificaste 3 respuestas: 2 bien, 1 por mejorar");
    expect(fraseEnsenadas(1)).toBe("Le enseñaste 1 cosa en esta prueba");
    expect(fraseEnsenadas(3)).toBe("Le enseñaste 3 cosas en esta prueba");
  });

  it("sin calificaciones invita a calificar; singular con una", () => {
    expect(fraseResumen(resumenPrueba({}))).toMatch(/pulgar/);
    expect(fraseResumen(resumenPrueba({ a: { valor: "mal" } }))).toBe("Calificaste 1 respuesta: 0 bien, 1 por mejorar");
  });

  it("la nota es de 1 a 5", () => {
    expect(notaValida(4)).toBe(4);
    expect(notaValida(0)).toBeNull();
    expect(notaValida(6)).toBeNull();
    expect(notaValida(2.5)).toBeNull();
  });

  it("la frase de lo guardado dice qué aprendió", () => {
    expect(fraseGuardado(queGuardar(pedido({ motivo: "dato", texto: "Son 4." })))).toBe("Listo: va a escribir como tú y ya sabe ese dato.");
    expect(fraseGuardado(queGuardar(pedido({ motivo: "falta" })))).toMatch(/pregunta en su cerebro/);
  });
});
