import { beforeEach, describe, expect, it, vi } from "vitest";
import { claveSeguimiento, preguntarPorVisitas, puedeSerResumen, resultadoDeVisita } from "../lib/agenda/seguimiento-visitas";
import type { Cerebro } from "../lib/asistente/cerebro";
import { SIN_CONSUMO } from "../lib/asistente/costo";
import { conversacionDelCorredor } from "../lib/asistente/corredor";
import { procesarMensaje, type Dependencias } from "../lib/asistente/procesar";
import type { Corredor } from "../lib/datos/tipos";
import type { EnviadorWhatsApp } from "../lib/whatsapp/enviar";
import { PATRICIA, corredorBase, entrante, repoEnMemoria } from "./dobles";

// Costa Rica es UTC-6. La visita es de 3:00 a 4:00 p. m. del martes 20 de octubre (21:00–22:00 UTC).
const INICIO = new Date("2026-10-20T21:00:00Z");
const FIN = new Date("2026-10-20T22:00:00Z");

describe("seguimiento de visitas", () => {
  let corredor: Corredor;
  let db: ReturnType<typeof repoEnMemoria>;
  let whatsapp: Record<string, ReturnType<typeof vi.fn>>;
  let cerebro: Record<string, ReturnType<typeof vi.fn>>;
  let deps: Dependencias;
  let ahora: Date;
  let citaId: string;

  const reloj = (iso: string) => {
    ahora = new Date(iso);
    db.reloj.ahora = ahora;
  };
  const textos = () => whatsapp.texto.mock.calls.map((c) => c[2] as string);
  const plantillas = () => whatsapp.plantilla.mock.calls.map((c) => (c[3] as string[])[0]);
  const dePatricia = (texto: string) => procesarMensaje(deps, entrante(texto, { telefono: PATRICIA, timestamp: ahora }));
  /** Patricia escribió hace poco: la ventana de 24 horas está abierta. */
  const abrirVentana = async () => {
    const conv = await conversacionDelCorredor(deps, corredor);
    db.conversaciones.find((c) => c.id === conv.id)!.ultimo_mensaje_cliente_at = new Date(ahora.getTime() - 60 * 60_000).toISOString();
  };
  const cita = () => db.citas.find((c) => c.id === citaId)!;

  beforeEach(async () => {
    corredor = corredorBase();
    db = repoEnMemoria(corredor);
    whatsapp = { texto: vi.fn(async () => "w"), plantilla: vi.fn(async () => "w"), imagen: vi.fn(async () => "w"), documento: vi.fn(async () => "w") };
    cerebro = { analizar: vi.fn(async () => ({ texto: "Análisis", avisarCorredor: null, consumo: SIN_CONSUMO })) };
    ahora = new Date("2026-10-20T23:00:00Z");
    deps = {
      repo: db.repo,
      cerebro: cerebro as unknown as Cerebro,
      whatsapp: whatsapp as unknown as EnviadorWhatsApp,
      plantillaAviso: "aviso_corredor",
      plantillaRecordatorio: "recordatorio_visita",
      registrar: () => {},
      ahora: () => ahora,
    };
    db.contactos.push({ id: "rob", corredor_id: "c1", telefono: "+50688881111", nombre: "Robert Miller" });
    db.propiedades.push({
      id: "p1", codigo: "DP-01", titulo: "Casa Lindora", tipo: "casa", operacion: "venta", precio: 1, moneda: "USD",
      provincia: null, canton: null, distrito: null, zona: null, habitaciones: null, banos: null,
      m2_construccion: null, m2_terreno: null, descripcion: null, amenidades: [], url_e24: null, estado: "activa", fotos: [],
    });
    citaId = (await db.repo.crearCita({ corredor_id: "c1", contacto_id: "rob", conversacion_id: null, propiedad_id: "p1", inicio: INICIO, fin: FIN }))!;
    reloj("2026-10-20T23:00:00Z"); // 5:00 p. m.
  });

  it("pregunta una sola vez por visita, con hora, cliente y casa armados por el código", async () => {
    await abrirVentana();
    expect(await preguntarPorVisitas(deps)).toEqual({ preguntadas: 1, fallidos: 0 });
    expect(textos()).toEqual([
      "¿Cómo te fue en la visita de las 3:00 p. m. con Robert Miller (Casa Lindora)? Cuéntame en un mensaje o nota de voz y lo anoto en su historia. Si no se hizo, respóndeme «no vino» o «se canceló».",
    ]);
    expect(db.alertas.has(claveSeguimiento(citaId))).toBe(true);
    reloj("2026-10-21T00:00:00Z");
    expect(await preguntarPorVisitas(deps)).toEqual({ preguntadas: 0, fallidos: 0 });
    expect(whatsapp.texto).toHaveBeenCalledTimes(1);
  });

  it("no pregunta antes de 30 minutos del fin", async () => {
    reloj("2026-10-20T22:20:00Z");
    expect((await preguntarPorVisitas(deps)).preguntadas).toBe(0);
  });

  it("con la ventana cerrada sale la plantilla corta, sin el nombre del cliente", async () => {
    await preguntarPorVisitas(deps);
    expect(whatsapp.texto).not.toHaveBeenCalled();
    expect(plantillas()).toEqual(["Tu visita de las 3:00 p. m. ya terminó. Respóndeme cómo te fue y lo anoto en la historia del cliente."]);
    expect(plantillas()[0]).not.toContain("Robert");
  });

  it("de noche no pregunta: espera a la mañana", async () => {
    cita().estado = "cancelada"; // se deja solo la visita de la noche
    const noche = await db.repo.crearCita({
      corredor_id: "c1", contacto_id: "rob", conversacion_id: null, propiedad_id: null,
      inicio: new Date("2026-10-21T02:00:00Z"), fin: new Date("2026-10-21T03:00:00Z"), // 8:00–9:00 p. m.
    });
    reloj("2026-10-21T03:40:00Z"); // 9:40 p. m.
    expect((await preguntarPorVisitas(deps)).preguntadas).toBe(0);
    reloj("2026-10-21T06:00:00Z"); // medianoche
    expect((await preguntarPorVisitas(deps)).preguntadas).toBe(0);
    reloj("2026-10-21T13:10:00Z"); // 7:10 a. m.
    expect((await preguntarPorVisitas(deps)).preguntadas).toBe(1);
    expect(db.alertas.has(claveSeguimiento(noche!))).toBe(true);
  });

  it("no pregunta por visitas canceladas ni ya marcadas", async () => {
    cita().estado = "cancelada";
    expect((await preguntarPorVisitas(deps)).preguntadas).toBe(0);
    cita().estado = "realizada";
    expect((await preguntarPorVisitas(deps)).preguntadas).toBe(0);
    expect(whatsapp.plantilla).not.toHaveBeenCalled();
  });

  it("la demo (corredor inactivo) nunca pregunta", async () => {
    corredor.activo = false;
    expect((await preguntarPorVisitas(deps)).preguntadas).toBe(0);
    expect(whatsapp.texto).not.toHaveBeenCalled();
    expect(whatsapp.plantilla).not.toHaveBeenCalled();
  });

  it("la respuesta queda en la historia, la visita como hecha y un recordatorio para mañana", async () => {
    await abrirVentana();
    await preguntarPorVisitas(deps);
    reloj("2026-10-21T00:30:00Z");
    const r = await dePatricia("Le encantó la cocina, pero quiere negociar el precio. Vuelve con su esposa el sábado.");
    expect(r).toEqual({ tipo: "corredor", accion: "seguimiento" });
    expect(cita().estado).toBe("realizada");
    expect(db.actividades.map((a) => [a.tipo, a.texto, a.autor])).toEqual([
      ["visita", "Fue a ver la casa Casa Lindora", "asistente"],
      ["nota", "Cómo fue la visita: Le encantó la cocina, pero quiere negociar el precio. Vuelve con su esposa el sábado.", "corredor"],
    ]);
    expect(db.actividades.every((a) => a.corredor_id === "c1" && a.contacto_id === "rob")).toBe(true);
    const rob = db.contactos.find((c) => c.id === "rob")!;
    expect(rob.seguimiento_fecha).toBe("2026-10-21");
    expect(textos().at(-1)).toBe("Listo, lo anoté en la historia de Robert. Mañana te recuerdo darle seguimiento.");
    expect(cerebro.analizar).not.toHaveBeenCalled();
    // Ya respondida: el siguiente mensaje va al análisis de siempre.
    await dePatricia("Y qué tal se ve el mercado en Santa Ana esta semana");
    expect(cerebro.analizar).toHaveBeenCalledTimes(1);
  });

  it('"no vino" deja la visita como que no llegó, sin recordatorio', async () => {
    await abrirVentana();
    await preguntarPorVisitas(deps);
    const r = await dePatricia("No vino");
    expect(r).toEqual({ tipo: "corredor", accion: "seguimiento" });
    expect(cita().estado).toBe("no_asistio");
    expect(db.actividades.map((a) => a.texto)).toEqual(["No llegó a la visita a Casa Lindora"]);
    expect(db.contactos.find((c) => c.id === "rob")!.seguimiento_fecha).toBeUndefined();
    expect(textos().at(-1)).toBe("Anotado: no llegó a la visita de las 3:00 p. m. (Casa Lindora). Lo dejé en la historia de Robert.");
  });

  it('"se canceló" la deja cancelada', async () => {
    await abrirVentana();
    await preguntarPorVisitas(deps);
    await dePatricia("Se canceló, me escribió que le salió un viaje");
    expect(cita().estado).toBe("cancelada");
  });

  it("un enlace, un comando o una pregunta con la pregunta pendiente siguen su camino", async () => {
    await abrirVentana();
    await preguntarPorVisitas(deps);
    const r = await dePatricia("Analízame esta https://www.encuentra24.com/costa-rica-es/x/123");
    expect(r).toEqual({ tipo: "corredor", accion: "analisis" });
    expect(cerebro.analizar).toHaveBeenCalledTimes(1);
    expect(await dePatricia("plan")).toEqual({ tipo: "corredor", accion: "plan" });
    await dePatricia("¿Cuánto vale el m2 en Escazú?");
    expect(cerebro.analizar).toHaveBeenCalledTimes(2);
    expect(cita().estado).toBe("agendada");
    expect(db.actividades).toEqual([]);
  });

  it("sin pregunta hecha, el mensaje no se toma como resumen", async () => {
    await abrirVentana();
    await dePatricia("Le encantó la casa");
    expect(cita().estado).toBe("agendada");
    expect(cerebro.analizar).toHaveBeenCalledTimes(1);
  });

  it("la pregunta vence a las 36 horas", async () => {
    await abrirVentana();
    await preguntarPorVisitas(deps);
    reloj("2026-10-22T12:00:00Z");
    await abrirVentana();
    await dePatricia("Le encantó la casa");
    expect(cita().estado).toBe("agendada");
  });

  it("nunca toca la visita de otro corredor", async () => {
    db.contactos.push({ id: "otro", corredor_id: "c2", telefono: "+50688882222", nombre: "Otra Persona" });
    db.citas.push({
      id: "ajena", corredor_id: "c2", contacto_id: "otro", conversacion_id: null, propiedad_id: null,
      inicio: new Date("2026-10-20T20:00:00Z"), fin: new Date("2026-10-20T21:00:00Z"),
      estado: "agendada", recordatorio: false, creada: new Date(0),
    });
    // Aunque alguien hubiera preguntado por ella, la respuesta de Patricia no la alcanza.
    db.alertas.set(claveSeguimiento("ajena"), new Date("2026-10-20T23:30:00Z"));
    await abrirVentana();
    expect((await preguntarPorVisitas(deps)).preguntadas).toBe(1);
    expect(textos().join(" ")).not.toContain("Otra");
    reloj("2026-10-20T23:45:00Z");
    await dePatricia("Le encantó la casa");
    expect(db.citas.find((c) => c.id === "ajena")!.estado).toBe("agendada");
    expect(cita().estado).toBe("realizada");
    expect(db.actividades.some((a) => a.corredor_id === "c2" || a.contacto_id === "otro")).toBe(false);
  });

  it("con dos visitas pendientes anota en la última preguntada y avisa de la otra", async () => {
    await db.repo.crearCita({
      corredor_id: "c1", contacto_id: "rob", conversacion_id: null, propiedad_id: null,
      inicio: new Date("2026-10-20T19:00:00Z"), fin: new Date("2026-10-20T20:00:00Z"), // 1:00 p. m.
    });
    await abrirVentana();
    expect((await preguntarPorVisitas(deps)).preguntadas).toBe(2);
    await dePatricia("Muy bien, quiere hacer una oferta");
    expect(cita().estado).toBe("realizada");
    expect(textos().at(-1)).toBe(
      "Listo, lo anoté en la historia de Robert (visita de las 3:00 p. m. a Casa Lindora). Mañana te recuerdo darle seguimiento. " +
        "Todavía me falta saber cómo te fue en la visita de las 1:00 p. m. con Robert Miller.",
    );
  });
});

describe("reglas del seguimiento", () => {
  it("detecta el resultado con código", () => {
    expect(resultadoDeVisita("No vino")).toBe("no_asistio");
    expect(resultadoDeVisita("no llegó nadie, me dejó plantada")).toBe("no_asistio");
    expect(resultadoDeVisita("Se canceló.")).toBe("cancelada");
    expect(resultadoDeVisita("No se hizo, la pospusimos")).toBe("cancelada");
    expect(resultadoDeVisita("Llegó tarde pero le gustó")).toBe("realizada");
    expect(resultadoDeVisita("no llegó a tiempo pero la vimos")).toBe("realizada");
  });

  it("no toma como resumen comandos, enlaces, preguntas, acuses ni adjuntos", () => {
    for (const t of ["plan", "ficha DP-01", "fotos DP-01", "https://x.com", "¿Qué opinas?", "ok", "Dale", "gracias!", "bloquear mañana en la tarde", "Analízame esta casa"]) {
      expect(puedeSerResumen(t, false), t).toBe(false);
    }
    expect(puedeSerResumen("Le gustó mucho", true)).toBe(false);
    expect(puedeSerResumen("Le gustó mucho, vuelve el sábado", false)).toBe(true);
  });
});
