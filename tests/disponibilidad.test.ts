import { describe, expect, it } from "vitest";
import { dosOpciones, horariosLibres, type ParametrosAgenda } from "../lib/agenda/disponibilidad";
import { etiquetaHorario } from "../lib/agenda/formato";
import { aUtc, fechaLocal } from "../lib/agenda/tiempo";

const CR = "America/Costa_Rica";
// Lunes 19 de octubre de 2026, 8:00 en Costa Rica (UTC-6).
const LUNES_8AM = new Date("2026-10-19T14:00:00Z");
const local = (iso: string) => new Date(`${iso}-06:00`);

function base(extra: Partial<ParametrosAgenda> = {}): ParametrosAgenda {
  return {
    ahora: LUNES_8AM,
    zona: CR,
    horarios: [1, 2, 3, 4, 5].map((d) => ({ dia_semana: d, hora_inicio: "08:00", hora_fin: "17:00" })),
    bloqueos: [],
    citas: [],
    duracionMin: 60,
    margenMin: 30,
    anticipacionHoras: 3,
    horizonteDias: 2,
    ...extra,
  };
}

const horas = (libres: { inicio: Date }[]) => libres.map((l) => l.inicio.toISOString());

describe("tiempo", () => {
  it("convierte hora local de Costa Rica a UTC", () => {
    expect(aUtc(fechaLocal(LUNES_8AM, CR), 10 * 60, CR).toISOString()).toBe("2026-10-19T16:00:00.000Z");
    expect(fechaLocal(new Date("2026-10-20T05:30:00Z"), CR)).toMatchObject({ dia: 19, diaSemana: 1 });
  });
  it("respeta el horario de verano en otras zonas", () => {
    // 8 de marzo de 2026: Nueva York pasa a UTC-4.
    const f = { anio: 2026, mes: 3, dia: 9, diaSemana: 1 };
    expect(aUtc(f, 9 * 60, "America/New_York").toISOString()).toBe("2026-03-09T13:00:00.000Z");
  });
});

describe("horariosLibres", () => {
  it("respeta la anticipación mínima y la franja", () => {
    const libres = horariosLibres(base({ horizonteDias: 0 }));
    expect(horas(libres)).toEqual(
      ["11:00", "12:00", "13:00", "14:00", "15:00", "16:00"].map((h) => local(`2026-10-19T${h}`).toISOString()),
    );
  });

  it("no ofrece fines de semana sin franja", () => {
    // Viernes 23, horizonte hasta el lunes 26.
    const libres = horariosLibres(base({ ahora: new Date("2026-10-23T14:00:00Z"), horizonteDias: 3 }));
    const dias = new Set(libres.map((l) => fechaLocal(l.inicio, CR).diaSemana));
    expect([...dias].sort()).toEqual([1, 5]);
  });

  it("deja margen de traslado alrededor de cada cita y salta bloqueos", () => {
    const libres = horariosLibres(
      base({
        horizonteDias: 0,
        citas: [{ inicio: local("2026-10-19T12:00"), fin: local("2026-10-19T13:00") }],
        bloqueos: [{ inicio: local("2026-10-19T15:00"), fin: local("2026-10-19T17:00") }],
      }),
    );
    // 11:00–12:00 choca con el margen previo (11:30); 13:00 con el posterior (13:30).
    expect(horas(libres)).toEqual([local("2026-10-19T14:00").toISOString()]);
  });

  it("propone dos opciones en días distintos", () => {
    const libres = horariosLibres(base());
    const [a, b] = dosOpciones(libres, CR);
    expect(a.inicio.toISOString()).toBe(local("2026-10-19T11:00").toISOString());
    expect(b.inicio.toISOString()).toBe(local("2026-10-20T08:00").toISOString());
  });
});

describe("etiquetaHorario", () => {
  it("escribe la fecha en español en la zona del corredor", () => {
    expect(etiquetaHorario(local("2026-10-21T10:00"), CR)).toBe("miércoles 21 de octubre, 10:00 a. m.");
  });
});
