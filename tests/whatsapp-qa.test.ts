// Hallazgos del QA del camino de WhatsApp (antes de abrir el número real): cada caso reproducido queda como prueba.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Cerebro } from "../lib/asistente/cerebro";
import { avisarAlCorredor } from "../lib/asistente/contexto";
import { SIN_CONSUMO } from "../lib/asistente/costo";
import {
  TEXTO_NO_LEO,
  anterioresSinRespuesta,
  esSolicitudPrivacidad,
  procesarEstado,
  procesarMensaje,
  type Dependencias,
} from "../lib/asistente/procesar";
import { avisarSinRespuesta } from "../lib/asistente/sin-respuesta";
import { enviarRecordatorios } from "../lib/agenda/recordatorios";
import { crearAlertas } from "../lib/monitoreo/alertas";
import {
  ErrorWhatsApp,
  crearEnviadorWhatsApp,
  esErrorTransitorio,
  explicarErrorWhatsApp,
  porQueNoLlego,
  type EnviadorWhatsApp,
} from "../lib/whatsapp/enviar";
import { parsearWebhook } from "../lib/whatsapp/parsear";
import { digitosTelefono, mismoTelefono } from "../lib/whatsapp/telefono";
import { PATRICIA, corredorBase, entrante, repoEnMemoria } from "./dobles";

const CLIENTE = "+50688880001";

function armar(over: Partial<ReturnType<typeof corredorBase>> = {}) {
  const corredor = { ...corredorBase(), ...over };
  const db = repoEnMemoria(corredor);
  let n = 0;
  const whatsapp = {
    texto: vi.fn(async (_p: string, _para: string, _cuerpo: string) => `wamid.out${++n}`),
    plantilla: vi.fn(async (_p: string, _para: string, _nombre: string, _params: string[]) => `wamid.aviso${++n}`),
    imagen: vi.fn(async () => `wamid.img${++n}`),
    documento: vi.fn(async () => `wamid.doc${++n}`),
  };
  const cerebro = {
    clasificar: vi.fn(async (_c: unknown, _h: unknown, _t: string) => ({ intencion: "consulta_propiedad", tema: "casa", consumo: SIN_CONSUMO })),
    responder: vi.fn(async (..._a: unknown[]) => ({ texto: "Sí, sigue disponible.", avisarCorredor: null, consumo: SIN_CONSUMO })),
  };
  const eventos: [string, Record<string, unknown>][] = [];
  const deps: Dependencias = {
    repo: db.repo,
    cerebro: cerebro as unknown as Cerebro,
    whatsapp: whatsapp as unknown as EnviadorWhatsApp,
    plantillaAviso: "aviso_corredor",
    plantillaRecordatorio: "recordatorio_visita",
    registrar: (e, d) => eventos.push([e, d]),
  };
  // Avisos al corredor: por plantilla o, con su ventana abierta, como texto a su número.
  const avisos = () => [
    ...whatsapp.plantilla.mock.calls.map((c) => String(c[3][0])),
    ...whatsapp.texto.mock.calls.filter((c) => String(c[1]).replace(/\D/g, "") === String(PATRICIA).replace(/\D/g, "")).map((c) => String(c[2])),
  ];
  const nombres = () => eventos.map(([e]) => e);
  return { corredor, db, whatsapp, cerebro, deps, eventos, avisos, nombres };
}

const sobre = (mensaje: object) => ({
  object: "whatsapp_business_account",
  entry: [
    {
      changes: [
        {
          field: "messages",
          value: { metadata: { phone_number_id: "PNID" }, contacts: [{ wa_id: "50688880001", profile: { name: "Ana" } }], messages: [mensaje] },
        },
      ],
    },
  ],
});
const base = { from: "50688880001", timestamp: "1700000000" };

describe("H1: reacciones, stickers, ubicación, contactos, ediciones y tipos sin soporte", () => {
  it("reacciones, stickers, ediciones y mensajes borrados no se guardan ni se contestan", () => {
    for (const m of [
      { id: "w1", type: "reaction", reaction: { message_id: "x", emoji: "👍" } },
      { id: "w2", type: "sticker", sticker: { id: "123", mime_type: "image/webp" } },
      { id: "w3", type: "edit", edit: {} },
      { id: "w4", type: "revoke", revoke: {} },
      { id: "w5", type: "system", system: { body: "cambió de número" } },
    ]) {
      expect(parsearWebhook(sobre({ ...base, ...m })).mensajes).toEqual([]);
    }
  });

  it("la ubicación y la tarjeta de contacto llegan como texto corto", () => {
    const [ubic] = parsearWebhook(sobre({ ...base, id: "w6", type: "location", location: { latitude: 9.93, longitude: -84.18, name: "Escazú" } })).mensajes;
    expect(ubic.tipo).toBe("ubicacion");
    expect(ubic.texto).toBe("[El cliente compartió una ubicación: Escazú · coordenadas 9.93, -84.18]");
    const [cont] = parsearWebhook(
      sobre({ ...base, id: "w7", type: "contacts", contacts: [{ name: { formatted_name: "Luis" }, phones: [{ phone: "+506 8888 0002" }] }] }),
    ).mensajes;
    expect(cont.tipo).toBe("texto");
    expect(cont.texto).toContain("Luis +506 8888 0002");
  });

  it("una ubicación sigue el flujo normal: la IA la lee y contesta, sin escalar", async () => {
    const t = armar();
    const [m] = parsearWebhook(sobre({ ...base, id: "w8", type: "location", location: { latitude: 9.9, longitude: -84.1 } })).mensajes;
    const r = await procesarMensaje(t.deps, m);
    expect(r).toEqual({ tipo: "respondido", intencion: "consulta_propiedad", borrador: false });
    expect(t.cerebro.clasificar.mock.calls[0][2]).toContain("ubicación");
    expect(t.db.conversaciones[0].estado).toBe("abierta");
  });

  it("un tipo sin soporte: respuesta fija una vez al día, sin escalar, sin aviso de 'le escribe', y la IA sigue contestando", async () => {
    const t = armar();
    t.db.reloj.ahora = new Date("2026-11-17T15:00:00Z");
    // El día del corredor sale de deps.ahora: se fija para que la prueba no dependa del día en que corre.
    t.deps.ahora = () => new Date("2026-11-17T15:00:00Z");
    const sinSoporte = () => parsearWebhook(sobre({ ...base, id: `w${Math.random()}`, type: "unsupported", errors: [{ code: 131051 }] })).mensajes[0];
    expect(sinSoporte().texto).toBeNull();

    expect(await procesarMensaje(t.deps, sinSoporte())).toEqual({ tipo: "sin_respuesta", motivo: "no_legible" });
    expect(await procesarMensaje(t.deps, sinSoporte())).toEqual({ tipo: "sin_respuesta", motivo: "no_legible" });
    const textos = t.whatsapp.texto.mock.calls.map((c) => c[2]);
    expect(textos).toEqual([TEXTO_NO_LEO]);
    expect(t.whatsapp.plantilla).not.toHaveBeenCalled();
    expect(textos.join(" ")).not.toContain("personalmente");
    expect(t.db.conversaciones[0].estado).toBe("abierta");

    // La siguiente pregunta real la contesta la IA.
    const r = await procesarMensaje(t.deps, entrante("¿Y cuánto cuesta la casa?"));
    expect(r.tipo).toBe("respondido");

    // Al día siguiente, otra vez la respuesta fija (una por día y chat).
    t.deps.ahora = () => new Date("2026-11-18T15:00:00Z");
    await procesarMensaje(t.deps, sinSoporte());
    expect(t.whatsapp.texto.mock.calls.filter((c) => c[2] === TEXTO_NO_LEO)).toHaveLength(2);
  });

  it("en una conversación escalada, un mensaje nuevo del cliente le avisa al corredor (una vez cada 2 horas)", async () => {
    const t = armar();
    await procesarMensaje(t.deps, entrante("Hola"));
    t.db.conversaciones[0].estado = "escalada";
    await procesarMensaje(t.deps, entrante("¿Me puede llamar?"));
    await procesarMensaje(t.deps, entrante("¿Hola?"));
    expect(t.avisos().filter((a) => a.includes("te volvió a escribir"))).toHaveLength(1);
    expect(t.avisos()[0]).toContain("¿Me puede llamar?");
  });
});

describe("H2: número desconocido o corredor inactivo", () => {
  it("deja un evento error_ (alerta a soporte) con el id del número y sin datos del cliente", async () => {
    const t = armar();
    const r = await procesarMensaje(t.deps, entrante("Hola, soy Ana", { phoneNumberId: "999999" }));
    expect(r).toEqual({ tipo: "corredor_desconocido" });
    expect(t.eventos).toHaveLength(1);
    expect(t.eventos[0][0]).toBe("error_corredor_desconocido");
    expect(t.eventos[0][1].phoneNumberId).toBe("999999");
    expect(JSON.stringify(t.eventos)).not.toMatch(/88880001|Ana/);
  });
});

describe("H3: estados 'failed' de Meta", () => {
  const fallido = (codigo: number, id = "wamid.X") => ({
    object: "whatsapp_business_account",
    entry: [
      {
        changes: [
          {
            field: "messages",
            value: { metadata: { phone_number_id: "PNID" }, statuses: [{ id, status: "failed", recipient_id: "50688880001", errors: [{ code: codigo, title: "x" }] }] },
          },
        ],
      },
    ],
  });

  it("el parser conserva el código de Meta", () => {
    expect(parsearWebhook(fallido(131047)).estados).toEqual([{ phoneNumberId: "PNID", waMessageId: "wamid.X", estado: "fallido", codigo: 131047 }]);
  });

  it("una respuesta al cliente que Meta no entregó: el corredor sabe qué mensaje, a quién y por qué (una vez por chat y hora)", async () => {
    const t = armar();
    await procesarMensaje(t.deps, entrante("¿Sigue disponible?"));
    const waId = t.db.mensajes.find((m) => m.direccion === "saliente")!.wa_message_id!;
    const esperar = vi.fn(async () => {});
    await procesarEstado(t.deps, parsearWebhook(fallido(131047, waId)).estados[0], esperar);
    expect(esperar).not.toHaveBeenCalled();
    expect(t.db.mensajes.find((m) => m.wa_message_id === waId)?.estado_entrega).toBe("fallido");
    expect(t.whatsapp.plantilla).toHaveBeenCalledTimes(1);
    const aviso = t.avisos()[0];
    expect(aviso.split("\n")[0]).toBe("*No le llegó un mensaje a Ana*");
    expect(aviso).toContain("\nTeléfono: +50688880001");
    expect(aviso).toContain('Mensaje: "Sí, sigue disponible."');
    expect(aviso).toContain("24 horas");
    expect(t.nombres()).toContain("whatsapp_fallido");
    expect(t.eventos.find(([e]) => e === "whatsapp_fallido")?.[1].codigo).toBe(131047);

    await procesarEstado(t.deps, parsearWebhook(fallido(131049, waId)).estados[0], esperar);
    expect(t.whatsapp.plantilla).toHaveBeenCalledTimes(1);
  });

  it("un error de configuración (plantilla que no existe) alerta a soporte", async () => {
    const t = armar();
    await procesarMensaje(t.deps, entrante("Hola"));
    const waId = t.db.mensajes.find((m) => m.direccion === "saliente")!.wa_message_id!;
    await procesarEstado(t.deps, parsearWebhook(fallido(132001, waId)).estados[0], async () => {});
    expect(t.nombres()).toContain("error_whatsapp_config");
  });

  it("si lo que no llegó es un aviso al propio corredor, va a soporte (no a él)", async () => {
    const t = armar();
    await avisarAlCorredor(t.deps, t.corredor, "Algo para Patricia", (e, d) => t.eventos.push([e, d]));
    const waId = t.db.mensajes.find((m) => m.autor === "sistema")!.wa_message_id!;
    await procesarEstado(t.deps, parsearWebhook(fallido(131047, waId)).estados[0], async () => {});
    expect(t.nombres()).toContain("error_aviso_no_entregado");
    expect(t.whatsapp.plantilla).toHaveBeenCalledTimes(1); // solo el aviso original
  });

  it("un estado de otro corredor no toca ni avisa nada de este", async () => {
    const t = armar();
    await procesarMensaje(t.deps, entrante("Hola"));
    const waId = t.db.mensajes.find((m) => m.direccion === "saliente")!.wa_message_id!;
    const otro = { ...corredorBase(), id: "c2", whatsapp_phone_number_id: "PNID2" };
    const repo = { ...t.db.repo, corredorPorPhoneNumberId: async () => otro };
    await procesarEstado({ ...t.deps, repo }, { phoneNumberId: "PNID2", waMessageId: waId, estado: "fallido", codigo: 131047 }, async () => {});
    expect(t.db.mensajes.find((m) => m.wa_message_id === waId)?.estado_entrega).toBe("enviado");
    expect(t.whatsapp.plantilla).not.toHaveBeenCalled();
  });
});

describe("H4: solicitud de privacidad (Ley 8968)", () => {
  it("se detecta también tras un saludo, pero no cuando solo se menciona la palabra", () => {
    expect(esSolicitudPrivacidad("Privacidad: borren mis datos")).toBe(true);
    expect(esSolicitudPrivacidad("Hola, privacidad: borren mis datos")).toBe(true);
    expect(esSolicitudPrivacidad("Buenas tardes. Privacidad, quiero ver mis datos")).toBe(true);
    expect(esSolicitudPrivacidad("Solicitud de privacidad")).toBe(true);
    expect(esSolicitudPrivacidad("¿El lote tiene privacidad?")).toBe(false);
  });

  for (const [caso, preparar] of [
    ["escalada", (t: ReturnType<typeof armar>) => void (t.db.conversaciones[0].estado = "escalada")],
    ["tomada por el corredor", (t: ReturnType<typeof armar>) => void (t.db.conversaciones[0].control = "corredor")],
    ["con el tope del mes", (t: ReturnType<typeof armar>) => void (t.db.uso.mensajes_total = 5000)],
  ] as const) {
    it(`llega al corredor aunque la conversación esté ${caso}`, async () => {
      const t = armar({ aviso_mensajes_mes: 100_000 });
      await procesarMensaje(t.deps, entrante("Hola"));
      preparar(t);
      t.whatsapp.plantilla.mockClear();
      t.whatsapp.texto.mockClear();
      const r = await procesarMensaje(t.deps, entrante("Hola, privacidad: quiero que borren mis datos"));
      expect(r).toEqual({ tipo: "escalado", intencion: null });
      expect(t.avisos().some((a) => a.includes("solicitud de privacidad") && a.includes("5 días hábiles"))).toBe(true);
      expect(t.nombres()).toContain("solicitud_privacidad");
      expect(t.cerebro.clasificar).toHaveBeenCalledTimes(1); // solo el "Hola" del principio
    });
  }

  it("si el aviso al corredor no sale, al cliente no se le promete nada y soporte se entera", async () => {
    const t = armar();
    t.whatsapp.plantilla.mockRejectedValue(new ErrorWhatsApp(404, 132001));
    await procesarMensaje(t.deps, entrante("Privacidad: borren mis datos"));
    expect(t.whatsapp.texto).not.toHaveBeenCalled();
    expect(t.nombres()).toContain("error_privacidad_sin_aviso");
    expect(t.db.conversaciones[0].estado).toBe("escalada"); // queda en "Te esperan" del panel
  });
});

describe("H5: los frenos no dejan el chat escalado para siempre", () => {
  it("ráfaga: aviso al corredor una vez por chat y día, el chat sigue abierto y la IA vuelve cuando baja el ritmo", async () => {
    const t = armar();
    let ahora = new Date();
    t.deps.ahora = () => ahora;
    let r;
    for (let i = 0; i < 22; i++) r = await procesarMensaje(t.deps, entrante(`hola ${i}`));
    expect(r).toEqual({ tipo: "sin_respuesta", motivo: "rafaga" });
    const frenos = t.avisos().filter((a) => /el chat queda para ti/i.test(a));
    expect(frenos).toHaveLength(1);
    expect(frenos[0]).toContain("más de 20 mensajes en una hora");
    expect(t.db.conversaciones[0].estado).toBe("abierta");
    const textosAlCliente = t.whatsapp.texto.mock.calls.length;

    ahora = new Date(Date.now() + 3 * 3600_000);
    t.db.reloj.ahora = ahora;
    const r2 = await procesarMensaje(t.deps, entrante("¿Me dan la dirección?"));
    expect(r2.tipo).toBe("respondido");
    expect(t.whatsapp.texto.mock.calls.length).toBe(textosAlCliente + 1);
  });

  it("tope del mes: al cliente nada, al corredor un aviso por chat y día; al renovarse el tope, la IA contesta", async () => {
    const t = armar({ tope_mensajes_mes: 10, aviso_mensajes_mes: 100_000 });
    t.db.uso.mensajes_total = 10;
    expect(await procesarMensaje(t.deps, entrante("hola"))).toEqual({ tipo: "sin_respuesta", motivo: "tope_mes" });
    await procesarMensaje(t.deps, entrante("¿hola?"));
    expect(t.whatsapp.texto).not.toHaveBeenCalled();
    expect(t.avisos().filter((a) => a.includes("tope de mensajes"))).toHaveLength(1);
    expect(t.db.conversaciones[0].estado).toBe("abierta");

    t.db.uso.mensajes_total = 0; // mes nuevo
    expect((await procesarMensaje(t.deps, entrante("¿Sigue disponible?"))).tipo).toBe("respondido");
  });

  it("tope de gasto de IA: lo dice como energía y no escala", async () => {
    const t = armar();
    t.db.costoDia.usd = 50;
    expect(await procesarMensaje(t.deps, entrante("hola"))).toEqual({ tipo: "sin_respuesta", motivo: "tope_dia" });
    expect(t.avisos()[0]).toContain("sin energía");
    expect(t.db.conversaciones[0].estado).toBe("abierta");
  });
});

describe("H6: reintentos de envío", () => {
  const respuesta = (status: number, cuerpo: object) => new Response(JSON.stringify(cuerpo), { status });
  afterEach(() => vi.unstubAllGlobals());

  it("lo pasajero (130429, 5xx) se reintenta con espera corta, máximo 2 veces", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(respuesta(400, { error: { code: 130429 } }))
      .mockResolvedValueOnce(respuesta(503, {}))
      .mockResolvedValueOnce(respuesta(200, { messages: [{ id: "wamid.ok" }] }));
    vi.stubGlobal("fetch", fetch);
    const dormir = vi.fn(async (_ms: number) => {});
    const w = crearEnviadorWhatsApp("token", { dormir });
    expect(await w.texto("PNID", CLIENTE, "hola")).toBe("wamid.ok");
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(dormir.mock.calls.map((c) => c[0])).toEqual([1500, 4000]);
  });

  it("después de 2 reintentos se rinde; lo permanente (131026, 131047) no se reintenta", async () => {
    const fetch = vi.fn(async () => respuesta(400, { error: { code: 131056 } }));
    vi.stubGlobal("fetch", fetch);
    const w = crearEnviadorWhatsApp("token", { dormir: async () => {} });
    await expect(w.texto("PNID", CLIENTE, "hola")).rejects.toMatchObject({ codigo: 131056 });
    expect(fetch).toHaveBeenCalledTimes(3);

    for (const codigo of [131026, 131047, 132001]) {
      const f = vi.fn(async () => respuesta(400, { error: { code: codigo } }));
      vi.stubGlobal("fetch", f);
      await expect(crearEnviadorWhatsApp("token", { dormir: async () => {} }).plantilla("PNID", CLIENTE, "x", [])).rejects.toBeInstanceOf(ErrorWhatsApp);
      expect(f).toHaveBeenCalledTimes(1);
    }
  });

  it("una falla de red o tiempo agotado cuenta como pasajera; la falta de llave no", () => {
    expect(esErrorTransitorio(new TypeError("fetch failed"))).toBe(true);
    expect(esErrorTransitorio(new ErrorWhatsApp(500, undefined))).toBe(true);
    expect(esErrorTransitorio(new ErrorWhatsApp(0, undefined))).toBe(false);
    expect(esErrorTransitorio(new ErrorWhatsApp(400, 131049))).toBe(false);
  });

  it("si la respuesta al cliente no sale, queda fallida y el corredor recibe un aviso (una vez por chat y hora)", async () => {
    const t = armar();
    t.whatsapp.texto.mockRejectedValue(new ErrorWhatsApp(400, 131049));
    await procesarMensaje(t.deps, entrante("¿Sigue disponible?"));
    await procesarMensaje(t.deps, entrante("¿Hola?"));
    expect(t.db.mensajes.filter((m) => m.direccion === "saliente" && m.estado_entrega === "fallido")).toHaveLength(2);
    const avisos = t.avisos().filter((a) => a.includes("No le pude mandar la respuesta"));
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toContain("muchos mensajes de empresas");
    expect(t.eventos.find(([e]) => e === "error_envio_cliente")?.[1].codigo).toBe(131049);
  });
});

describe("H7: explicarErrorWhatsApp con los códigos de producción", () => {
  it("ningún código de producción culpa a la lista de prueba", () => {
    for (const c of [131047, 131056, 130429, 131049, 368, 131031, 131051, 470, 999999]) {
      expect(explicarErrorWhatsApp(new ErrorWhatsApp(400, c))).not.toContain("lista de prueba");
    }
    expect(explicarErrorWhatsApp(new ErrorWhatsApp(400, 131047))).toContain("24 horas");
    expect(explicarErrorWhatsApp(new ErrorWhatsApp(400, 130429))).toContain("demasiados mensajes");
    expect(explicarErrorWhatsApp(new ErrorWhatsApp(400, 368))).toContain("restringió");
    expect(porQueNoLlego(131026)).toContain("no tiene WhatsApp");
  });
});

describe("H8: varios mensajes seguidos → una sola respuesta", () => {
  it("en el mismo aviso de Meta: se guardan todos y contesta el último con todo el texto", async () => {
    const t = armar();
    expect(await procesarMensaje(t.deps, entrante("Hola"), { siguenMas: true })).toEqual({ tipo: "sin_respuesta", motivo: "agrupado" });
    expect(await procesarMensaje(t.deps, entrante("Me interesa la casa"), { siguenMas: true })).toEqual({ tipo: "sin_respuesta", motivo: "agrupado" });
    // Sin espera configurada también se juntan: el último contesta por los del mismo aviso.
    const r = await procesarMensaje(t.deps, entrante("en Escazú"));
    expect(r.tipo).toBe("respondido");
    expect(t.cerebro.responder).toHaveBeenCalledTimes(1);
    expect(t.whatsapp.texto).toHaveBeenCalledTimes(1);
    expect(t.cerebro.clasificar.mock.calls[0][2]).toBe("Hola\nMe interesa la casa\nen Escazú");
  });

  it("en avisos separados: el primero espera, ve que llegó otro y deja que ese conteste por los dos", async () => {
    const t = armar();
    t.deps.esperaAgruparMs = 5000;
    let primera = true;
    t.deps.dormir = async () => {
      if (!primera) return;
      primera = false;
      await procesarMensaje(t.deps, entrante("Me interesa la casa")); // llega mientras el primero espera
    };
    const r = await procesarMensaje(t.deps, entrante("Hola"));
    expect(r).toEqual({ tipo: "sin_respuesta", motivo: "agrupado" });
    expect(t.cerebro.responder).toHaveBeenCalledTimes(1);
    expect(t.cerebro.clasificar.mock.calls[0][2]).toBe("Hola\nMe interesa la casa");
  });

  it("mensajes viejos sin respuesta (de un freno) no se juntan con el nuevo", () => {
    const m = (id: string, direccion: "entrante" | "saliente", iso: string) => ({
      id,
      direccion,
      autor: direccion === "entrante" ? ("cliente" as const) : ("asistente" as const),
      contenido: id,
      estado_borrador: null,
      created_at: iso,
    });
    const lista = [m("a", "saliente", "2026-11-17T10:00:00Z"), m("viejo", "entrante", "2026-11-17T10:05:00Z"), m("b", "entrante", "2026-11-17T12:00:00Z"), m("c", "entrante", "2026-11-17T12:00:04Z")];
    expect(anterioresSinRespuesta(lista, "c", 5000).map((x) => x.id)).toEqual(["b"]);
  });
});

describe("H9: recordatorios", () => {
  const preparar = async (t: ReturnType<typeof armar>) => {
    t.deps.ahora = () => new Date("2026-11-20T12:00:00Z");
    const contacto = await t.db.repo.contacto("c1", CLIENTE, "Ana");
    await t.db.repo.crearCita({
      corredor_id: "c1",
      contacto_id: contacto.id,
      conversacion_id: null,
      propiedad_id: null,
      inicio: new Date("2026-11-21T08:00:00Z"),
      fin: new Date("2026-11-21T09:00:00Z"),
    } as never);
  };

  it("en piloto en sombra sale igual (la cita la aprobó el corredor) y una falla pasajera se reintenta en la próxima corrida", async () => {
    const t = armar({ respuesta_automatica: false });
    await preparar(t);
    t.whatsapp.plantilla.mockRejectedValueOnce(new ErrorWhatsApp(400, 130429));
    expect(await enviarRecordatorios(t.deps)).toEqual({ enviados: 0, fallidos: 1 });
    expect(await enviarRecordatorios(t.deps)).toEqual({ enviados: 1, fallidos: 0 });
    expect(await enviarRecordatorios(t.deps)).toEqual({ enviados: 0, fallidos: 0 });
  });

  it("una falla permanente no se reintenta: se le avisa al corredor y, si es la plantilla, a soporte", async () => {
    const t = armar();
    await preparar(t);
    t.whatsapp.plantilla.mockRejectedValueOnce(new ErrorWhatsApp(404, 132001));
    expect(await enviarRecordatorios(t.deps)).toEqual({ enviados: 0, fallidos: 1 });
    expect(t.whatsapp.plantilla).toHaveBeenCalledTimes(2);
    expect(t.whatsapp.plantilla.mock.calls[1][1]).toBe(PATRICIA);
    expect(t.avisos()[1]).toContain("recordatorio");
    expect(t.nombres()).toContain("error_whatsapp_config");
    expect(await enviarRecordatorios(t.deps)).toEqual({ enviados: 0, fallidos: 0 });
  });
});

describe("H10: una alerta que falla no consume su turno", () => {
  it("libera la clave y la siguiente alerta lo vuelve a intentar", async () => {
    const usados = new Set<string>();
    const plantilla = vi.fn().mockRejectedValueOnce(new ErrorWhatsApp(404, 132001)).mockResolvedValueOnce("wamid.ok");
    const a = crearAlertas({
      whatsapp: { plantilla } as unknown as EnviadorWhatsApp,
      plantilla: "aviso_corredor",
      destino: "+50600000000",
      phoneNumberId: "PNID",
      reclamar: async (k) => (usados.has(k) ? false : (usados.add(k), true)),
      liberar: async (k) => void usados.delete(k),
    });
    expect(await a.alertar("error_webhook", "x")).toBe(false);
    expect(usados.has("error_webhook")).toBe(false);
    expect(await a.alertar("error_webhook", "x")).toBe(true);
    expect(await a.alertar("error_webhook", "x")).toBe(false); // ya salió: una por hora
  });
});

describe("H11: los avisos al corredor se guardan", () => {
  it("quedan en su conversación con su wamid: su estado se encuentra sin esperar", async () => {
    const t = armar();
    await procesarMensaje(t.deps, entrante("¿Aceptan mascotas?"));
    await avisarAlCorredor(t.deps, t.corredor, "Prueba", () => {});
    const aviso = t.db.mensajes.find((m) => m.autor === "sistema");
    expect(aviso?.wa_message_id).toMatch(/^wamid\.aviso/);
    expect(t.db.contactos.find((c) => c.telefono === PATRICIA)?.es_corredor).toBe(true);
    const esperar = vi.fn(async () => {});
    await procesarEstado(t.deps, { phoneNumberId: "PNID", waMessageId: aviso!.wa_message_id!, estado: "entregado" }, esperar);
    expect(esperar).not.toHaveBeenCalled();
    expect(aviso?.estado_entrega).toBe("entregado");
  });

  it("un corredor inactivo (demo) nunca manda avisos", async () => {
    const t = armar({ activo: false });
    expect(await avisarAlCorredor(t.deps, t.corredor, "x", () => {})).toBe(false);
    expect(t.whatsapp.plantilla).not.toHaveBeenCalled();
  });
});

describe("H12: celular del corredor guardado sin código de país", () => {
  it("se reconoce como el corredor y sus avisos van al número con +506", async () => {
    expect(digitosTelefono("7000-0000")).toBe("50670000000");
    expect(mismoTelefono("+50670000000", "7000 0000")).toBe(true);
    expect(mismoTelefono("+50670000000", "")).toBe(false);
    const t = armar({ whatsapp_corredor: "7000-0000" });
    const r = await procesarMensaje(t.deps, entrante("plan", { telefono: PATRICIA }));
    expect(r.tipo).toBe("corredor");
    await avisarAlCorredor(t.deps, t.corredor, "x", () => {});
    expect(t.whatsapp.plantilla.mock.calls.at(-1)?.[1]).toBe(PATRICIA);
  });
});

describe("S1: un mensaje que quedó sin respuesta (función cortada) no se pierde", () => {
  it("el barrido avisa al corredor una vez por chat y día; el chat del propio corredor no cuenta", async () => {
    const t = armar();
    const antes = new Date("2026-11-17T15:00:00Z");
    t.db.reloj.ahora = antes;
    const contacto = await t.db.repo.contacto("c1", CLIENTE, "Ana");
    const conv = await t.db.repo.conversacionActiva("c1", contacto.id);
    await t.db.repo.guardarMensaje({ corredor_id: "c1", conversacion_id: conv.id, direccion: "entrante", autor: "cliente", contenido: "Hola", wa_message_id: "w.cortado" });
    await t.db.repo.actualizarConversacion("c1", conv.id, { ultimo_mensaje_cliente_at: antes.toISOString() });
    const propia = await t.db.repo.conversacionActiva("c1", (await t.db.repo.contactoCorredor("c1", PATRICIA)).id);
    await t.db.repo.actualizarConversacion("c1", propia.id, { ultimo_mensaje_cliente_at: antes.toISOString() });

    t.deps.ahora = () => new Date("2026-11-17T15:20:00Z");
    expect(await avisarSinRespuesta(t.deps)).toEqual({ avisados: 1 });
    expect(t.avisos()[0]).toContain("no alcanzó a contestarle a Ana*");
    expect(t.avisos()[0]).toContain("\nTeléfono: +50688880001");
    expect(t.nombres()).toContain("error_mensaje_sin_respuesta");
    expect(await avisarSinRespuesta(t.deps)).toEqual({ avisados: 0 });
  });
});
