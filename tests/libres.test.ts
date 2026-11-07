import { describe, expect, it } from "vitest";
import { ratosLibres } from "../lib/agenda/libres";

const h = (x: number) => x * 60;

describe("ratos libres de Tu día", () => {
  it("el horario menos visitas y bloqueos", () => {
    const r = ratosLibres([{ desde: h(8), hasta: h(12) }, { desde: h(13), hasta: h(17) }], [{ desde: h(10), hasta: h(11) }, { desde: h(15), hasta: h(17) }]);
    expect(r).toEqual([
      { desde: h(8), hasta: h(10) },
      { desde: h(11), hasta: h(12) },
      { desde: h(13), hasta: h(15) },
    ]);
  });

  it("hoy no ofrece horas que ya pasaron: empieza en la próxima media hora (QA)", () => {
    // Son las 10:20: el rato de 8 a 12 queda de 10:30 a 12.
    expect(ratosLibres([{ desde: h(8), hasta: h(12) }], [], h(10) + 20)).toEqual([{ desde: h(10) + 30, hasta: h(12) }]);
    // Son las 11:45: quedan 15 minutos, no alcanza para una visita.
    expect(ratosLibres([{ desde: h(8), hasta: h(12) }], [], h(11) + 45)).toEqual([]);
  });

  it("descarta ratos de menos de 30 minutos", () => {
    expect(ratosLibres([{ desde: h(8), hasta: h(9) }], [{ desde: h(8) + 20, hasta: h(9) }])).toEqual([]);
  });
});
