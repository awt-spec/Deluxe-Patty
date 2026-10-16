import "server-only";
import type { Marca } from "../fichas/marca";
import { createAdminClient } from "../supabase/admin";

/** Lo que la pantalla de entrada muestra de un corredor antes de saber quién entra. */
export interface MarcaEntrada {
  slug: string;
  nombre: string;
  colores: Marca["colores"] | null;
  /** Fondo exacto del archivo del logo, si difiere del profundo: la pantalla lo usa para que no se vea el borde. */
  fondoLogo: string | null;
  eslogan: string | null;
  /** Dirección del logo para fondo profundo (`/marca/<slug>/logo`), o null si no tiene. */
  logo: string | null;
}

const SLUG = /^[a-z0-9][a-z0-9-]{0,59}$/;

export const slugValido = (slug: string | null | undefined): slug is string => !!slug && SLUG.test(slug);

/**
 * Marca de la pantalla de entrada. Con `?c=<slug>` es la de ese corredor; sin él, la del único corredor
 * si hay uno solo (hoy Deluxe). Con varios corredores y sin `?c`, la entrada queda neutra: cada uno
 * entra por su propio enlace, sin tocar código.
 *
 * Usa el backend porque quien entra todavía no tiene sesión, y solo lee datos públicos de la marca
 * (nombre, colores, eslogan, logo); nunca devuelve nada más del corredor.
 */
export async function marcaDeEntrada(slug?: string | null): Promise<MarcaEntrada | null> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  try {
    const db = createAdminClient();
    const consulta = db.from("corredores").select("slug, nombre, marca");
    const { data } = slugValido(slug) ? await consulta.eq("slug", slug).limit(1) : await consulta.limit(2);
    if (!data || data.length !== 1) return null;
    const fila = data[0] as { slug: string; nombre: string; marca: Marca | null };
    return {
      slug: fila.slug,
      nombre: fila.marca?.nombre ?? fila.nombre,
      colores: fila.marca?.colores ?? null,
      fondoLogo: fila.marca?.fondoLogo ?? null,
      eslogan: fila.marca?.eslogan ?? null,
      logo: fila.marca?.logoSobreProfundo ? `/marca/${fila.slug}/logo` : null,
    };
  } catch {
    // Sin marca la entrada sigue funcionando: se ve neutra.
    return null;
  }
}

/** Ruta del logo de un corredor (archivo de `marcas/` o URL), para servirlo en `/marca/<slug>/logo`. */
export async function logoDeCorredor(slug: string): Promise<string | null> {
  if (!slugValido(slug)) return null;
  const { data } = await createAdminClient().from("corredores").select("marca").eq("slug", slug).maybeSingle();
  return (data?.marca as Marca | null)?.logoSobreProfundo ?? null;
}
