import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Corredor, Foto } from "../datos/tipos";
import { fotosPropias } from "../fotos/origen";
import { configFotosSitio } from "../sitio/fotos";
import { revisarCasas, type CasaParaRevisar } from "./herramientas-patty";

// "Revisar mis casas" y "Dueños directos" de las herramientas de Patty, sin IA. Los usan el chat del panel (con la
// sesión del corredor, RLS) y el panel lateral de la extensión (con el cliente del backend): por eso cada consulta
// filtra por corredor_id de forma explícita.

type Fallo = { ok: false; motivo: string };

export type RevisionCasas = { ok: true; pendientes: { casa: CasaParaRevisar; problemas: string[] }[]; completas: number; pausadas: number };

export async function revisarCasasDe(db: SupabaseClient, corredor: Pick<Corredor, "id" | "activo">): Promise<RevisionCasas | Fallo> {
  const { data, error } = await db
    .from("propiedades")
    .select("id, codigo, titulo, estado, precio, zona, descripcion, fotos, habitaciones, tipo")
    .eq("corredor_id", corredor.id)
    .in("estado", ["activa", "reservada", "inactiva"])
    .limit(500);
  if (error) return { ok: false, motivo: "No pude leer tus casas. Inténtalo de nuevo." };
  const { data: c } = await db.from("corredores").select("slug").eq("id", corredor.id).maybeSingle();
  const conSitio = !!configFotosSitio((c as { slug?: string } | null)?.slug);
  type Fila = { id: string; codigo: string; titulo: string; estado: string; precio: number | null; zona: string | null; descripcion: string | null; fotos: Foto[] | null; habitaciones: number | null; tipo: string | null };
  const casas: CasaParaRevisar[] = ((data ?? []) as Fila[]).map((f) => {
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
export type DuenosRecientes = { ok: true; recientes: DuenoReciente[]; sinEscribir: number; ultimaSemana: number };

const esE24 = (u: string | null) => !!u && /^https:\/\/([a-z0-9-]+\.)*encuentra24\.com\//i.test(u);

/** Los últimos dueños que encontró la búsqueda (solo enlaces y fotos de Encuentra24) y cuántos esperan que les escriba. */
export async function duenosRecientesDe(db: SupabaseClient, corredorId: string, ahora = Date.now()): Promise<DuenosRecientes | Fallo> {
  const { data, error } = await db
    .from("leads_duenos")
    .select("id, titulo, zona, precio, moneda, url, foto_url, estado_contacto, created_at")
    .eq("corredor_id", corredorId)
    .eq("es_dueno", true)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return { ok: false, motivo: "No pude leer los dueños. Inténtalo de nuevo." };
  const filas = (data ?? []) as { id: string; titulo: string | null; zona: string | null; precio: number | null; moneda: string | null; url: string | null; foto_url: string | null; estado_contacto: string | null; created_at: string }[];
  const hace7 = ahora - 7 * 24 * 3600_000;
  const nuevos = filas.filter((f) => (f.estado_contacto ?? "nuevo") === "nuevo");
  return {
    ok: true,
    recientes: nuevos
      .slice(0, 5)
      .map((f) => ({ id: f.id, titulo: f.titulo, zona: f.zona, precio: f.precio, moneda: f.moneda, url: esE24(f.url) ? f.url : null, foto: esE24(f.foto_url) ? f.foto_url : null, cuando: f.created_at })),
    sinEscribir: nuevos.length,
    ultimaSemana: filas.filter((f) => Date.parse(f.created_at) >= hace7).length,
  };
}
