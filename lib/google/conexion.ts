import type { SupabaseClient } from "@supabase/supabase-js";
import { errorSeguro } from "../monitoreo/errores";
import { cifrar, descifrar } from "./cifrado";
import { renovarAcceso } from "./google";

// La conexión de un corredor con Google: guardarla (cifrada), conseguir un token de acceso vigente y
// anotar si Google dejó de aceptarla (por ejemplo, si el corredor quitó el permiso desde su cuenta).

export interface ConexionGoogle {
  corredorId: string;
  correo: string;
  calendario: string;
  correoLeidoHasta: number | null;
  acceso: () => Promise<string>;
}

export async function guardarConexion(
  db: SupabaseClient,
  corredorId: string,
  datos: { correo: string; refresh: string; permisos: string[] },
) {
  const { error } = await db.from("google_conexiones").upsert({
    corredor_id: corredorId,
    correo: datos.correo,
    token_cifrado: cifrar(datos.refresh),
    permisos: datos.permisos,
    ultimo_error: null,
    conectado_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(`guardar_conexion_${error.code}`);
}

export async function quitarConexion(db: SupabaseClient, corredorId: string) {
  await db.from("google_conexiones").delete().eq("corredor_id", corredorId);
}

/** La conexión del corredor, o null si no conectó Google (o falta la configuración del servidor). */
export async function conexionDe(db: SupabaseClient, corredorId: string): Promise<ConexionGoogle | null> {
  const clienteId = process.env.GOOGLE_CLIENT_ID;
  const secreto = process.env.GOOGLE_CLIENT_SECRET;
  if (!clienteId || !secreto || !process.env.GOOGLE_TOKEN_KEY) return null;
  const { data } = await db
    .from("google_conexiones")
    .select("correo, token_cifrado, calendario_id, correo_leido_hasta")
    .eq("corredor_id", corredorId)
    .maybeSingle();
  if (!data) return null;
  let cache: { token: string; vence: number } | null = null;
  return {
    corredorId,
    correo: data.correo as string,
    calendario: data.calendario_id as string,
    correoLeidoHasta: (data.correo_leido_hasta as number | null) ?? null,
    acceso: async () => {
      if (cache && cache.vence > Date.now() + 60_000) return cache.token;
      try {
        const r = await renovarAcceso({ clienteId, secreto }, descifrar(data.token_cifrado as string));
        cache = { token: r.access_token, vence: Date.now() + r.expires_in * 1000 };
        return cache.token;
      } catch (e) {
        await anotarError(db, corredorId, errorSeguro(e));
        throw e;
      }
    },
  };
}

export async function anotarError(db: SupabaseClient, corredorId: string, error: string | null) {
  await db
    .from("google_conexiones")
    .update({ ultimo_error: error ? error.slice(0, 200) : null, updated_at: new Date().toISOString() })
    .eq("corredor_id", corredorId);
}
