import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

// Copia una foto de afuera (el sitio web del corredor, un anuncio de Encuentra24) al bucket `fotos` del corredor:
// `<corredor>/<propiedad>/originales/<prefijo>-<huella>.<ext>`. Solo pide direcciones que `permitida` acepta (nada
// de pedir otras direcciones: SSRF), sin seguir redirecciones, y solo imágenes JPEG, PNG o WebP de hasta 12 MB.

export const MAX_FOTO_COPIADA = 12 * 1024 * 1024;

export interface CopiaFoto {
  corredorId: string;
  propiedadId: string;
  url: string;
  permitida: (url: string) => boolean;
  /** Comienzo del nombre del archivo ("web", "e24"). */
  prefijo: string;
  /** Tiempo máximo de esta descarga. */
  tiempoMs?: number;
}

/** Huella con la que se nombra la copia de una dirección (la misma dirección da siempre el mismo nombre). */
export function huellaFoto(url: string): string {
  return createHash("sha256").update(url).digest("hex").slice(0, 16);
}

/** Dirección pública de la copia, o null si la foto no se pudo (o no se debía) copiar. */
export async function copiarFotoExterna(db: SupabaseClient, c: CopiaFoto): Promise<string | null> {
  if (!c.permitida(c.url)) return null;
  const r = await fetch(c.url, { signal: AbortSignal.timeout(Math.max(1000, c.tiempoMs ?? 30_000)), redirect: "error" });
  const tipo = (r.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!r.ok || !/^image\/(jpeg|png|webp)$/.test(tipo)) return null;
  if (Number(r.headers.get("content-length") ?? 0) > MAX_FOTO_COPIADA) return null;
  const datos = Buffer.from(await r.arrayBuffer());
  if (datos.length === 0 || datos.length > MAX_FOTO_COPIADA) return null;
  const ext = tipo === "image/png" ? "png" : tipo === "image/webp" ? "webp" : "jpg";
  const camino = `${c.corredorId}/${c.propiedadId}/originales/${c.prefijo}-${huellaFoto(c.url)}.${ext}`;
  const { error } = await db.storage.from("fotos").upload(camino, datos, { contentType: tipo, upsert: true });
  if (error) return null;
  return db.storage.from("fotos").getPublicUrl(camino).data.publicUrl;
}
