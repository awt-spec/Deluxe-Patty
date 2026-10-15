import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Cerebro } from "../lib/asistente/cerebro";
import { SIN_CONSUMO } from "../lib/asistente/costo";
import { armarPlan, enviarPlanes } from "../lib/asistente/plan";
import { procesarMensaje, type Dependencias } from "../lib/asistente/procesar";
import type { Corredor } from "../lib/datos/tipos";
import type { EnviadorWhatsApp } from "../lib/whatsapp/enviar";
import { PATRICIA, corredorBase, entrante, repoEnMemoria } from "./dobles";

const local = (iso: string) => new Date(`${iso}-06:00`);

describe("Asistente Base", () => {
  let corredor: Corredor;
  let db: ReturnType<typeof repoEnMemoria>;
  let whatsapp: { texto: ReturnType<typeof vi.fn>; plantilla: ReturnType<typeof vi.fn> };
  let cerebro: Record<string, ReturnType<typeof vi.fn>>;
  let ahora: Date;
  let deps: Dependencias;

  beforeEach(() => {
    corredor = corredorBase();
    db = repoEnMemoria(corredor);
    whatsapp = { texto: vi.fn(async () => "wamid.out"), plantilla: vi.fn(async () => "wamid.p") };
    cerebro = {
      clasificar: vi.fn(),
      responder: vi.fn(),
      agendar: vi.fn(),
      analizar: vi.fn(async () => ({ texto: "*Análisis* listo", avisarCorredor: null, consumo: SIN_CONSUMO })),
    };
    ahora = local("2026-10-20T09:00");
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

  const dePatricia = (texto: string | null, cuando = ahora) =>
    entrante(texto, { telefono: PATRICIA, nombrePerfil: "Patricia", timestamp: cuando });

  it("un mensaje de Patricia no se trata como de un cliente: va al análisis", async () => {
    const enlace = "https://www.encuentra24.com/costa-rica-es/bienes-raices-venta-de-propiedades-casas/casa/123";
    const r = await procesarMensaje(deps, dePatricia(`Analízame esta ${enlace}`));
    expect(r).toEqual({ tipo: "corredor", accion: "analisis" });
    expect(cerebro.clasificar).not.toHaveBeenCalled();
    expect(cerebro.analizar.mock.calls[0][3]).toContain(enlace);
    expect(whatsapp.texto).toHaveBeenCalledWith("PNID", PATRICIA, "*Análisis* listo");
    expect(db.contactos[0]).toMatchObject({ telefono: PATRICIA, es_corredor: true });
  });

  it('"plan" le manda su plan del día con las visitas de hoy', async () => {
    await db.repo.crearCita({
      corredor_id: "c1",
      contacto_id: "ct9",
      conversacion_id: null,
      propiedad_id: null,
      inicio: local("2026-10-20T15:00"),
      fin: local("2026-10-20T16:00"),
    });
    const r = await procesarMensaje(deps, dePatricia("Plan"));
    expect(r).toEqual({ tipo: "corredor", accion: "plan" });
    const texto = whatsapp.texto.mock.calls[0][2] as string;
    expect(texto).toContain("Tu plan para hoy, martes 20 de octubre");
    expect(texto).toContain("• 3:00 p. m. · Ana (por confirmar)");
    expect(cerebro.analizar).not.toHaveBeenCalled();
  });

  it("si el análisis falla, Patricia recibe una disculpa, no silencio", async () => {
    cerebro.analizar.mockRejectedValueOnce(new Error("api caída"));
    const r = await procesarMensaje(deps, dePatricia("Me ofrecen 380 mil por la casa de Escazú"));
    expect(r).toEqual({ tipo: "corredor", accion: "error" });
    expect(whatsapp.texto.mock.calls[0][2]).toContain("No pude hacer el análisis");
  });

  describe("plan del día por cron", () => {
    it("no sale antes de la hora elegida", async () => {
      ahora = local("2026-10-20T06:00");
      expect(await enviarPlanes(deps)).toEqual({ enviados: 0, avisados: 0, fallidos: 0 });
    });

    it("con la ventana cerrada manda el resumen por plantilla y el plan completo cuando ella responde", async () => {
      ahora = local("2026-10-20T07:00");
      expect(await enviarPlanes(deps)).toEqual({ enviados: 0, avisados: 1, fallidos: 0 });
      expect(whatsapp.plantilla).toHaveBeenCalledWith("PNID", PATRICIA, "aviso_corredor", [
        expect.stringContaining("Tu plan de hoy: 0 visitas hoy"),
      ]);
      expect(whatsapp.texto).not.toHaveBeenCalled();

      // Un segundo cron el mismo día no repite.
      ahora = local("2026-10-20T08:00");
      expect(await enviarPlanes(deps)).toEqual({ enviados: 0, avisados: 0, fallidos: 0 });

      // Patricia responde "ok": recibe el plan y no se dispara un análisis.
      const r = await procesarMensaje(deps, dePatricia("ok"));
      expect(r).toEqual({ tipo: "corredor", accion: "plan_pendiente" });
      expect(whatsapp.texto.mock.calls[0][2]).toContain("Tu plan para hoy");
      expect(cerebro.analizar).not.toHaveBeenCalled();
      expect(db.planes.get("2026-10-20")?.enviado).toBe(true);
    });

    it("con la ventana abierta manda el plan completo de una vez", async () => {
      await procesarMensaje(deps, dePatricia("Plan", local("2026-10-19T18:00")));
      whatsapp.texto.mockClear();
      ahora = local("2026-10-20T07:00");
      expect(await enviarPlanes(deps)).toEqual({ enviados: 1, avisados: 0, fallidos: 0 });
      expect(whatsapp.texto.mock.calls[0][2]).toContain("Tu plan para hoy");
      expect(whatsapp.plantilla).not.toHaveBeenCalled();
    });
  });
});

describe("armarPlan", () => {
  it("lista visitas, prospectos, pendientes y lo de mañana", () => {
    const texto = armarPlan(
      corredorBase(),
      {
        citasHoy: [
          { inicio: local("2026-10-20T10:00"), estado: "confirmada", cliente: "Ana", propiedad: "Casa en Escazú" },
        ],
        prospectosNuevos: ["Luis", "Marta", "Pedro", "Sofía", "Juan", "Rosa"],
        conversacionesEscaladas: ["Carlos"],
        borradoresPendientes: 2,
        citasManana: 1,
      },
      local("2026-10-20T07:00"),
    );
    expect(texto).toBe(
      [
        "*Buenos días, Patricia.* Tu plan para hoy, martes 20 de octubre:",
        "",
        "*Visitas de hoy (1)*",
        "• 10:00 a. m. · Ana · Casa en Escazú (confirmada)",
        "",
        "*Prospectos nuevos (6):* Luis, Marta, Pedro, Sofía, Juan y 1 más",
        "*Te esperan (1):* Carlos",
        "*Respuestas por aprobar:* 2",
        "Mañana tienes 1 visita.",
      ].join("\n"),
    );
  });
});
