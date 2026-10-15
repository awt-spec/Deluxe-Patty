import { beforeEach, describe, expect, it, vi } from "vitest";
import { enlaceWhatsApp, extraerReferencia } from "../lib/anuncios/atribucion";
import { armarReporte } from "../lib/anuncios/reporte";
import { avisarVencimientos } from "../lib/anuncios/vencimientos";
import type { Cerebro } from "../lib/asistente/cerebro";
import { SIN_CONSUMO } from "../lib/asistente/costo";
import { procesarMensaje, type Dependencias } from "../lib/asistente/procesar";
import type { Corredor } from "../lib/datos/tipos";
import type { EnviadorWhatsApp } from "../lib/whatsapp/enviar";
import { PATRICIA, corredorBase, entrante, repoEnMemoria } from "./dobles";

const local = (iso: string) => new Date(`${iso}-06:00`);

describe("atribución", () => {
  it("el enlace lleva el número de la asistente y la referencia", () => {
    const enlace = enlaceWhatsApp("+506 6000-0000", "A1B2C3");
    expect(enlace.startsWith("https://wa.me/50660000000?text=")).toBe(true);
    expect(decodeURIComponent(enlace.split("text=")[1])).toBe("Hola, me interesa la propiedad del anuncio ref. A1B2C3");
  });

  it("encuentra la referencia en el mensaje del cliente", () => {
    expect(extraerReferencia("Hola, me interesa la propiedad del anuncio ref. a1b2c3")).toBe("A1B2C3");
    expect(extraerReferencia("Ref: DLX123 sigue disponible?")).toBe("DLX123");
    expect(extraerReferencia("Hola, me refiero a la casa")).toBeNull();
    expect(extraerReferencia("ref A1B2C3")).toBe("A1B2C3");
  });
});

describe("armarReporte", () => {
  const base = { url: "u", vence_en: null, propiedad_titulo: null, contactos_total: 0 };
  it("separa anuncios con contactos, sin contactos y por vencer", () => {
    const texto = armarReporte(
      [
        { ...base, id: "1", titulo: "Casa Escazú", referencia: "A", estado: "activo", contactos_periodo: 4 },
        { ...base, id: "2", titulo: "Lote Belén", referencia: "B", estado: "activo", contactos_periodo: 0, vence_en: "2026-10-23" },
        { ...base, id: "3", titulo: "Borrador", referencia: "C", estado: "borrador", contactos_periodo: 0 },
      ],
      "2026-10-20",
    );
    expect(texto).toContain("• Casa Escazú: 4 contactos");
    expect(texto).toContain("*Sin contactos: conviene mejorar foto principal, título o precio*\n• Lote Belén");
    expect(texto).toContain("• Lote Belén: vence en 3 días");
    expect(texto).not.toContain("Borrador");
  });

  it("sin anuncios publicados lo dice", () => {
    expect(armarReporte([], "2026-10-20")).toContain("Todavía no tengo anuncios");
  });
});

describe("anuncios por WhatsApp", () => {
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
      clasificar: vi.fn(async () => ({ intencion: "consulta_propiedad", tema: "casa", consumo: SIN_CONSUMO })),
      responder: vi.fn(async () => ({ texto: "Sí, sigue disponible.", avisarCorredor: null, consumo: SIN_CONSUMO })),
      agendar: vi.fn(),
      analizar: vi.fn(),
      prepararAnuncio: vi.fn(async () => ({
        tituloEs: "Casa en venta en Escazú · 3 hab · Piscina",
        descripcionEs: "Casa amplia en condominio.\n• 3 habitaciones",
        tituloEn: "House for sale in Escazú · 3 bed · Pool",
        descripcionEn: "Spacious house in a gated community.\n• 3 bedrooms",
        ordenFotos: [
          { foto: 2, muestra: "fachada" },
          { foto: 1, muestra: "sala" },
        ],
        sugerencias: ["Agrega la cuota de mantenimiento"],
        consumo: SIN_CONSUMO,
      })),
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
    db.propiedades.push({
      id: "p1",
      codigo: "DLX-1",
      titulo: "Casa en condominio",
      tipo: "casa",
      operacion: "venta",
      precio: 450000,
      moneda: "USD",
      provincia: "San José",
      canton: "Escazú",
      distrito: null,
      zona: "Escazú",
      habitaciones: 3,
      banos: 3,
      m2_construccion: 320,
      m2_terreno: 500,
      descripcion: null,
      amenidades: [],
      url_e24: null,
      estado: "activa",
      fotos: [{ url: "https://x/1.jpg" }, { url: "https://x/2.jpg" }],
    });
  });

  const dePatricia = (texto: string) => entrante(texto, { telefono: PATRICIA, timestamp: ahora });

  it('"anuncio DLX-1" prepara el texto en dos idiomas con el enlace y el orden de fotos', async () => {
    const r = await procesarMensaje(deps, dePatricia("anuncio dlx-1"));
    expect(r).toEqual({ tipo: "corredor", accion: "anuncio" });
    const [es, en, notas] = whatsapp.texto.mock.calls.map((c) => c[2] as string);
    expect(es.split("\n")[0]).toBe("Casa en venta en Escazú · 3 hab · Piscina");
    expect(es).toContain("Escríbeme por WhatsApp: https://wa.me/50660000000?text=");
    expect(decodeURIComponent(es)).toContain("ref. REF");
    expect(en).toContain("Message me on WhatsApp: https://wa.me/");
    expect(notas).toContain("*Orden sugerido de fotos*\n1. Foto 2: fachada\n2. Foto 1: sala");
    expect(notas).toContain("• Agrega la cuota de mantenimiento");
    expect(db.anuncios[0]).toMatchObject({ estado: "borrador", propiedad_id: "p1" });
  });

  it("un código que no existe no llama a Claude", async () => {
    await procesarMensaje(deps, dePatricia("anuncio XYZ"));
    expect(cerebro.prepararAnuncio).not.toHaveBeenCalled();
    expect(whatsapp.texto.mock.calls[0][2]).toContain("No encontré una propiedad con el código XYZ");
  });

  it("el cliente que llega por el enlace queda atribuido al anuncio y aparece en el reporte", async () => {
    await procesarMensaje(deps, dePatricia("anuncio DLX-1"));
    const anuncio = db.anuncios[0];
    Object.assign(anuncio, { estado: "activo", url: "https://encuentra24/x" });

    await procesarMensaje(deps, entrante(`Hola, me interesa la propiedad del anuncio ref. ${anuncio.referencia}`));
    expect(db.contactos.find((c) => !c.es_corredor)).toMatchObject({ anuncio_id: anuncio.id, origen: "anuncio" });

    whatsapp.texto.mockClear();
    const r = await procesarMensaje(deps, dePatricia("reporte"));
    expect(r).toEqual({ tipo: "corredor", accion: "reporte" });
    expect(whatsapp.texto.mock.calls[0][2]).toContain("• Casa en venta en Escazú · 3 hab · Piscina: 1 contacto");
  });

  it("avisa una sola vez los anuncios que vencen en 5 días", async () => {
    db.anuncios.push(
      { id: "a1", titulo: "Casa Escazú", referencia: "A1", url: "u", estado: "activo", vence_en: "2026-10-24", propiedad_titulo: null, propiedad_id: null, aviso: false },
      { id: "a2", titulo: "Lote Belén", referencia: "A2", url: "u", estado: "activo", vence_en: "2026-11-30", propiedad_titulo: null, propiedad_id: null, aviso: false },
    );
    expect(await avisarVencimientos(deps)).toEqual({ avisados: 1, fallidos: 0 });
    // Ventana cerrada: sale por la plantilla de aviso.
    expect(whatsapp.plantilla).toHaveBeenCalledWith("PNID", PATRICIA, "aviso_corredor", [
      "Tu anuncio de Encuentra24 Casa Escazú (vence el 24 de octubre) está por vencer. Renuévalo para no perder posición.",
    ]);
    expect(await avisarVencimientos(deps)).toEqual({ avisados: 0, fallidos: 0 });
  });
});
