import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Cerebro } from "../lib/asistente/cerebro";
import { RechazoModelo } from "../lib/asistente/cerebro";
import { SIN_CONSUMO } from "../lib/asistente/costo";
import { procesarMensaje, type Dependencias } from "../lib/asistente/procesar";
import type { Corredor } from "../lib/datos/tipos";
import type { EnviadorWhatsApp } from "../lib/whatsapp/enviar";
import { PATRICIA, corredorBase, entrante, repoEnMemoria } from "./dobles";

describe("procesarMensaje", () => {
  let corredor: Corredor;
  let db: ReturnType<typeof repoEnMemoria>;
  let whatsapp: { texto: ReturnType<typeof vi.fn>; plantilla: ReturnType<typeof vi.fn> };
  let cerebro: { clasificar: ReturnType<typeof vi.fn>; responder: ReturnType<typeof vi.fn> };
  let deps: Dependencias;

  beforeEach(() => {
    corredor = corredorBase();
    db = repoEnMemoria(corredor);
    whatsapp = { texto: vi.fn(async () => "wamid.out"), plantilla: vi.fn(async () => "wamid.aviso") };
    cerebro = {
      clasificar: vi.fn(async () => ({ intencion: "consulta_propiedad", tema: "casa en Escazú", consumo: SIN_CONSUMO })),
      responder: vi.fn(async () => ({ texto: "Sí, la casa sigue disponible.", avisarCorredor: null, consumo: SIN_CONSUMO })),
    };
    deps = {
      repo: db.repo,
      cerebro: cerebro as unknown as Cerebro,
      whatsapp: whatsapp as unknown as EnviadorWhatsApp,
      plantillaAviso: "aviso_corredor",
      plantillaRecordatorio: "recordatorio_visita",
      registrar: () => {},
    };
  });

  it("responde al cliente y guarda entrante y saliente", async () => {
    const r = await procesarMensaje(deps, entrante("¿Sigue disponible la casa de Escazú?"));
    expect(r).toEqual({ tipo: "respondido", intencion: "consulta_propiedad", borrador: false });
    expect(whatsapp.texto).toHaveBeenCalledWith("PNID", "+50688880001", "Sí, la casa sigue disponible.");
    expect(whatsapp.plantilla).not.toHaveBeenCalled();
    expect(db.mensajes.map((m) => [m.direccion, m.autor, m.estado_entrega ?? null])).toEqual([
      ["entrante", "cliente", null],
      ["saliente", "asistente", "enviado"],
    ]);
  });

  it("lo que escribe el modelo sale en formato de WhatsApp (sin markdown) y así queda guardado", async () => {
    cerebro.responder.mockResolvedValueOnce({
      texto: "## Casa en Escazú\n\n- **Precio:** $485.000\n- **Cuartos:** 3\n\n\n\n¿Le gustaría verla?",
      avisarCorredor: null,
      consumo: SIN_CONSUMO,
    });
    await procesarMensaje(deps, entrante("¿Sigue disponible la casa de Escazú?"));
    const esperado = "*Casa en Escazú*\n\n• *Precio:* $485.000\n• *Cuartos:* 3\n\n¿Le gustaría verla?";
    expect(whatsapp.texto).toHaveBeenCalledWith("PNID", "+50688880001", esperado);
    expect(db.mensajes.find((m) => m.direccion === "saliente")?.contenido).toBe(esperado);
  });

  it("el aviso a Patricia tiene título en negrita, mensaje y teléfono en su línea", async () => {
    cerebro.clasificar.mockResolvedValueOnce({ intencion: "pasar_a_corredor", tema: "negociación de precio", consumo: SIN_CONSUMO });
    await procesarMensaje(deps, entrante("¿Me lo deja en 400 mil?"));
    const aviso: string = whatsapp.plantilla.mock.calls[0][3][0];
    const lineas = aviso.split("\n");
    expect(lineas[0]).toMatch(/^\*.+ quiere hablar contigo\*$/);
    expect(lineas).toContain('Mensaje: "¿Me lo deja en 400 mil?"');
    expect(lineas.at(-1)).toBe("Teléfono: +50688880001");
  });

  it("lo de la lista de escalamiento llega a Patricia, no al cliente", async () => {
    cerebro.clasificar.mockResolvedValueOnce({ intencion: "pasar_a_corredor", tema: "negociación de precio", consumo: SIN_CONSUMO });
    const r = await procesarMensaje(deps, entrante("¿Me lo deja en 400 mil?"));
    expect(r).toEqual({ tipo: "escalado", intencion: "pasar_a_corredor" });
    expect(cerebro.responder).not.toHaveBeenCalled();
    expect(whatsapp.plantilla).toHaveBeenCalledWith("PNID", PATRICIA, "aviso_corredor", [
      expect.stringContaining("¿Me lo deja en 400 mil?"),
    ]);
    // Al cliente solo le llega el aviso fijo de que Patricia le escribe.
    expect(whatsapp.texto).toHaveBeenCalledTimes(1);
    expect(whatsapp.texto.mock.calls[0][2]).toContain("Patricia personalmente");
    expect(db.conversaciones[0].estado).toBe("escalada");
  });

  it("una vez escalada, la asistente no vuelve a contestar en esa conversación", async () => {
    cerebro.clasificar.mockResolvedValueOnce({ intencion: "pasar_a_corredor", tema: "comisión", consumo: SIN_CONSUMO });
    await procesarMensaje(deps, entrante("¿Cuánto cobra de comisión?"));
    whatsapp.texto.mockClear();
    const r = await procesarMensaje(deps, entrante("¿Hola?"));
    expect(r).toEqual({ tipo: "sin_respuesta", motivo: "escalada" });
    expect(whatsapp.texto).not.toHaveBeenCalled();
  });

  it("no contesta si Patricia tomó control", async () => {
    await procesarMensaje(deps, entrante("Hola"));
    db.conversaciones[0].control = "corredor";
    whatsapp.texto.mockClear();
    const r = await procesarMensaje(deps, entrante("¿Y el precio?"));
    expect(r).toEqual({ tipo: "sin_respuesta", motivo: "control_corredor" });
    expect(whatsapp.texto).not.toHaveBeenCalled();
    expect(cerebro.clasificar).toHaveBeenCalledTimes(1);
  });

  it("ignora reintentos de Meta con el mismo wa_message_id", async () => {
    const m = entrante("Hola");
    await procesarMensaje(deps, m);
    const r = await procesarMensaje(deps, m);
    expect(r).toEqual({ tipo: "duplicado" });
    expect(whatsapp.texto).toHaveBeenCalledTimes(1);
  });

  it("en piloto en sombra guarda el borrador y no envía", async () => {
    corredor.respuesta_automatica = false;
    const r = await procesarMensaje(deps, entrante("¿Tienen apartamentos en Santa Ana?"));
    expect(r).toEqual({ tipo: "respondido", intencion: "consulta_propiedad", borrador: true });
    expect(whatsapp.texto).not.toHaveBeenCalled();
    expect(db.mensajes[1]).toMatchObject({ direccion: "saliente", estado_borrador: "pendiente" });
  });

  it("lo que no trae texto ni archivo legible no llama a Claude ni escala: respuesta fija y el chat sigue abierto", async () => {
    const r = await procesarMensaje(deps, entrante(null));
    expect(r).toEqual({ tipo: "sin_respuesta", motivo: "no_legible" });
    expect(cerebro.clasificar).not.toHaveBeenCalled();
    expect(db.conversaciones[0].estado).toBe("abierta");
  });

  it("si Claude falla o declina, el cliente no queda sin respuesta y Patricia recibe el mensaje", async () => {
    cerebro.responder.mockRejectedValueOnce(new RechazoModelo(SIN_CONSUMO));
    const r = await procesarMensaje(deps, entrante("Hola, busco casa"));
    expect(r).toEqual({ tipo: "escalado", intencion: "consulta_propiedad" });
    expect(whatsapp.plantilla.mock.calls[0][3][0]).toContain("no pudo responder");
    expect(whatsapp.texto).toHaveBeenCalledTimes(1);
  });

  it("avisa a Patricia cuando la respuesta pide confirmar un dato", async () => {
    cerebro.responder.mockResolvedValueOnce({
      texto: "Lo confirmo y te escribo.",
      avisarCorredor: "confirmar si acepta mascotas",
      consumo: SIN_CONSUMO,
    });
    await procesarMensaje(deps, entrante("¿Aceptan mascotas?"));
    expect(whatsapp.texto).toHaveBeenCalledWith("PNID", "+50688880001", "Lo confirmo y te escribo.");
    expect(whatsapp.plantilla.mock.calls[0][3][0]).toContain("confirmar si acepta mascotas");
  });

  it("al llegar a 900 mensajes avisa a Patricia una sola vez", async () => {
    db.uso.mensajes_total = 898;
    await procesarMensaje(deps, entrante("Hola")); // 899 entrante, 900 saliente → aviso
    await procesarMensaje(deps, entrante("Gracias"));
    const avisos = whatsapp.plantilla.mock.calls.filter((c) => String(c[3][0]).includes("mensajes de WhatsApp este mes"));
    expect(avisos).toHaveLength(1);
    expect(avisos[0][3][0]).toContain("de 1000");
  });

  it("un mensaje a un número que no es de ningún corredor activo no guarda nada y alerta a soporte sin datos personales", async () => {
    const eventos: [string, Record<string, unknown>][] = [];
    deps.registrar = (e, d) => eventos.push([e, d]);
    const r = await procesarMensaje(deps, entrante("Hola", { phoneNumberId: "OTRO" }));
    expect(r).toEqual({ tipo: "corredor_desconocido" });
    expect(db.mensajes).toHaveLength(0);
    expect(eventos.map(([e]) => e)).toEqual(["error_corredor_desconocido"]);
    expect(JSON.stringify(eventos)).not.toContain("88880001");
    expect(JSON.stringify(eventos)).not.toContain("Hola");
  });

  describe("topes que frenan la IA", () => {
    it("al llegar al tope de mensajes del mes no llama a Claude y el chat queda para Patricia", async () => {
      db.uso.mensajes_total = corredor.tope_mensajes_mes - 1;
      const r = await procesarMensaje(deps, entrante("¿Sigue disponible?"));
      expect(r).toEqual({ tipo: "sin_respuesta", motivo: "tope_mes" });
      expect(cerebro.clasificar).not.toHaveBeenCalled();
      expect(whatsapp.texto).not.toHaveBeenCalled();
      // El freno no escala: el chat sigue abierto y Patricia recibe el aviso de que queda para ella.
      expect(db.conversaciones[0].estado).toBe("abierta");
      expect(whatsapp.plantilla.mock.calls.some((c) => String(c[3][0]).includes("tope de mensajes"))).toBe(true);
    });

    it("con el costo del día en el tope, se frena hasta mañana", async () => {
      db.costoDia.usd = 50;
      const r = await procesarMensaje(deps, entrante("Hola"));
      expect(r).toEqual({ tipo: "sin_respuesta", motivo: "tope_dia" });
      expect(cerebro.clasificar).not.toHaveBeenCalled();
    });

    it("una ráfaga de un mismo cliente se frena", async () => {
      for (let i = 0; i < 20; i++) await procesarMensaje(deps, entrante(`mensaje ${i}`));
      cerebro.clasificar.mockClear();
      const r = await procesarMensaje(deps, entrante("uno más"));
      expect(r).toEqual({ tipo: "sin_respuesta", motivo: "rafaga" });
      expect(cerebro.clasificar).not.toHaveBeenCalled();
    });
  });
});
