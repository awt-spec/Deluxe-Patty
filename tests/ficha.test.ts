import { describe, expect, it } from "vitest";
import { generarFicha } from "../lib/fichas/generar";
import { MARCA_DELUXE } from "../lib/fichas/marca";

describe("ficha de propiedad", () => {
  it("genera un PDF con la marca y los datos, sin fotos ni campos opcionales", async () => {
    const pdf = await generarFicha({
      marca: MARCA_DELUXE,
      whatsappAsistente: "+50660000000",
      propiedad: {
        id: "p1", codigo: "DLX-1", titulo: "Lote en La Asunción de Belén", tipo: "lote", operacion: "venta",
        precio: 180000, moneda: "USD", provincia: "Heredia", canton: "Belén", distrito: "La Asunción", zona: null,
        habitaciones: null, banos: null, m2_construccion: null, m2_terreno: 1200, descripcion: null,
        amenidades: [], url_e24: null, estado: "activa", fotos: [],
      },
    });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(20_000);
  }, 30_000);
});

describe('"ficha <código>"', () => {
  it("genera el PDF, lo sube a fichas y se lo manda a Patricia como documento", async () => {
    const { vi } = await import("vitest");
    const { procesarMensaje } = await import("../lib/asistente/procesar");
    const { PATRICIA, corredorBase, entrante, repoEnMemoria } = await import("./dobles");
    const corredor = corredorBase();
    const db = repoEnMemoria(corredor);
    db.propiedades.push({
      id: "p1", codigo: "DLX-1", titulo: "Casa en condominio", tipo: "casa", operacion: "venta",
      precio: 450000, moneda: "USD", provincia: "San José", canton: "Escazú", distrito: null, zona: null,
      habitaciones: 3, banos: 3, m2_construccion: 320, m2_terreno: null, descripcion: "Casa de prueba.",
      amenidades: ["piscina"], url_e24: null, estado: "activa", fotos: [],
    });
    const whatsapp = { texto: vi.fn(async () => "w"), plantilla: vi.fn(), imagen: vi.fn(), documento: vi.fn(async () => "w") };
    const ahora = new Date("2026-10-20T15:00:00Z");
    const r = await procesarMensaje(
      {
        repo: db.repo,
        cerebro: {} as never,
        whatsapp: whatsapp as never,
        plantillaAviso: "aviso_corredor",
        plantillaRecordatorio: "recordatorio_visita",
        registrar: () => {},
        ahora: () => ahora,
      },
      entrante("ficha dlx-1", { telefono: PATRICIA, timestamp: ahora }),
    );
    expect(r).toEqual({ tipo: "corredor", accion: "ficha" });
    expect(db.subidas).toHaveLength(1);
    expect(db.subidas[0].bucket).toBe("fichas");
    expect(db.subidas[0].datos.subarray(0, 5).toString()).toBe("%PDF-");
    expect(whatsapp.documento).toHaveBeenCalledWith(
      "PNID",
      PATRICIA,
      expect.stringMatching(/^https:\/\/storage\.example\/fichas\/c1\/p1\/ficha-DLX-1-/),
      "Ficha DLX-1 · Deluxe Properties.pdf",
      "Ficha de Casa en condominio. Revísala antes de compartirla.",
    );
  }, 30_000);
});
