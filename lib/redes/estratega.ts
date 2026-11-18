import type { Propiedad } from "../datos/tipos";
import { cifrasInventadas, cifrasPermitidas, conCifrasDichas } from "./cifras";
import { datosCortos, etiquetaCasa, lineaContacto, precioCasa } from "./texto";

// "Redes sociales" del panel (/panel/redes): la estratega comercial del corredor. Aquí vive todo lo que NO es IA:
// revisar lo que devuelve el modelo (nada de cifras fuera de la ficha o del texto del corredor), el presupuesto
// sugerido y la calculadora de la pauta (montos del código, alcances como estimación), los pasos para lanzarla a
// mano, las métricas de referencia, el documento de la estrategia (markdown que el panel y el PDF dibujan) y las
// respuestas simuladas de la demo. El modelo nunca escribe un monto: la regla es de código, no de confianza.

export type CasaEstratega = Pick<
  Propiedad,
  "id" | "codigo" | "titulo" | "tipo" | "operacion" | "precio" | "moneda" | "zona" | "canton" | "habitaciones" | "banos" | "m2_construccion" | "m2_terreno" | "amenidades"
> &
  Partial<Pick<Propiedad, "provincia" | "distrito" | "descripcion" | "estado" | "url_e24">>;
export type Contacto = { nombre: string; whatsapp: string | null };

/** Lo que el corredor pega (el límite de Instagram para una publicación). */
export const MAX_POST = 2200;
/** Pedidos de IA por minuto y corredor en esta sección (igual que el chat del estudio). */
export const PEDIDOS_POR_MINUTO = 6;

/** El texto pegado, sin caracteres de control; se recorta después de validar el largo. */
export function limpiarCaption(t: unknown): string {
  return String(t ?? "")
    .replace(/\r\n?/g, "\n")
    // eslint-disable-next-line no-control-regex -- se quitan a propósito los caracteres de control del texto pegado
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const texto = (x: unknown, max = 300) => (typeof x === "string" ? x.replace(/\s+/g, " ").trim().slice(0, max) : "");
const lista = (x: unknown, max = 6, largo = 300) =>
  (Array.isArray(x) ? x : [])
    .map((y) => texto(y, largo))
    .filter(Boolean)
    .slice(0, max);

/** Quita las frases que traen una cifra que no está permitida. */
export function sinCifrasAjenas(t: string, permitidas: Set<string> | null): { texto: string; quitadas: number } {
  if (!permitidas || !t) return { texto: t, quitadas: 0 };
  const frases = t.split(/(?<=[.!?])\s+/);
  const buenas = frases.filter((f) => cifrasInventadas(f, permitidas).length === 0);
  return { texto: buenas.join(" ").trim(), quitadas: frases.length - buenas.length };
}

/** Una lista sin los elementos con cifras ajenas. */
function listaLimpia(x: unknown, permitidas: Set<string> | null, max = 6, largo = 300): { lista: string[]; quitadas: number } {
  const todos = lista(x, max, largo);
  const buenos = permitidas ? todos.filter((t) => cifrasInventadas(t, permitidas).length === 0) : todos;
  return { lista: buenos, quitadas: todos.length - buenos.length };
}

/** Cifras que la IA puede usar: las de la ficha (tal como se le pasó), el precio, el contacto y lo que escribió el corredor. */
export function cifrasDeLaCasa(ficha: string | null, casa: CasaEstratega | null, contacto: Contacto, dichoPorCorredor?: string): Set<string> {
  const base = cifrasPermitidas(ficha, contacto.whatsapp, casa ? precioCasa(casa) : null, casa ? lineaContacto(casa, contacto) : null);
  return conCifrasDichas(base, dichoPorCorredor);
}

// ---------------------------------------------------------------- Mejorar un post

export interface VersionPostCruda {
  nombre: string;
  gancho: string;
  cuerpo: string;
  cta: string;
  hashtags: string[];
}
export interface PostCrudo {
  fuerte: string[];
  mejorar: string[];
  versiones: VersionPostCruda[];
}
export interface VersionPost {
  nombre: string;
  texto: string;
}
export interface ResultadoPost {
  fuerte: string[];
  mejorar: string[];
  versiones: VersionPost[];
  /** Versiones o comentarios descartados por traer cifras que no están en la ficha ni en su texto. */
  quitadas: number;
}

export const MOTIVO_POST_CIFRAS =
  "La IA puso números que no están en la ficha ni en tu texto, así que no usé sus versiones. Inténtalo de nuevo.";

const esIngles = (nombre: string) => /ingl[eé]s|english|extranjer/i.test(nombre);

/** Hashtags limpios: sin «#», solo letras y números, sin repetir, de 3 a 6. */
export function hashtagsLimpios(x: unknown, casa: CasaEstratega | null): string[] {
  const vistos = new Set<string>();
  const res: string[] = [];
  for (const h of Array.isArray(x) ? x : []) {
    const limpio = String(h ?? "").replace(/[^\p{L}\p{N}]/gu, "").slice(0, 30);
    if (limpio.length < 2 || vistos.has(limpio.toLowerCase())) continue;
    vistos.add(limpio.toLowerCase());
    res.push(limpio);
    if (res.length === 6) break;
  }
  if (res.length < 3) {
    for (const h of ["BienesRaicesCR", "CostaRica", casa?.zona?.replace(/[^\p{L}\p{N}]/gu, "")]) {
      if (h && !vistos.has(h.toLowerCase()) && res.length < 6) {
        vistos.add(h.toLowerCase());
        res.push(h);
      }
    }
  }
  return res;
}

/** La línea de WhatsApp: con la casa, la misma del estudio (con su código); sin casa, el enlace del corredor. */
export function lineaWhatsApp(casa: CasaEstratega | null, contacto: Contacto, idioma: "es" | "en" = "es"): string {
  if (casa) return lineaContacto(casa, contacto, idioma);
  const wa = contacto.whatsapp ? `wa.me/${contacto.whatsapp.replace(/\D/g, "")}` : null;
  if (idioma === "en") return wa ? `📲 Message me on WhatsApp: ${wa}` : "📲 Message me on WhatsApp to book a private viewing.";
  return wa ? `📲 Escríbeme por WhatsApp: ${wa}` : "📲 Escríbeme por WhatsApp para coordinar una visita privada.";
}

/** Arma una versión lista para copiar: gancho, cuerpo, llamado, WhatsApp (del código) y hashtags. */
export function armarVersion(v: VersionPostCruda, casa: CasaEstratega | null, contacto: Contacto): VersionPost {
  const nombre = texto(v.nombre, 40) || "Versión";
  const cuerpo = String(v.cuerpo ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 1500);
  const partes = [texto(v.gancho, 200), cuerpo, texto(v.cta, 200)].filter(Boolean);
  const etiquetas = hashtagsLimpios(v.hashtags, casa).map((h) => `#${h}`).join(" ");
  const final = [...partes, lineaWhatsApp(casa, contacto, esIngles(nombre) ? "en" : "es"), etiquetas].filter(Boolean).join("\n\n");
  return { nombre, texto: final.slice(0, MAX_POST) };
}

/** Revisa lo que devolvió el modelo: fuera lo que trae cifras ajenas; el WhatsApp y los hashtags los pone el código. */
export function revisarPost(
  crudo: PostCrudo,
  o: { casa: CasaEstratega | null; contacto: Contacto; permitidas: Set<string> },
): { ok: true; post: ResultadoPost } | { ok: false; motivo: string } {
  const fuerte = listaLimpia(crudo?.fuerte, o.permitidas, 5, 220);
  const mejorar = listaLimpia(crudo?.mejorar, o.permitidas, 6, 260);
  let quitadas = fuerte.quitadas + mejorar.quitadas;
  const versiones: VersionPost[] = [];
  for (const v of (Array.isArray(crudo?.versiones) ? crudo.versiones : []).slice(0, 3)) {
    const propio = [v?.gancho, v?.cuerpo, v?.cta, ...(Array.isArray(v?.hashtags) ? v.hashtags : [])].map((x) => String(x ?? "")).join("\n");
    if (cifrasInventadas(propio, o.permitidas).length > 0) {
      quitadas++;
      continue;
    }
    const armada = armarVersion(v, o.casa, o.contacto);
    if (armada.texto.trim()) versiones.push(armada);
  }
  if (versiones.length === 0) return { ok: false, motivo: quitadas ? MOTIVO_POST_CIFRAS : "La IA no devolvió versiones. Inténtalo de nuevo." };
  return { ok: true, post: { fuerte: fuerte.lista, mejorar: mejorar.lista, versiones, quitadas } };
}

// ---------------------------------------------------------------- Pautas (Meta: Instagram y Facebook)

export const OBJETIVOS = {
  mensajes: { nombre: "Mensajes a WhatsApp", meta: "Interacción → Apps de mensajes → WhatsApp", boton: "Más mensajes" },
  clientes_potenciales: { nombre: "Clientes potenciales (formulario)", meta: "Clientes potenciales → Formulario instantáneo", boton: "Más mensajes" },
  trafico: { nombre: "Visitas a tu sitio", meta: "Tráfico → Sitio web", boton: "Más visitas al sitio web" },
  reconocimiento: { nombre: "Que la vea más gente", meta: "Reconocimiento → Alcance", boton: "Más visitas al perfil" },
} as const;
export type Objetivo = keyof typeof OBJETIVOS;

export const UBICACIONES = {
  reels_instagram: "Reels de Instagram",
  historias_instagram: "Historias de Instagram",
  feed_instagram: "Feed de Instagram",
  feed_facebook: "Feed de Facebook",
  historias_facebook: "Historias de Facebook",
  marketplace: "Marketplace de Facebook",
} as const;
export type Ubicacion = keyof typeof UBICACIONES;

export interface PautaCruda {
  objetivo: string;
  porque: string;
  publico: { zonas: string[]; paises: string[]; intereses: string[]; edad_min: number; edad_max: number; radio_km: number | null };
  ubicaciones: string[];
  creativo: string;
  titular: string;
  texto_anuncio: string;
  consejos: string[];
}
export interface Pauta {
  objetivo: Objetivo;
  porque: string;
  publico: { zonas: string[]; paises: string[]; intereses: string[]; edadMin: number; edadMax: number; radioKm: number | null };
  ubicaciones: Ubicacion[];
  creativo: string;
  titular: string;
  textoAnuncio: string;
  consejos: string[];
}

const entero = (x: unknown, min: number, max: number): number | null => {
  const n = Math.round(Number(x));
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
};

/**
 * Lo que devolvió el modelo (o lo guardado en el navegador) como una pauta válida. Las edades y el radio son datos de
 * segmentación (no de la casa) y se acotan a lo que Meta deja; los textos sin cifras ajenas. null si no sirve.
 */
export function revisarPauta(crudo: unknown, permitidas: Set<string> | null): { pauta: Pauta; quitadas: number } | null {
  type PublicoCrudo = Partial<PautaCruda["publico"]> & { edadMin?: unknown; edadMax?: unknown; radioKm?: unknown };
  const c = crudo as Omit<Partial<PautaCruda>, "publico"> & { publico?: PublicoCrudo; textoAnuncio?: unknown };
  if (!c || typeof c !== "object") return null;
  const objetivo = (typeof c.objetivo === "string" && c.objetivo in OBJETIVOS ? c.objetivo : "mensajes") as Objetivo;
  let quitadas = 0;
  const limpio = (x: unknown, max: number) => {
    const r = sinCifrasAjenas(texto(x, max), permitidas);
    quitadas += r.quitadas;
    return r.texto;
  };
  const p: PublicoCrudo = c.publico ?? {};
  const listas = (x: unknown) => {
    const r = listaLimpia(x, permitidas, 8, 60);
    quitadas += r.quitadas;
    return r.lista;
  };
  let edadMin = entero(p.edad_min ?? p.edadMin, 18, 65) ?? 30;
  let edadMax = entero(p.edad_max ?? p.edadMax, 18, 65) ?? 65;
  if (edadMin > edadMax) [edadMin, edadMax] = [edadMax, edadMin];
  const ubicaciones = [...new Set((Array.isArray(c.ubicaciones) ? c.ubicaciones : []).filter((u): u is Ubicacion => typeof u === "string" && u in UBICACIONES))];
  const consejos = listaLimpia(c.consejos, permitidas, 5, 260);
  quitadas += consejos.quitadas;
  return {
    pauta: {
      objetivo,
      porque: limpio(c.porque, 300),
      publico: {
        zonas: listas(p.zonas),
        paises: listas(p.paises),
        intereses: listas(p.intereses),
        edadMin,
        edadMax,
        radioKm: entero(p.radio_km ?? p.radioKm, 1, 80),
      },
      ubicaciones: ubicaciones.length ? ubicaciones : ["reels_instagram", "historias_instagram", "feed_instagram", "feed_facebook"],
      creativo: limpio(c.creativo, 400),
      titular: limpio(c.titular, 80),
      textoAnuncio: limpio(c.texto_anuncio ?? c.textoAnuncio, 500),
      consejos: consejos.lista,
    },
    quitadas,
  };
}

export interface Presupuesto {
  diarioUsd: number;
  dias: number;
  porque: string;
}

/** Equivalencia gruesa solo para elegir el rango (nunca se muestra ni se convierte un precio). */
const COLONES_POR_DOLAR_RANGO = 500;

/**
 * Presupuesto de prueba sugerido por el código según el precio de la casa: lo suficiente para salir de la fase de
 * aprendizaje de Meta sin gastar de más. Es una recomendación: el corredor lo cambia en la calculadora.
 */
export function presupuestoSugerido(casa: Pick<CasaEstratega, "operacion" | "precio" | "moneda"> | null): Presupuesto {
  if (!casa) return { diarioUsd: 10, dias: 10, porque: "Una prueba corta y moderada para ver qué público responde." };
  const usd = casa.precio ? (casa.moneda === "CRC" ? casa.precio / COLONES_POR_DOLAR_RANGO : casa.precio) : null;
  if (casa.operacion === "alquiler") {
    return usd !== null && usd < 3000
      ? { diarioUsd: 7, dias: 7, porque: "Un alquiler se mueve rápido: una semana corta basta para llenar la agenda de visitas." }
      : { diarioUsd: 10, dias: 10, porque: "Un alquiler de este rango pide un público más filtrado y unos días más." };
  }
  if (usd === null) return { diarioUsd: 10, dias: 10, porque: "Sin precio en la ficha, una prueba moderada para medir el interés." };
  if (usd < 250_000) return { diarioUsd: 8, dias: 10, porque: "Para este rango, una prueba de diez días muestra qué público escribe." };
  if (usd < 700_000) return { diarioUsd: 12, dias: 14, porque: "Dos semanas con un diario moderado: el comprador de este rango compara antes de escribir." };
  if (usd < 1_500_000) return { diarioUsd: 18, dias: 14, porque: "Público más chico y exigente: dos semanas con un diario mayor para llegarle varias veces." };
  return { diarioUsd: 25, dias: 21, porque: "Casa de lujo alto: el comprador decide despacio y muchas veces desde afuera; tres semanas de presencia." };
}

/** Costo por mil impresiones estimado en Costa Rica para bienes raíces (USD), y frecuencia esperada por persona. */
export const CPM_USD = { min: 4, max: 12 } as const;
export const FRECUENCIA = { min: 1.5, max: 2.5 } as const;
/** Costo por conversación de WhatsApp estimado para bienes raíces en Costa Rica (USD). */
export const COSTO_MENSAJE_USD = { min: 2, max: 8 } as const;
export const MAX_DIARIO_USD = 1000;
export const MAX_DIAS = 90;

export type Calculo =
  | { ok: true; diario: number; dias: number; total: number; impresiones: [number, number]; alcance: [number, number]; mensajes: [number, number] }
  | { ok: false; motivo: string };

const redondear = (n: number) => (n >= 10_000 ? Math.round(n / 1000) * 1000 : n >= 1000 ? Math.round(n / 100) * 100 : Math.round(n / 10) * 10);

/** "12", "12,5", "12.50" → 12.5. Sin miles: es un diario, nunca pasa de mil. */
function leerDiario(x: unknown): number {
  if (typeof x === "number") return x;
  const s = String(x ?? "").replace(/[$\s]|USD/gi, "").replace(",", ".");
  return /^\d+(\.\d{1,2})?$/.test(s) ? Number(s) : NaN;
}

/** La calculadora: diario × días = total, con alcance e impresiones como rangos estimados (nunca como promesa). */
export function calcularPauta(diarioCrudo: unknown, diasCrudo: unknown): Calculo {
  const diario = leerDiario(diarioCrudo);
  const dias = Number(diasCrudo);
  if (!Number.isFinite(diario) || diario < 1) return { ok: false, motivo: "Escribe cuánto quieres gastar por día, desde USD $1." };
  if (diario > MAX_DIARIO_USD) return { ok: false, motivo: `Hasta USD $${MAX_DIARIO_USD.toLocaleString("es-CR")} por día.` };
  if (!Number.isInteger(dias) || dias < 1 || dias > MAX_DIAS) return { ok: false, motivo: `Escribe de 1 a ${MAX_DIAS} días.` };
  const total = Math.round(diario * dias * 100) / 100;
  const impMin = (total / CPM_USD.max) * 1000;
  const impMax = (total / CPM_USD.min) * 1000;
  return {
    ok: true,
    diario,
    dias,
    total,
    impresiones: [redondear(impMin), redondear(impMax)],
    alcance: [redondear(impMin / FRECUENCIA.max), redondear(impMax / FRECUENCIA.min)],
    mensajes: [Math.floor(total / COSTO_MENSAJE_USD.max), Math.floor(total / COSTO_MENSAJE_USD.min)],
  };
}

/** "USD $12" / "USD $12,50" (montos del código, con moneda y signo). */
export function usd(n: number): string {
  const entero = Number.isInteger(n);
  return `USD $${n.toLocaleString("es-CR", { minimumFractionDigits: entero ? 0 : 2, maximumFractionDigits: 2 })}`;
}

const publicoEnPalabras = (p: Pauta | null, casa: CasaEstratega | null) => {
  const zonas = p?.publico.zonas.length ? p.publico.zonas.join(", ") : casa?.zona ?? casa?.canton ?? "la zona de la casa";
  return { zonas, edades: p ? `${p.publico.edadMin} a ${p.publico.edadMax}` : "30 a 65" };
};

/** Pasos para lanzarla desde Instagram ("Promocionar"), en palabras de todos los días. */
export function pasosInstagram(p: Pauta | null, casa: CasaEstratega | null, presupuesto: { diario: number; dias: number }): string[] {
  const { zonas, edades } = publicoEnPalabras(p, casa);
  const objetivo = OBJETIVOS[p?.objetivo ?? "mensajes"];
  return [
    "Antes: tu Instagram tiene que ser cuenta profesional y estar enlazado a tu página de Facebook; para recibir mensajes, conecta tu número de WhatsApp Business (Configuración → Herramientas para empresas).",
    "Abre la publicación o el reel que mejor te funcionó (el que tenga más guardados o mensajes) y toca «Promocionar».",
    `En «Objetivo» elige «${objetivo.boton}»${p?.objetivo === "mensajes" || !p ? " y luego WhatsApp" : ""}.`,
    `En «Público» toca «Crear tu propio público»: ubicación ${zonas}${p?.publico.radioKm ? ` (con un radio de ${p.publico.radioKm} km)` : ""}, edad ${edades}${p?.publico.intereses.length ? ` e intereses como ${p.publico.intereses.slice(0, 4).join(", ")}` : ""}. Ponle un nombre para reusarlo.`,
    `En «Presupuesto y duración» pon ${usd(presupuesto.diario)} por día durante ${presupuesto.dias} días. Instagram te muestra su propio estimado de alcance.`,
    "Revisa el pago, toca «Promocionar publicación» y espera la aprobación (suele tardar unas horas).",
    "A los 3 o 4 días revisa en «Ver estadísticas» cuántos mensajes llegaron. Si casi no hay, cambia la foto o el gancho, no el presupuesto.",
  ];
}

/** Pasos para el Administrador de anuncios de Meta (más control: ubicaciones, varios anuncios). */
export function pasosAdsManager(p: Pauta | null, casa: CasaEstratega | null, presupuesto: { diario: number; dias: number }): string[] {
  const { zonas, edades } = publicoEnPalabras(p, casa);
  const objetivo = OBJETIVOS[p?.objetivo ?? "mensajes"];
  const ubicaciones = (p?.ubicaciones ?? (["reels_instagram", "historias_instagram", "feed_instagram", "feed_facebook"] as Ubicacion[])).map((u) => UBICACIONES[u]);
  return [
    "Entra a adsmanager.facebook.com con tu cuenta (o en el teléfono, la app Meta Ads Manager) y toca «Crear».",
    `Objetivo: ${objetivo.meta}.`,
    "Si Meta te pregunta por «Categorías especiales de anuncios» y la casa es vivienda, márcala si te lo pide: así no te rechaza el anuncio.",
    `Presupuesto: ${usd(presupuesto.diario)} diarios; calendario de ${presupuesto.dias} días con fecha de fin (así nunca gasta de más).`,
    `Público: ${zonas}${p?.publico.radioKm ? ` (radio ${p.publico.radioKm} km)` : ""}${p?.publico.paises.length ? `; países: ${p.publico.paises.join(", ")}` : ""}; edad ${edades}${p?.publico.intereses.length ? `; intereses: ${p.publico.intereses.join(", ")}` : ""}.`,
    `Ubicaciones: «Manuales» y deja ${ubicaciones.join(", ")}.`,
    `Anuncio: usa la publicación existente (conserva los comentarios y «me gusta») o sube el creativo; ${p?.titular ? `titular «${p.titular}»` : "un titular corto"} y el botón «Enviar mensaje de WhatsApp».`,
    "Publica. Revisa cada 3 o 4 días el costo por mensaje y la frecuencia; cambia el creativo cada dos o tres semanas.",
  ];
}

// ---------------------------------------------------------------- Estrategia por casa

export const FORMATOS_CONTENIDO = ["reel", "carrusel", "post", "historia"] as const;
export type FormatoContenido = (typeof FORMATOS_CONTENIDO)[number];
const NOMBRE_FORMATO: Record<FormatoContenido, string> = { reel: "Reel", carrusel: "Carrusel", post: "Post", historia: "Historia" };

export interface EstrategiaCruda {
  posicionamiento: string;
  comprador_ideal: string;
  puntos_clave: string[];
  calendario: { dia: number; formato: string; tema: string; gancho: string }[];
  plan_pagado: string[];
  plan_organico: string[];
  siguientes_pasos: string[];
  por_confirmar: string[];
}
export interface Estrategia {
  posicionamiento: string;
  compradorIdeal: string;
  puntosClave: string[];
  calendario: { dia: number; formato: FormatoContenido; tema: string; gancho: string }[];
  planPagado: string[];
  planOrganico: string[];
  siguientesPasos: string[];
  porConfirmar: string[];
}

/** Lo que devolvió el modelo, sin cifras ajenas y con el calendario de 14 días ordenado (máximo 2 piezas por día). */
export function revisarEstrategia(crudo: EstrategiaCruda, permitidas: Set<string> | null): { estrategia: Estrategia; quitadas: number } | null {
  if (!crudo || typeof crudo !== "object") return null;
  let quitadas = 0;
  const frase = (x: unknown, max: number) => {
    const r = sinCifrasAjenas(texto(x, max), permitidas);
    quitadas += r.quitadas;
    return r.texto;
  };
  const listas = (x: unknown, max = 6) => {
    const r = listaLimpia(x, permitidas, max, 300);
    quitadas += r.quitadas;
    return r.lista;
  };
  const porDia = new Map<number, number>();
  const calendario: Estrategia["calendario"] = [];
  for (const c of Array.isArray(crudo.calendario) ? crudo.calendario : []) {
    const dia = entero(c?.dia, 1, 14);
    const formato = FORMATOS_CONTENIDO.includes(c?.formato as FormatoContenido) ? (c.formato as FormatoContenido) : null;
    const tema = texto(c?.tema, 160);
    const gancho = texto(c?.gancho, 160);
    if (dia === null || !formato || !tema) continue;
    if (permitidas && cifrasInventadas(`${tema} ${gancho}`, permitidas).length) {
      quitadas++;
      continue;
    }
    if ((porDia.get(dia) ?? 0) >= 2) continue;
    porDia.set(dia, (porDia.get(dia) ?? 0) + 1);
    calendario.push({ dia, formato, tema, gancho });
  }
  calendario.sort((a, b) => a.dia - b.dia);
  const estrategia: Estrategia = {
    posicionamiento: frase(crudo.posicionamiento, 400),
    compradorIdeal: frase(crudo.comprador_ideal, 600),
    puntosClave: listas(crudo.puntos_clave, 8),
    calendario: calendario.slice(0, 20),
    planPagado: listas(crudo.plan_pagado),
    planOrganico: listas(crudo.plan_organico),
    siguientesPasos: listas(crudo.siguientes_pasos),
    porConfirmar: listas(crudo.por_confirmar),
  };
  if (!estrategia.posicionamiento && estrategia.calendario.length === 0) return null;
  return { estrategia, quitadas };
}

/** Métricas a mirar: referencias del código para bienes raíces en Costa Rica (nunca del modelo). */
export const KPIS: { nombre: string; referencia: string }[] = [
  { nombre: "Mensajes a WhatsApp por semana", referencia: "La métrica que manda: cuántas personas escribieron por esta casa." },
  { nombre: "Costo por mensaje (pauta)", referencia: `Aceptable entre ${usd(COSTO_MENSAJE_USD.min)} y ${usd(COSTO_MENSAJE_USD.max)}; si sube, cambia el creativo o el público.` },
  { nombre: "Clics sobre impresiones (CTR)", referencia: "Arriba de 1 % es bueno; debajo de 0,5 % el anuncio no detiene a nadie." },
  { nombre: "Frecuencia", referencia: "Si pasa de 3 en una semana, la gente se cansa: cambia la foto o el gancho." },
  { nombre: "Guardados y compartidos", referencia: "En reels y carruseles valen más que los «me gusta»: dicen qué pieza impulsar." },
  { nombre: "Visitas agendadas desde redes", referencia: "Cuántos mensajes terminan en visita privada: el filtro de calidad del público." },
];

const fila = (celdas: string[]) => `| ${celdas.map((c) => c.replace(/\|/g, "/").replace(/\n/g, " ")).join(" | ")} |`;
const vinetas = (l: string[]) => l.map((x) => `- ${x}`).join("\n");

/**
 * El documento de la estrategia en markdown (lo dibuja el panel con su lector y el PDF con las piezas de las fichas).
 * Los datos de la casa, el presupuesto y las métricas los escribe el código.
 */
export function estrategiaMarkdown(e: Estrategia, casa: CasaEstratega, presupuesto: Presupuesto, demo = false): string {
  const calc = calcularPauta(presupuesto.diarioUsd, presupuesto.dias);
  const datos = [etiquetaCasa(casa), precioCasa(casa), ...datosCortos(casa)].filter(Boolean).join(" · ");
  const partes: string[] = [];
  if (demo) partes.push("> Demostración: este plan lo arma el código con los datos de la casa, sin IA de verdad.");
  partes.push(`**${casa.titulo}** (código ${casa.codigo})\n\n${datos}`);
  if (e.posicionamiento) partes.push(`## Posicionamiento\n\n${e.posicionamiento}`);
  if (e.compradorIdeal) partes.push(`## Comprador ideal\n\n${e.compradorIdeal}`);
  if (e.puntosClave.length) partes.push(`## Lo que vende esta casa\n\n${vinetas(e.puntosClave)}`);
  if (e.calendario.length) {
    partes.push(
      [
        "## Calendario de 2 semanas",
        "",
        fila(["Día", "Formato", "Tema", "Gancho"]),
        fila(["---", "---", "---", "---"]),
        ...e.calendario.map((c) => fila([String(c.dia), NOMBRE_FORMATO[c.formato], c.tema, c.gancho || "—"])),
      ].join("\n"),
    );
  }
  const pagado = [
    calc.ok
      ? `Presupuesto sugerido: ${usd(calc.diario)} al día por ${calc.dias} días (total ${usd(calc.total)}). Es una recomendación: tú decides cuánto y cuándo.`
      : null,
    ...e.planPagado,
  ].filter((x): x is string => !!x);
  partes.push(`## Plan pagado\n\n${vinetas(pagado)}`);
  if (e.planOrganico.length) partes.push(`## Plan orgánico\n\n${vinetas(e.planOrganico)}`);
  partes.push(
    [
      "## Métricas a mirar",
      "",
      fila(["Métrica", "Referencia"]),
      fila(["---", "---"]),
      ...KPIS.map((k) => fila([k.nombre, k.referencia])),
      "",
      "Referencias generales del mercado en Costa Rica: estimaciones, no promesas.",
    ].join("\n"),
  );
  if (e.siguientesPasos.length) partes.push(`## Siguientes pasos\n\n${vinetas(e.siguientesPasos)}`);
  if (e.porConfirmar.length) partes.push(`## Por confirmar antes de usarlo\n\nNo están en la ficha: confírmalos antes de publicarlos.\n\n${vinetas(e.porConfirmar)}`);
  return partes.join("\n\n");
}

// ---------------------------------------------------------------- Demo (corredor inactivo): sin IA, lo arma el código

const lugar = (c: CasaEstratega | null) => c?.zona ?? c?.canton ?? null;
const extras = (c: CasaEstratega | null) => (c?.amenidades ?? []).slice(0, 3);

export function postDemo(caption: string, casa: CasaEstratega | null, contacto: Contacto): ResultadoPost {
  const tieneCta = /whats|wa\.me|escr[ií]b/i.test(caption);
  const datos = casa ? [precioCasa(casa), ...datosCortos(casa)].filter(Boolean).join(" · ") : "";
  const zona = lugar(casa);
  const versiones: VersionPostCruda[] = [
    {
      nombre: "Estilo de vida",
      gancho: zona ? `Así se vive en ${zona}.` : "Así se vive en esta casa.",
      cuerpo: [casa?.titulo, extras(casa).length ? `Lo que vas a disfrutar: ${extras(casa).join(", ").toLowerCase()}.` : null, datos || null].filter(Boolean).join("\n\n"),
      cta: "Escríbeme por WhatsApp y coordinamos una visita privada.",
      hashtags: ["BienesRaicesCR", zona ?? "CostaRica", casa?.operacion === "alquiler" ? "Alquiler" : "CasaEnVenta"],
    },
    {
      nombre: "Directa con datos",
      gancho: casa ? `${casa.titulo}${zona ? ` en ${zona}` : ""}.` : "Una casa que vale la pena ver en persona.",
      cuerpo: datos || caption.split("\n").filter(Boolean).slice(0, 3).join("\n"),
      cta: "¿Te la muestro? Escríbeme por WhatsApp.",
      hashtags: ["BienesRaicesCR", "CostaRica", zona ?? "Venta"],
    },
  ];
  return {
    fuerte: [caption.length > 40 ? "Ya cuenta qué es la casa." : "Es corto y directo.", ...(casa && precioCasa(casa) && caption.includes(String(casa.precio ?? "-")) ? ["Trae el precio."] : [])],
    mejorar: [
      "Abre con un gancho en la primera línea (lo que se ve antes de «más»): cómo se vive ahí, no «hermosa casa».",
      tieneCta ? "Deja un solo llamado a la acción, a WhatsApp." : "Falta un llamado a la acción: termina con «Escríbeme por WhatsApp».",
      "Usa de 3 a 6 hashtags de la zona y del tipo de casa.",
    ],
    versiones: versiones.map((v) => armarVersion(v, casa, contacto)),
    quitadas: 0,
  };
}

export function pautaDemo(casa: CasaEstratega): Pauta {
  const zona = lugar(casa);
  return {
    objetivo: "mensajes",
    porque: "En bienes raíces lo que vende es la conversación: que te escriban por WhatsApp para coordinar la visita.",
    publico: {
      zonas: [...new Set([zona, "Escazú", "Santa Ana"].filter((z): z is string => !!z))],
      paises: casa.operacion === "alquiler" ? ["Costa Rica"] : ["Costa Rica", "Estados Unidos", "Canadá"],
      intereses: ["Bienes raíces", "Inversión inmobiliaria", "Decoración de interiores", "Viajes"],
      edadMin: casa.operacion === "alquiler" ? 25 : 32,
      edadMax: 65,
      radioKm: 15,
    },
    ubicaciones: ["reels_instagram", "historias_instagram", "feed_instagram", "feed_facebook"],
    creativo: "El reel de recorrido con la mejor foto de portada (la sala o la vista), y un carrusel con las fotos reales para el feed.",
    titular: `${casa.titulo}`.slice(0, 80),
    textoAnuncio: `${casa.titulo}${zona ? ` en ${zona}` : ""}. Escríbeme por WhatsApp y coordinamos una visita privada.`,
    consejos: [
      "Impulsa la pieza que ya funcionó gratis, no una nueva.",
      "Contesta cada mensaje en menos de una hora: la pauta paga por la conversación.",
      "No cambies nada los primeros días: Meta está aprendiendo.",
    ],
  };
}

export function estrategiaDemo(casa: CasaEstratega): Estrategia {
  const zona = lugar(casa) ?? "la zona";
  const tiene = extras(casa);
  return {
    posicionamiento: `Para quien busca vivir en ${zona} con espacio y tranquilidad, ${casa.titulo.toLowerCase()} es una casa lista para disfrutar desde el primer día.`,
    compradorIdeal:
      casa.operacion === "alquiler"
        ? "Familias o profesionales que se mudan a la zona y quieren algo listo, cerca de su trabajo y colegios. Les preocupa la seguridad y el tiempo de traslado."
        : "Familias de nivel alto de la zona y compradores extranjeros que buscan clima y tranquilidad. Les preocupa la seguridad, el estado legal y lo que cuesta mantenerla; los convence verla en persona.",
    puntosClave: [etiquetaCasa(casa), ...datosCortos(casa), ...tiene].filter(Boolean),
    calendario: [
      { dia: 1, formato: "reel", tema: "Recorrido de la casa", gancho: `Entra conmigo a esta casa en ${zona}` },
      { dia: 1, formato: "historia", tema: "Adelanto de la casa nueva", gancho: "¿Adivinan en qué zona está?" },
      { dia: 3, formato: "carrusel", tema: "Lo mejor de la casa, foto por foto", gancho: "Lo que más me gustó de esta casa" },
      { dia: 5, formato: "historia", tema: "Encuesta: ¿qué espacio prefieren?", gancho: "¿Sala o terraza?" },
      { dia: 6, formato: "post", tema: "Datos de la ficha y llamado a visita", gancho: casa.titulo },
      { dia: 8, formato: "reel", tema: `Vivir en ${zona}`, gancho: `Por qué tanta gente quiere vivir en ${zona}` },
      { dia: 10, formato: "carrusel", tema: "Preguntas frecuentes del comprador", gancho: "Lo que siempre me preguntan antes de visitar" },
      { dia: 12, formato: "historia", tema: "Caja de preguntas", gancho: "Pregúntame lo que quieras de esta casa" },
      { dia: 14, formato: "reel", tema: "Detalles que no se ven en fotos", gancho: "Lo que solo vas a notar en persona" },
    ],
    planPagado: ["Impulsa el reel del día 1 cuando tenga sus primeros guardados.", "Con los mensajes de la primera semana, repite con el carrusel."],
    planOrganico: ["Comparte la casa con tu red de corredores (Modo corredor).", "Publícala en Encuentra24 y en tu sitio con el mismo código.", "Historias seguidas mientras dure la campaña."],
    siguientesPasos: ["Revisa las fotos en «Analizar fotos» y elige la portada.", "Graba el reel de recorrido de día, con luz natural.", "Deja listo el mensaje de bienvenida de WhatsApp."],
    porConfirmar: ["Si tiene vista, orientación o algo único del vecindario, agrégalo a la ficha para usarlo."],
  };
}
