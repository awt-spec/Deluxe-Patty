import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Cerebro } from "../lib/asistente/cerebro";
import { SIN_CONSUMO } from "../lib/asistente/costo";
import { procesarMensaje, type Dependencias } from "../lib/asistente/procesar";
import type { Corredor } from "../lib/datos/tipos";
import type { EnviadorWhatsApp } from "../lib/whatsapp/enviar";
import { ErrorMedio, type Medios } from "../lib/whatsapp/media";
import type { MedioEntrante } from "../lib/whatsapp/parsear";
import { PATRICIA, corredorBase, entrante, repoEnMemoria } from "./dobles";

// Notas de voz, fotos y PDF por WhatsApp: se leen y siguen el flujo de siempre; lo que no se puede leer cae al aviso.

const AHORA = new Date("2026-10-20T15:00:00Z");
const media = (clase: MedioEntrante["clase"], mime: string, nombre?: string): MedioEntrante => ({ id: "123456789", mime, clase, ...(nombre ? { nombre } : {}) });

describe("medios por WhatsApp", () => {
  let corredor: Corredor;
  let db: ReturnType<typeof repoEnMemoria>;
  let whatsapp: { texto: ReturnType<typeof vi.fn>; plantilla: ReturnType<typeof vi.fn> };
  let cerebro: Record<string, ReturnType<typeof vi.fn>>;
  let medios: { descargar: ReturnType<typeof vi.fn>; transcribir: ReturnType<typeof vi.fn> };
  let deps: Dependencias;

  beforeEach(() => {
    corredor = corredorBase();
    db = repoEnMemoria(corredor);
    whatsapp = { texto: vi.fn(async () => "wamid.out"), plantilla: vi.fn(async () => "wamid.p") };
    cerebro = {
      clasificar: vi.fn(async () => ({ intencion: "consulta_propiedad", tema: "casa", consumo: SIN_CONSUMO })),
      responder: vi.fn(async () => ({ texto: "Claro, te cuento.", avisarCorredor: null, consumo: SIN_CONSUMO })),
      analizar: vi.fn(async () => ({ texto: "*Análisis* de la foto", avisarCorredor: null, consumo: SIN_CONSUMO })),
      describirMedio: vi.fn(async () => ({ texto: "Fachada de una casa de dos pisos con jardín.", consumo: SIN_CONSUMO })),
    };
    medios = {
      descargar: vi.fn(async () => ({ datos: Buffer.from("contenido"), mime: "audio/ogg; codecs=opus" })),
      transcribir: vi.fn(async () => ({ texto: "plan", segundos: 12, costoUsd: 0.0012 })),
    };
    deps = {
      repo: db.repo,
      cerebro: cerebro as unknown as Cerebro,
      whatsapp: whatsapp as unknown as EnviadorWhatsApp,
      plantillaAviso: "aviso_corredor",
      plantillaRecordatorio: "recordatorio_visita",
      medios: medios as unknown as Medios,
      registrar: () => {},
      ahora: () => AHORA,
    };
  });

  const dePatricia = (extra: Parameters<typeof entrante>[1]) => entrante(null, { telefono: PATRICIA, timestamp: AHORA, ...extra });

  describe("Patricia", () => {
    it("una nota de voz se trata como si lo hubiera escrito: 'plan' le manda su plan", async () => {
      const r = await procesarMensaje(deps, dePatricia({ tipo: "audio", media: media("audio", "audio/ogg; codecs=opus") }));
      expect(r).toEqual({ tipo: "corredor", accion: "plan" });
      expect(medios.transcribir).toHaveBeenCalledTimes(1);
      expect(whatsapp.texto).toHaveBeenCalledWith("PNID", PATRICIA, expect.stringContaining("Patricia"));
      // La transcripción queda en el mensaje guardado y su costo en el gasto de IA.
      expect(db.mensajes.find((m) => m.direccion === "entrante")?.contenido).toBe("Nota de voz: plan");
      expect((await db.repo.presupuestoIA(corredor.id)).gastoDia).toBeCloseTo(0.0012, 4);
    });

    it("una foto se analiza con Claude, con la foto adjunta", async () => {
      medios.descargar.mockResolvedValueOnce({ datos: Buffer.from("jpg"), mime: "image/jpeg" });
      const r = await procesarMensaje(deps, dePatricia({ tipo: "imagen", media: media("imagen", "image/jpeg") }));
      expect(r).toEqual({ tipo: "corredor", accion: "analisis" });
      const adjuntos = cerebro.analizar.mock.calls[0][4];
      expect(adjuntos).toHaveLength(1);
      expect(adjuntos[0]).toMatchObject({ tipo: "imagen", mediaType: "image/jpeg", datos: Buffer.from("jpg").toString("base64") });
      expect(cerebro.analizar.mock.calls[0][3]).toBe("Analiza esta foto.");
      expect(whatsapp.texto).toHaveBeenCalledWith("PNID", PATRICIA, "*Análisis* de la foto");
    });

    it("un PDF con pie de texto usa ese texto como pedido", async () => {
      medios.descargar.mockResolvedValueOnce({ datos: Buffer.from("%PDF"), mime: "application/pdf" });
      await procesarMensaje(deps, dePatricia({ tipo: "documento", texto: "¿Es buen precio?", media: media("documento", "application/pdf", "oferta.pdf") }));
      expect(cerebro.analizar.mock.calls[0][3]).toBe("¿Es buen precio?");
      expect(cerebro.analizar.mock.calls[0][4][0]).toMatchObject({ tipo: "pdf", nombre: "oferta.pdf" });
    });

    it("un video no se puede ver por WhatsApp: le dice que lo suba al panel", async () => {
      const r = await procesarMensaje(deps, dePatricia({ tipo: "otro", media: media("video", "video/mp4") }));
      expect(r).toEqual({ tipo: "corredor", accion: "ayuda" });
      expect(medios.descargar).not.toHaveBeenCalled();
      expect(whatsapp.texto.mock.calls.at(-1)?.[2]).toMatch(/videos.*panel/i);
    });

    it("un Word o un Excel por WhatsApp no se leen: lo dirige al panel", async () => {
      await procesarMensaje(deps, dePatricia({ tipo: "documento", media: media("documento", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "x.docx") }));
      expect(medios.descargar).not.toHaveBeenCalled();
      expect(whatsapp.texto.mock.calls.at(-1)?.[2]).toMatch(/Word|Excel/);
    });

    it("sin la llave de OpenAI avisa que no puede escuchar, sin tumbar nada", async () => {
      medios.transcribir.mockRejectedValueOnce(new ErrorMedio("sin_llave"));
      const r = await procesarMensaje(deps, dePatricia({ tipo: "audio", media: media("audio", "audio/ogg") }));
      expect(r).toEqual({ tipo: "corredor", accion: "ayuda" });
      expect(whatsapp.texto.mock.calls.at(-1)?.[2]).toMatch(/falta activarlo/);
    });

    it("con el tope de gasto alcanzado no transcribe ni gasta más", async () => {
      await db.repo.registrarImagenes(corredor.id, 1, 50);
      await procesarMensaje(deps, dePatricia({ tipo: "audio", media: media("audio", "audio/ogg") }));
      expect(medios.transcribir).not.toHaveBeenCalled();
      expect(whatsapp.texto.mock.calls.at(-1)?.[2]).toMatch(/límite de uso/);
    });

    it("un audio vacío (silencio) le pide que lo escriba, pero el costo ya se contó", async () => {
      medios.transcribir.mockResolvedValueOnce({ texto: "", segundos: 5, costoUsd: 0.0005 });
      await procesarMensaje(deps, dePatricia({ tipo: "audio", media: media("audio", "audio/ogg") }));
      expect(whatsapp.texto.mock.calls.at(-1)?.[2]).toMatch(/no logré entender/i);
      expect((await db.repo.presupuestoIA(corredor.id)).gastoDia).toBeCloseTo(0.0005, 4);
    });
  });

  describe("clientes", () => {
    const cliente = (extra: Parameters<typeof entrante>[1]) => entrante(null, { telefono: "+50688880001", timestamp: AHORA, ...extra });

    it("una nota de voz se transcribe y sigue el flujo normal (clasifica y responde)", async () => {
      medios.transcribir.mockResolvedValueOnce({ texto: "Hola, busco una casa en Escazú", segundos: 9, costoUsd: 0.0009 });
      const r = await procesarMensaje(deps, cliente({ tipo: "audio", media: media("audio", "audio/ogg") }));
      expect(r).toEqual({ tipo: "respondido", intencion: "consulta_propiedad", borrador: false });
      expect(cerebro.clasificar.mock.calls[0][2]).toBe("Hola, busco una casa en Escazú");
      expect(db.mensajes.find((m) => m.direccion === "entrante")?.contenido).toBe("Nota de voz: Hola, busco una casa en Escazú");
    });

    it("una foto se describe y la descripción entra al flujo como texto del cliente", async () => {
      medios.descargar.mockResolvedValueOnce({ datos: Buffer.from("jpg"), mime: "image/jpeg" });
      await procesarMensaje(deps, cliente({ tipo: "imagen", texto: "¿Esta sigue disponible?", media: media("imagen", "image/jpeg") }));
      expect(cerebro.describirMedio).toHaveBeenCalledTimes(1);
      const enviado = cerebro.clasificar.mock.calls[0][2] as string;
      expect(enviado).toContain("¿Esta sigue disponible?");
      expect(enviado).toContain("Fachada de una casa de dos pisos");
    });

    it("un video del cliente pasa a Patricia, con su nombre en el aviso", async () => {
      const r = await procesarMensaje(deps, cliente({ tipo: "otro", media: media("video", "video/mp4") }));
      expect(r).toEqual({ tipo: "escalado", intencion: null });
      expect(whatsapp.plantilla).toHaveBeenCalledWith("PNID", PATRICIA, "aviso_corredor", [expect.stringContaining("un video")]);
      expect(cerebro.clasificar).not.toHaveBeenCalled();
    });

    it("sin la llave de WhatsApp o de OpenAI, la nota de voz pasa a Patricia como antes", async () => {
      medios.descargar.mockRejectedValueOnce(new ErrorMedio("sin_llave"));
      const r = await procesarMensaje(deps, cliente({ tipo: "audio", media: media("audio", "audio/ogg") }));
      expect(r).toEqual({ tipo: "escalado", intencion: null });
      expect(whatsapp.plantilla.mock.calls[0][3][0]).toContain("una nota de voz");
    });

    it("sin la configuración de medios (deps.medios vacío) todo sigue como antes", async () => {
      deps.medios = undefined;
      const r = await procesarMensaje(deps, cliente({ tipo: "imagen", media: media("imagen", "image/jpeg") }));
      expect(r).toEqual({ tipo: "escalado", intencion: null });
    });

    it("si Claude no puede describir la foto, el cliente queda para Patricia y no se cae nada", async () => {
      medios.descargar.mockResolvedValueOnce({ datos: Buffer.from("jpg"), mime: "image/jpeg" });
      cerebro.describirMedio.mockRejectedValueOnce(new Error("falla"));
      const r = await procesarMensaje(deps, cliente({ tipo: "imagen", media: media("imagen", "image/jpeg") }));
      expect(r).toEqual({ tipo: "escalado", intencion: null });
    });
  });
});
