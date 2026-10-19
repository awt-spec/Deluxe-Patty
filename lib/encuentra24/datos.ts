import type { SupabaseClient } from "@supabase/supabase-js";
import type { Corredor } from "../datos/tipos";
import type { Bloqueado, LeadDueno } from "./busqueda";
import type { AlmacenExtension, EstadoBusqueda } from "./extension";
import type { AnuncioE24 } from "./parsear";
import { ErrorDatos } from "../monitoreo/errores";

// Consultas de la búsqueda de dueños (worker y extensión de Chrome). Corre con service_role: todo
// filtra por corredor_id, salvo buscar a quién pertenece un código o un permiso de la extensión.

export type CorredorBusqueda = Corredor & {
  zonas_e24: string[];
  categoria_busqueda_e24: string;
  precio_busqueda_min: number | null;
  precio_busqueda_max: number | null;
};

function verificar(error: { message: string; code?: string } | null, que: string): void {
  if (error) throw new ErrorDatos(que, error.code, error.message);
}

const COLUMNAS_BUSQUEDA =
  "id, nombre, nombre_contacto, whatsapp_numero, whatsapp_phone_number_id, whatsapp_corredor, zona_horaria, tono, reglas_escalamiento, tope_mensajes_mes, aviso_mensajes_mes, respuesta_automatica, duracion_visita_min, margen_visitas_min, anticipacion_min_horas, horizonte_agenda_dias, hora_plan_dia, marca, zonas_e24, categoria_busqueda_e24, precio_busqueda_min, precio_busqueda_max";

export async function corredoresConBusqueda(db: SupabaseClient): Promise<CorredorBusqueda[]> {
  const { data, error } = await db
    .from("corredores")
    .select(COLUMNAS_BUSQUEDA)
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

/** Datos de la extensión de Chrome (lib/encuentra24/extension.ts). */
export function crearAlmacenExtension(db: SupabaseClient): AlmacenExtension {
  return {
    async guardarCodigo(corredorId, codigoHash, vence) {
      // Un solo código vigente por corredor: pedir otro anula el anterior.
      const { error: e1 } = await db
        .from("extension_conexiones")
        .delete()
        .eq("corredor_id", corredorId)
        .is("token_hash", null);
      verificar(e1, "guardarCodigo (anteriores)");
      const { error } = await db
        .from("extension_conexiones")
        .insert({ corredor_id: corredorId, codigo_hash: codigoHash, codigo_vence_at: vence.toISOString() });
      verificar(error, "guardarCodigo");
    },

    async canjearCodigo(codigoHash, tokenHash, ahora) {
      const { data, error } = await db
        .from("extension_conexiones")
        .update({ codigo_hash: null, codigo_vence_at: null, token_hash: tokenHash, conectada_at: ahora.toISOString() })
        .eq("codigo_hash", codigoHash)
        .gt("codigo_vence_at", ahora.toISOString())
        .is("token_hash", null)
        .select("corredor_id")
        .maybeSingle();
      verificar(error, "canjearCodigo");
      return (data?.corredor_id as string | undefined) ?? null;
    },

    async corredorDeToken(tokenHash, ahora) {
      const { data, error } = await db
        .from("extension_conexiones")
        .update({ ultimo_uso_at: ahora.toISOString() })
        .eq("token_hash", tokenHash)
        .is("revocada_at", null)
        .select("corredor_id, corredores!inner(activo)")
        .maybeSingle();
      verificar(error, "corredorDeToken");
      const corredor = data?.corredores as unknown as { activo: boolean } | undefined;
      return data && corredor?.activo ? (data.corredor_id as string) : null;
    },

    async revocarToken(tokenHash, ahora) {
      const { error } = await db
        .from("extension_conexiones")
        .update({ revocada_at: ahora.toISOString() })
        .eq("token_hash", tokenHash)
        .is("revocada_at", null);
      verificar(error, "revocarToken");
    },

    async revocarTodas(corredorId, ahora) {
      const { error } = await db
        .from("extension_conexiones")
        .update({ revocada_at: ahora.toISOString() })
        .eq("corredor_id", corredorId)
        .not("token_hash", "is", null)
        .is("revocada_at", null);
      verificar(error, "revocarTodas");
    },

    async corredor(corredorId) {
      const { data, error } = await db
        .from("corredores")
        .select(COLUMNAS_BUSQUEDA)
        .eq("id", corredorId)
        .eq("activo", true)
        .maybeSingle();
      verificar(error, "corredor (extensión)");
      return (data as CorredorBusqueda | null) ?? null;
    },

    idsVistos: (corredorId) => idsVistos(db, corredorId),
    bloqueados: (corredorId) => bloqueados(db, corredorId),

    async crearBusqueda(corredorId, estado) {
      const { error: e1 } = await db.from("busquedas_extension").delete().eq("corredor_id", corredorId);
      verificar(e1, "crearBusqueda (anteriores)");
      const { data, error } = await db
        .from("busquedas_extension")
        .insert({ corredor_id: corredorId, estado })
        .select("id")
        .single();
      verificar(error, "crearBusqueda");
      return data!.id as string;
    },

    async busqueda(corredorId, id) {
      const { data, error } = await db
        .from("busquedas_extension")
        .select("estado")
        .eq("corredor_id", corredorId)
        .eq("id", id)
        .is("terminada_at", null)
        .maybeSingle();
      verificar(error, "busqueda (extensión)");
      return (data?.estado as EstadoBusqueda | undefined) ?? null;
    },

    async estadoDe(corredorId, id) {
      const { data, error } = await db
        .from("busquedas_extension")
        .select("estado")
        .eq("corredor_id", corredorId)
        .eq("id", id)
        .maybeSingle();
      verificar(error, "estadoDe (extensión)");
      return (data?.estado as EstadoBusqueda | undefined) ?? null;
    },

    async guardarEstado(corredorId, id, estado) {
      const { error } = await db.from("busquedas_extension").update({ estado }).eq("corredor_id", corredorId).eq("id", id);
      verificar(error, "guardarEstado (extensión)");
    },

    async agregarAnuncios(corredorId, id, anuncios) {
      if (anuncios.length === 0) return [];
      const filas = anuncios.map((a) => ({ busqueda_id: id, corredor_id: corredorId, e24_id: a.id, anuncio: a }));
      // Solo vuelven las filas insertadas: los anuncios que ya estaban en esta búsqueda no cuentan como nuevos.
      const { data, error } = await db
        .from("busquedas_extension_anuncios")
        .upsert(filas, { onConflict: "busqueda_id,e24_id", ignoreDuplicates: true })
        .select("e24_id");
      verificar(error, "agregarAnuncios (extensión)");
      return (data ?? []).map((f) => f.e24_id as string);
    },

    async anuncios(corredorId, id) {
      const { data, error } = await db
        .from("busquedas_extension_anuncios")
        .select("anuncio")
        .eq("corredor_id", corredorId)
        .eq("busqueda_id", id);
      verificar(error, "anuncios (extensión)");
      return (data ?? []).map((f) => f.anuncio as AnuncioE24);
    },

    async terminar(corredorId, id, ahora) {
      const { error } = await db
        .from("busquedas_extension")
        .update({ terminada_at: ahora.toISOString() })
        .eq("corredor_id", corredorId)
        .eq("id", id);
      verificar(error, "terminar (extensión)");
      const { error: e2 } = await db
        .from("busquedas_extension_anuncios")
        .delete()
        .eq("corredor_id", corredorId)
        .eq("busqueda_id", id);
      verificar(e2, "terminar (anuncios)");
    },

    guardarLeads: (corredorId, semana, leads) => guardarLeads(db, corredorId, semana, leads),
  };
}
