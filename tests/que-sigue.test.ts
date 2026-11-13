import { describe, expect, it } from "vitest";
import { agruparPorDia, diasDesde, queSigue, tituloDia, type EntradaQueSigue } from "@/app/panel/clientes/[id]/que-sigue";

// Viernes 13 de noviembre de 2026, 9:00 a. m. en Costa Rica (UTC-6).
const ahora = new Date("2026-11-13T15:00:00Z");
const zona = "America/Costa_Rica";
const h = (horas: number) => new Date(ahora.getTime() + horas * 3_600_000).toISOString();

const base: EntradaQueSigue = {
  ahora,
  zona,
  etapa: "interesado",
  telefono: "+50688001234",
  seguimientoFecha: null,
  seguimientoNota: null,
  visitas: [],
  ofertaMonto: null,
  ofertaMoneda: null,
  diasSinMovimiento: 0,
  sabeQueBusca: true,
  cierreAnotado: false,
  motivoPerdida: null,
  casasQueEncajan: 0,
  tieneCasaInteres: false,
};
const q = (cambios: Partial<EntradaQueSigue>) => queSigue({ ...base, ...cambios });

describe("Qué sigue con un cliente", () => {
  it("el recordatorio de hoy va primero, aunque haya visita, oferta y días quieto", () => {
    const r = q({
      seguimientoFecha: "2026-11-13",
      seguimientoNota: "Llamarla por la contraoferta",
      visitas: [{ id: "v1", inicio: h(24), fin: h(25), estado: "confirmada", casa: null }],
      ofertaMonto: 400000,
      diasSinMovimiento: 9,
    });
    expect(r.motivo).toBe("recordatorio");
    expect(r.urgente).toBe(true);
    expect(r.titulo).toBe("Hoy toca: Llamarla por la contraoferta");
    expect(r.accion.tipo).toBe("llamar");
    expect(r.accion.href).toBe("tel:+50688001234");
    expect(r.otra?.href).toBe("#recordatorio");
  });

  it("un recordatorio atrasado dice para cuándo era y propone WhatsApp si no es llamar", () => {
    const r = q({ seguimientoFecha: "2026-11-10", seguimientoNota: "mandarle fotos" });
    expect(r.titulo).toBe("Quedó pendiente: mandarle fotos");
    expect(r.detalle).toBe("Era para el martes 10 de noviembre.");
    expect(r.accion).toMatchObject({ tipo: "whatsapp", href: "https://wa.me/50688001234", externo: true });
  });

  it("un recordatorio a futuro no es urgente: todo al día, con la fecha", () => {
    const r = q({ seguimientoFecha: "2026-11-14", seguimientoNota: "escribirle" });
    expect(r.motivo).toBe("al-dia");
    expect(r.detalle).toBe("Tu recordatorio es mañana: escribirle.");
  });

  it("la visita que viene, con la fecha armada por el código y enlace a la visita", () => {
    const r = q({
      visitas: [
        { id: "lejos", inicio: h(24 * 5), fin: h(24 * 5 + 1), estado: "agendada", casa: null },
        { id: "cerca", inicio: h(24 + 3), fin: h(24 + 4), estado: "agendada", casa: "Casa en Lindora" },
        { id: "cancelada", inicio: h(2), fin: h(3), estado: "cancelada", casa: null },
      ],
      ofertaMonto: 400000,
    });
    expect(r.motivo).toBe("visita-proxima");
    expect(r.titulo).toBe("Visita mañana a las 12:00 p. m.");
    expect(r.detalle).toBe("Casa en Lindora · Falta confirmarla");
    expect(r.accion).toMatchObject({ texto: "Confirmar la visita", href: "/panel/agenda/visita/cerca" });
    expect(r.urgente).toBe(false);
  });

  it("una visita de otro día lleva el día y la hora; la de hoy es urgente", () => {
    expect(q({ visitas: [{ id: "v", inicio: h(24 * 2), fin: null, estado: "confirmada", casa: null }] }).titulo).toBe(
      "Visita el domingo 15 de noviembre a las 9:00 a. m.",
    );
    const hoy = q({ visitas: [{ id: "v", inicio: h(5), fin: null, estado: "confirmada", casa: null }] });
    expect(hoy.titulo).toBe("Visita hoy a las 2:00 p. m.");
    expect(hoy.urgente).toBe(true);
    expect(hoy.accion.texto).toBe("Ver la visita");
  });

  it("una visita que pasó sin anotar pregunta cómo salió", () => {
    const r = q({ visitas: [{ id: "p", inicio: h(-20), fin: h(-19), estado: "confirmada", casa: "Casa en Escazú" }], ofertaMonto: 300000 });
    expect(r.motivo).toBe("visita-sin-resultado");
    expect(r.titulo).toBe("¿Cómo salió la visita?");
    expect(r.detalle).toContain("Fue ayer · Casa en Escazú");
    expect(r.accion.href).toBe("/panel/agenda/visita/p");
  });

  it("una visita hecha o muy vieja no se pregunta", () => {
    const visitas = [
      { id: "hecha", inicio: h(-20), fin: h(-19), estado: "realizada", casa: null },
      { id: "vieja", inicio: h(-24 * 30), fin: h(-24 * 30 + 1), estado: "agendada", casa: null },
    ];
    expect(q({ visitas }).motivo).not.toBe("visita-sin-resultado");
  });

  it("con oferta: llamarlo, con el monto en su moneda", () => {
    const r = q({ etapa: "negociando", ofertaMonto: 85000000, ofertaMoneda: "CRC", diasSinMovimiento: 8 });
    expect(r.motivo).toBe("oferta");
    expect(r.titulo).toBe("Ofreció ₡85.000.000: llámalo por la oferta");
    expect(r.accion.tipo).toBe("llamar");
  });

  it("sin movimiento desde hace 3 días o más: escribirle", () => {
    expect(q({ diasSinMovimiento: 2 }).motivo).not.toBe("sin-movimiento");
    const r = q({ diasSinMovimiento: 4 });
    expect(r.motivo).toBe("sin-movimiento");
    expect(r.titulo).toBe("Lleva 4 días sin movimiento");
    expect(r.accion.tipo).toBe("whatsapp");
  });

  it("nuevo sin qué busca: preguntárselo", () => {
    const r = q({ etapa: "nuevo", sabeQueBusca: false });
    expect(r.motivo).toBe("que-busca");
    expect(r.titulo).toBe("Pregúntale qué busca");
    expect(r.otra?.href).toBe("#busca");
  });

  it("con casas que le encajan y sin casa elegida: ofrecérselas", () => {
    expect(q({ casasQueEncajan: 3 }).titulo).toBe("Tienes 3 casas que le encajan");
    expect(q({ casasQueEncajan: 3, tieneCasaInteres: true }).motivo).toBe("al-dia");
  });

  it("cerrado: anotar el cierre si falta; si no, felicitar. Nada de visitas ni días quieto", () => {
    const sinPrecio = q({ etapa: "cerrado", diasSinMovimiento: 20, visitas: [{ id: "v", inicio: h(24), fin: null, estado: "confirmada", casa: null }] });
    expect(sinPrecio).toMatchObject({ motivo: "cierre", titulo: "Anota cómo cerró", urgente: true });
    expect(sinPrecio.accion.href).toBe("#cierre");
    expect(q({ etapa: "cerrado", cierreAnotado: true, diasSinMovimiento: 20 }).titulo).toBe("Cerró. ¡Felicidades!");
  });

  it("perdido: dice por qué y no insiste con días quieto", () => {
    const r = q({ etapa: "perdido", motivoPerdida: "Compró con otro corredor", diasSinMovimiento: 30 });
    expect(r.motivo).toBe("perdido");
    expect(r.titulo).toBe("Se perdió: compró con otro corredor");
  });
});

describe("Días de la ficha", () => {
  it("cuenta días completos y nunca negativos", () => {
    expect(diasDesde(h(-49), ahora)).toBe(2);
    expect(diasDesde(h(5), ahora)).toBe(0);
    expect(diasDesde(null, ahora)).toBe(0);
  });

  it("titula los días como Hoy, Ayer o la fecha, en la zona del corredor", () => {
    expect(tituloDia(new Date(h(-1)), ahora, zona)).toBe("Hoy");
    // 1:00 a. m. del 13 en UTC es todavía el 12 en Costa Rica.
    expect(tituloDia(new Date("2026-11-13T01:00:00Z"), ahora, zona)).toBe("Ayer");
    expect(tituloDia(new Date(h(-24 * 4)), ahora, zona)).toBe("lunes 9 de noviembre");
  });

  it("agrupa la historia por día sin cambiar el orden", () => {
    const eventos = [h(-1), h(-2), h(-30), h(-24 * 4)].map((t) => ({ cuando: new Date(t) }));
    const grupos = agruparPorDia(eventos, ahora, zona);
    expect(grupos.map((g) => [g.titulo, g.eventos.length])).toEqual([
      ["Hoy", 2],
      ["Ayer", 1],
      ["lunes 9 de noviembre", 1],
    ]);
  });
});
