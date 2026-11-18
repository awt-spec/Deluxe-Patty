import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ID, conAlertasReales, estado, supabaseFalso } from "./entorno";

// Subir fotos al sitio web desde el chat de Patty: solo casas del sitio del propio corredor, solo fotos de su carpeta
// de envío, nada sale sin "Sí, subir al sitio", la demo no llama al sitio y un segundo toque no repite el envío.

vi.mock("next/navigation", () => import("./mocks/navegacion"));
vi.mock("next/cache", () => import("./mocks/cache"));
vi.mock("next/headers", () => import("./mocks/headers"));
vi.mock("@/lib/panel/sesion", () => import("./mocks/sesion"));
vi.mock("@/lib/supabase/admin", () => import("./mocks/admin"));

const presupuesto = { gastoDia: 0, gastoMes: 0, topeDia: 10, topeMes: 150 };
const mejorar = vi.fn(async () => ({ imagen: Buffer.from("mejorada"), costoUsd: 0.2 }));
const registrarImagenes = vi.fn(async () => {});
const subirArchivo = vi.fn(async (c: string, _b: string, ruta: string) => `https://portal.supabase.co/storage/v1/object/public/fotos/${c}/${ruta}`);
vi.mock("@/lib/asistente/dependencias", () => ({
  dependenciasPara: () => ({ repo: { presupuestoIA: async () => presupuesto, registrarImagenes, subirArchivo }, fotos: { mejorar }, whatsapp: {}, db: estado.admin }),
}));

const acciones = await import("@/app/panel/patty-sitio-acciones");

const SECRETO = "secreto-de-prueba-muy-largo-123";
const SITIO_FN = "https://gaogmucqywqhybaezzpo.supabase.co/functions/v1/recibir-fotos";
const HOST_SITIO = "https://gaogmucqywqhybaezzpo.supabase.co/storage/v1/object/public/property-media/images";
const CASA_OTRA_PROPIA = "60000000-0000-4000-8000-000000000003";
const corredor = { id: ID.deluxe, activo: true, nombre: "Deluxe", nombre_asistente: "Patty", imagenes_activas: true };
const camino = (casa: string, n: number, corredorId: string = ID.deluxe) => `${corredorId}/${casa}/al-sitio/1700000000000-abc123-${n}.jpg`;

const respuestaSitio = (n: number) =>
  new Response(
    JSON.stringify({ ok: true, fotos: Array.from({ length: n }, (_, i) => ({ url: `${HOST_SITIO}/nueva-${i}.jpg` })), url_casa: "https://www.deluxeproperties.sale/propiedad/casa-escazu" }),
    { status: 200 },
  );
const fetchSitio = vi.fn(async (_u: string, _i?: RequestInit) => respuestaSitio(2));

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(presupuesto, { gastoDia: 0, gastoMes: 0 });
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://portal.supabase.co";
  process.env.SITIO_FOTOS_URL = SITIO_FN;
  process.env.SITIO_FOTOS_SECRETO = SECRETO;
  vi.stubGlobal("fetch", fetchSitio);
  const filas = () => ({
    corredores: [
      { id: ID.deluxe, slug: "deluxe-properties" },
      { id: ID.otro, slug: "otro" },
    ],
    propiedades: [
      { id: ID.casa, corredor_id: ID.deluxe, codigo: "DP-01AB2C", titulo: "Casa en Escazú", zona: "Escazú", estado: "activa", fotos: [{ url: "https://x/1.jpg", fuente: `${HOST_SITIO}/vieja.jpg` }] },
      { id: CASA_OTRA_PROPIA, corredor_id: ID.deluxe, codigo: "P-001", titulo: "Casa del portal", zona: null, estado: "activa", fotos: [] },
      { id: ID.casaAjena, corredor_id: ID.otro, codigo: "DP-ZZZ999", titulo: "Casa ajena", zona: null, estado: "activa", fotos: [] },
    ],
  });
  const admin = conAlertasReales(supabaseFalso(filas()));
  estado.sesion = { corredor, usuario: { id: ID.usuario, email: "patricia@ejemplo.com" }, supabase: conAlertasReales(supabaseFalso(filas())) };
  estado.admin = admin;
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.SITIO_FOTOS_URL;
  delete process.env.SITIO_FOTOS_SECRETO;
});

const escrituras = () => [...estado.sesion!.supabase.escrituras, ...estado.admin.escrituras];
const pedido = (casaId: string, fotos: { camino: string; usar: string }[], envio = "11111111-1111-4111-8111-111111111111") => ({ casaId, fotos, portada: 1, envio });

describe("Casas del sitio", () => {
  it("lista solo las casas del sitio (DP-) activas del corredor", async () => {
    const r = await acciones.casasDelSitio();
    expect(r).toMatchObject({ ok: true, demo: false });
    expect(r.ok && r.casas.map((c) => c.codigo)).toEqual(["DP-01AB2C"]);
  });

  it("sin la función del sitio configurada lo dice y no lista nada", async () => {
    delete process.env.SITIO_FOTOS_SECRETO;
    const r = await acciones.casasDelSitio();
    expect(r).toMatchObject({ ok: false, motivo: expect.stringMatching(/no está conectado/) });
  });
});

describe("Con datos de otro corredor no hace nada", () => {
  it("preparar, mejorar y subir a una casa ajena: no prepara subidas, no llama a la IA ni al sitio, no escribe", async () => {
    const espia = vi.spyOn(estado.admin.storage as { from: () => unknown }, "from");
    expect(await acciones.prepararFotosSitio(ID.casaAjena, 2)).toMatchObject({ ok: false });
    expect(await acciones.mejorarFotoSitio(ID.casaAjena, camino(ID.casaAjena, 1, ID.otro))).toMatchObject({ ok: false });
    expect(await acciones.subirFotosAlSitio(pedido(ID.casaAjena, [{ camino: camino(ID.casaAjena, 1, ID.otro), usar: "original" }]))).toMatchObject({ ok: false });
    expect(espia).not.toHaveBeenCalled();
    expect(mejorar).not.toHaveBeenCalled();
    expect(fetchSitio).not.toHaveBeenCalled();
    expect(escrituras()).toEqual([]);
  });

  it("fotos de la carpeta de otro corredor o de otra casa en su propia casa: no se mandan", async () => {
    const ajena = await acciones.subirFotosAlSitio(pedido(ID.casa, [{ camino: camino(ID.casa, 1, ID.otro), usar: "original" }]));
    const otraCasa = await acciones.subirFotosAlSitio(pedido(ID.casa, [{ camino: camino(CASA_OTRA_PROPIA, 1), usar: "original" }]));
    expect(ajena).toMatchObject({ ok: false });
    expect(otraCasa).toMatchObject({ ok: false });
    expect(fetchSitio).not.toHaveBeenCalled();
  });

  it("una casa propia que no es del sitio no recibe fotos", async () => {
    expect(await acciones.prepararFotosSitio(CASA_OTRA_PROPIA, 1)).toMatchObject({ ok: false });
  });
});

describe("Subir al sitio", () => {
  it("manda el pedido firmado y anota las fotos en la casa con su fuente (sin duplicar)", async () => {
    const r = await acciones.subirFotosAlSitio(
      pedido(ID.casa, [
        { camino: camino(ID.casa, 1), usar: "original" },
        { camino: camino(ID.casa, 2), usar: "mejorada" },
      ]),
    );
    expect(r).toEqual({ ok: true, demo: false, fotos: [`${HOST_SITIO}/nueva-0.jpg`, `${HOST_SITIO}/nueva-1.jpg`], urlCasa: "https://www.deluxeproperties.sale/propiedad/casa-escazu" });
    const [url, init] = fetchSitio.mock.calls[0];
    expect(url).toBe(SITIO_FN);
    const cuerpo = String(init!.body);
    expect((init!.headers as Record<string, string>)["x-firma"]).toBe(createHmac("sha256", SECRETO).update(cuerpo).digest("hex"));
    const datos = JSON.parse(cuerpo);
    expect(datos.codigo).toBe("DP-01AB2C");
    expect(datos.fotos).toEqual([
      { url: `https://portal.supabase.co/storage/v1/object/public/fotos/${camino(ID.casa, 1)}`, orden: 1 },
      { url: `https://portal.supabase.co/storage/v1/object/public/fotos/${camino(ID.casa, 2).replace(".jpg", "-mejorada.jpg")}`, orden: 2 },
    ]);
    expect(datos.portada_url).toBe(datos.fotos[1].url);
    expect(typeof datos.nonce).toBe("string");

    const casa = estado.admin.tablas.propiedades.find((p) => p.id === ID.casa)!;
    const fotos = casa.fotos as { url: string; fuente?: string; mejorada_url?: string }[];
    expect(fotos).toHaveLength(3);
    expect(fotos[1]).toMatchObject({ fuente: `${HOST_SITIO}/nueva-0.jpg`, url: expect.stringContaining("-1.jpg") });
    expect(fotos[2]).toMatchObject({ fuente: `${HOST_SITIO}/nueva-1.jpg`, mejorada_url: expect.stringContaining("-2-mejorada.jpg") });
    // Solo escribe en su casa.
    expect(estado.admin.escrituras.filter((e) => e.tabla === "propiedades").every((e) => e.filtros.some(([c, v]) => c === "corredor_id" && v === ID.deluxe))).toBe(true);
  });

  it("un segundo toque del mismo envío no vuelve a mandar nada", async () => {
    const p = pedido(ID.casa, [{ camino: camino(ID.casa, 1), usar: "original" }]);
    fetchSitio.mockResolvedValueOnce(respuestaSitio(1));
    await acciones.subirFotosAlSitio(p);
    const otra = await acciones.subirFotosAlSitio(p);
    expect(otra).toMatchObject({ ok: false });
    expect(fetchSitio).toHaveBeenCalledTimes(1);
  });

  it("si el sitio rechaza la firma, explica con palabras simples y suelta el envío para reintentar", async () => {
    fetchSitio.mockResolvedValueOnce(new Response(JSON.stringify({ ok: false, error: "firma" }), { status: 401 }));
    const r = await acciones.subirFotosAlSitio(pedido(ID.casa, [{ camino: camino(ID.casa, 1), usar: "original" }]));
    expect(r).toMatchObject({ ok: false, motivo: expect.stringMatching(/soporte/) });
    expect(estado.admin.tablas.propiedades.find((p) => p.id === ID.casa)!.fotos).toHaveLength(1);
    fetchSitio.mockResolvedValueOnce(respuestaSitio(1));
    expect(await acciones.subirFotosAlSitio(pedido(ID.casa, [{ camino: camino(ID.casa, 1), usar: "original" }]))).toMatchObject({ ok: true });
  });

  it("en la demo es simulado: no llama al sitio ni escribe", async () => {
    estado.sesion!.corredor = { ...corredor, activo: false };
    expect(await acciones.prepararFotosSitio(ID.casa, 2)).toEqual({ ok: true, demo: true });
    expect(await acciones.subirFotosAlSitio(pedido(ID.casa, []))).toEqual({ ok: true, demo: true, fotos: [], urlCasa: null });
    expect(await acciones.mejorarFotoSitio(ID.casa, camino(ID.casa, 1))).toMatchObject({ ok: false });
    expect(fetchSitio).not.toHaveBeenCalled();
    expect(mejorar).not.toHaveBeenCalled();
    expect(escrituras()).toEqual([]);
  });

  it("preparar da un permiso por foto dentro de la carpeta de envío de esa casa", async () => {
    const r = await acciones.prepararFotosSitio(ID.casa, 2);
    expect(r.ok && !r.demo && r.subidas.map((s) => s.camino)).toEqual([
      expect.stringMatching(new RegExp(`^${ID.deluxe}/${ID.casa}/al-sitio/[0-9]+-[a-z0-9]{6}-1\\.jpg$`)),
      expect.stringMatching(new RegExp(`^${ID.deluxe}/${ID.casa}/al-sitio/[0-9]+-[a-z0-9]{6}-2\\.jpg$`)),
    ]);
    expect(await acciones.prepararFotosSitio(ID.casa, 13)).toMatchObject({ ok: false });
  });
});

describe("Mejorar con IA antes de subir", () => {
  it("guarda la mejorada aparte y suma el gasto a la Energía", async () => {
    fetchSitio.mockResolvedValueOnce(new Response(Buffer.from("foto"), { status: 200, headers: { "content-type": "image/jpeg" } }));
    const r = await acciones.mejorarFotoSitio(ID.casa, camino(ID.casa, 1));
    expect(r).toMatchObject({ ok: true, camino: camino(ID.casa, 1).replace(".jpg", "-mejorada.jpg") });
    expect(fetchSitio.mock.calls[0][0]).toBe(`https://portal.supabase.co/storage/v1/object/public/fotos/${camino(ID.casa, 1)}`);
    expect(registrarImagenes).toHaveBeenCalledWith(ID.deluxe, 1, 0.2);
    expect(subirArchivo).toHaveBeenCalledWith(ID.deluxe, "fotos", `${ID.casa}/al-sitio/1700000000000-abc123-1-mejorada.jpg`, expect.any(Buffer), "image/jpeg");
  });

  it("sin Energía no llama a la IA", async () => {
    presupuesto.gastoMes = 150;
    const r = await acciones.mejorarFotoSitio(ID.casa, camino(ID.casa, 1));
    expect(r).toMatchObject({ ok: false, motivo: expect.stringMatching(/límite de gasto/) });
    expect(mejorar).not.toHaveBeenCalled();
  });
});
