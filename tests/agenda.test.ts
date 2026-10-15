import { beforeEach, describe, expect, it, vi } from "vitest";
import { enviarRecordatorios } from "../lib/agenda/recordatorios";
import type { Cerebro, DecisionAgenda } from "../lib/asistente/cerebro";
import { SIN_CONSUMO } from "../lib/asistente/costo";
import { procesarMensaje, type Dependencias } from "../lib/asistente/procesar";
import type { Corredor } from "../lib/datos/tipos";
import type { EnviadorWhatsApp } from "../lib/whatsapp/enviar";
import { PATRICIA, corredorBase, entrante, repoEnMemoria } from "./dobles";

// Lunes 19 de octubre de 2026, 8:00 en Costa Rica. Horario lunes a viernes 8–17, anticipación 3 h.
const AHORA = new Date("2026-10-19T14:00:00Z");
const local = (iso: string) => new Date(`${iso}-06:00`);

function decision(d: Partial<DecisionAgenda>): DecisionAgenda {
  return {
    accion: "proponer",
    horarios: [],
    citaId: null,
    propiedadCodigo: null,
    mensaje: "",
    avisarCorredor: null,
    consumo: SIN_CONSUMO,
    ...d,
  };
}

describe("agenda por WhatsApp", () => {
  let corredor: Corredor;
  let db: ReturnType<typeof repoEnMemoria>;
  let whatsapp: { texto: ReturnType<typeof vi.fn>; plantilla: ReturnType<typeof vi.fn> };
  let cerebro: { clasificar: ReturnType<typeof vi.fn>; responder: ReturnType<typeof vi.fn>; agendar: ReturnType<typeof vi.fn> };
  let deps: Dependencias;

  beforeEach(() => {
    corredor = corredorBase();
    db = repoEnMemoria(corredor);
    whatsapp = { texto: vi.fn(async () => "wamid.out"), plantilla: vi.fn(async () => "wamid.p") };
    cerebro = {
      clasificar: vi.fn(async () => ({ intencion: "agendar_visita", tema: "visita", consumo: SIN_CONSUMO })),
      responder: vi.fn(),
      agendar: vi.fn(async () => decision({})),
    };
    deps = {
      repo: db.repo,
      cerebro: cerebro as unknown as Cerebro,
      whatsapp: whatsapp as unknown as EnviadorWhatsApp,
      plantillaAviso: "aviso_corredor",
      plantillaRecordatorio: "recordatorio_visita",
      registrar: () => {},
      ahora: () => AHORA,
    };
  });

  const textoEnviado = () => whatsapp.texto.mock.calls.at(-1)![2] as string;

  it("propone dos horarios armados por el sistema, no por el modelo", async () => {
    const r = await procesarMensaje(deps, entrante("Quiero ver la casa"));
    expect(r).toEqual({ tipo: "agenda", accion: "propuesto", borrador: false });
    expect(textoEnviado()).toBe(
      "Con gusto, tengo estos espacios:\n\n1. Lunes 19 de octubre, 11:00 a. m.\n2. Martes 20 de octubre, 8:00 a. m.\n\n¿Cuál te queda mejor?",
    );
    const contexto = cerebro.agendar.mock.calls[0][2];
    expect(contexto.libres[0]).toEqual({ id: "H1", etiqueta: "lunes 19 de octubre, 11:00 a. m." });
  });

  it("usa los horarios que eligió el modelo según la preferencia del cliente", async () => {
    cerebro.agendar.mockResolvedValueOnce(decision({ horarios: ["H4", "H5"], mensaje: "En la tarde tengo:" }));
    await procesarMensaje(deps, entrante("Puedo en la tarde"));
    expect(textoEnviado()).toContain("1. Lunes 19 de octubre, 2:00 p. m.\n2. Lunes 19 de octubre, 3:00 p. m.");
  });

  it("confirma: crea la cita, avisa al cliente y a Patricia", async () => {
    cerebro.agendar.mockResolvedValueOnce(decision({ accion: "confirmar", horarios: ["H1"] }));
    const r = await procesarMensaje(deps, entrante("La primera"));
    expect(r).toEqual({ tipo: "agenda", accion: "agendado", borrador: false });
    expect(db.citas).toHaveLength(1);
    expect(db.citas[0]).toMatchObject({ inicio: local("2026-10-19T11:00"), fin: local("2026-10-19T12:00"), estado: "agendada" });
    expect(textoEnviado()).toContain("quedó agendada tu visita el lunes 19 de octubre, 11:00 a. m.");
    expect(textoEnviado()).not.toContain("recordatorio"); // es hoy: no se promete recordatorio
    expect(whatsapp.plantilla).toHaveBeenCalledWith("PNID", PATRICIA, "aviso_corredor", [
      expect.stringContaining("Nueva visita"),
    ]);
  });

  it("si el modelo da un id inexistente, no inventa: vuelve a proponer", async () => {
    cerebro.agendar.mockResolvedValueOnce(decision({ accion: "confirmar", horarios: ["H999"] }));
    const r = await procesarMensaje(deps, entrante("El domingo a las 6"));
    expect(r).toMatchObject({ accion: "propuesto" });
    expect(db.citas).toHaveLength(0);
    expect(textoEnviado()).toContain("Ese horario no lo tengo libre");
  });

  it("si el horario se ocupó al confirmar, propone otros", async () => {
    // Otra visita entra a la misma hora justo antes de insertar.
    const original = db.repo.crearCita;
    db.repo.crearCita = async (c) => {
      await original({ ...c, contacto_id: "otro" });
      return original(c);
    };
    cerebro.agendar.mockResolvedValueOnce(decision({ accion: "confirmar", horarios: ["H1"] }));
    const r = await procesarMensaje(deps, entrante("La primera"));
    expect(r).toMatchObject({ accion: "propuesto" });
    expect(textoEnviado()).toContain("Ese espacio se acaba de ocupar");
    expect(textoEnviado()).not.toContain("11:00 a. m.");
  });

  it("reprogramar cancela la cita anterior", async () => {
    cerebro.agendar.mockResolvedValueOnce(decision({ accion: "confirmar", horarios: ["H1"] }));
    await procesarMensaje(deps, entrante("La primera"));
    cerebro.agendar.mockResolvedValueOnce(decision({ accion: "confirmar", horarios: ["H3"], citaId: "C1" }));
    await procesarMensaje(deps, entrante("Mejor más tarde"));
    expect(db.citas.map((c) => c.estado)).toEqual(["cancelada", "agendada"]);
    expect(whatsapp.plantilla.mock.calls.at(-1)![3][0]).toContain("Visita reprogramada");
  });

  it("cancela una visita del cliente", async () => {
    cerebro.agendar.mockResolvedValueOnce(decision({ accion: "confirmar", horarios: ["H1"] }));
    await procesarMensaje(deps, entrante("La primera"));
    cerebro.agendar.mockResolvedValueOnce(decision({ accion: "cancelar", citaId: "C1" }));
    const r = await procesarMensaje(deps, entrante("Ya no puedo ir"));
    expect(r).toMatchObject({ accion: "cancelado" });
    expect(db.citas[0].estado).toBe("cancelada");
    expect(whatsapp.plantilla.mock.calls.at(-1)![3][0]).toContain("Visita cancelada");
  });

  it("en piloto en sombra no crea la cita: la deja como acción del borrador", async () => {
    corredor.respuesta_automatica = false;
    cerebro.agendar.mockResolvedValueOnce(decision({ accion: "confirmar", horarios: ["H2"] }));
    const r = await procesarMensaje(deps, entrante("La segunda"));
    expect(r).toEqual({ tipo: "agenda", accion: "agendado", borrador: true });
    expect(db.citas).toHaveLength(0);
    expect(whatsapp.texto).not.toHaveBeenCalled();
    expect(db.mensajes.at(-1)).toMatchObject({
      estado_borrador: "pendiente",
      accion: { tipo: "crear_cita", inicio: local("2026-10-19T12:00").toISOString() },
    });
  });

  it("sin horarios libres, pasa a Patricia", async () => {
    db.repo.datosAgenda = async () => ({ horarios: [], bloqueos: [], citas: [] });
    const r = await procesarMensaje(deps, entrante("Quiero ver la casa"));
    expect(r).toMatchObject({ tipo: "escalado" });
    expect(cerebro.agendar).not.toHaveBeenCalled();
    expect(whatsapp.plantilla.mock.calls[0][3][0]).toContain("no hay horarios libres");
  });
});

describe("recordatorios", () => {
  it("recuerda una vez las visitas de mañana agendadas con anticipación", async () => {
    const db = repoEnMemoria(corredorBase());
    const plantilla = vi.fn(async () => "wamid.r");
    const ahora = local("2026-10-20T10:00");
    await db.repo.crearCita({
      corredor_id: "c1",
      contacto_id: "ct1",
      conversacion_id: "cv1",
      propiedad_id: null,
      inicio: local("2026-10-21T09:00"),
      fin: local("2026-10-21T10:00"),
    });
    const deps = {
      repo: db.repo,
      whatsapp: { texto: vi.fn(), plantilla } as unknown as EnviadorWhatsApp,
      plantillaRecordatorio: "recordatorio_visita",
      registrar: () => {},
      ahora: () => ahora,
    };
    expect(await enviarRecordatorios(deps)).toEqual({ enviados: 1, fallidos: 0 });
    expect(plantilla).toHaveBeenCalledWith("PNID", "+50688880001", "recordatorio_visita", [
      "Patricia",
      "miércoles 21 de octubre, 9:00 a. m.",
      "la propiedad",
    ]);
    expect(await enviarRecordatorios(deps)).toEqual({ enviados: 0, fallidos: 0 });
  });

  it("no recuerda visitas agendadas el mismo día", async () => {
    const db = repoEnMemoria(corredorBase());
    await db.repo.crearCita({
      corredor_id: "c1",
      contacto_id: "ct1",
      conversacion_id: "cv1",
      propiedad_id: null,
      inicio: local("2026-10-21T09:00"),
      fin: local("2026-10-21T10:00"),
    });
    db.citas[0].creada = local("2026-10-20T20:00");
    const plantilla = vi.fn(async () => "wamid.r");
    const r = await enviarRecordatorios({
      repo: db.repo,
      whatsapp: { texto: vi.fn(), plantilla } as unknown as EnviadorWhatsApp,
      plantillaRecordatorio: "recordatorio_visita",
      registrar: () => {},
      ahora: () => local("2026-10-20T22:00"),
    });
    expect(r.enviados).toBe(0);
    expect(plantilla).not.toHaveBeenCalled();
  });
});
