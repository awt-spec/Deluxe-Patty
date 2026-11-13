import type { SupabaseClient } from "@supabase/supabase-js";
import { ErrorDatos } from "../monitoreo/errores";

// Enseñarle algo a la asistente (tabla `conocimiento`). Lo usan "Enséñale algo" del Cerebro y la
// calificación de "Probar la asistente". Va con la sesión del corredor (RLS) y filtra por corredor_id.

const escaparIlike = (t: string) => t.replace(/[\\%_]/g, "\\$&");

/**
 * Guarda lo que sabe: si ya hay un tema igual (activo o una duda pendiente), le pone esta respuesta y
 * queda activo; si no, crea uno nuevo. Así enseñar dos veces lo mismo no deja dos filas.
 */
export async function ensenarAlCerebro(db: SupabaseClient, corredorId: string, tema: string, respuesta: string): Promise<"nuevo" | "actualizado"> {
  const t = tema.trim().slice(0, 300);
  const r = respuesta.trim().slice(0, 2000);
  if (!t || !r) throw new ErrorDatos("ensenarAlCerebro", "vacio", "tema o respuesta vacíos");
  const { data: igual, error: e1 } = await db
    .from("conocimiento")
    .select("id")
    .eq("corredor_id", corredorId)
    .in("estado", ["activo", "pendiente"])
    .ilike("tema", escaparIlike(t))
    .limit(1)
    .maybeSingle();
  if (e1) throw new ErrorDatos("ensenarAlCerebro (buscar)", e1.code, e1.message);
  if (igual) {
    const { error } = await db
      .from("conocimiento")
      .update({ respuesta: r, estado: "activo", updated_at: new Date().toISOString() })
      .eq("corredor_id", corredorId)
      .eq("id", igual.id as string);
    if (error) throw new ErrorDatos("ensenarAlCerebro (cambiar)", error.code, error.message);
    return "actualizado";
  }
  const { error } = await db.from("conocimiento").insert({ corredor_id: corredorId, tema: t, respuesta: r, estado: "activo", origen: "manual" });
  if (error) throw new ErrorDatos("ensenarAlCerebro", error.code, error.message);
  return "nuevo";
}
