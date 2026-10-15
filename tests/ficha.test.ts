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
