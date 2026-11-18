import { afterEach, describe, expect, it, vi } from "vitest";
import { amenidadesDelSitio, CODIGO_SITIO, filaDesdeSitio, fotosDeCasa, hostsDeFotos, sincronizarSitio, type CasaSitio } from "@/lib/sitio/importar";
import { exportacionReal, fotoCarpeta, fotoSemilla, HOST_EXPORTACION } from "./fixtures/sitio-exportacion";
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
    expect(f).toMatchObject({ codigo: "DP-1A2B3C", tipo: "casa", operacion: "venta", zona: "Lindora", estado: "activa", habitaciones: 4, m2_terreno: 1330 });
    expect(f.descripcion).toContain("- Piscina con spa");
    expect(f.amenidades).toEqual(["piscina", "seguridad 24/7"]);
    // El sitio también trae amenidades ya escritas en español (no solo claves): se guardan tal cual, sin repetir.
    expect(amenidadesDelSitio(["gym", "Gimnasio", "Cine en casa", " Piscina niños ", "Seguridad 24/7", "security", "rocket", 7, "x".repeat(81)])).toEqual([
      "gimnasio",
      "Cine en casa",
      "Piscina niños",
      "Seguridad 24/7",
    ]);
    expect(filaDesdeSitio(casa({ amenidades: ["pool", "Canchas de tenis"] }))?.amenidades).toEqual(["piscina", "Canchas de tenis"]);
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
  it("la zona sale del barrio más preciso; si hay dudas, pregunta una vez y luego respeta lo que contestó el corredor", async () => {
    const dudosa = casa({ codigo: "DP-LHD6L0", titulo: { es: "VENTA LINDORA SANTA ANA CONDOMINIO LA ESCONDIDA" }, ubicacion: "Santa Ana Centro, Santa Ana", distrito: "Santa Ana Centro", imagenes: [] });
    const db = supabaseFalso({
      propiedades: [],
      // Una respuesta de otro corredor sobre el mismo código no cuenta.
      conocimiento: [{ id: "k-otro", corredor_id: ID.otro, tema: "Ubicación DP-LHD6L0: x", respuesta: "Cartago", estado: "activo" }],
    });
    const r1 = await sincronizarSitio(db as never, { id: ID.deluxe }, [dudosa], HOST);
    expect(r1).toMatchObject({ creadas: 1, ubicacionesPorConfirmar: 1 });
    const propia = () => db.tablas.propiedades.find((p) => p.codigo === "DP-LHD6L0")!;
    expect(propia().zona).toBe("Lindora"); // la mejor conjetura
    const pregunta = db.tablas.conocimiento.find((k) => k.corredor_id === ID.deluxe)!;
    expect(pregunta).toMatchObject({ estado: "pendiente", origen: "duda" });
    expect(String(pregunta.tema)).toMatch(/^Ubicación DP-LHD6L0: .*Opciones: Lindora \| Santa Ana$/);

    // La siguiente vuelta no vuelve a preguntar ni escribe nada.
    const antes = db.escrituras.length;
    expect(await sincronizarSitio(db as never, { id: ID.deluxe }, [dudosa], HOST)).toMatchObject({ ubicacionesPorConfirmar: 0, actualizadas: 0 });
    expect(db.escrituras.length).toBe(antes);

    // Patricia contesta "Santa Ana": la importación lo respeta en cada vuelta, aunque el sitio diga otra cosa.
    Object.assign(pregunta, { estado: "activo", respuesta: "Santa Ana" });
    expect(await sincronizarSitio(db as never, { id: ID.deluxe }, [dudosa], HOST)).toMatchObject({ actualizadas: 1 });
    expect(propia().zona).toBe("Santa Ana");
    const antes2 = db.escrituras.length;
    await sincronizarSitio(db as never, { id: ID.deluxe }, [dudosa], HOST);
    expect(db.escrituras.length).toBe(antes2);
    expect(db.tablas.conocimiento.filter((k) => k.corredor_id === ID.deluxe)).toHaveLength(1);
  });

  it("una casa segura no pregunta; si una dudosa se aclara en el sitio, la pregunta pendiente se archiva", async () => {
    const db = supabaseFalso({
      propiedades: [],
      conocimiento: [{ id: "k1", corredor_id: ID.deluxe, tema: "Ubicación DP-1A2B3C: ¿dónde queda «x»? El sitio dice «y».", respuesta: null, estado: "pendiente" }],
    });
    const r = await sincronizarSitio(db as never, { id: ID.deluxe }, [casa({ imagenes: [] })], HOST);
    expect(r.ubicacionesPorConfirmar).toBe(0);
    expect(db.tablas.propiedades[0].zona).toBe("Lindora");
    expect(db.tablas.conocimiento[0].estado).toBe("archivado");
  });
});

describe("Fotos subidas desde el portal al sitio (al_sitio)", () => {
  const hace = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
  const urlPropia = (n: number) => `https://${HOST}/storage/v1/object/public/fotos/${ID.deluxe}/p1/${n}.jpg`;
  const db0 = (fotos: unknown[]) =>
    supabaseFalso({ propiedades: [{ id: "p1", corredor_id: ID.deluxe, codigo: "DP-1A2B3C", fotos, estado: "activa" }] });
  const fuentes = (db: ReturnType<typeof db0>) => (db.tablas.propiedades[0].fotos as { fuente?: string }[]).map((f) => f.fuente);

  it("una foto de menos de 30 min se conserva aunque la exportación aún no la liste", async () => {
    fetchFotos();
    const db = db0([
      { url: urlPropia(1), fuente: foto(1), orden: 1 },
      { url: urlPropia(9), fuente: foto(9), al_sitio: hace(5), orden: 2 },
    ]);
    await sincronizarSitio(db as never, { id: ID.deluxe }, [casa({ imagenes: [foto(1)] })], HOST);
    expect(fuentes(db)).toEqual([foto(1), foto(9)]);
  });

  it("una de más de 30 min que la exportación no lista se quita", async () => {
    fetchFotos();
    const db = db0([
      { url: urlPropia(1), fuente: foto(1), orden: 1 },
      { url: urlPropia(9), fuente: foto(9), al_sitio: hace(45), orden: 2 },
    ]);
    await sincronizarSitio(db as never, { id: ID.deluxe }, [casa({ imagenes: [foto(1)] })], HOST);
    expect(fuentes(db)).toEqual([foto(1)]);
  });

  it("cuando la exportación ya la lista no se duplica", async () => {
    fetchFotos();
    const db = db0([{ url: urlPropia(9), fuente: foto(9), al_sitio: hace(5), orden: 1 }]);
    const r = await sincronizarSitio(db as never, { id: ID.deluxe }, [casa({ imagenes: [foto(9)] })], HOST);
    expect(r.fotosCopiadas).toBe(0);
    expect(fuentes(db)).toEqual([foto(9)]);
  });
});

describe("Fotos del sitio con la forma real de la exportación", () => {
  const H = HOST_EXPORTACION;
  const pub = (llave: string) => `https://${H}/storage/v1/object/public/${llave}`;

  it("TC-01: trae TODAS las fotos que el sitio muestra (35 y 25), en su orden y con la llave codificada (%2F)", async () => {
    fetchFotos();
    const db = supabaseFalso({ propiedades: [] });
    const exp = exportacionReal();
    const r = await sincronizarSitio(db as never, { id: ID.deluxe }, exp.propiedades, H);
    expect(r).toMatchObject({ creadas: 4, fotosCopiadas: 60, fotosPendientes: 0, casasConFotos: 2, casasSinFotos: 2, fotosEnSitio: 60, fotosEnPortal: 60, fallidos: 0 });
    const lindora = db.tablas.propiedades.find((p) => p.codigo === "DP-AAAAA1")!;
    // Antes el importador cortaba en 30: las fotos 31 a 35 nunca llegaban.
    expect((lindora.fotos as { fuente: string }[]).map((f) => f.fuente)).toEqual(exp.propiedades[0].imagenes);
    const malinches = db.tablas.propiedades.find((p) => p.codigo === "DP-AAAAA2")!;
    expect((malinches.fotos as { fuente: string; orden: number }[]).map((f) => f.fuente)).toEqual(exp.propiedades[1].imagenes);
    expect((malinches.fotos as { orden: number }[]).map((f) => f.orden)).toEqual(Array.from({ length: 25 }, (_, i) => i + 1));
  });

  it("TC-02: una casa con `imagenes: []` queda sin fotos (no pide nada) y, cuando el sitio le suba fotos, se traen", async () => {
    fetchFotos();
    const db = supabaseFalso({ propiedades: [] });
    const exp = exportacionReal();
    const sinFotos = exp.propiedades.filter((c) => !(c.imagenes ?? []).length);
    await sincronizarSitio(db as never, { id: ID.deluxe }, sinFotos, H);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
    const conFotos = sinFotos.map((c, i) => ({ ...c, imagenes: [fotoCarpeta(`e24-${i}`, 1), fotoCarpeta(`e24-${i}`, 2)] }));
    const r = await sincronizarSitio(db as never, { id: ID.deluxe }, conFotos, H);
    expect(r).toMatchObject({ fotosCopiadas: 4, casasConFotos: 2, casasSinFotos: 0 });
  });

  it("TC-03: acepta la dirección transformada que usa el sitio (/render/image/…?width=) y la llave sola del bucket", () => {
    const lista = [
      `https://${H}/storage/v1/render/image/public/property-media/images/a.jpg?width=480&quality=70`,
      "property-media/los-reyes%2Fg1.jpeg",
      pub("property-media/images/a.jpg"), // la misma que la transformada: no se repite
      `https://abcdefghijklmnopqrst.storage.supabase.co/storage/v1/object/public/property-media/images/b.jpg`,
    ];
    expect(fotosDeCasa(lista, H)).toEqual([
      pub("property-media/images/a.jpg"),
      pub("property-media/los-reyes%2Fg1.jpeg"),
      `https://abcdefghijklmnopqrst.storage.supabase.co/storage/v1/object/public/property-media/images/b.jpg`,
    ]);
    expect(hostsDeFotos(H)).toEqual([H, "abcdefghijklmnopqrst.storage.supabase.co"]);
    expect(hostsDeFotos("sitio.example.com")).toEqual(["sitio.example.com"]);
  });

  it("TC-04: rechaza cualquier otro servidor o ruta (SSRF) y no gasta presupuesto en ellas", async () => {
    const malas = [
      "https://otroproyectoxxxxxxxx.supabase.co/storage/v1/object/public/property-media/x.jpg",
      `https://${H}.evil.com/storage/v1/object/public/x.jpg`,
      `http://${H}/storage/v1/object/public/property-media/x.jpg`,
      `https://${H}:8443/storage/v1/object/public/property-media/x.jpg`,
      `https://user:pw@${H}/storage/v1/object/public/property-media/x.jpg`,
      `https://${H}/storage/v1/object/sign/property-media/x.jpg?token=t`,
      `https://${H}/rest/v1/properties`,
      `https://${H}/storage/v1/object/public/property-media/%2e%2e/secreto.jpg`,
      "https://images.unsplash.com/photo-1.jpg",
      "https://img.encuentra24.com/foto.jpg",
      "//abcdefghijklmnopqrst.supabase.co/storage/v1/object/public/x.jpg",
      "data:image/jpeg;base64,AAAA",
      "../../etc/passwd",
      42,
      null,
    ];
    expect(fotosDeCasa(malas, H)).toEqual([]);
    fetchFotos();
    const db = supabaseFalso({ propiedades: [] });
    const c = exportacionReal().propiedades[0];
    const r = await sincronizarSitio(db as never, { id: ID.deluxe }, [{ ...c, imagenes: [...malas, fotoSemilla("lindora", 1)] as unknown[] }], H, { maxFotos: 1 });
    expect(r).toMatchObject({ fotosCopiadas: 1, fotosPendientes: 0, fotosDescartadas: malas.length });
    expect(vi.mocked(fetch).mock.calls.map(([u]) => String(u))).toEqual([fotoSemilla("lindora", 1)]);
  });

  it("TC-05: con tope por vuelta avanza en varias vueltas, sin repetir, y deja las cuentas a la vista", async () => {
    fetchFotos();
    const db = supabaseFalso({ propiedades: [] });
    const casas = exportacionReal().propiedades;
    const v1 = await sincronizarSitio(db as never, { id: ID.deluxe }, casas, H, { maxFotos: 40 });
    expect(v1).toMatchObject({ fotosCopiadas: 40, fotosPendientes: 20, fotosEnPortal: 40 });
    const v2 = await sincronizarSitio(db as never, { id: ID.deluxe }, casas, H, { maxFotos: 40 });
    expect(v2).toMatchObject({ fotosCopiadas: 20, fotosPendientes: 0, fotosEnPortal: 60 });
    const v3 = await sincronizarSitio(db as never, { id: ID.deluxe }, casas, H, { maxFotos: 40 });
    expect(v3).toMatchObject({ fotosCopiadas: 0, fotosPendientes: 0, fotosEnPortal: 60 });
    expect(new Set(db.subidas).size).toBe(60);
  });

  it("TC-06: una foto que el sitio quita sale del portal y el orden sigue al del sitio", async () => {
    fetchFotos();
    const db = supabaseFalso({ propiedades: [] });
    const c = exportacionReal().propiedades[1];
    await sincronizarSitio(db as never, { id: ID.deluxe }, [c], H);
    const nuevas = [c.imagenes![2], c.imagenes![0]] as string[];
    const r = await sincronizarSitio(db as never, { id: ID.deluxe }, [{ ...c, imagenes: nuevas }], H);
    expect(r.fotosCopiadas).toBe(0);
    expect((db.tablas.propiedades[0].fotos as { fuente: string }[]).map((f) => f.fuente)).toEqual(nuevas);
  });
});
