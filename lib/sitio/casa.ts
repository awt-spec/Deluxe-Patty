import { randomUUID } from "node:crypto";
import type { FichaParcial } from "../datos/tipos";
import { firmarCuerpo, type PedidoSitio } from "./fotos";

// Publicar en el sitio web una casa nueva que se cargó en el chat de Patty. El portal le manda a la función
// `recibir-casa` del sitio (la misma firma que `recibir-fotos`) los datos de la ficha, el texto en español e inglés
// y las fotos del Storage propio; el sitio crea la casa, baja las fotos y contesta su código DP-XXXXXX.

/** Lo que va al sitio además de la ficha: título, descripción y puntos destacados en los dos idiomas. */
export type TextosCasa = {
  titulo_es: string;
  titulo_en: string;
  descripcion_es: string;
  descripcion_en: string;
  destacados_es: string[];
  destacados_en: string[];
};

export const MAX_FOTOS_CASA_SITIO = 12;

/** La dirección de `recibir-casa` sale de la de `recibir-fotos` (las dos viven en el mismo proyecto del sitio). */
export function urlFuncionCasa(urlFotos: string): string | null {
  try {
    const u = new URL(urlFotos);
    if (u.protocol !== "https:" || !/\/recibir-fotos\/?$/.test(u.pathname)) return null;
    u.pathname = u.pathname.replace(/\/recibir-fotos\/?$/, "/recibir-casa");
    return u.toString();
  } catch {
    return null;
  }
}

const TIPO: Record<string, string> = { casa: "house", apartamento: "apartment", lote: "lot", finca: "lot", local: "house", oficina: "house", otro: "house" };

/** Amenidades del sitio (tiene íconos para estas): se reconocen por palabras, nunca se inventan. */
const AMENIDADES: [string, RegExp][] = [
  ["pool", /piscina|pool|alberca/],
  ["security", /seguridad|vigilancia|guarda|condominio|security/],
  ["view", /vista|view|mirador/],
  ["gym", /gimnasio|gym/],
  ["smart", /inteligente|domotica|smart/],
  ["garden", /jardin|garden|zonas verdes/],
  ["beach", /playa|beach|frente al mar/],
  ["golf", /golf/],
];

const sinTildes = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export function amenidadesSitio(ficha: Pick<FichaParcial, "amenidades" | "descripcion">, destacados: string[] = []): string[] {
  const texto = sinTildes([...ficha.amenidades, ...destacados, ficha.descripcion ?? ""].join(" · "));
  return AMENIDADES.filter(([, r]) => r.test(texto)).map(([a]) => a);
}

const limpiar = (s: string, max: number) => s.replace(/\s+\n/g, "\n").trim().slice(0, max);
const lista = (xs: string[]) => xs.map((x) => limpiar(x, 160)).filter(Boolean).slice(0, 20);

/** Los datos de la casa como los guarda el sitio (`properties`). Solo lo que dice la ficha: lo que falta va vacío. */
export function datosCasaSitio(ficha: FichaParcial, textos: TextosCasa) {
  const destacadosEs = lista(textos.destacados_es);
  return {
    titulo: { es: limpiar(textos.titulo_es, 120), en: limpiar(textos.titulo_en || textos.titulo_es, 120) },
    descripcion: { es: limpiar(textos.descripcion_es, 6000), en: limpiar(textos.descripcion_en || textos.descripcion_es, 6000) },
    destacados: { es: destacadosEs, en: lista(textos.destacados_en) },
    operacion: ficha.operacion === "alquiler" ? "rent" : "sale",
    tipo: TIPO[ficha.tipo ?? "otro"] ?? "house",
    precio: ficha.precio ?? 0,
    moneda: ficha.moneda === "CRC" ? "CRC" : "USD",
    ubicacion: ficha.zona ?? ficha.distrito ?? ficha.canton ?? "",
    provincia: ficha.provincia,
    canton: ficha.canton,
    distrito: ficha.distrito,
    habitaciones: ficha.habitaciones ?? 0,
    banos: ficha.banos ?? 0,
    m2_construccion: ficha.m2_construccion ?? 0,
    m2_terreno: ficha.m2_terreno,
    amenidades: amenidadesSitio(ficha, destacadosEs),
  };
}

/** El pedido firmado para crear la casa en el sitio (fotos del Storage propio, en orden; la primera es la portada). */
export function armarPedidoCasa(
  i: { ficha: FichaParcial; textos: TextosCasa; fotos: string[]; secreto: string },
  ahora = Date.now(),
  nonce: string = randomUUID(),
): PedidoSitio {
  const fotos = [...new Set(i.fotos)].slice(0, MAX_FOTOS_CASA_SITIO);
  if (fotos.length === 0) throw new Error("sin_fotos");
  const cuerpo = JSON.stringify({
    accion: "crear",
    casa: datosCasaSitio(i.ficha, i.textos),
    fotos: fotos.map((url, n) => ({ url, orden: n + 1 })),
    ts: Math.floor(ahora / 1000),
    nonce,
  });
  return { cuerpo, firma: firmarCuerpo(i.secreto, cuerpo), nonce };
}

const CODIGO = /^DP-[0-9A-Z]{6}$/;

/** Lo que contestó el sitio: el código de la casa nueva, sus fotos (https de sus hosts) y el enlace público. */
export function leerRespuestaCasa(
  json: unknown,
  i: { hostsFotos: string[]; sitio: string | null },
): { codigo: string; fotos: string[]; urlCasa: string | null } | null {
  if (!json || typeof json !== "object") return null;
  const r = json as { ok?: unknown; codigo?: unknown; fotos?: unknown; url_casa?: unknown };
  const codigo = typeof r.codigo === "string" ? r.codigo.trim().toUpperCase() : "";
  if (r.ok !== true || !CODIGO.test(codigo)) return null;
  const fotos: string[] = [];
  for (const f of Array.isArray(r.fotos) ? r.fotos.slice(0, MAX_FOTOS_CASA_SITIO) : []) {
    const url = typeof f === "string" ? f : typeof (f as { url?: unknown })?.url === "string" ? (f as { url: string }).url : null;
    if (!url) continue;
    try {
      const u = new URL(url);
      if (u.protocol === "https:" && i.hostsFotos.includes(u.host) && !u.username && !u.password) fotos.push(u.toString());
    } catch {
      // se descarta
    }
  }
  let urlCasa: string | null = null;
  if (typeof r.url_casa === "string" && i.sitio) {
    try {
      const u = new URL(r.url_casa);
      if (u.protocol === "https:" && u.origin === new URL(i.sitio).origin) urlCasa = u.toString();
    } catch {
      urlCasa = null;
    }
  }
  return { codigo, fotos, urlCasa };
}
