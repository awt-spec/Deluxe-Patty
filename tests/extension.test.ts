import { describe, expect, it, vi } from "vitest";
import type { Cerebro } from "../lib/asistente/cerebro";
import { SIN_CONSUMO } from "../lib/asistente/costo";
import { buscarDuenos, type Bloqueado, type LeadDueno } from "../lib/encuentra24/busqueda";
import type { CorredorBusqueda } from "../lib/encuentra24/datos";
import {
  autenticar,
  conectar,
  consultarBusqueda,
  huella,
  iniciarBusqueda,
  nuevoCodigo,
  recibirPagina,
  terminarBusqueda,
  type AlmacenExtension,
  type DependenciasExtension,
  type EstadoBusqueda,
} from "../lib/encuentra24/extension";
import { urlListado, type AnuncioE24 } from "../lib/encuentra24/parsear";
import { corredorBase } from "./dobles";
import { anuncioE24, paginaE24 } from "./fixtures/e24";

const CAT = "bienes-raices-venta-de-propiedades-casas";
const ID = "c1";

/** Almacén en memoria con el mismo contrato que el de Supabase. */
function almacenEnMemoria(corredor: CorredorBusqueda | null, extra: { vistos?: string[]; bloqueados?: Bloqueado[] } = {}) {
  const conexiones: { corredorId: string; codigo: string | null; vence: Date | null; token: string | null; revocada: boolean }[] = [];
  const busquedas = new Map<string, { corredorId: string; estado: EstadoBusqueda; terminada: boolean; anuncios: Map<string, AnuncioE24> }>();
  const leads: { semana: string; lead: LeadDueno }[] = [];
  let n = 0;
  const copia = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
  const propia = (corredorId: string, id: string) => {
    const b = busquedas.get(id);
    return b && b.corredorId === corredorId ? b : undefined;
  };
  const almacen: AlmacenExtension = {
    async guardarCodigo(corredorId, codigo, vence) {
      conexiones.push({ corredorId, codigo, vence, token: null, revocada: false });
    },
    async canjearCodigo(codigo, token, ahora) {
      const c = conexiones.find((x) => x.codigo === codigo && x.vence! > ahora && !x.token);
      if (!c) return null;
      Object.assign(c, { codigo: null, vence: null, token });
      return c.corredorId;
    },
    async corredorDeToken(token) {
      return conexiones.find((x) => x.token === token && !x.revocada)?.corredorId ?? null;
    },
    async revocarToken(token) {
      for (const c of conexiones) if (c.token === token) c.revocada = true;
    },
    async revocarTodas(corredorId) {
      for (const c of conexiones) if (c.corredorId === corredorId) c.revocada = true;
    },
    async corredor(id) {
      return corredor && corredor.id === id ? corredor : null;
    },
    async idsVistos() {
      return new Set(extra.vistos ?? []);
    },
    async bloqueados() {
      return extra.bloqueados ?? [];
    },
    async crearBusqueda(corredorId, estado) {
      for (const [k, b] of busquedas) if (b.corredorId === corredorId) busquedas.delete(k);
      const id = `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
      busquedas.set(id, { corredorId, estado: copia(estado), terminada: false, anuncios: new Map() });
      return id;
    },
    async busqueda(corredorId, id) {
      const b = propia(corredorId, id);
      return b && !b.terminada ? copia(b.estado) : null;
    },
    async estadoDe(corredorId, id) {
      const b = propia(corredorId, id);
      return b ? copia(b.estado) : null;
    },
    async guardarEstado(corredorId, id, estado) {
      const b = propia(corredorId, id);
      if (b) b.estado = copia(estado);
    },
    async agregarAnuncios(corredorId, id, anuncios) {
      const b = propia(corredorId, id)!;
      const nuevos: string[] = [];
      for (const a of anuncios) {
        if (b.anuncios.has(a.id)) continue;
        b.anuncios.set(a.id, a);
        nuevos.push(a.id);
      }
      return nuevos;
    },
    async anuncios(corredorId, id) {
      return [...(propia(corredorId, id)?.anuncios.values() ?? [])];
    },
    async terminar(corredorId, id) {
      const b = propia(corredorId, id);
      if (b) {
        b.terminada = true;
        b.anuncios.clear();
      }
    },
    async guardarLeads(_corredorId, semana, nuevos) {
      for (const lead of nuevos) leads.push({ semana, lead });
    },
  };
  return { almacen, leads, busquedas, conexiones };
}

function corredor(extra: Partial<CorredorBusqueda> = {}): CorredorBusqueda {
  return {
    ...corredorBase(),
    id: ID,
    zonas_e24: ["escazu", "santa-ana"],
    categoria_busqueda_e24: CAT,
    precio_busqueda_min: 100_000,
    precio_busqueda_max: 1_000_000,
    ...extra,
  };
}

const cerebro = {
  clasificarAnuncio: vi.fn(async (a: { id: string; anunciante: { nombre: string | null } }) => ({
    esDueno: !/bienes ra/i.test(a.anunciante.nombre ?? ""),
    puntaje: 100 - Number(a.id),
    senales: ["texto en primera persona"],
    consumo: { ...SIN_CONSUMO, costoUsd: 0.001 },
  })),
} as unknown as Pick<Cerebro, "clasificarAnuncio">;

function dependencias(almacen: AlmacenExtension, costoHoy = 0): DependenciasExtension & { usos: unknown[] } {
  const usos: unknown[] = [];
  return {
    almacen,
    cerebro,
    usos,
    repo: {
      costoClaudeDelDia: async () => costoHoy,
      registrarUso: async (_id, delta) => {
        usos.push(delta);
        return {} as never;
      },
    },
  };
}

// Las mismas páginas del worker (tests/encuentra24.test.ts): Escazú 2 páginas, Santa Ana 1.
const paginas: Record<string, string> = {
  [urlListado(CAT, "escazu", 1)]: paginaE24([
    anuncioE24(1, "Agente", "Realty Uno"),
    anuncioE24(2, "Propietario", "Ana Mora"),
    anuncioE24(3, "Propietario", "Pedro Solís", { price: { currency: { symbol: "USD" }, amount: { value: 2_000_000 } } }),
  ]),
  [urlListado(CAT, "escazu", 2)]: paginaE24([
    anuncioE24(4, "Propietario", "Luis Vargas"),
    anuncioE24(5, "Propietario", "Bienes Raíces Escondidas", { user: { id: "u5", name: "Bienes Raíces Escondidas" } }),
    anuncioE24(6, "Propietario", "María Jiménez"),
  ]),
  [urlListado(CAT, "santa-ana", 1)]: paginaE24([anuncioE24(7, "Propietario", "Rosa Quesada")]),
};
const pagina = (url: string) => paginas[url] ?? paginaE24([anuncioE24(1, "Agente", "Realty Uno")]);

/** Lo que hace la extensión: abre cada dirección que le piden y la manda, hasta que no hay siguiente. */
async function recorrer(d: DependenciasExtension, abrir: (url: string) => string = pagina) {
  const inicio = await iniciarBusqueda(d, ID);
  if (!inicio.ok) throw new Error(inicio.motivo);
  const pedidas: string[] = [];
  for (let url: string | null = inicio.siguiente; url; ) {
    pedidas.push(url);
    const r = await recibirPagina(d, ID, { busqueda: inicio.busqueda, url, html: abrir(url) });
    if (!r.ok) throw new Error(r.motivo);
    url = r.siguiente;
  }
  return { busqueda: inicio.busqueda, pedidas };
}

describe("conexión de la extensión", () => {
  it("el código sirve una sola vez y da un permiso que se puede quitar", async () => {
    const { almacen } = almacenEnMemoria(corredor());
    const ahora = new Date("2026-10-19T12:00:00Z");
    const codigo = await nuevoCodigo(almacen, ID, ahora);
    expect(codigo).toMatch(/^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/);

    // Se acepta en minúsculas y sin guion.
    const conexion = await conectar(almacen, codigo.toLowerCase().replace("-", " "), ahora);
    expect(conexion?.corredorId).toBe(ID);
    expect(await conectar(almacen, codigo, ahora)).toBeNull();

    expect(await autenticar(almacen, `Bearer ${conexion!.token}`)).toBe(ID);
    expect(await autenticar(almacen, "Bearer otro")).toBeNull();
    expect(await autenticar(almacen, null)).toBeNull();
    await almacen.revocarTodas(ID, ahora);
    expect(await autenticar(almacen, `Bearer ${conexion!.token}`)).toBeNull();
  });

  it("el código vence a los 10 minutos y solo se guarda su huella", async () => {
    const { almacen, conexiones } = almacenEnMemoria(corredor());
    const ahora = new Date("2026-10-19T12:00:00Z");
    const codigo = await nuevoCodigo(almacen, ID, ahora);
    expect(conexiones[0].codigo).toBe(huella(codigo.replace("-", "")));
    expect(await conectar(almacen, codigo, new Date(ahora.getTime() + 11 * 60_000))).toBeNull();
  });
});

describe("búsqueda desde la extensión", () => {
  it("recorre las zonas por turnos y encuentra los mismos dueños que el worker", async () => {
    const extra = { vistos: ["6"], bloqueados: [{ nombre: "LUIS  vargas", anunciante_e24_id: null }] };
    const { almacen, leads, busquedas } = almacenEnMemoria(corredor(), extra);
    const d = dependencias(almacen);
    const { busqueda, pedidas } = await recorrer(d);

    expect(pedidas.map((u) => u.replace(/^.*casas\//, ""))).toEqual([
      "escazu",
      "santa-ana",
      "escazu?page=2",
      "santa-ana?page=2",
      "escazu?page=3",
    ]);
    // Antes de que Haiku termine, la extensión ve que sigue en proceso.
    expect(await consultarBusqueda(d, ID, busqueda)).toEqual({ ok: true, listo: false, paginas: 5 });

    await terminarBusqueda(d, ID, busqueda, new Date("2026-10-22T15:00:00Z"));
    const worker = await buscarDuenos(
      { categoria: CAT, zonas: ["escazu", "santa-ana"], precioMin: 100_000, precioMax: 1_000_000, yaVistos: new Set(extra.vistos), bloqueados: extra.bloqueados },
      async (url) => pagina(url),
      cerebro,
    );
    expect(leads.map((l) => l.lead.anuncio.id)).toEqual(worker.leads.map((l) => l.anuncio.id));
    expect(leads.map((l) => l.lead.anuncio.id)).toEqual(["2", "7"]);
    // La semana es el lunes local; el uso de Claude suma al corredor; los anuncios en tránsito se borran.
    expect(leads[0].semana).toBe("2026-10-19");
    expect(d.usos).toEqual([{ llamadasClaude: 3, tokensEntrada: 0, tokensSalida: 0, costoClaudeUsd: 0.003 }]);
    expect(busquedas.get(busqueda)!.anuncios.size).toBe(0);
    expect(await consultarBusqueda(d, ID, busqueda)).toEqual({
      ok: true,
      listo: true,
      resumen: { duenos: 2, paginas: 5, anuncios: 7, candidatos: 3 },
    });
  });

  it("solo acepta la página que pidió, y una búsqueda terminada ya no recibe páginas", async () => {
    const { almacen } = almacenEnMemoria(corredor());
    const d = dependencias(almacen);
    const inicio = await iniciarBusqueda(d, ID);
    if (!inicio.ok) throw new Error();
    const otra = urlListado(CAT, "santa-ana", 1);
    expect(await recibirPagina(d, ID, { busqueda: inicio.busqueda, url: otra, html: pagina(otra) })).toEqual({
      ok: false,
      motivo: "fuera_de_orden",
    });
    // Otro corredor no puede mandar páginas a esta búsqueda.
    expect(await recibirPagina(d, "otro", { busqueda: inicio.busqueda, url: inicio.siguiente, html: "" })).toEqual({
      ok: false,
      motivo: "no_encontrada",
    });
  });

  it("la verificación de Cloudflare se salta y la zona sigue", async () => {
    const { almacen, leads } = almacenEnMemoria(corredor({ zonas_e24: ["escazu"] }));
    const d = dependencias(almacen);
    const DESAFIO = "<title>Just a moment...</title><script src='/cdn-cgi/challenge-platform/x.js'></script>";
    const { busqueda, pedidas } = await recorrer(d, (url) => (url.endsWith("escazu") ? DESAFIO : pagina(url)));
    // Página 1 bloqueada; la 2 y la 3 traen anuncios; la 4 ya no trae nada nuevo y la zona termina.
    expect(pedidas.map((u) => u.replace(/^.*casas\//, ""))).toEqual(["escazu", "escazu?page=2", "escazu?page=3", "escazu?page=4"]);
    await terminarBusqueda(d, ID, busqueda);
    expect(leads.map((l) => l.lead.anuncio.id)).toEqual(["4", "6"]);
    expect(await consultarBusqueda(d, ID, busqueda)).toMatchObject({ ok: true, listo: true, resumen: { anuncios: 4 } });
  });

  it("si Encuentra24 no trae nada, la búsqueda termina avisando", async () => {
    const { almacen } = almacenEnMemoria(corredor({ zonas_e24: ["escazu"] }));
    const d = dependencias(almacen);
    const { busqueda } = await recorrer(d, () => "<title>Attention Required! | Cloudflare</title>");
    await terminarBusqueda(d, ID, busqueda);
    expect(await consultarBusqueda(d, ID, busqueda)).toMatchObject({ ok: false, motivo: "sin_resultados" });
  });

  it("no empieza sin zonas, sin presupuesto del día o con un corredor inactivo", async () => {
    expect(await iniciarBusqueda(dependencias(almacenEnMemoria(corredor({ zonas_e24: [] })).almacen), ID)).toEqual({
      ok: false,
      motivo: "sin_zonas",
    });
    expect(await iniciarBusqueda(dependencias(almacenEnMemoria(corredor()).almacen, 999), ID)).toEqual({
      ok: false,
      motivo: "sin_presupuesto",
    });
    expect(await iniciarBusqueda(dependencias(almacenEnMemoria(null).almacen), ID)).toEqual({ ok: false, motivo: "sin_corredor" });
  });

  it("empezar otra vez descarta la búsqueda que quedó a medias", async () => {
    const { almacen } = almacenEnMemoria(corredor());
    const d = dependencias(almacen);
    const primera = await iniciarBusqueda(d, ID);
    await iniciarBusqueda(d, ID);
    if (!primera.ok) throw new Error();
    expect(await recibirPagina(d, ID, { busqueda: primera.busqueda, url: primera.siguiente, html: pagina(primera.siguiente) })).toEqual({
      ok: false,
      motivo: "no_encontrada",
    });
  });
});
