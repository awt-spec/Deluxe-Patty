import type { Cerebro } from "../asistente/cerebro";
import { precio as formatoPrecio } from "../formato";
import { SIN_CONSUMO, sumar, type Consumo } from "../asistente/costo";
import { fechaIso, fechaLocal, sumarDias } from "../agenda/tiempo";
import { anunciosDePagina, esDesafio, urlListado, type AnuncioE24 } from "./parsear";

export interface Bloqueado {
  nombre: string | null;
  anunciante_e24_id: string | null;
}

export interface ParametrosBusqueda {
  categoria: string;
  zonas: string[];
  precioMin: number | null;
  precioMax: number | null;
  /** e24_id de anuncios ya vistos en semanas anteriores. */
  yaVistos: Set<string>;
  bloqueados: Bloqueado[];
  maxLeads?: number;
  maxPaginasPorZona?: number;
}

export interface LeadDueno {
  anuncio: AnuncioE24;
  puntaje: number;
  senales: string[];
}

export interface ResultadoBusqueda {
  leads: LeadDueno[];
  paginas: number;
  anunciosLeidos: number;
  candidatos: number;
  descartadosPorCorredor: number;
  consumo: Consumo;
  llamadasClaude: number;
}

/** Encuentra24 bloqueó la página o no trajo anuncios: el portal pudo cambiar. */
export class BusquedaSinResultados extends Error {}

export function normalizarNombre(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Recorrido de las zonas por turnos (página 1 de cada una, luego página 2…) para repartir la búsqueda
 * y no agotar una sola zona. Es un estado plano (JSON) para que la extensión de Chrome lo guarde en la
 * base entre una página y la siguiente.
 * El desafío de Cloudflare es intermitente: una página bloqueada se salta y la zona sigue; solo se
 * abandona tras dos bloqueos seguidos. Una zona sin anuncios nuevos se terminó.
 */
export interface EstadoRecorrido {
  activas: string[];
  pagina: number;
  /** Posición dentro de `activas` en la vuelta actual. */
  pos: number;
  seguidos: Record<string, number>;
  maxPaginas: number;
  paginas: number;
  desafios: number;
}

export function iniciarRecorrido(zonas: string[], maxPaginas = 8): EstadoRecorrido {
  return { activas: [...new Set(zonas)], pagina: 1, pos: 0, seguidos: {}, maxPaginas, paginas: 0, desafios: 0 };
}

/**
 * Zona y página que tocan, o null si se terminó. `suficiente` (ya hay candidatos de sobra) corta al
 * cerrar una vuelta completa.
 */
export function siguienteDelRecorrido(e: EstadoRecorrido, suficiente: boolean): { zona: string; pagina: number } | null {
  if (e.pos >= e.activas.length) {
    if (suficiente) return null;
    e.pagina++;
    e.pos = 0;
  }
  if (e.activas.length === 0 || e.pagina > e.maxPaginas) return null;
  return { zona: e.activas[e.pos], pagina: e.pagina };
}

/** Anota cómo le fue a la página de `zona` que se acaba de leer. */
export function anotarPagina(e: EstadoRecorrido, zona: string, r: "desafio" | { nuevos: number }) {
  e.paginas++;
  const quitar = () => {
    e.activas = e.activas.filter((z) => z !== zona);
  };
  if (r === "desafio") {
    e.desafios++;
    e.seguidos[zona] = (e.seguidos[zona] ?? 0) + 1;
    if (e.seguidos[zona] >= 2) quitar();
    else e.pos++;
    return;
  }
  e.seguidos[zona] = 0;
  if (r.nuevos === 0) quitar();
  else e.pos++;
}

/** Filtro antes de Haiku: no se declara agente, no visto antes, no es corredor conocido y está en rango. */
export function esCandidato(p: Pick<ParametrosBusqueda, "yaVistos" | "bloqueados" | "precioMin" | "precioMax">) {
  const bloqueadosId = new Set(p.bloqueados.map((b) => b.anunciante_e24_id).filter(Boolean));
  const bloqueadosNombre = new Set(
    p.bloqueados.map((b) => (b.nombre ? normalizarNombre(b.nombre) : "")).filter((n) => n.length > 0),
  );
  return (a: AnuncioE24): boolean => {
    if (a.tipoAnunciante === "Agente") return false;
    if (p.yaVistos.has(a.id)) return false;
    if (a.anunciante.id && bloqueadosId.has(a.anunciante.id)) return false;
    if (a.anunciante.nombre && bloqueadosNombre.has(normalizarNombre(a.anunciante.nombre))) return false;
    if (a.precio !== null && a.moneda === "USD") {
      if (p.precioMin !== null && a.precio < p.precioMin) return false;
      if (p.precioMax !== null && a.precio > p.precioMax) return false;
    }
    return true;
  };
}

const cuentaDe = (a: AnuncioE24) => a.anunciante.id ?? a.anunciante.nombre ?? a.id;

/**
 * Con todos los anuncios leídos: filtra candidatos y Haiku confirma dueño o corredor (varias a la vez,
 * para no pasar el tiempo de una función de Vercel). Cuántos anuncios tiene cada cuenta es una señal:
 * un "dueño" con muchas casas suele ser corredor.
 */
export async function evaluarAnuncios(
  leidos: AnuncioE24[],
  p: Pick<ParametrosBusqueda, "yaVistos" | "bloqueados" | "precioMin" | "precioMax" | "maxLeads">,
  cerebro: Pick<Cerebro, "clasificarAnuncio">,
  simultaneas = 4,
): Promise<Omit<ResultadoBusqueda, "paginas" | "anunciosLeidos">> {
  const maxLeads = p.maxLeads ?? 30;
  const porAnunciante = new Map<string, number>();
  for (const a of leidos) porAnunciante.set(cuentaDe(a), (porAnunciante.get(cuentaDe(a)) ?? 0) + 1);

  const candidatos = leidos.filter(esCandidato(p));
  const clasificados: (Awaited<ReturnType<Cerebro["clasificarAnuncio"]>> | undefined)[] = [];
  let proximo = 0;
  await Promise.all(
    Array.from({ length: Math.min(simultaneas, candidatos.length) }, async () => {
      while (proximo < candidatos.length) {
        const i = proximo++;
        clasificados[i] = await cerebro.clasificarAnuncio(candidatos[i], porAnunciante.get(cuentaDe(candidatos[i])) ?? 1);
      }
    }),
  );

  let consumo = SIN_CONSUMO;
  const leads: LeadDueno[] = [];
  let descartados = 0;
  candidatos.forEach((a, i) => {
    const c = clasificados[i]!;
    consumo = sumar(consumo, c.consumo);
    if (c.esDueno) leads.push({ anuncio: a, puntaje: c.puntaje, senales: c.senales });
    else descartados++;
  });
  leads.sort((x, y) => y.puntaje - x.puntaje);

  return {
    leads: leads.slice(0, maxLeads),
    candidatos: candidatos.length,
    descartadosPorCorredor: descartados,
    consumo,
    llamadasClaude: candidatos.length,
  };
}

/** Encuentra24 bloqueó todo o no trajo anuncios: el portal pudo cambiar. */
export function sinResultados(e: EstadoRecorrido): BusquedaSinResultados {
  return new BusquedaSinResultados(
    e.desafios ? `Encuentra24 bloqueó ${e.desafios} de ${e.paginas} páginas` : `Ninguna de ${e.paginas} páginas trajo anuncios`,
  );
}

/**
 * Recorre los listados de las zonas del corredor (con volumen bajo: pocas páginas y pausas, a cargo de
 * `obtenerPagina`), se queda con los anuncios que no se declaran de agente, descarta los ya vistos,
 * los fuera de rango de precio y los corredores conocidos, y Haiku confirma dueño o corredor.
 */
export async function buscarDuenos(
  p: ParametrosBusqueda,
  obtenerPagina: (url: string) => Promise<string>,
  cerebro: Pick<Cerebro, "clasificarAnuncio">,
): Promise<ResultadoBusqueda> {
  const maxLeads = p.maxLeads ?? 30;
  const candidato = esCandidato(p);
  const leidos = new Map<string, AnuncioE24>();
  let candidatos = 0;
  const e = iniciarRecorrido(p.zonas, p.maxPaginasPorZona ?? 8);

  for (let t = siguienteDelRecorrido(e, false); t; t = siguienteDelRecorrido(e, candidatos >= maxLeads * 2)) {
    const html = await obtenerPagina(urlListado(p.categoria, t.zona, t.pagina));
    if (esDesafio(html)) {
      anotarPagina(e, t.zona, "desafio");
      continue;
    }
    const nuevos = anunciosDePagina(html).filter((a) => !leidos.has(a.id));
    for (const a of nuevos) {
      leidos.set(a.id, a);
      if (candidato(a)) candidatos++;
    }
    anotarPagina(e, t.zona, { nuevos: nuevos.length });
  }

  if (leidos.size === 0) throw sinResultados(e);
  const evaluados = await evaluarAnuncios([...leidos.values()], p, cerebro);
  return { ...evaluados, paginas: e.paginas, anunciosLeidos: leidos.size };
}

/** Lunes de la semana local, "YYYY-MM-DD": los dueños se agrupan por semana en el panel. */
export function semanaDe(ahora: Date, zona: string): string {
  const hoy = fechaLocal(ahora, zona);
  return fechaIso(sumarDias(hoy, -((hoy.diaSemana + 6) % 7)));
}

/** Lista para WhatsApp. Lleva el enlace del anuncio: el primer mensaje al dueño lo manda el corredor. */
export function armarListaDuenos(leads: LeadDueno[], maxEnMensaje = 15): string {
  if (leads.length === 0) {
    return "Esta semana no encontré dueños directos nuevos en tus zonas. La próxima semana vuelvo a buscar.";
  }
  const l = [`*Dueños directos de la semana (${leads.length})*`, ""];
  leads.slice(0, maxEnMensaje).forEach((lead, i) => {
    const a = lead.anuncio;
    const precio = a.precio ? ` · ${formatoPrecio(a.precio, a.moneda)}` : "";
    const zona = a.zona ? ` · ${a.zona.split(",").slice(-2).join(",").trim()}` : "";
    l.push(`${i + 1}. ${a.titulo}${precio}${zona} (${lead.puntaje}/100)`);
    if (lead.senales.length) l.push(`   ${lead.senales.slice(0, 2).join("; ")}`);
    l.push(`   ${a.url}`);
  });
  if (leads.length > maxEnMensaje) l.push("", `Y ${leads.length - maxEnMensaje} más en el panel.`);
  l.push("", "Escríbeles desde el botón de WhatsApp de cada anuncio.");
  return l.join("\n");
}
