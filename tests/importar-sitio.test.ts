import { afterEach, describe, expect, it, vi } from "vitest";
import { CODIGO_SITIO, filaDesdeSitio, sincronizarSitio, type CasaSitio } from "@/lib/sitio/importar";
import { ID, supabaseFalso } from "./acciones/entorno";

const HOST = "sitio.supabase.co";
const foto = (n: number) => `https://${HOST}/storage/v1/object/public/property-media/images/casa-${n}.jpg`;

const casa = (extra: Partial<CasaSitio> = {}): CasaSitio => ({
  codigo: "DP-1A2B3C",
  titulo: { es: "Casa de lujo en Bosques de Lindora", en: "Luxury home" },
  descripcion: { es: "Exclusiva residencia.", en: "Exclusive." },
  destacados: { es: ["Piscina con spa", "Garaje para 2"], en: [] },
  operacion: "sale",
  tipo: "house",
  precio: 2200000,
  moneda: "USD",
  ubicacion: "Bosques de Lindora",
  provincia: "San José",
  canton: "Santa Ana",
  distrito: "Pozos",
  habitaciones: 4,
  banos: 5,
  m2_construccion: 873,
  m2_terreno: 1330,
  amenidades: ["pool", "security", "rocket"],
  imagenes: [foto(1), foto(2)],
  estado: "available",
  oculta: false,
  ...extra,
});

afterEach(() => vi.unstubAllGlobals());

const fetchFotos = () =>
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "content-type": "image/jpeg" } })),
  );

describe("Casas del sitio web → portal", () => {
  it("traduce la casa del sitio a la ficha del portal (destacados en la descripción, amenidades en español)", () => {
    const f = filaDesdeSitio(casa())!;
    expect(f).toMatchObject({ codigo: "DP-1A2B3C", tipo: "casa", operacion: "venta", zona: "Santa Ana", estado: "activa", habitaciones: 4, m2_terreno: 1330 });
    expect(f.descripcion).toContain("- Piscina con spa");
    expect(f.amenidades).toEqual(["piscina", "seguridad 24/7"]);
    expect(filaDesdeSitio(casa({ estado: "sold", operacion: "rent" }))).toMatchObject({ estado: "alquilada", operacion: "alquiler" });
    expect(filaDesdeSitio(casa({ oculta: true }))).toMatchObject({ estado: "inactiva" });
    expect(filaDesdeSitio(casa({ codigo: "P-001" }))).toBeNull();
    // 0 metros o precio 0 en el sitio = sin dato (la base solo acepta mayores que 0).
    expect(filaDesdeSitio(casa({ m2_construccion: 0, m2_terreno: 0, precio: 0, habitaciones: 0 }))).toMatchObject({ m2_construccion: null, m2_terreno: null, precio: null, habitaciones: 0 });
    expect(CODIGO_SITIO.test("P-001")).toBe(false);
  });

  it("crea la casa, copia las fotos al bucket propio, borra las de ejemplo y no toca las del portal", async () => {
    fetchFotos();
    const db = supabaseFalso({
      propiedades: [
        { id: "e1", corredor_id: ID.deluxe, codigo: "EJEMPLO-001", fotos: [], estado: "activa" },
        { id: "p1", corredor_id: ID.deluxe, codigo: "P-001", fotos: [], estado: "activa" },
        { id: "o1", corredor_id: ID.otro, codigo: "EJEMPLO-001", fotos: [], estado: "activa" },
      ],
    });
    const r = await sincronizarSitio(db as never, { id: ID.deluxe }, [casa()], HOST);
    expect(r).toMatchObject({ creadas: 1, ejemplosBorrados: 1, fotosCopiadas: 2, fallidos: 0 });
    const filas = db.tablas.propiedades;
    expect(filas.map((p) => `${p.corredor_id === ID.deluxe ? "D" : "O"}:${p.codigo}`).sort()).toEqual(["D:DP-1A2B3C", "D:P-001", "O:EJEMPLO-001"]);
    const nueva = filas.find((p) => p.codigo === "DP-1A2B3C")!;
    expect((nueva.fotos as { url: string; fuente: string }[]).map((f) => f.fuente)).toEqual([foto(1), foto(2)]);
    expect(db.subidas.every((c) => c.startsWith(`${ID.deluxe}/${nueva.id}/originales/web-`))).toBe(true);
    // Toda escritura va filtrada por el corredor.
    expect(db.escrituras.filter((e) => e.op !== "insert").every((e) => e.filtros.some(([c, v]) => c === "corredor_id" && v === ID.deluxe))).toBe(true);
  });

  it("la segunda vuelta no vuelve a copiar fotos; si una sale del sitio, se quita; si la casa desaparece, queda pausada", async () => {
    fetchFotos();
    const db = supabaseFalso({ propiedades: [] });
    await sincronizarSitio(db as never, { id: ID.deluxe }, [casa()], HOST);
    // Sin cambios en la ficha no se escribe nada.
    const escriturasAntes = db.escrituras.length;
    expect(await sincronizarSitio(db as never, { id: ID.deluxe }, [casa()], HOST)).toMatchObject({ actualizadas: 0, fotosCopiadas: 0 });
    expect(db.escrituras.length).toBe(escriturasAntes);
    const r2 = await sincronizarSitio(db as never, { id: ID.deluxe }, [casa({ imagenes: [foto(2)], precio: 2100000 })], HOST);
    expect(r2).toMatchObject({ actualizadas: 1, fotosCopiadas: 0 });
    expect(db.tablas.propiedades[0].precio).toBe(2100000);
    expect((db.tablas.propiedades[0].fotos as { fuente: string }[]).map((f) => f.fuente)).toEqual([foto(2)]);
    const r3 = await sincronizarSitio(db as never, { id: ID.deluxe }, [], HOST);
    expect(r3.pausadas).toBe(1);
    expect(db.tablas.propiedades[0].estado).toBe("inactiva");
  });

  it("solo copia fotos del servidor de la exportación (nunca de otra dirección) y respeta el presupuesto por vuelta", async () => {
    fetchFotos();
    const db = supabaseFalso({ propiedades: [] });
    const r = await sincronizarSitio(
      db as never,
      { id: ID.deluxe },
      [casa({ imagenes: ["https://malo.example/x.jpg", `https://${HOST}/otra/ruta.jpg`, foto(1), foto(2), foto(3)] })],
      HOST,
      { maxFotos: 2 },
    );
    // Las de otra dirección se descartan sin gastar el presupuesto: copia 2 y deja 1 para la próxima vuelta.
    expect(r.fotosCopiadas).toBe(2);
    expect(r.fotosPendientes).toBe(1);
    expect(vi.mocked(fetch).mock.calls.map(([u]) => String(u)).every((u) => u.startsWith(`https://${HOST}/storage/`))).toBe(true);
  });
});
