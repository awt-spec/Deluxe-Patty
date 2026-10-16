import type { Foto } from "../datos/tipos";

// El servidor solo descarga fotos del bucket público "fotos" y de la carpeta del propio corredor: una URL
// cualquiera guardada en propiedades.fotos no puede hacer que el servidor pida otras direcciones (SSRF).

function base(): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  return url ? url.replace(/\/+$/, "") : null;
}

export function esFotoPropia(url: string | undefined, corredorId: string): boolean {
  const b = base();
  if (!b || !url) return false;
  const prefijo = `${b}/storage/v1/object/public/fotos/${corredorId}/`;
  return url.startsWith(prefijo) && !url.slice(prefijo.length).split("/").some((p) => p === ".." || p === "");
}

/** Las fotos con su original en el bucket propio; la mejorada se descarta si no es propia. */
export function fotosPropias(fotos: Foto[], corredorId: string): Foto[] {
  return fotos
    .filter((f) => esFotoPropia(f.url, corredorId))
    .map((f) => (f.mejorada_url && !esFotoPropia(f.mejorada_url, corredorId) ? { ...f, mejorada_url: undefined } : f));
}
