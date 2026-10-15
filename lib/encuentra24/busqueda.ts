import type { Cerebro } from "../asistente/cerebro";
import { precio as formatoPrecio } from "../formato";
import { SIN_CONSUMO, sumar, type Consumo } from "../asistente/costo";
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
  const maxPaginas = p.maxPaginasPorZona ?? 8;
  const bloqueadosId = new Set(p.bloqueados.map((b) => b.anunciante_e24_id).filter(Boolean));
  const bloqueadosNombre = new Set(
    p.bloqueados.map((b) => (b.nombre ? normalizarNombre(b.nombre) : "")).filter((n) => n.length > 0),
  );

  const leidos = new Map<string, AnuncioE24>();
  const porAnunciante = new Map<string, number>();
  let paginas = 0;
  let desafios = 0;

  // Las zonas se recorren por turnos (página 1 de cada una, luego página 2…) para repartir la
  // búsqueda y no agotar una sola zona.
  const activas = new Set(p.zonas);
  for (let n = 1; n <= maxPaginas && activas.size > 0; n++) {
    for (const zona of [...activas]) {
      const html = await obtenerPagina(urlListado(p.categoria, zona, n));
      paginas++;
      if (esDesafio(html)) {
        desafios++;
        activas.delete(zona);
        continue;
      }
      const anuncios = anunciosDePagina(html);
      const nuevos = anuncios.filter((a) => !leidos.has(a.id));
      if (nuevos.length === 0) {
        activas.delete(zona);
        continue;
      }
      for (const a of nuevos) {
        leidos.set(a.id, a);
        const cuenta = a.anunciante.id ?? a.anunciante.nombre ?? a.id;
        porAnunciante.set(cuenta, (porAnunciante.get(cuenta) ?? 0) + 1);
      }
    }
    if (candidatosDe().length >= maxLeads * 2) break;
  }

  if (leidos.size === 0) {
    throw new BusquedaSinResultados(
      desafios ? `Encuentra24 bloqueó ${desafios} de ${paginas} páginas` : `Ninguna de ${paginas} páginas trajo anuncios`,
    );
  }

  function candidatosDe(): AnuncioE24[] {
    return [...leidos.values()].filter((a) => {
      if (a.tipoAnunciante === "Agente") return false;
      if (p.yaVistos.has(a.id)) return false;
      if (a.anunciante.id && bloqueadosId.has(a.anunciante.id)) return false;
      if (a.anunciante.nombre && bloqueadosNombre.has(normalizarNombre(a.anunciante.nombre))) return false;
      if (a.precio !== null && a.moneda === "USD") {
        if (p.precioMin !== null && a.precio < p.precioMin) return false;
        if (p.precioMax !== null && a.precio > p.precioMax) return false;
      }
      return true;
    });
  }

  const candidatos = candidatosDe();
  let consumo = SIN_CONSUMO;
  let llamadas = 0;
  const leads: LeadDueno[] = [];
  let descartados = 0;
  for (const a of candidatos) {
    const cuenta = a.anunciante.id ?? a.anunciante.nombre ?? a.id;
    const c = await cerebro.clasificarAnuncio(a, porAnunciante.get(cuenta) ?? 1);
    consumo = sumar(consumo, c.consumo);
    llamadas++;
    if (c.esDueno) leads.push({ anuncio: a, puntaje: c.puntaje, senales: c.senales });
    else descartados++;
  }
  leads.sort((x, y) => y.puntaje - x.puntaje);

  return {
    leads: leads.slice(0, maxLeads),
    paginas,
    anunciosLeidos: leidos.size,
    candidatos: candidatos.length,
    descartadosPorCorredor: descartados,
    consumo,
    llamadasClaude: llamadas,
  };
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
