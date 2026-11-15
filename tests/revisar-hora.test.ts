import { describe, expect, it } from "vitest";
import { firmaConfirmacion, revisarHoraVisita } from "../lib/agenda/revisar-hora";
import { esHora, fechaDeIso, instanteLocal } from "../lib/agenda/tiempo";

const CR = "America/Costa_Rica";
const local = (iso: string) => new Date(`${iso}-06:00`);

describe("fechas y horas que existen", () => {
  it("fechaDeIso valida ida y vuelta: 31 de febrero, mes 13 o 9999-99-99 no existen", () => {
    expect(fechaDeIso("2026-02-28")).toEqual({ anio: 2026, mes: 2, dia: 28, diaSemana: 6 });
    expect(fechaDeIso("2028-02-29")).not.toBeNull();
    for (const mala of ["2026-02-31", "2026-02-29", "2026-13-01", "2026-00-10", "2026-04-31", "9999-99-99", "", "2026-1-5", "mañana"]) {
      expect(fechaDeIso(mala), mala).toBeNull();
    }
  });

  it("esHora e instanteLocal: 25:00 o 10:60 no son horas", () => {
    expect(esHora("23:59")).toBe(true);
    for (const mala of ["25:00", "24:00", "10:60", "9:00", ""]) expect(esHora(mala), mala).toBe(false);
    expect(instanteLocal("2026-11-20", "10:00", CR)?.toISOString()).toBe("2026-11-20T16:00:00.000Z");
    expect(instanteLocal("2026-02-31", "10:00", CR)).toBeNull();
    expect(instanteLocal("2026-11-20", "25:00", CR)).toBeNull();
  });
});

describe("revisarHoraVisita: es su agenda, se avisa y se pide confirmar", () => {
  const ahora = local("2026-11-16T09:00"); // lunes
  // Lunes a viernes de 8 a 12.
  const franjas = [1, 2, 3, 4, 5].map((d) => ({ dia_semana: d, hora_inicio: "08:00:00", hora_fin: "12:00:00" }));
  const visita = (iso: string, minutos = 60) => ({ inicio: local(iso), fin: new Date(local(iso).getTime() + minutos * 60_000) });

  it("una hora que ya pasó se rechaza (con unos minutos de gracia)", () => {
    expect(revisarHoraVisita({ ...visita("2026-11-10T10:00"), ahora, zona: CR, franjas, bloqueos: [] })).toMatchObject({ ok: false, motivo: expect.stringMatching(/ya pasó/) });
    expect(revisarHoraVisita({ ...visita("2026-11-16T08:55"), ahora, zona: CR, franjas, bloqueos: [] })).toMatchObject({ ok: true });
  });

  it("dentro del horario y sin ratos apartados no pregunta nada", () => {
    expect(revisarHoraVisita({ ...visita("2026-11-17T10:00"), ahora, zona: CR, franjas, bloqueos: [] })).toEqual({ ok: true, avisos: [], pregunta: null });
  });

  it("fuera del horario (sábado, o pasándose de las 12) pregunta '¿Agendar igual?'", () => {
    const sabado = revisarHoraVisita({ ...visita("2026-11-21T10:00"), ahora, zona: CR, franjas, bloqueos: [] });
    expect(sabado).toEqual({ ok: true, avisos: ["fuera_de_horario"], pregunta: "Eso cae fuera de tu horario de visitas. ¿Agendar igual?" });
    expect(revisarHoraVisita({ ...visita("2026-11-17T11:30"), ahora, zona: CR, franjas, bloqueos: [] })).toMatchObject({ avisos: ["fuera_de_horario"] });
    // Sin horario guardado no hay con qué comparar.
    expect(revisarHoraVisita({ ...visita("2026-11-21T10:00"), ahora, zona: CR, franjas: [], bloqueos: [] })).toMatchObject({ avisos: [] });
  });

  it("sobre un rato apartado pregunta, también al mover ('¿Moverla igual?')", () => {
    const bloqueos = [{ inicio: local("2026-11-17T09:30").toISOString(), fin: local("2026-11-17T10:30").toISOString() }];
    const r = revisarHoraVisita({ ...visita("2026-11-17T10:00"), ahora, zona: CR, franjas, bloqueos, accion: "mover" });
    expect(r).toEqual({ ok: true, avisos: ["rato_apartado"], pregunta: "Eso cae en un rato que apartaste. ¿Moverla igual?" });
    // Pegada al final del rato apartado, no choca.
    expect(revisarHoraVisita({ ...visita("2026-11-17T10:30"), ahora, zona: CR, franjas, bloqueos })).toMatchObject({ avisos: [] });
  });

  it("la confirmación queda amarrada al día y la hora", () => {
    expect(firmaConfirmacion("2026-11-17", "10:00")).toBe("2026-11-17T10:00");
  });
});
