import { existsSync, readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { chromium, type Browser } from "playwright";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import type { Cerebro } from "../lib/asistente/cerebro";
import { SIN_CONSUMO } from "../lib/asistente/costo";
import { leerAnuncio, leerPaginaAnuncio, type DependenciasAnuncio } from "../lib/encuentra24/anuncio";
import { FICHA_VACIA } from "../lib/propiedades/conversar";
import { ID, supabaseFalso } from "./acciones/entorno";
import { corredorBase } from "./dobles";
import {
  FOTO_AJENA,
  FOTO_E24,
  FOTO_JSONLD_AJENA,
  ID_ANUNCIO,
  imagenDeTamano,
  LOGO_E24,
  paginaAnuncioE24,
  URL_ANUNCIO_E24,
  type OpcionesAnuncio,
} from "./fixtures/e24-anuncio";
import { DESAFIO_CLOUDFLARE } from "./fixtures/verificacion-e24";

// "Leer este anuncio" de punta a punta, sin tocar encuentra24.com: una página de anuncio ficticia (con la estructura
// real: RSC, JSON-LD, galería, wa.me) se abre en Chromium con todas las direcciones interceptadas; ahí corre la MISMA
// función que la extensión inyecta con chrome.scripting.executeScript (extraerAnuncio, sacada del texto de
// extension/background.js), y lo que devuelve pasa por la validación y la lógica del servidor
// (lib/encuentra24/anuncio.ts) con la base en memoria. Si no hay Chromium (ni el de Playwright ni uno del sistema),
// la parte del navegador se salta y la del servidor corre con la página ya extraída de referencia.

const NUMERO_ASISTENTE = "+50688887777";
const corredor = { ...corredorBase(), id: ID.deluxe };

/** El texto de `function extraerAnuncio() { … }` en background.js (termina en la primera "}" a columna 0). */
function funcionDeLaExtension(): string {
  const fuente = readFileSync("extension/background.js", "utf8");
  const inicio = fuente.indexOf("function extraerAnuncio()");
  if (inicio < 0) throw new Error("extraerAnuncio ya no está en extension/background.js");
  const fin = fuente.indexOf("\n}\n", inicio);
  return fuente.slice(inicio, fin + 2);
}

async function abrirNavegador(): Promise<Browser | null> {
  try {
    return await chromium.launch();
  } catch {
    const sistema = [process.env.CHROME_PATH, "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"].find(
      (r) => r && existsSync(r),
    );
    return sistema ? chromium.launch({ executablePath: sistema }).catch(() => null) : null;
  }
}

const navegador = await abrirNavegador();
afterAll(async () => navegador?.close());

type Extraida = Record<string, unknown> & { desafio: boolean; url: string; fotos: string[]; enlaces: string[]; jsonld: string[]; texto: string };

/** Abre la página en Chromium (sin red: todo se intercepta) y corre la función de la extensión. */
async function extraer(html: string, url = `${URL_ANUNCIO_E24}?utm_source=whatsapp#fotos`): Promise<Extraida> {
  if (!navegador) throw new Error("sin navegador");
  const ctx = await navegador.newContext();
  const pedidas: string[] = [];
  await ctx.route("**/*", (route) => {
    const u = route.request().url();
    pedidas.push(u);
    if (u.split("#")[0].split("?")[0] === URL_ANUNCIO_E24) return route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: html });
    if (u === LOGO_E24) return route.fulfill({ contentType: "image/svg+xml", body: imagenDeTamano(120, 40) });
    if (u.startsWith("https://photos.encuentra24.com/") || u === FOTO_AJENA) {
      return route.fulfill({ contentType: "image/svg+xml", body: imagenDeTamano(1024, 768) });
    }
    return route.abort();
  });
  try {
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: "load" });
    const r = (await page.evaluate(`(${funcionDeLaExtension()})()`)) as Extraida;
    // Ninguna dirección fuera de las interceptadas (la extensión no pide nada: solo lee la página).
    expect(pedidas.every((p) => /^https:\/\/(www|photos)\.encuentra24\.com\/|^https:\/\/tpc\.googlesyndication\.com\//.test(p))).toBe(true);
    return r;
  } finally {
    await ctx.close();
  }
}

/** Lo que el background manda al servidor: todo menos `desafio` (igual que leerAnuncio en background.js). */
function cuerpoParaServidor(e: Extraida): Record<string, unknown> {
  const { desafio: _desafio, ...datos } = e;
  return datos;
}

/** Ficha que "llena" el modelo a partir del texto que de verdad le llega (así se prueba que la página le llega). */
function cerebroQueLee() {
  return vi.fn(async (_c: unknown, conversacion: { texto: string }[]) => {
    const t = conversacion.map((m) => m.texto).join("\n");
    const ficha: typeof FICHA_VACIA = {
      ...FICHA_VACIA,
      titulo: /Casa en condominio en San Rafael de Escazú/.test(t) ? "Casa en condominio en San Rafael de Escazú" : "",
      tipo: /\bcasa\b/i.test(t) ? "casa" : null,
      operacion: /venta/i.test(t) ? "venta" : null,
      precio: /\$450\.000/.test(t) ? 450000 : null,
      moneda: /\$450\.000/.test(t) ? "USD" : null,
      zona: /Escazú/.test(t) ? "Escazú" : null,
      habitaciones: /3 habitaciones/.test(t) ? 3 : null,
    };
    return { ficha, pregunta: null, consumo: { ...SIN_CONSUMO, costoUsd: 0.01 } };
  });
}

/** Base en memoria con reclamar_alerta como en Postgres: gana si la clave no se reclamó en sus últimos p_minutos. */
function entorno(tablas: Record<string, Record<string, unknown>[]> = {}) {
  const db = supabaseFalso({ anuncios_e24: [], propiedades: [], alertas: [], ...tablas });
  let ahora = new Date("2026-11-15T15:00:00Z");
  db.rpc = async (nombre, args) => {
    db.rpcs.push({ nombre, args });
    if (nombre !== "reclamar_alerta") return { data: null, error: null };
    const { p_clave, p_minutos } = args as { p_clave: string; p_minutos: number };
    const fila = db.tablas.alertas.find((a) => a.clave === p_clave);
    if (fila && ahora.getTime() - new Date(fila.enviada_at as string).getTime() < p_minutos * 60_000) return { data: false, error: null };
    if (fila) fila.enviada_at = ahora.toISOString();
    else db.tablas.alertas.push({ clave: p_clave, enviada_at: ahora.toISOString() });
    return { data: true, error: null };
  };
  const fichaConversada = cerebroQueLee();
  const d: DependenciasAnuncio = {
    db: db as unknown as SupabaseClient,
    cerebro: { fichaConversada } as unknown as Pick<Cerebro, "fichaConversada">,
    repo: {
      presupuestoIA: async () => ({ gastoDia: 0, gastoMes: 0, topeDia: 10, topeMes: 150 }),
      registrarUso: async () => ({}) as never,
    },
    ahora: () => ahora,
  };
  const pasar = (segundos: number) => (ahora = new Date(ahora.getTime() + segundos * 1000));
  return { db, d, fichaConversada, pasar };
}

/** fetch de las fotos: anota lo pedido y devuelve un JPEG mínimo. */
function fotosFalsas() {
  const pedidas: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      pedidas.push(url);
      return new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), { headers: { "content-type": "image/jpeg" } });
    }),
  );
  return pedidas;
}

afterEach(() => vi.unstubAllGlobals());

const conNavegador = describe.skipIf(!navegador);

async function pagina(o: OpcionesAnuncio = {}) {
  const extraida = await extraer(paginaAnuncioE24(o));
  expect(extraida.desafio).toBe(false);
  const p = leerPaginaAnuncio(cuerpoParaServidor(extraida));
  expect(p).not.toBeNull();
  return { extraida, p: p! };
}

conNavegador("Subir casa desde la extensión: lo que saca de la página (Chromium)", () => {
  it("saca dirección, título, texto, JSON-LD, wa.me y fotos de la galería (también la diferida), sin el logo ni repetidas", async () => {
    const { extraida, p } = await pagina({ whatsapp: { numero: NUMERO_ASISTENTE, referencia: "A1B2C3" } });
    expect(extraida.url).toBe(`${URL_ANUNCIO_E24}?utm_source=whatsapp#fotos`);
    expect(extraida.titulo).toBe("Casa en condominio en San Rafael de Escazú | Encuentra24");
    expect(extraida.texto).toContain("Precio: $450.000, negociable.");
    expect(extraida.jsonld).toHaveLength(3); // el JSON-LD roto también viaja como texto; el servidor lo trata como dato
    expect(extraida.enlaces).toEqual([expect.stringMatching(/^https:\/\/wa\.me\/50688887777\?text=.*ref\.%20A1B2C3$/)]);
    expect(extraida.fotos).toEqual([FOTO_E24(1), FOTO_E24(2), FOTO_E24(3), FOTO_E24(4), FOTO_AJENA, FOTO_JSONLD_AJENA]);
    expect(extraida.fotos).not.toContain(LOGO_E24);
    // Del lado del servidor: dirección limpia e id del anuncio.
    expect(p.url).toBe(URL_ANUNCIO_E24);
    expect(p.e24Id).toBe(ID_ANUNCIO);
  });

  it("la verificación de Cloudflare se reconoce y no se manda", async () => {
    const r = await extraer(DESAFIO_CLOUDFLARE);
    expect(r.desafio).toBe(true);
  });
});

conNavegador("Subir casa desde la extensión: lo que hace el servidor con eso", () => {
  it("crea la casa pausada, con la dirección limpia y solo fotos de *.encuentra24.com", async () => {
    const pedidas = fotosFalsas();
    const { p } = await pagina({ whatsapp: { numero: NUMERO_ASISTENTE, referencia: null } });
    const { db, d, fichaConversada } = entorno();
    const r = await leerAnuncio(d, corredor, p);
    expect(r).toMatchObject({ ok: true, tipo: "traida", fotos: 4 });
    expect(fichaConversada).toHaveBeenCalledTimes(1);
    expect(pedidas).toEqual([FOTO_E24(1), FOTO_E24(2), FOTO_E24(3), FOTO_E24(4)]);
    expect(pedidas.every((u) => new URL(u).hostname.endsWith(".encuentra24.com"))).toBe(true);
    const [casa] = db.tablas.propiedades;
    expect(casa).toMatchObject({ corredor_id: ID.deluxe, estado: "inactiva", url_e24: URL_ANUNCIO_E24, operacion: "venta", precio: 450000, zona: "Escazú" });
    expect((casa.fotos as { url: string; orden: number }[]).map((f) => f.orden)).toEqual([1, 2, 3, 4]);
    expect(db.subidas.every((c) => c.startsWith(`${ID.deluxe}/${casa.id as string}/originales/e24-`))).toBe(true);
  });

  it("leerla otra vez (pasado el minuto) no la duplica ni gasta IA", async () => {
    fotosFalsas();
    const { p } = await pagina();
    const { db, d, fichaConversada, pasar } = entorno();
    expect(await leerAnuncio(d, corredor, p)).toMatchObject({ tipo: "traida" });
    pasar(120);
    const otra = await leerAnuncio(d, corredor, p);
    expect(otra).toMatchObject({ ok: true, tipo: "repetida" });
    expect(db.tablas.propiedades).toHaveLength(1);
    expect(fichaConversada).toHaveBeenCalledTimes(1);
  });

  it("con la referencia de un anuncio de la asistente, ese anuncio pasa a activo y la casa recibe el enlace", async () => {
    const pedidas = fotosFalsas();
    const { p } = await pagina({ whatsapp: { numero: NUMERO_ASISTENTE, referencia: "A1B2C3" } });
    const { db, d, fichaConversada } = entorno({
      anuncios_e24: [{ id: "a1", corredor_id: ID.deluxe, propiedad_id: ID.casa, referencia: "A1B2C3", estado: "borrador", titulo: "Casa", publicado_en: null }],
      propiedades: [{ id: ID.casa, corredor_id: ID.deluxe, codigo: "P-001", titulo: "Casa en Escazú", url_e24: null, estado: "activa" }],
    });
    const r = await leerAnuncio(d, corredor, p);
    expect(r).toMatchObject({ ok: true, tipo: "publicado", ruta: `/panel/propiedades/${ID.casa}` });
    expect(db.tablas.anuncios_e24[0]).toMatchObject({ estado: "activo", url: URL_ANUNCIO_E24, e24_id: ID_ANUNCIO, publicado_en: "2026-11-15" });
    expect(db.tablas.propiedades).toHaveLength(1);
    expect(db.tablas.propiedades[0]).toMatchObject({ url_e24: URL_ANUNCIO_E24, estado: "activa" });
    expect(fichaConversada).not.toHaveBeenCalled();
    expect(pedidas).toEqual([]);
  });

  it("sin precio en la página no guarda nada y dice qué falta", async () => {
    const pedidas = fotosFalsas();
    const { p } = await pagina({ sinPrecio: true });
    const { db, d } = entorno();
    const r = await leerAnuncio(d, corredor, p);
    expect(r).toMatchObject({ ok: false, motivo: "incompleta" });
    if (!r.ok) expect(r.mensaje).toContain("el precio");
    expect(db.tablas.propiedades).toEqual([]);
    expect(db.escrituras.filter((e) => e.tabla === "propiedades")).toEqual([]);
    expect(pedidas).toEqual([]);
  });

  it("los frenos: otra lectura antes de 10 s y el mismo anuncio antes de un minuto esperan; otro anuncio después sí pasa", async () => {
    fotosFalsas();
    const { p } = await pagina();
    const otro = leerPaginaAnuncio({ ...cuerpoParaServidor(await extraer(paginaAnuncioE24())), url: URL_ANUNCIO_E24.replace(ID_ANUNCIO, "39999999") })!;
    const { d, fichaConversada, pasar } = entorno();
    expect(await leerAnuncio(d, corredor, p)).toMatchObject({ ok: true });
    pasar(5);
    expect(await leerAnuncio(d, corredor, otro)).toMatchObject({ ok: false, motivo: "espera" });
    pasar(10);
    expect(await leerAnuncio(d, corredor, p)).toMatchObject({ ok: false, motivo: "espera", mensaje: expect.stringContaining("Acabo de leer ese anuncio") });
    pasar(15);
    expect(await leerAnuncio(d, corredor, otro)).toMatchObject({ ok: true, tipo: "traida" });
    expect(fichaConversada).toHaveBeenCalledTimes(2);
  });
});

describe("Subir casa desde la extensión: la función inyectada", () => {
  it("sigue en background.js y es autónoma (executeScript no lleva lo que está afuera de la función)", () => {
    const f = funcionDeLaExtension();
    expect(f.startsWith("function extraerAnuncio()")).toBe(true);
    // Solo usa globales del navegador: nada importado del módulo.
    expect(f).not.toMatch(/\b(esPaginaDeAnuncio|esVerificacion|APP|api|chrome)\b/);
  });
});
