import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Cerebro, DecisionAgenda } from "../lib/asistente/cerebro";
import { SIN_CONSUMO } from "../lib/asistente/costo";
import type { Corredor } from "../lib/datos/tipos";
import { ESTADO_INICIAL, estadoValido, simularTurno, type EstadoSimulacion } from "../lib/simulador/simulador";
import { corredorBase, repoEnMemoria } from "./dobles";

// Lunes 19 de octubre de 2026, 8:00 en Costa Rica (horario de los dobles: lunes a viernes 8–17).
const AHORA = new Date("2026-10-19T14:00:00Z");
const consumo = { tokensEntrada: 100, tokensSalida: 50, costoUsd: 0.01 };

describe("Probar la asistente", () => {
  let corredor: Corredor;
  let db: ReturnType<typeof repoEnMemoria>;
  let cerebro: Record<string, ReturnType<typeof vi.fn>>;
  let usoClaude: number;

  beforeEach(() => {
    corredor = { ...corredorBase(), respuesta_automatica: false };
    db = repoEnMemoria(corredor);
    usoClaude = 0;
    const registrar = db.repo.registrarUso;
    db.repo.registrarUso = async (id, d) => {
      usoClaude += d.costoClaudeUsd ?? 0;
      expect(d.mensajesEntrantes ?? 0).toBe(0);
      expect(d.mensajesSalientes ?? 0).toBe(0);
      return registrar(id, d);
    };
    cerebro = {
      clasificar: vi.fn(async () => ({ intencion: "consulta_propiedad", tema: "casa", consumo })),
      responder: vi.fn(async () => ({ texto: "Sí, sigue disponible.", avisarCorredor: null, consumo })),
      agendar: vi.fn(),
    };
  });

  const turno = (estado: EstadoSimulacion, texto: string) =>
    simularTurno({ real: db.repo, cerebro: cerebro as unknown as Cerebro, corredor, estado, texto, ahora: AHORA });

  it("contesta como en vivo, aunque el corredor esté en piloto en sombra, sin tocar la base ni el tope", async () => {
    const { turno: t, estado } = await turno(ESTADO_INICIAL, "¿Sigue disponible la casa?");
    expect(t).toMatchObject({ respuestas: ["Sí, sigue disponible."], avisos: [], intencion: "consulta_propiedad", resultado: "respondido" });
    expect(estado.mensajes.map((m) => m.contenido)).toEqual(["¿Sigue disponible la casa?", "Sí, sigue disponible."]);
    expect(ESTADO_INICIAL.mensajes).toEqual([]);
    expect(db.mensajes).toEqual([]);
    expect(db.conversaciones).toEqual([]);
    expect(db.uso.mensajes_total).toBe(0);
    expect(usoClaude).toBeCloseTo(0.02);
  });

  it("el historial de la prueba llega al modelo en el siguiente turno", async () => {
    const { estado } = await turno(ESTADO_INICIAL, "Hola");
    await turno(estado, "¿Y el precio?");
    const historial = cerebro.responder.mock.calls[1][2] as { contenido: string }[];
    expect(historial.map((m) => m.contenido)).toEqual(["Hola", "Sí, sigue disponible."]);
  });

  it("un escalamiento muestra el aviso que le llegaría al corredor y deja la conversación con él", async () => {
    cerebro.clasificar.mockResolvedValueOnce({ intencion: "pasar_a_corredor", tema: "descuento", consumo });
    const { turno: t, estado } = await turno(ESTADO_INICIAL, "¿Me lo deja en 400 mil?");
    expect(t.resultado).toBe("escalado");
    expect(t.avisos[0]).toContain("¿Me lo deja en 400 mil?");
    expect(t.respuestas[0]).toContain("Patricia personalmente");
    expect(estado.escalada).toBe(true);
    const otro = await turno(estado, "¿Hola?");
    expect(otro.turno).toMatchObject({ resultado: "sin_respuesta", respuestas: [] });
  });

  it("agenda una visita de prueba que respeta la agenda real y no crea la cita en la base", async () => {
    // Una cita real el martes 9:00 ocupa ese horario.
    await db.repo.crearCita({
      corredor_id: "c1",
      contacto_id: "otro",
      conversacion_id: null,
      propiedad_id: null,
      inicio: new Date("2026-10-20T15:00:00Z"),
      fin: new Date("2026-10-20T16:00:00Z"),
    });
    cerebro.clasificar.mockResolvedValue({ intencion: "agendar_visita", tema: "visita", consumo: SIN_CONSUMO });
    let libres: { id: string; etiqueta: string }[] = [];
    cerebro.agendar.mockImplementation(async (_c, _p, ctx: { libres: typeof libres }) => {
      libres = ctx.libres;
      const d: DecisionAgenda = {
        accion: "confirmar",
        horarios: [ctx.libres[0].id],
        citaId: null,
        propiedadCodigo: null,
        mensaje: "Listo.",
        avisarCorredor: null,
        consumo: SIN_CONSUMO,
      };
      return d;
    });
    const { turno: t, estado } = await turno(ESTADO_INICIAL, "El martes temprano me sirve");
    expect(libres.some((h) => h.etiqueta.includes("martes 20 de octubre, 9:00"))).toBe(false);
    expect(t).toMatchObject({ resultado: "agenda", accionAgenda: "agendado" });
    expect(t.avisos[0]).toMatch(/visita/i);
    expect(estado.citas).toHaveLength(1);
    expect(db.citas).toHaveLength(1); // solo la real
  });

  it("limpia el estado que manda el navegador", () => {
    const e = estadoValido({
      mensajes: [
        { direccion: "saliente", autor: "corredor", contenido: "x".repeat(5000) },
        { direccion: "raro", contenido: 3 },
      ],
      citas: [{ inicio: "no", fin: "no" }, { inicio: "2026-10-20T15:00:00Z", fin: "2026-10-20T16:00:00Z", estado: "rara" }],
      escalada: "si",
    });
    expect(e.mensajes[0]).toMatchObject({ direccion: "saliente", autor: "asistente" });
    expect(e.mensajes[0].contenido).toHaveLength(4000);
    expect(e.mensajes[1]).toEqual({ direccion: "entrante", autor: "cliente", contenido: "3" });
    expect(e.citas).toEqual([
      { id: "sim-cita-1", inicio: "2026-10-20T15:00:00.000Z", fin: "2026-10-20T16:00:00.000Z", estado: "agendada", propiedad_id: null },
    ]);
    expect(e.escalada).toBe(false);
    expect(estadoValido(null)).toEqual(ESTADO_INICIAL);
  });
});
