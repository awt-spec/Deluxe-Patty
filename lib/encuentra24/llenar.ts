import type { SupabaseClient } from "@supabase/supabase-js";
import { descripcionConEnlace, enlaceWhatsApp } from "../anuncios/atribucion";
import { prepararAnuncio } from "../anuncios/preparar";
import { mensajeFallaIA, registrarFallaIA } from "../asistente/falla-ia";
import { hayPresupuestoHoy, SIN_PRESUPUESTO } from "../asistente/limites";
import type { Dependencias } from "../asistente/contexto";
import type { Corredor, Foto } from "../datos/tipos";
import { esFotoPropia } from "../fotos/origen";
import { ErrorDatos, errorSeguro } from "../monitoreo/errores";

// "Llenar con Patty" de la extensión de Chrome: el corredor abre el formulario de publicar de Encuentra24 en su Chrome
// y la extensión lo llena con un anuncio que la asistente ya preparó (anuncios_e24 en borrador). El corredor revisa y
// toca Publicar él mismo: la extensión nunca envía el formulario. Aquí se arma lo que la extensión pone en cada campo,
// siempre del corredor del permiso y solo con fotos originales de su carpeta del bucket "fotos".
// También "Preparar un anuncio" desde el panel lateral: la misma preparación de lib/anuncios/preparar.ts.

export const MAX_FOTOS_LLENAR = 20;
export const MAX_LISTOS = 20;
export const MAX_CASAS = 50;

/** Casas que no se anuncian (ya se vendieron o alquilaron). */
const CERRADAS = new Set(["vendida", "alquilada"]);
const ACTIVAS = ["activa", "reservada"];

interface TextoIdioma {
  titulo: string;
  descripcion: string;
}

export interface TextoPreparado {
  es: TextoIdioma | null;
  en: TextoIdioma | null;
  orden_fotos: { foto: number; muestra: string }[];
}

export interface CasaLlenar {
  id: string;
  codigo: string;
  titulo: string;
  tipo: string;
  operacion: string;
  precio: number | null;
  moneda: string;
  provincia: string | null;
  canton: string | null;
  distrito: string | null;
  zona: string | null;
  habitaciones: number | null;
  banos: number | null;
  m2_construccion: number | null;
  m2_terreno: number | null;
  amenidades: string[];
  estado: string;
  fotos: Foto[];
}

export interface AnuncioFila {
  id: string;
  referencia: string;
  titulo: string | null;
  propiedad_id: string | null;
  texto_preparado: unknown;
}

/** Lo que la extensión pone en el formulario. Sin datos del cliente, notas ni comisiones. */
export interface DatosLlenar {
  id: string;
  referencia: string;
  casa: { codigo: string; titulo: string };
  es: TextoIdioma;
  en: TextoIdioma | null;
  operacion: "venta" | "alquiler" | null;
  tipo: string | null;
  precio: number | null;
  moneda: "USD" | "CRC" | null;
  provincia: string | null;
  canton: string | null;
  distrito: string | null;
  zona: string | null;
  habitaciones: number | null;
  banos: number | null;
  m2_construccion: number | null;
  m2_terreno: number | null;
  amenidades: string[];
  /** Hasta 20 originales propias, en el orden preparado y luego las demás de la casa. */
  fotos: string[];
  /** Sin número de la asistente la descripción no lleva el enlace con la referencia. */
  conEnlace: boolean;
}

export interface AnuncioListo {
  id: string;
  referencia: string;
  titulo: string;
  casa: { codigo: string; titulo: string };
  portada: string | null;
}

export interface CasaParaAnuncio {
  id: string;
  codigo: string;
  titulo: string;
  portada: string | null;
  /** Ya tiene un anuncio por publicar: prepararlo otra vez reescribe ese mismo. */
  conBorrador: boolean;
}

const texto = (v: unknown, max: number): string => (typeof v === "string" ? v.trim().slice(0, max) : "");

function idioma(v: unknown): TextoIdioma | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const titulo = texto(o.titulo, 300);
  const descripcion = texto(o.descripcion, 20_000);
  return titulo && descripcion ? { titulo, descripcion } : null;
}

/** El jsonb `texto_preparado` validado (lo escribió la asistente, pero se lee con cuidado). */
export function leerTextoPreparado(v: unknown): TextoPreparado {
  const o = v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  const orden = (Array.isArray(o.orden_fotos) ? o.orden_fotos : [])
    .filter((x): x is { foto: number; muestra?: unknown } => !!x && typeof x === "object" && Number.isInteger((x as { foto?: unknown }).foto))
    .map((x) => ({ foto: x.foto, muestra: texto(x.muestra, 200) }));
  return { es: idioma(o.es), en: idioma(o.en), orden_fotos: orden };
}

/**
 * Las fotos en el orden que preparó la asistente (`orden_fotos.foto` cuenta desde 1 sobre las fotos ordenadas por
 * `orden`, como se las mostró a Claude), luego las demás. Solo originales del bucket propio, sin repetir, hasta `max`.
 */
export function ordenDeFotos(fotos: Foto[], orden: { foto: number }[], corredorId: string, max = MAX_FOTOS_LLENAR): string[] {
  const ordenadas = [...(Array.isArray(fotos) ? fotos : [])].sort((x, y) => (x.orden ?? 0) - (y.orden ?? 0));
  const elegidas = [...orden.map((o) => ordenadas[o.foto - 1]).filter(Boolean), ...ordenadas];
  const urls: string[] = [];
  for (const f of elegidas) {
    if (urls.length >= max) break;
    if (f && esFotoPropia(f.url, corredorId) && !urls.includes(f.url)) urls.push(f.url);
  }
  return urls;
}

const numero = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null;
};
const nulo = (v: unknown): string | null => texto(v, 120) || null;

/**
 * Lo que va en cada campo del formulario (pura). null si el anuncio no es de ese corredor, no tiene casa o texto en
 * español, o la casa ya se vendió o alquiló. La descripción termina con el enlace de WhatsApp con la referencia, igual
 * que la que manda la asistente (`descripcionConEnlace`).
 */
export function datosParaLlenar(
  anuncio: AnuncioFila,
  casa: CasaLlenar | null,
  corredor: Pick<Corredor, "id" | "whatsapp_numero">,
): DatosLlenar | null {
  if (!casa || anuncio.propiedad_id !== casa.id || CERRADAS.has(casa.estado)) return null;
  const t = leerTextoPreparado(anuncio.texto_preparado);
  if (!t.es) return null;
  const enlace = corredor.whatsapp_numero ? enlaceWhatsApp(corredor.whatsapp_numero, anuncio.referencia) : null;
  return {
    id: anuncio.id,
    referencia: anuncio.referencia,
    casa: { codigo: casa.codigo, titulo: casa.titulo },
    es: { titulo: t.es.titulo, descripcion: descripcionConEnlace(t.es.descripcion, enlace, "es") },
    en: t.en ? { titulo: t.en.titulo, descripcion: descripcionConEnlace(t.en.descripcion, enlace, "en") } : null,
    operacion: casa.operacion === "venta" || casa.operacion === "alquiler" ? casa.operacion : null,
    tipo: nulo(casa.tipo),
    precio: numero(casa.precio),
    moneda: casa.moneda === "USD" || casa.moneda === "CRC" ? casa.moneda : null,
    provincia: nulo(casa.provincia),
    canton: nulo(casa.canton),
    distrito: nulo(casa.distrito),
    zona: nulo(casa.zona),
    habitaciones: numero(casa.habitaciones),
    banos: numero(casa.banos),
    m2_construccion: numero(casa.m2_construccion),
    m2_terreno: numero(casa.m2_terreno),
    amenidades: (Array.isArray(casa.amenidades) ? casa.amenidades : []).map((a) => texto(a, 60)).filter(Boolean).slice(0, 30),
    fotos: ordenDeFotos(casa.fotos, t.orden_fotos, corredor.id),
    conEnlace: !!enlace,
  };
}

function verificar(error: { message: string; code?: string } | null, que: string): void {
  if (error) throw new ErrorDatos(que, error.code, error.message);
}

const COLUMNAS_CASA =
  "id, codigo, titulo, tipo, operacion, precio, moneda, provincia, canton, distrito, zona, habitaciones, banos, m2_construccion, m2_terreno, amenidades, estado, fotos";

/** Los anuncios por publicar del corredor (con texto y casa que se pueda anunciar), lo más nuevo primero. */
export async function anunciosListos(db: SupabaseClient, corredorId: string): Promise<AnuncioListo[]> {
  const { data, error } = await db
    .from("anuncios_e24")
    .select("id, referencia, titulo, propiedad_id, texto_preparado")
    .eq("corredor_id", corredorId)
    .eq("estado", "borrador")
    .order("updated_at", { ascending: false })
    .limit(MAX_LISTOS);
  verificar(error, "anunciosListos");
  const filas = ((data ?? []) as AnuncioFila[]).filter((a) => a.propiedad_id && leerTextoPreparado(a.texto_preparado).es);
  if (filas.length === 0) return [];
  const { data: casas, error: e2 } = await db
    .from("propiedades")
    .select("id, codigo, titulo, estado, fotos")
    .eq("corredor_id", corredorId)
    .in("id", filas.map((a) => a.propiedad_id as string));
  verificar(e2, "anunciosListos (casas)");
  const porId = new Map(((casas ?? []) as Pick<CasaLlenar, "id" | "codigo" | "titulo" | "estado" | "fotos">[]).map((c) => [c.id, c]));
  const lista: AnuncioListo[] = [];
  for (const a of filas) {
    const c = porId.get(a.propiedad_id as string);
    if (!c || CERRADAS.has(c.estado)) continue;
    const t = leerTextoPreparado(a.texto_preparado);
    lista.push({
      id: a.id,
      referencia: a.referencia,
      titulo: t.es?.titulo ?? a.titulo ?? c.titulo,
      casa: { codigo: c.codigo, titulo: c.titulo },
      portada: ordenDeFotos(c.fotos, t.orden_fotos, corredorId, 1)[0] ?? null,
    });
  }
  return lista.slice(0, MAX_LISTOS);
}

/** Lo que va en el formulario para un anuncio del corredor, o null si no es suyo o ya no está por publicar. */
export async function anuncioParaLlenar(db: SupabaseClient, corredor: Pick<Corredor, "id" | "whatsapp_numero">, id: string): Promise<DatosLlenar | null> {
  const { data, error } = await db
    .from("anuncios_e24")
    .select("id, referencia, titulo, propiedad_id, texto_preparado")
    .eq("corredor_id", corredor.id)
    .eq("id", id)
    .eq("estado", "borrador")
    .maybeSingle();
  verificar(error, "anuncioParaLlenar");
  const anuncio = data as AnuncioFila | null;
  if (!anuncio?.propiedad_id) return null;
  const { data: casa, error: e2 } = await db
    .from("propiedades")
    .select(COLUMNAS_CASA)
    .eq("corredor_id", corredor.id)
    .eq("id", anuncio.propiedad_id)
    .maybeSingle();
  verificar(e2, "anuncioParaLlenar (casa)");
  return datosParaLlenar(anuncio, (casa as CasaLlenar | null) ?? null, corredor);
}

/** Las casas activas (o reservadas) del corredor para preparar su anuncio, con su portada y si ya tienen uno por publicar. */
export async function casasParaAnuncio(db: SupabaseClient, corredorId: string): Promise<CasaParaAnuncio[]> {
  const [{ data, error }, { data: borradores, error: e2 }] = await Promise.all([
    db
      .from("propiedades")
      .select("id, codigo, titulo, estado, fotos")
      .eq("corredor_id", corredorId)
      .in("estado", ACTIVAS)
      .order("updated_at", { ascending: false })
      .limit(MAX_CASAS),
    db.from("anuncios_e24").select("propiedad_id").eq("corredor_id", corredorId).eq("estado", "borrador"),
  ]);
  verificar(error, "casasParaAnuncio");
  verificar(e2, "casasParaAnuncio (borradores)");
  const con = new Set(((borradores ?? []) as { propiedad_id: string | null }[]).map((b) => b.propiedad_id));
  return ((data ?? []) as Pick<CasaLlenar, "id" | "codigo" | "titulo" | "estado" | "fotos">[])
    .filter((c) => ACTIVAS.includes(c.estado))
    .map((c) => ({ id: c.id, codigo: c.codigo, titulo: c.titulo, portada: ordenDeFotos(c.fotos, [], corredorId, 1)[0] ?? null, conBorrador: con.has(c.id) }));
}

// --- Preparar un anuncio desde el panel lateral ----------------------------------------------------------------

export const TURNOS_PREPARAR_MINUTO = 4;

export type Preparado =
  | { ok: true; anuncio: AnuncioListo | null; mensaje: string; demo?: boolean }
  | { ok: false; motivo: "no_encontrada" | "turno" | "sin_presupuesto" | "ia"; mensaje: string };

export interface DependenciasPreparar {
  db: SupabaseClient;
  deps: Dependencias;
  /** Freno de ráfagas (hayTurnoPorMinuto con TURNOS_PREPARAR_MINUTO). */
  hayTurno: () => Promise<boolean>;
}

/**
 * Prepara (o vuelve a preparar) el anuncio de una casa activa del corredor con la misma IA y los mismos topes que el
 * panel. En la demo (corredor inactivo) no llama a la IA ni gasta: lo dice y no guarda nada.
 */
export async function prepararDesdeExtension(d: DependenciasPreparar, corredor: Corredor, casaId: string): Promise<Preparado> {
  const { data, error } = await d.db
    .from("propiedades")
    .select("id, codigo, titulo, estado")
    .eq("corredor_id", corredor.id)
    .eq("id", casaId)
    .maybeSingle();
  verificar(error, "prepararDesdeExtension (casa)");
  const casa = data as { id: string; codigo: string; titulo: string; estado: string } | null;
  if (!casa || !ACTIVAS.includes(casa.estado)) {
    return { ok: false, motivo: "no_encontrada", mensaje: "No encontré esa casa entre tus casas activas. Vuelve a elegirla." };
  }
  const nombre = (corredor.nombre_asistente ?? "").trim() || "Patty";
  if (corredor.activo === false) {
    return { ok: true, demo: true, anuncio: null, mensaje: `En la demo ${nombre} no prepara anuncios de verdad: en tu cuenta aparecería aquí, listo para llenar.` };
  }
  if (!(await d.hayTurno())) {
    return { ok: false, motivo: "turno", mensaje: "Pediste varios anuncios seguidos. Espera un minuto y vuelve a intentarlo." };
  }
  if (!(await hayPresupuestoHoy(d.deps.repo, corredor))) return { ok: false, motivo: "sin_presupuesto", mensaje: SIN_PRESUPUESTO };
  try {
    const listo = await prepararAnuncio(d.deps, corredor, casa.codigo);
    if (listo.consumo) {
      await d.deps.repo.registrarUso(corredor.id, {
        llamadasClaude: 1,
        tokensEntrada: listo.consumo.tokensEntrada,
        tokensSalida: listo.consumo.tokensSalida,
        costoClaudeUsd: listo.consumo.costoUsd,
      });
    }
    const anuncio = (await anunciosListos(d.db, corredor.id)).find((a) => a.casa.codigo === casa.codigo) ?? null;
    return { ok: true, anuncio, mensaje: anuncio ? `Listo: preparé el anuncio de ${casa.titulo}. Elígelo y toca «Llenar el formulario».` : listo.mensajes[0] };
  } catch (e) {
    const causa = registrarFallaIA(d.deps.registrar, { corredorId: corredor.id, donde: "extension_anuncio" }, e);
    console.error(JSON.stringify({ evento: "error_preparar_extension", corredorId: corredor.id, causa, error: errorSeguro(e) }));
    return { ok: false, motivo: "ia", mensaje: mensajeFallaIA(causa, corredor.nombre_asistente) };
  }
}
