import type { SupabaseClient } from "@supabase/supabase-js";
import { ErrorDatos } from "../monitoreo/errores";
import { LIMITES, textoLibre } from "./texto-libre";

// Enseñarle algo a la asistente (tabla `conocimiento`). Lo usan "Enséñale algo" del Cerebro y la
// calificación de "Probar la asistente". Va con la sesión del corredor (RLS) y filtra por corredor_id.

/** Tema y respuesta limpios (sin caracteres de dirección o control) y dentro de su tope; si pasan, el motivo. */
export function textoParaCerebro(
  tema: unknown,
  respuesta: unknown,
): { ok: true; tema: string | null; respuesta: string | null } | { ok: false; motivo: string } {
  const t = textoLibre(tema, LIMITES.tema, "El tema");
  if (!t.ok) return t;
  const r = textoLibre(respuesta, LIMITES.respuesta, "La respuesta");
  if (!r.ok) return r;
  return { ok: true, tema: t.valor, respuesta: r.valor };
}

const escaparIlike = (t: string) => t.replace(/[\\%_]/g, "\\$&");

/**
 * Guarda lo que sabe: si ya hay un tema igual (activo o una duda pendiente), le pone esta respuesta y
 * queda activo; si no, crea uno nuevo. Así enseñar dos veces lo mismo no deja dos filas.
 */
export async function ensenarAlCerebro(db: SupabaseClient, corredorId: string, tema: string, respuesta: string): Promise<"nuevo" | "actualizado"> {
  const limpio = textoParaCerebro(tema, respuesta);
  if (!limpio.ok) throw new ErrorDatos("ensenarAlCerebro", "largo", "tema o respuesta muy largos");
  const t = limpio.tema;
  const r = limpio.respuesta;
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
