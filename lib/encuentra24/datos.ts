import type { SupabaseClient } from "@supabase/supabase-js";
import type { Corredor } from "../datos/tipos";
import type { Bloqueado, LeadDueno } from "./busqueda";

// Consultas del worker de búsqueda semanal. Corre con service_role: todo filtra por corredor_id.

export type CorredorBusqueda = Corredor & {
  zonas_e24: string[];
  categoria_busqueda_e24: string;
  precio_busqueda_min: number | null;
  precio_busqueda_max: number | null;
};

function verificar(error: { message: string; code?: string } | null, que: string): void {
  if (error) throw new Error(`${que}: ${error.code ?? ""} ${error.message}`);
}

export async function corredoresConBusqueda(db: SupabaseClient): Promise<CorredorBusqueda[]> {
  const { data, error } = await db
    .from("corredores")
    .select(
      "id, nombre, nombre_contacto, whatsapp_numero, whatsapp_phone_number_id, whatsapp_corredor, zona_horaria, tono, reglas_escalamiento, tope_mensajes_mes, aviso_mensajes_mes, respuesta_automatica, duracion_visita_min, margen_visitas_min, anticipacion_min_horas, horizonte_agenda_dias, hora_plan_dia, zonas_e24, categoria_busqueda_e24, precio_busqueda_min, precio_busqueda_max",
    )
    .eq("activo", true)
    .neq("zonas_e24", "{}");
  verificar(error, "corredoresConBusqueda");
  return (data ?? []) as CorredorBusqueda[];
}

export async function idsVistos(db: SupabaseClient, corredorId: string): Promise<Set<string>> {
  const { data, error } = await db.from("leads_duenos").select("e24_id").eq("corredor_id", corredorId);
  verificar(error, "idsVistos");
  return new Set((data ?? []).map((l) => l.e24_id as string));
}

export async function bloqueados(db: SupabaseClient, corredorId: string): Promise<Bloqueado[]> {
  const { data, error } = await db
    .from("corredores_bloqueados")
    .select("nombre, anunciante_e24_id")
    .eq("corredor_id", corredorId);
  verificar(error, "bloqueados");
  return (data ?? []) as Bloqueado[];
}

export async function guardarLeads(db: SupabaseClient, corredorId: string, semana: string, leads: LeadDueno[]) {
  if (leads.length === 0) return;
  const filas = leads.map(({ anuncio: a, puntaje, senales }) => ({
    corredor_id: corredorId,
    e24_id: a.id,
    url: a.url,
    titulo: a.titulo,
    zona: a.zona,
    precio: a.precio,
    moneda: a.moneda === "USD" || a.moneda === "CRC" ? a.moneda : null,
    nombre_anunciante: a.anunciante.nombre,
    anunciante_e24_id: a.anunciante.id,
    descripcion: a.descripcion.slice(0, 4000),
    m2_construccion: a.m2Construccion,
    habitaciones: a.habitaciones,
    foto_url: a.fotoPrincipal,
    es_dueno: true,
    puntaje,
    senales,
    semana,
  }));
  const { error } = await db
    .from("leads_duenos")
    .upsert(filas, { onConflict: "corredor_id,e24_id", ignoreDuplicates: true });
  verificar(error, "guardarLeads");
}
