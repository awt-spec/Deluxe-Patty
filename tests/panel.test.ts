import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Cerebro, DecisionAgenda } from "../lib/asistente/cerebro";
import { SIN_CONSUMO } from "../lib/asistente/costo";
import { procesarMensaje, type Dependencias } from "../lib/asistente/procesar";
import type { Corredor } from "../lib/datos/tipos";
import { aprobarBorrador, descartarBorrador, devolverControl, escribirComoCorredor, tomarControl } from "../lib/panel/acciones";
import { enviadorDemo, enviadorSinConfigurar, type EnviadorWhatsApp } from "../lib/whatsapp/enviar";
import { corredorBase, entrante, repoEnMemoria } from "./dobles";

describe("panel: piloto en sombra y toma de control", () => {
  let corredor: Corredor;
  let db: ReturnType<typeof repoEnMemoria>;
  let whatsapp: Record<string, ReturnType<typeof vi.fn>>;
  let cerebro: Record<string, ReturnType<typeof vi.fn>>;
  let ahora: Date;
  let deps: Dependencias;

  beforeEach(() => {
    corredor = { ...corredorBase(), respuesta_automatica: false };
    db = repoEnMemoria(corredor);
    whatsapp = { texto: vi.fn(async () => `wamid.${Math.random()}`), plantilla: vi.fn(async () => "w"), imagen: vi.fn(), documento: vi.fn() };
    cerebro = {
      clasificar: vi.fn(async () => ({ intencion: "consulta_propiedad", tema: "casa", consumo: SIN_CONSUMO })),
      responder: vi.fn(async () => ({ texto: "Hola, sí está disponible.", avisarCorredor: null, consumo: SIN_CONSUMO })),
      agendar: vi.fn(),
    };
    ahora = new Date("2026-10-19T14:00:00Z");
    deps = {
      repo: db.repo,
      cerebro: cerebro as unknown as Cerebro,
      whatsapp: whatsapp as unknown as EnviadorWhatsApp,
      plantillaAviso: "aviso_corredor",
      plantillaRecordatorio: "recordatorio_visita",
      registrar: () => {},
      ahora: () => ahora,
    };
  });

  const borrador = () => db.mensajes.find((m) => m.estado_borrador)!;
  const llega = (texto: string) => procesarMensaje(deps, entrante(texto, { timestamp: ahora }));

  it("aprobar envía el borrador tal cual y no lo envía dos veces", async () => {
    await llega("¿Sigue disponible?");
    expect(whatsapp.texto).not.toHaveBeenCalled();
    expect(await aprobarBorrador(deps, corredor, borrador().id)).toEqual({ ok: true });
    expect(whatsapp.texto).toHaveBeenCalledWith("PNID", "+50688880001", "Hola, sí está disponible.");
    expect(borrador()).toMatchObject({ estado_borrador: "aprobado", estado_entrega: "enviado" });
    expect(await aprobarBorrador(deps, corredor, borrador().id)).toEqual({ ok: false, motivo: "Este borrador ya se resolvió." });
    expect(whatsapp.texto).toHaveBeenCalledTimes(1);
  });

  it("en la demo aprobar simula el envío: queda como enviado sin llamar a Meta", async () => {
    await llega("¿Sigue disponible?");
    const demo = { ...deps, whatsapp: enviadorDemo() };
    expect(await aprobarBorrador(demo, corredor, borrador().id)).toEqual({ ok: true });
    expect(borrador()).toMatchObject({ estado_borrador: "aprobado", estado_entrega: "enviado" });
    expect(String(borrador().wa_message_id)).toMatch(/^demo-/);
    expect(whatsapp.texto).not.toHaveBeenCalled();
  });

  it("sin token de WhatsApp aprobar falla con su mensaje y el borrador sigue pendiente de envío", async () => {
    await llega("¿Sigue disponible?");
    const sinToken = { ...deps, whatsapp: enviadorSinConfigurar() };
    const r = await aprobarBorrador(sinToken, corredor, borrador().id);
    expect(r.ok).toBe(false);
    expect(borrador()).toMatchObject({ estado_entrega: "fallido" });
  });

  it("corregir envía la versión de Patricia y la usa como ejemplo de tono la próxima vez", async () => {
    await llega("¿Sigue disponible?");
    await aprobarBorrador(deps, corredor, borrador().id, "Buenas tardes, con gusto le confirmo que sí está disponible.");
    expect(whatsapp.texto.mock.calls[0][2]).toBe("Buenas tardes, con gusto le confirmo que sí está disponible.");
    expect(borrador().estado_borrador).toBe("corregido");
    expect(db.correcciones).toEqual([
      { original: "Hola, sí está disponible.", corregido: "Buenas tardes, con gusto le confirmo que sí está disponible." },
    ]);
    await llega("¿Y el precio?");
    expect(cerebro.responder.mock.calls[1][4]).toEqual(db.correcciones);
  });

  it("aprobar un borrador de agenda crea la cita; si el horario se ocupó, vuelve a pendiente", async () => {
    cerebro.clasificar.mockResolvedValue({ intencion: "agendar_visita", tema: "visita", consumo: SIN_CONSUMO });
    const decision: DecisionAgenda = {
      accion: "confirmar", horarios: ["H1"], citaId: null, propiedadCodigo: null, mensaje: "", avisarCorredor: null, consumo: SIN_CONSUMO,
    };
    cerebro.agendar.mockResolvedValue(decision);
    await llega("La primera");
    const id = borrador().id;
    expect(db.citas).toHaveLength(0);

    // Alguien ocupa el horario antes de que Patricia apruebe.
    const accion = borrador().accion as { inicio: string; fin: string };
    await db.repo.crearCita({ corredor_id: "c1", contacto_id: "otro", conversacion_id: null, propiedad_id: null, inicio: new Date(accion.inicio), fin: new Date(accion.fin) });
    const r = await aprobarBorrador(deps, corredor, id);
    expect(r).toEqual({ ok: false, motivo: expect.stringContaining("Ese horario ya se ocupó") });
    expect(borrador().estado_borrador).toBe("pendiente");
    expect(whatsapp.texto).not.toHaveBeenCalled();

    db.citas[0].estado = "cancelada";
    expect(await aprobarBorrador(deps, corredor, id)).toEqual({ ok: true });
    expect(db.citas.filter((c) => c.estado === "agendada")).toHaveLength(1);
  });

  it("no envía si pasaron más de 24 horas desde el último mensaje del cliente", async () => {
    await llega("¿Sigue disponible?");
    ahora = new Date(ahora.getTime() + 25 * 60 * 60_000);
    const r = await aprobarBorrador(deps, corredor, borrador().id);
    expect(r).toEqual({ ok: false, motivo: expect.stringContaining("24 horas") });
    expect(borrador().estado_borrador).toBe("pendiente");
  });

  it("descartar no envía nada", async () => {
    await llega("¿Sigue disponible?");
    expect(await descartarBorrador(deps, corredor, borrador().id)).toEqual({ ok: true });
    expect(borrador().estado_borrador).toBe("descartado");
    expect(whatsapp.texto).not.toHaveBeenCalled();
  });

  it("tomar control silencia a la asistente; escribir como Patricia y devolver control", async () => {
    corredor.respuesta_automatica = true;
    await llega("Hola");
    const conv = db.conversaciones[0];
    await tomarControl(deps, corredor, conv.id);
    whatsapp.texto.mockClear();
    expect(await llega("¿Me da su número?")).toEqual({ tipo: "sin_respuesta", motivo: "control_corredor" });

    expect(await escribirComoCorredor(deps, corredor, conv.id, "Claro, soy Patricia. Le llamo ahora.")).toEqual({ ok: true });
    expect(db.mensajes.at(-1)).toMatchObject({ autor: "corredor", contenido: "Claro, soy Patricia. Le llamo ahora." });

    conv.estado = "escalada";
    await devolverControl(deps, corredor, conv.id);
    expect(conv).toMatchObject({ control: "asistente", estado: "abierta" });
    expect(await llega("Gracias")).toMatchObject({ tipo: "respondido" });
  });
});
