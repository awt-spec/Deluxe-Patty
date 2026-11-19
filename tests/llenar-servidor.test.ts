// "Llenar con Patty" y "Preparar un anuncio" del lado del servidor (lib/encuentra24/llenar.ts y las rutas
// /api/extension/anuncios-listos, anuncio-listo, casas-para-anuncio y preparar-anuncio): siempre del corredor del
// permiso, solo fotos originales propias en el orden preparado, la descripción termina con el enlace de WhatsApp con la
// referencia, y la demo no gasta.
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { descripcionConEnlace, enlaceWhatsApp } from "../lib/anuncios/atribucion";
import type { Dependencias } from "../lib/asistente/contexto";
import type { Corredor } from "../lib/datos/tipos";
import { huella, type DependenciasExtension } from "../lib/encuentra24/extension";
import { anuncioParaLlenar, anunciosListos, datosParaLlenar, ordenDeFotos, prepararDesdeExtension, type DependenciasPreparar } from "../lib/encuentra24/llenar";
import { ID, supabaseFalso, type SupabaseFalso } from "./acciones/entorno";

const BASE = "https://abc.supabase.co";
const antes = process.env.NEXT_PUBLIC_SUPABASE_URL;
beforeAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = BASE;
});
afterAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = antes;
});

const foto = (corredor: string, n: number) => `${BASE}/storage/v1/object/public/fotos/${corredor}/casa/originales/${n}.jpg`;
const ANUNCIO = "aaaaaaaa-1111-4111-8111-111111111111";
const ANUNCIO_AJENO = "aaaaaaaa-2222-4222-8222-222222222222";
const TOKEN = "a".repeat(64);
const NUMERO = "+506 8888 7777";

const corredor = { id: ID.deluxe, whatsapp_numero: NUMERO, nombre_asistente: "Patty" } as Corredor;

function casa(extra: Record<string, unknown> = {}) {
  return {
    id: ID.casa,
    corredor_id: ID.deluxe,
    codigo: "DP-0001",
    titulo: "Casa en Escazú",
    tipo: "casa",
    operacion: "venta",
    precio: 350000,
    moneda: "USD",
    provincia: "San José",
    canton: "Escazú",
    distrito: "San Rafael",
    zona: "Trejos Montealegre",
    habitaciones: 3,
    banos: 2.5,
    m2_construccion: 280,
    m2_terreno: 450,
    amenidades: ["Piscina"],
    estado: "activa",
    notas: "comisión 5 %",
    fotos: [
      { url: foto(ID.deluxe, 1), orden: 1, mejorada_url: foto(ID.deluxe, 11) },
      { url: foto(ID.otro, 2), orden: 2 },
      { url: "https://malo.example/3.jpg", orden: 3 },
      { url: foto(ID.deluxe, 4), orden: 4 },
      { url: foto(ID.deluxe, 5), orden: 5 },
    ],
    ...extra,
  };
}

const TEXTO = {
  es: { titulo: "Casa con vista en Escazú", descripcion: "Linda casa con piscina." },
  en: { titulo: "House with a view", descripcion: "Lovely house." },
  // La 5 primero, luego la 4, luego la ajena (2), que se descarta.
  orden_fotos: [
    { foto: 5, muestra: "fachada" },
    { foto: 4, muestra: "sala" },
    { foto: 2, muestra: "cocina" },
  ],
  sugerencias: [],
};

function anuncio(extra: Record<string, unknown> = {}) {
  return { id: ANUNCIO, corredor_id: ID.deluxe, referencia: "A1B2C3", titulo: "Casa con vista", propiedad_id: ID.casa, estado: "borrador", texto_preparado: TEXTO, ...extra };
}

function base(): SupabaseFalso {
  return supabaseFalso({
    propiedades: [casa(), casa({ id: ID.casaAjena, corredor_id: ID.otro, codigo: "OT-1" })],
    anuncios_e24: [anuncio(), anuncio({ id: ANUNCIO_AJENO, corredor_id: ID.otro, referencia: "ZZZZZZ", propiedad_id: ID.casaAjena })],
  });
}

describe("datosParaLlenar y ordenDeFotos", () => {
  it("las fotos van en el orden preparado y luego las demás, solo originales propias y sin repetir", () => {
    expect(ordenDeFotos(casa().fotos, TEXTO.orden_fotos, ID.deluxe)).toEqual([foto(ID.deluxe, 5), foto(ID.deluxe, 4), foto(ID.deluxe, 1)]);
    expect(ordenDeFotos(casa().fotos, [], ID.deluxe, 1)).toEqual([foto(ID.deluxe, 1)]);
    // Nunca la mejorada (la original es la que se publica) ni fotos de otro corredor.
    const todas = ordenDeFotos(casa().fotos, TEXTO.orden_fotos, ID.deluxe).join(" ");
    expect(todas).not.toContain("/11.jpg");
    expect(todas).not.toContain(ID.otro);
  });

  it("hasta 20 fotos", () => {
    const muchas = Array.from({ length: 30 }, (_, i) => ({ url: foto(ID.deluxe, i + 1), orden: i }));
    expect(ordenDeFotos(muchas, [], ID.deluxe)).toHaveLength(20);
  });

  it("la descripción termina con el enlace de WhatsApp con la referencia, igual que la que manda la asistente", () => {
    const d = datosParaLlenar(anuncio(), casa(), corredor)!;
    const enlace = enlaceWhatsApp(NUMERO, "A1B2C3");
    expect(d.es.descripcion).toBe(descripcionConEnlace("Linda casa con piscina.", enlace, "es"));
    expect(d.es.descripcion.endsWith(`Escríbeme por WhatsApp: ${enlace}`)).toBe(true);
    expect(d.en?.descripcion.endsWith(`Message me on WhatsApp: ${enlace}`)).toBe(true);
    expect(decodeURIComponent(enlace)).toContain("ref. A1B2C3");
    expect(d).toMatchObject({ operacion: "venta", tipo: "casa", precio: 350000, moneda: "USD", provincia: "San José", habitaciones: 3, banos: 2.5, conEnlace: true });
    // Nada que no se publica.
    expect(JSON.stringify(d)).not.toMatch(/comisi|notas/);
  });

  it("sin número de la asistente no hay enlace (y se dice); casa vendida, sin texto o de otra casa: nada", () => {
    expect(datosParaLlenar(anuncio(), casa(), { ...corredor, whatsapp_numero: null })).toMatchObject({ conEnlace: false, es: { descripcion: "Linda casa con piscina." } });
    expect(datosParaLlenar(anuncio(), casa({ estado: "vendida" }), corredor)).toBeNull();
    expect(datosParaLlenar(anuncio({ texto_preparado: { es: { titulo: "" } } }), casa(), corredor)).toBeNull();
    expect(datosParaLlenar(anuncio({ propiedad_id: ID.casaAjena }), casa(), corredor)).toBeNull();
  });
});

describe("consultas: siempre del corredor", () => {
  it("anuncioParaLlenar: el de otro corredor no sale, aunque se pida por su id", async () => {
    const db = base();
    expect(await anuncioParaLlenar(db as unknown as SupabaseClient, corredor, ANUNCIO_AJENO)).toBeNull();
    expect((await anuncioParaLlenar(db as unknown as SupabaseClient, corredor, ANUNCIO))?.referencia).toBe("A1B2C3");
    expect(db.escrituras).toEqual([]);
  });

  it("anunciosListos: solo los suyos, con portada propia", async () => {
    const lista = await anunciosListos(base() as unknown as SupabaseClient, ID.deluxe);
    expect(lista).toEqual([{ id: ANUNCIO, referencia: "A1B2C3", titulo: "Casa con vista en Escazú", casa: { codigo: "DP-0001", titulo: "Casa en Escazú" }, portada: foto(ID.deluxe, 5) }]);
  });
});

// --- Rutas -------------------------------------------------------------------------------------------------------

const estado: { db: SupabaseFalso; preparar: DependenciasPreparar | null } = { db: supabaseFalso(), preparar: null };
const deps: { actual: DependenciasExtension | null } = { actual: null };
vi.mock("@/lib/encuentra24/extension-servidor", async (original) => ({
  ...(await original<typeof import("../lib/encuentra24/extension-servidor")>()),
  dependenciasExtension: () => deps.actual!,
  baseLlenar: () => estado.db,
  dependenciasPreparar: () => estado.preparar!,
}));

beforeEach(() => {
  estado.db = base();
  deps.actual = {
    almacen: {
      corredorDeToken: async (h: string) => (h === huella(TOKEN) ? ID.deluxe : null),
      corredor: async (id: string) => (id === ID.deluxe ? { ...corredor } : null),
    },
  } as unknown as DependenciasExtension;
});

const con = (token?: string): Record<string, string> => (token ? { authorization: `Bearer ${token}` } : {});

describe("rutas de Llenar con Patty", () => {
  it("sin permiso o con uno inválido: 401 en todas y no lee nada", async () => {
    const listos = await import("../app/api/extension/anuncios-listos/route");
    const uno = await import("../app/api/extension/anuncio-listo/route");
    const casas = await import("../app/api/extension/casas-para-anuncio/route");
    const preparar = await import("../app/api/extension/preparar-anuncio/route");
    for (const t of [undefined, "b".repeat(64)]) {
      const r = [
        await listos.GET(new Request("https://app/api/extension/anuncios-listos", { headers: con(t) })),
        await uno.GET(new Request(`https://app/api/extension/anuncio-listo?id=${ANUNCIO}`, { headers: con(t) })),
        await casas.GET(new Request("https://app/api/extension/casas-para-anuncio", { headers: con(t) })),
        await preparar.POST(new Request("https://app/api/extension/preparar-anuncio", { method: "POST", headers: con(t), body: JSON.stringify({ casaId: ID.casa }) })),
      ];
      for (const x of r) {
        expect(x.status).toBe(401);
        expect((await x.json()).motivo).toBe("permiso");
      }
    }
  });

  it("GET anuncios-listos y casas-para-anuncio: solo lo del corredor del permiso", async () => {
    const { GET } = await import("../app/api/extension/anuncios-listos/route");
    const r = await (await GET(new Request("https://app/x", { headers: con(TOKEN) }))).json();
    expect(r.anuncios.map((a: { id: string }) => a.id)).toEqual([ANUNCIO]);
    const casas = await import("../app/api/extension/casas-para-anuncio/route");
    const c = await (await casas.GET(new Request("https://app/x", { headers: con(TOKEN) }))).json();
    expect(c.casas).toEqual([{ id: ID.casa, codigo: "DP-0001", titulo: "Casa en Escazú", portada: foto(ID.deluxe, 1), conBorrador: true }]);
  });

  it("GET anuncio-listo: el suyo con todo; el de otro corredor, 404; un id raro, 400", async () => {
    const { GET } = await import("../app/api/extension/anuncio-listo/route");
    const pedir = (id: string) => GET(new Request(`https://app/api/extension/anuncio-listo?id=${encodeURIComponent(id)}`, { headers: con(TOKEN) }));
    const bien = await pedir(ANUNCIO);
    expect(bien.status).toBe(200);
    const { anuncio: a } = await bien.json();
    expect(a.fotos).toEqual([foto(ID.deluxe, 5), foto(ID.deluxe, 4), foto(ID.deluxe, 1)]);
    expect(a.es.descripcion).toMatch(/wa\.me\/50688887777\?text=.*A1B2C3$/);
    const ajeno = await pedir(ANUNCIO_AJENO);
    expect(ajeno.status).toBe(404);
    expect(JSON.stringify(await ajeno.json())).not.toContain("ZZZZZZ");
    expect((await pedir("1 or 1=1")).status).toBe(400);
  });
});

describe("Preparar un anuncio desde la extensión", () => {
  function preparar(extra: Partial<{ turno: boolean; presupuesto: boolean; falla: boolean }> = {}) {
    const llamadas = { ia: 0, uso: 0 };
    const db = estado.db;
    const repo = {
      presupuestoIA: async () => (extra.presupuesto === false ? { gastoDia: 5, gastoMes: 5, topeDia: 5, topeMes: 100 } : { gastoDia: 0, gastoMes: 0, topeDia: 5, topeMes: 100 }),
      propiedadPorCodigo: async (corredorId: string, codigo: string) =>
        (db.tablas.propiedades.find((p) => p.corredor_id === corredorId && p.codigo === codigo) as never) ?? null,
      guardarBorradorAnuncio: async (corredorId: string, propiedadId: string, titulo: string, texto: unknown) => {
        const fila = db.tablas.anuncios_e24.find((a) => a.corredor_id === corredorId && a.propiedad_id === propiedadId && a.estado === "borrador");
        if (fila) Object.assign(fila, { titulo, texto_preparado: texto });
        return (fila?.referencia as string) ?? "NUEVA1";
      },
      registrarUso: async () => {
        llamadas.uso++;
      },
    };
    const cerebro = {
      prepararAnuncio: async () => {
        llamadas.ia++;
        if (extra.falla) throw Object.assign(new Error("caída"), { status: 529 });
        return { tituloEs: "Nuevo título", descripcionEs: "Nueva descripción", tituloEn: "New", descripcionEn: "New desc", ordenFotos: [], sugerencias: [], consumo: { tokensEntrada: 10, tokensSalida: 20, costoUsd: 0.01 } };
      },
    };
    estado.preparar = {
      db: db as unknown as SupabaseClient,
      deps: { repo, cerebro, registrar: () => {} } as unknown as Dependencias,
      hayTurno: async () => extra.turno !== false,
    };
    return llamadas;
  }

  const pedir = async (casaId: string) => {
    const { POST } = await import("../app/api/extension/preparar-anuncio/route");
    return POST(new Request("https://app/api/extension/preparar-anuncio", { method: "POST", headers: con(TOKEN), body: JSON.stringify({ casaId }) }));
  };

  it("prepara con la misma IA, suma el gasto y devuelve el anuncio para llenarlo", async () => {
    const llamadas = preparar();
    const r = await pedir(ID.casa);
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j).toMatchObject({ ok: true, anuncio: { id: ANUNCIO, titulo: "Nuevo título" } });
    expect(llamadas).toEqual({ ia: 1, uso: 1 });
  });

  it("la casa de otro corredor: 404 y nada de IA", async () => {
    const llamadas = preparar();
    const r = await pedir(ID.casaAjena);
    expect(r.status).toBe(404);
    expect(llamadas.ia).toBe(0);
  });

  it("frenos: más de 4 por minuto (429) o sin energía, sin llamar a la IA; una falla de la IA se explica sin detalles", async () => {
    let llamadas = preparar({ turno: false });
    expect((await pedir(ID.casa)).status).toBe(429);
    expect(llamadas.ia).toBe(0);
    llamadas = preparar({ presupuesto: false });
    expect(await (await pedir(ID.casa)).json()).toMatchObject({ ok: false, motivo: "sin_presupuesto" });
    expect(llamadas.ia).toBe(0);
    llamadas = preparar({ falla: true });
    const j = await (await pedir(ID.casa)).json();
    expect(j).toMatchObject({ ok: false, motivo: "ia" });
    expect(j.mensaje).not.toMatch(/caída|529/);
  });

  it("la demo (corredor inactivo) no llama a la IA ni guarda nada", async () => {
    const llamadas = preparar();
    const antesTexto = JSON.stringify(estado.db.tablas.anuncios_e24);
    const r = await prepararDesdeExtension(estado.preparar!, { ...corredor, activo: false }, ID.casa);
    expect(r).toMatchObject({ ok: true, demo: true, anuncio: null });
    expect(llamadas).toEqual({ ia: 0, uso: 0 });
    expect(JSON.stringify(estado.db.tablas.anuncios_e24)).toBe(antesTexto);
  });

  it("un casaId que no es uuid: 400", async () => {
    preparar();
    expect((await pedir("DP-0001")).status).toBe(400);
  });
});
