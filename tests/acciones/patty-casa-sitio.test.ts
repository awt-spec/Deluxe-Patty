import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ID, conAlertasReales, estado, supabaseFalso } from "./entorno";

// Casa nueva publicada en el sitio desde el chat de Patty: solo casas propias, nada en la demo, pedido firmado, la casa
// del portal toma el código DP del sitio y sus fotos la dirección de allá, y un segundo toque no publica dos veces.

vi.mock("next/navigation", () => import("./mocks/navegacion"));
vi.mock("next/cache", () => import("./mocks/cache"));
vi.mock("next/headers", () => import("./mocks/headers"));
vi.mock("@/lib/panel/sesion", () => import("./mocks/sesion"));
vi.mock("@/lib/supabase/admin", () => import("./mocks/admin"));
vi.mock("@/lib/asistente/dependencias", () => ({ dependenciasPara: () => ({}) }));

const acciones = await import("@/app/panel/patty-casa-sitio-acciones");

const SECRETO = "secreto-de-prueba-muy-largo-123";
const BASE = "https://portal.supabase.co/storage/v1/object/public/fotos";
const HOST_SITIO = "https://gaogmucqywqhybaezzpo.supabase.co/storage/v1/object/public/property-media/images";
const foto = (n: number, corredor: string = ID.deluxe, casa: string = ID.casa) => `${BASE}/${corredor}/${casa}/originales/${n}.jpg`;
const TEXTOS = {
  titulo_es: "Casa en Escazú",
  titulo_en: "House in Escazú",
  descripcion_es: "Linda casa.",
  descripcion_en: "Nice house.",
  destacados_es: ["Piscina"],
  destacados_en: ["Pool"],
};
const ENVIO = "11111111-1111-4111-8111-111111111111";

const fetchSitio = vi.fn(
  async (_u: string, _i?: RequestInit) =>
    new Response(
      JSON.stringify({
        ok: true,
        codigo: "DP-A1B2C3",
        fotos: [{ url: `${HOST_SITIO}/portal-1.jpg` }, { url: `${HOST_SITIO}/portal-2.jpg` }],
        url_casa: "https://www.deluxeproperties.sale/propiedad/casa-escazu",
      }),
      { status: 200 },
    ),
);

function preparar(activo = true) {
  const filas = () => ({
    corredores: [
      { id: ID.deluxe, slug: "deluxe-properties" },
      { id: ID.otro, slug: "otro" },
    ],
    propiedades: [
      {
        id: ID.casa,
        corredor_id: ID.deluxe,
        codigo: "P-007",
        estado: "activa",
        titulo: "Casa en Escazú",
        operacion: "venta",
        tipo: "casa",
        precio: 450000,
        moneda: "USD",
        provincia: null,
        canton: "Escazú",
        distrito: null,
        zona: "Escazú",
        habitaciones: 3,
        banos: 2,
        m2_construccion: 280,
        m2_terreno: null,
        amenidades: ["piscina"],
        descripcion: "Linda casa.",
        fotos: [
          { url: foto(1), orden: 1 },
          { url: foto(2), orden: 2 },
          { url: "https://otro-lado.com/robada.jpg", orden: 3 },
        ],
      },
      { id: ID.casaAjena, corredor_id: ID.otro, codigo: "X-1", estado: "activa", titulo: "Ajena", operacion: "venta", tipo: "casa", precio: 1, fotos: [{ url: foto(1, ID.otro, ID.casaAjena) }] },
    ],
  });
  estado.sesion = {
    corredor: { id: ID.deluxe, activo, nombre: "Deluxe", nombre_asistente: "Patty" },
    usuario: { id: ID.usuario, email: "patricia@ejemplo.com" },
    supabase: conAlertasReales(supabaseFalso(filas())),
  };
  estado.admin = conAlertasReales(supabaseFalso(filas()));
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://portal.supabase.co";
  process.env.SITIO_FOTOS_URL = "https://gaogmucqywqhybaezzpo.supabase.co/functions/v1/recibir-fotos";
  process.env.SITIO_FOTOS_SECRETO = SECRETO;
  vi.stubGlobal("fetch", fetchSitio);
  preparar();
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.SITIO_FOTOS_URL;
  delete process.env.SITIO_FOTOS_SECRETO;
});

describe("publicarCasaEnSitio", () => {
  it("manda la casa firmada a recibir-casa con sus fotos propias y la casa toma el código DP", async () => {
    const r = await acciones.publicarCasaEnSitio({ casaId: ID.casa, textos: TEXTOS, envio: ENVIO });
    expect(r).toMatchObject({ ok: true, demo: false, codigo: "DP-A1B2C3", urlCasa: "https://www.deluxeproperties.sale/propiedad/casa-escazu" });
    const [url, init] = fetchSitio.mock.calls[0];
    expect(url).toBe("https://gaogmucqywqhybaezzpo.supabase.co/functions/v1/recibir-casa");
    const cuerpo = String(init!.body);
    expect((init!.headers as Record<string, string>)["x-firma"]).toBe(createHmac("sha256", SECRETO).update(cuerpo).digest("hex"));
    const datos = JSON.parse(cuerpo);
    expect(datos.accion).toBe("crear");
    expect(datos.fotos.map((f: { url: string }) => f.url)).toEqual([foto(1), foto(2)]);
    expect(datos.casa).toMatchObject({ operacion: "sale", tipo: "house", precio: 450000, titulo: { es: "Casa en Escazú", en: "House in Escazú" } });

    const casa = estado.admin.tablas.propiedades.find((p) => p.id === ID.casa)!;
    expect(casa.codigo).toBe("DP-A1B2C3");
    const fotos = casa.fotos as { url: string; fuente?: string; al_sitio?: string }[];
    expect(fotos[0]).toMatchObject({ url: foto(1), fuente: `${HOST_SITIO}/portal-1.jpg` });
    expect(fotos[1]).toMatchObject({ url: foto(2), fuente: `${HOST_SITIO}/portal-2.jpg` });
    expect(fotos.every((f) => f.al_sitio)).toBe(true);
  });

  it("con una casa de otro corredor no manda ni escribe nada", async () => {
    const r = await acciones.publicarCasaEnSitio({ casaId: ID.casaAjena, textos: TEXTOS, envio: ENVIO });
    expect(r.ok).toBe(false);
    expect(fetchSitio).not.toHaveBeenCalled();
    expect(estado.admin.escrituras.filter((e) => e.tabla === "propiedades")).toEqual([]);
  });

  it("en la demo es simulado: no llama al sitio", async () => {
    preparar(false);
    expect(await acciones.publicarCasaEnSitio({ casaId: ID.casa, textos: TEXTOS, envio: ENVIO })).toMatchObject({ ok: true, demo: true });
    expect(fetchSitio).not.toHaveBeenCalled();
  });

  it("sin el sitio conectado lo dice y no manda nada", async () => {
    delete process.env.SITIO_FOTOS_SECRETO;
    expect(await acciones.publicarCasaEnSitio({ casaId: ID.casa, textos: TEXTOS, envio: ENVIO })).toMatchObject({ ok: false, motivo: expect.stringMatching(/no está conectado/) });
    expect(fetchSitio).not.toHaveBeenCalled();
  });

  it("si el sitio rechaza la firma, no cambia la casa", async () => {
    fetchSitio.mockResolvedValueOnce(new Response(JSON.stringify({ ok: false, error: "firma" }), { status: 401 }));
    const r = await acciones.publicarCasaEnSitio({ casaId: ID.casa, textos: TEXTOS, envio: ENVIO });
    expect(r.ok).toBe(false);
    expect(estado.admin.tablas.propiedades.find((p) => p.id === ID.casa)!.codigo).toBe("P-007");
  });

  it("un segundo toque no la publica dos veces", async () => {
    await acciones.publicarCasaEnSitio({ casaId: ID.casa, textos: TEXTOS, envio: ENVIO });
    await acciones.publicarCasaEnSitio({ casaId: ID.casa, textos: TEXTOS, envio: ENVIO });
    expect(fetchSitio).toHaveBeenCalledTimes(1);
  });
});
