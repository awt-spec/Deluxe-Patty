import type { SupabaseClient } from "@supabase/supabase-js";

// Guardar tiempo apartado desde el panel, con la sesión del corredor (RLS): lo usan el formulario de Apartar
// tiempo y la confirmación de "Dímelo con tus palabras", para que la inserción en bloqueos_agenda sea una sola.
// Lo que ya estaba apartado entero no se repite. Una sola inserción con todas las filas.

export interface FilaBloqueo {
  inicio: string;
  fin: string;
  motivo: string | null;
}

/** ¿Ya hay un bloqueo que cubre todo ese rato? (para no repetirlo si se pide dos veces) */
export async function yaApartado(db: SupabaseClient, corredorId: string, inicio: string, fin: string): Promise<boolean> {
  const { count } = await db
    .from("bloqueos_agenda")
    .select("id", { count: "exact", head: true })
    .eq("corredor_id", corredorId)
    .lte("inicio", inicio)
    .gte("fin", fin);
  return (count ?? 0) > 0;
}

export async function guardarBloqueos(
  db: SupabaseClient,
  corredorId: string,
  filas: FilaBloqueo[],
): Promise<{ ok: true; ids: string[]; repetidos: number } | { ok: false }> {
  const repetidos = await Promise.all(filas.map((b) => yaApartado(db, corredorId, b.inicio, b.fin)));
  const nuevas = filas.filter((_, i) => !repetidos[i]).map((b) => ({ corredor_id: corredorId, inicio: b.inicio, fin: b.fin, motivo: b.motivo }));
  if (nuevas.length === 0) return { ok: true, ids: [], repetidos: filas.length };
  const { data, error } = await db.from("bloqueos_agenda").insert(nuevas).select("id");
  if (error) return { ok: false };
  return { ok: true, ids: ((data ?? []) as { id: string }[]).map((d) => d.id), repetidos: filas.length - nuevas.length };
}
