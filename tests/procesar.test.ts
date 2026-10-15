import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Cerebro } from "../lib/asistente/cerebro";
import { RechazoModelo } from "../lib/asistente/cerebro";
import { SIN_CONSUMO } from "../lib/asistente/costo";
import { procesarMensaje, type Dependencias } from "../lib/asistente/procesar";
import type { Repositorio } from "../lib/datos/repositorio";
import type { Contacto, Conversacion, Corredor, NuevoMensaje } from "../lib/datos/tipos";
import type { EnviadorWhatsApp } from "../lib/whatsapp/enviar";
import type { MensajeEntrante } from "../lib/whatsapp/parsear";

const PATRICIA = "+50670000000";

function corredorBase(): Corredor {
  return {
    id: "c1",
    nombre: "Deluxe Properties",
    nombre_contacto: "Patricia",
    whatsapp_phone_number_id: "PNID",
    whatsapp_corredor: PATRICIA,
    zona_horaria: "America/Costa_Rica",
    tono: "",
    reglas_escalamiento: ["negociación de precio", "comisiones"],
    tope_mensajes_mes: 1000,
    aviso_mensajes_mes: 900,
    respuesta_automatica: true,
  };
}

// Repositorio en memoria que imita las reglas de la base que importan aquí.
function repoEnMemoria(corredor: Corredor) {
  const mensajes: (NuevoMensaje & { id: string })[] = [];
  const conversaciones: Conversacion[] = [];
  const contactos: Contacto[] = [];
  const uso = { mes: "2026-10-01", mensajes_total: 0, aviso_tope_enviado_at: null as string | null };
  let n = 0;
  const repo: Repositorio = {
    corredorPorPhoneNumberId: async (id) => (id === corredor.whatsapp_phone_number_id ? corredor : null),
    contacto: async (corredorId, telefono, nombre) => {
      let c = contactos.find((x) => x.corredor_id === corredorId && x.telefono === telefono);
      if (!c) contactos.push((c = { id: `ct${++n}`, corredor_id: corredorId, telefono, nombre }));
      return c;
    },
    conversacionActiva: async (corredorId, contactoId) => {
      let c = conversaciones.find((x) => x.contacto_id === contactoId && x.estado !== "cerrada");
      if (!c)
        conversaciones.push(
          (c = { id: `cv${++n}`, corredor_id: corredorId, contacto_id: contactoId, estado: "abierta", control: "asistente" }),
        );
      return c;
    },
    guardarMensaje: async (m) => {
      if (m.wa_message_id && mensajes.some((x) => x.wa_message_id === m.wa_message_id)) return null;
      const id = `m${++n}`;
      mensajes.push({ ...m, id });
      return id;
    },
    actualizarMensaje: async (_c, id, cambios) => {
      Object.assign(mensajes.find((m) => m.id === id)!, cambios);
    },
    actualizarConversacion: async (_c, id, cambios) => {
      Object.assign(conversaciones.find((c) => c.id === id)!, cambios);
    },
    historial: async (_c, conversacionId) =>
      mensajes
        .filter((m) => m.conversacion_id === conversacionId)
        .map((m) => ({
          id: m.id,
          direccion: m.direccion,
          autor: m.autor,
          contenido: m.contenido,
          estado_borrador: m.estado_borrador ?? null,
          created_at: "",
        })),
    propiedadesActivas: async () => [],
    registrarUso: async (_c, d) => {
      uso.mensajes_total += (d.mensajesEntrantes ?? 0) + (d.mensajesSalientes ?? 0);
      return { ...uso };
    },
    marcarAvisoTope: async () => {
      if (uso.aviso_tope_enviado_at) return false;
      uso.aviso_tope_enviado_at = "ahora";
      return true;
    },
    actualizarEstadoEntrega: async () => {},
  };
  return { repo, mensajes, conversaciones, uso };
}

function entrante(texto: string | null, extra: Partial<MensajeEntrante> = {}): MensajeEntrante {
  return {
    phoneNumberId: "PNID",
    waMessageId: `wamid.${Math.random()}`,
    telefono: "+50688880001",
    nombrePerfil: "Ana",
    tipo: texto === null ? "audio" : "texto",
    texto,
    timestamp: new Date("2026-10-20T15:00:00Z"),
    ...extra,
  };
}

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

  it("los audios e imágenes sin texto van a Patricia sin llamar a Claude", async () => {
    const r = await procesarMensaje(deps, entrante(null));
    expect(r).toEqual({ tipo: "escalado", intencion: null });
    expect(cerebro.clasificar).not.toHaveBeenCalled();
    expect(whatsapp.plantilla.mock.calls[0][3][0]).toContain("un audio");
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

  it("ignora mensajes a un número que no es de ningún corredor", async () => {
    const r = await procesarMensaje(deps, entrante("Hola", { phoneNumberId: "OTRO" }));
    expect(r).toEqual({ tipo: "corredor_desconocido" });
    expect(db.mensajes).toHaveLength(0);
  });
});
