"use server";

import { dependenciasPara } from "@/lib/asistente/dependencias";
import type { Corredor, Foto } from "@/lib/datos/tipos";
import { fichaDePropiedad } from "@/lib/fichas/comando";
import { fotosPropias } from "@/lib/fotos/origen";
import { revisarCasas, type CasaHerramienta, type CasaParaRevisar } from "@/lib/panel/herramientas-patty";
import { configFotosSitio } from "@/lib/sitio/fotos";
import { sesionConCorredor } from "@/lib/panel/sesion";
import { hayTurnoPorMinuto } from "@/lib/panel/turno-ia";

// Herramientas del chat de Patty (fotos, post, historia, ficha y video de una casa): todo lee con la sesión del
// corredor (RLS) y filtra por su corredor_id. Nada de esto usa IA; la ficha se genera igual que en la casa.

type Fallo = { ok: false; motivo: string };
const ES_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const NO_ES_TUYA: Fallo = { ok: false, motivo: "No encontré esa casa." };

type Fila = { id: string; codigo: string; titulo: string; zona: string | null; estado: string; fotos: Foto[] | null };

/** Fotos originales que se pueden mostrar: las del Storage propio (en la demo, las de ejemplo). */
function originales(fotos: Foto[] | null, corredor: Corredor): string[] {
  const lista = [...(fotos ?? [])].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
  const propias = corredor.activo === false ? lista.filter((f) => /^https:\/\//.test(f.url)) : fotosPropias(lista, corredor.id);
  return propias.map((f) => f.url);
}

/** Casas activas o reservadas del corredor, con su portada, para elegir en el chat. */
export async function casasParaPatty(): Promise<{ ok: true; casas: CasaHerramienta[] } | Fallo> {
  const s = await sesionConCorredor();
  const corredor = s.corredor as Corredor;
  const { data, error } = await s.supabase
    .from("propiedades")
    .select("id, codigo, titulo, zona, estado, fotos")
    .eq("corredor_id", corredor.id)
    .in("estado", ["activa", "reservada"])
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) return { ok: false, motivo: "No pude leer tus casas. Inténtalo de nuevo." };
  const casas = ((data ?? []) as Fila[]).map((c) => {
    const fotos = originales(c.fotos, corredor);
    return { id: c.id, codigo: c.codigo, titulo: c.titulo, zona: c.zona, portada: fotos[0] ?? null, fotos: fotos.length };
  });
  return { ok: true, casas };
}

async function casaPropia(id: unknown) {
  if (typeof id !== "string" || !ES_ID.test(id)) return null;
  const s = await sesionConCorredor();
  const { data } = await s.supabase
    .from("propiedades")
    .select("id, codigo, titulo, zona, estado, fotos")
    .eq("corredor_id", s.corredor.id)
    .eq("id", id)
    .maybeSingle();
  return data ? { corredor: s.corredor as Corredor, casa: data as Fila } : null;
}

/** Las fotos originales de una casa (nunca las mejoradas ni las ilustrativas: esas las revisa el corredor en la casa). */
export async function fotosDeCasaPatty(id: unknown): Promise<{ ok: true; fotos: string[]; titulo: string; codigo: string } | Fallo> {
  const r = await casaPropia(id);
  if (!r) return NO_ES_TUYA;
  return { ok: true, fotos: originales(r.casa.fotos, r.corredor), titulo: r.casa.titulo, codigo: r.casa.codigo };
}

/** La ficha PDF de la casa, como en su pantalla (queda en el bucket público `fichas`, como siempre). */
export async function fichaDeCasaPatty(id: unknown): Promise<{ ok: true; url: string; nombre: string } | Fallo> {
  const r = await casaPropia(id);
  if (!r) return NO_ES_TUYA;
  if (!(await hayTurnoPorMinuto("patty_ficha", r.corredor.id, 4))) return { ok: false, motivo: "Muchas fichas seguidas. Espera un minuto." };
  try {
    const ficha = await fichaDePropiedad(dependenciasPara(r.corredor), r.corredor, r.casa.codigo);
    if (ficha.tipo !== "pdf") return { ok: false, motivo: ficha.texto };
    return { ok: true, url: ficha.url, nombre: ficha.nombreArchivo };
  } catch {
    return { ok: false, motivo: "No pude armar la ficha ahora. Inténtalo de nuevo en un rato." };
  }
}

/** "Revisar mis casas": qué le falta a cada casa activa (lo decide el código, sin IA). */
export async function revisarCasasPatty(): Promise<
  { ok: true; pendientes: { casa: CasaParaRevisar; problemas: string[] }[]; completas: number; pausadas: number } | Fallo
> {
  const s = await sesionConCorredor();
  const corredor = s.corredor as Corredor;
  const { data, error } = await s.supabase
    .from("propiedades")
    .select("id, codigo, titulo, estado, precio, zona, descripcion, fotos, habitaciones, tipo")
    .eq("corredor_id", corredor.id)
    .in("estado", ["activa", "reservada", "inactiva"])
    .limit(500);
  if (error) return { ok: false, motivo: "No pude leer tus casas. Inténtalo de nuevo." };
  const { data: c } = await s.supabase.from("corredores").select("slug").eq("id", corredor.id).maybeSingle();
  const conSitio = !!configFotosSitio((c as { slug?: string } | null)?.slug);
  const casas: CasaParaRevisar[] = ((data ?? []) as (Fila & { precio: number | null; descripcion: string | null; habitaciones: number | null; tipo: string | null })[]).map((f) => {
    const propias = corredor.activo === false ? (f.fotos ?? []) : fotosPropias(f.fotos ?? [], corredor.id);
    return {
      id: f.id,
      codigo: f.codigo,
      titulo: f.titulo,
      estado: f.estado,
      precio: f.precio,
      zona: f.zona,
      descripcion: f.descripcion,
      fotos: propias.length,
      mejoradas: propias.filter((x) => x.mejorada_url).length,
      habitaciones: f.habitaciones,
      tipo: f.tipo,
    };
  });
  const r = revisarCasas(casas, conSitio);
  return { ok: true, pendientes: r.pendientes.slice(0, 30), completas: r.completas.length, pausadas: r.pausadas };
}

export type DuenoReciente = { id: string; titulo: string | null; zona: string | null; precio: number | null; moneda: string | null; url: string | null; foto: string | null; cuando: string };

/** "Dueños directos": los últimos que encontró la búsqueda y cuántos esperan que les escribas. */
export async function duenosPatty(): Promise<{ ok: true; recientes: DuenoReciente[]; sinEscribir: number; ultimaSemana: number } | Fallo> {
  const s = await sesionConCorredor();
  const { data, error } = await s.supabase
    .from("leads_duenos")
    .select("id, titulo, zona, precio, moneda, url, foto_url, estado_contacto, created_at")
    .eq("corredor_id", s.corredor.id)
    .eq("es_dueno", true)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return { ok: false, motivo: "No pude leer los dueños. Inténtalo de nuevo." };
  const filas = (data ?? []) as { id: string; titulo: string | null; zona: string | null; precio: number | null; moneda: string | null; url: string | null; foto_url: string | null; estado_contacto: string | null; created_at: string }[];
  const hace7 = Date.now() - 7 * 24 * 3600_000;
  const esE24 = (u: string | null) => !!u && /^https:\/\/([a-z0-9-]+\.)*encuentra24\.com\//i.test(u);
  return {
    ok: true,
    recientes: filas
      .filter((f) => (f.estado_contacto ?? "nuevo") === "nuevo")
      .slice(0, 5)
      .map((f) => ({ id: f.id, titulo: f.titulo, zona: f.zona, precio: f.precio, moneda: f.moneda, url: esE24(f.url) ? f.url : null, foto: esE24(f.foto_url) ? f.foto_url : null, cuando: f.created_at })),
    sinEscribir: filas.filter((f) => (f.estado_contacto ?? "nuevo") === "nuevo").length,
    ultimaSemana: filas.filter((f) => Date.parse(f.created_at) >= hace7).length,
  };
}
