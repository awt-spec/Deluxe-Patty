import { describe, expect, it, vi } from "vitest";
import { apartar } from "../lib/agenda/apartar";
import { codigoLoEntiende, detectarHoraSupuesta, operacionDeCodigo, operacionEnManana, revisarOperaciones } from "../lib/agenda/apartar-ia";
import { entenderBloqueo, horasEnManana } from "../lib/agenda/bloquear";

vi.mock("server-only", () => ({}));

// "Mañana a las 3": se supone la tarde (1 a 6 sin a. m./p. m.), pero se le dice al corredor y puede pasarla a la mañana.

const CR = "America/Costa_Rica";
// Viernes 13 de noviembre de 2026, 9:00 a. m. en Costa Rica.
const AHORA = new Date("2026-11-13T15:00:00Z");
const entender = (t: string) => entenderBloqueo(t, AHORA, CR)!;
const ctx = (texto = "") => ({ ahora: AHORA, zona: CR, texto });

describe("intérprete de código: marca la hora supuesta", () => {
  it("«a las 3» sin periodo se supone de la tarde y se marca", () => {
    const p = entender("apartar mañana a las 3");
    expect(p.horas).toEqual({ desde: 15 * 60, hasta: 16 * 60 });
    expect(p.horaSupuesta).toBe("ambas");
  });

  it("con periodo o en 24 horas no se marca: «a las 3 pm», «a las 3 de la tarde», «a las 15», «a las 3 am»", () => {
    expect(entender("apartar mañana a las 3 pm").horaSupuesta).toBeUndefined();
    expect(entender("apartar mañana a las 3 p. m.").horaSupuesta).toBeUndefined();
    expect(entender("apartar mañana a las 15").horaSupuesta).toBeUndefined();
    const am = entender("apartar mañana a las 3 am");
    expect(am.horas).toEqual({ desde: 3 * 60, hasta: 4 * 60 });
    expect(am.horaSupuesta).toBeUndefined();
  });

  it("«a las 9» es de la mañana y no se marca (no se supuso nada)", () => {
    const p = entender("apartar mañana a las 9");
    expect(p.horas).toEqual({ desde: 9 * 60, hasta: 10 * 60 });
    expect(p.horaSupuesta).toBeUndefined();
  });

  it("«de 2 a 4» se marca en las dos horas; «de 9 a 11» no; «de 11 a 2» no ofrece cambiar (11 a 2 a. m. no cuadra)", () => {
    const a = entender("apartar el martes de 2 a 4");
    expect(a.horas).toEqual({ desde: 14 * 60, hasta: 16 * 60 });
    expect(a.horaSupuesta).toBe("ambas");
    expect(entender("apartar el martes de 9 a 11").horaSupuesta).toBeUndefined();
    const c = entender("apartar el martes de 11 a 2");
    expect(c.horas).toEqual({ desde: 11 * 60, hasta: 14 * 60 });
    expect(c.horaSupuesta).toBeUndefined();
  });

  it("con a. m./p. m. en las dos horas no se marca", () => {
    expect(entender("apartar el martes de 2 pm a 4 pm").horaSupuesta).toBeUndefined();
    expect(entender("apartar el martes de 1 am a 3 am").horaSupuesta).toBeUndefined();
  });

  it("horasEnManana: solo si cuadra", () => {
    expect(horasEnManana({ desde: 15 * 60, hasta: 16 * 60 }, "ambas")).toEqual({ desde: 3 * 60, hasta: 4 * 60 });
    expect(horasEnManana({ desde: 11 * 60, hasta: 14 * 60 }, "fin")).toBeNull();
  });
});

describe("WhatsApp del corredor: el resumen lo dice", () => {
  const repo = { crearBloqueo: vi.fn(async () => {}), datosAgenda: vi.fn(async () => ({ citas: [], bloqueos: [], horarios: [] })) };
  it("agrega «(entendí de la tarde)» solo cuando se supuso", async () => {
    const con = await apartar(repo as never, "c1", entender("apartar mañana a las 3"), AHORA);
    expect(con.texto).toContain("de 3 p. m. a 4 p. m. (entendí de la tarde)");
    const sin = await apartar(repo as never, "c1", entender("apartar mañana a las 3 pm"), AHORA);
    expect(sin.texto).not.toContain("entendí");
    const nueve = await apartar(repo as never, "c1", entender("apartar mañana a las 9"), AHORA);
    expect(nueve.texto).not.toContain("entendí");
  });
});

describe("camino de la IA y la tarjeta «Esto entendí»", () => {
  const horas = (inicio: string, fin: string) => ({ tipo: "apartar" as const, desde: "2026-11-17", rato: "horas" as const, hora_inicio: inicio, hora_fin: fin });

  it("el código marca la operación y revisarOperaciones la deja en el renglón", () => {
    const op = operacionDeCodigo(entender("apartar el martes de 2 a 4"));
    expect(op.hora_supuesta).toBe("ambas");
    const r = revisarOperaciones([op], ctx("apartar el martes de 2 a 4"));
    expect(r.apartados[0]).toMatchObject({ hora_inicio: "14:00", hora_fin: "16:00", hora_supuesta: "ambas" });
  });

  it("de lo que devolvió el modelo, la hora supuesta sale del texto del corredor", () => {
    const r = revisarOperaciones([horas("15:00", "16:00")], ctx("el martes a las 3 tengo dentista"));
    expect(r.apartados[0].hora_supuesta).toBe("ambas");
    expect(revisarOperaciones([horas("15:00", "16:00")], ctx("el martes a las 3 pm tengo dentista")).apartados[0].hora_supuesta).toBeUndefined();
    expect(revisarOperaciones([horas("15:00", "16:00")], ctx("el martes a las 15 tengo dentista")).apartados[0].hora_supuesta).toBeUndefined();
    expect(revisarOperaciones([horas("15:00", "16:00")], ctx("el martes a las 3 de la tarde")).apartados[0].hora_supuesta).toBeUndefined();
    expect(revisarOperaciones([horas("09:00", "10:00")], ctx("el martes a las 9")).apartados[0].hora_supuesta).toBeUndefined();
    expect(revisarOperaciones([horas("14:00", "16:00")], ctx("el martes de 2 a 4")).apartados[0].hora_supuesta).toBe("ambas");
  });

  it("detectarHoraSupuesta: no confunde días del mes ni minutos", () => {
    expect(detectarHoraSupuesta("el 3 de diciembre a las 3 pm", 15 * 60, 16 * 60)).toBeUndefined();
    expect(detectarHoraSupuesta("el martes a las 3:30", 15 * 60 + 30, 16 * 60 + 30)).toBe("ambas");
    expect(detectarHoraSupuesta("el martes a las 3:30 pm", 15 * 60 + 30, 16 * 60 + 30)).toBeUndefined();
  });

  it("«¿Era de la mañana?»: el mismo código recalcula el renglón, queda confirmado y no vuelve a preguntar", () => {
    const antes = revisarOperaciones([operacionDeCodigo(entender("apartar el martes a las 3"))], ctx("apartar el martes a las 3")).apartados[0];
    expect(antes.hora_supuesta).toBe("ambas");
    const op = operacionEnManana(antes)!;
    expect(op).toMatchObject({ hora_inicio: "03:00", hora_fin: "04:00", periodo_confirmado: true });
    // Las 3 a. m. normalmente son una duda (madrugada), pero ya lo confirmó el corredor.
    const r = revisarOperaciones([op], ctx(""));
    expect(r.dudas).toEqual([]);
    expect(r.apartados[0]).toMatchObject({ hora_inicio: "03:00", hora_fin: "04:00", inicio: "2026-11-17T09:00:00.000Z", fin: "2026-11-17T10:00:00.000Z", hora_confirmada: true });
    expect(r.apartados[0].hora_supuesta).toBeUndefined();
    expect(r.apartados[0].texto).toContain("3:00 a 4:00 a. m.");
    // Sin la confirmación, esa hora sigue siendo una duda.
    expect(revisarOperaciones([{ ...op, periodo_confirmado: false }], ctx("")).dudas).toHaveLength(1);
  });

  it("sin hora supuesta no hay nada que pasar a la mañana", () => {
    const sin = revisarOperaciones([operacionDeCodigo(entender("apartar el martes a las 9"))], ctx("")).apartados[0];
    expect(operacionEnManana(sin)).toBeNull();
    expect(codigoLoEntiende("apartar mañana a las 3", AHORA, CR)?.horaSupuesta).toBe("ambas");
  });
});
