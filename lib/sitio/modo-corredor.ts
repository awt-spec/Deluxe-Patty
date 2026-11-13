import type { SupabaseClient } from "@supabase/supabase-js";
import { CODIGO_SITIO, fuentesSitio } from "./importar";

// "Modo corredor": el enlace de una casa del sitio web SIN los datos de contacto del corredor, para pasárselo a otro
// corredor. Es la página `/share/<slug>` del sitio (sin menú, sin WhatsApp ni teléfono, con fotos, precio y datos).
// Funciona para cualquiera: el sitio busca la casa por su slug aunque no haya un enlace con nombre de corredor.
// Solo las casas que vienen del sitio (código DP-XXXXXX) existen allá; las hechas en el portal no.

/** Dirección pública del sitio de cada corredor, por slug. Otras con SITIO_URLS = {"slug":"https://…"}. */
const SITIOS_POR_DEFECTO: Record<string, string> = {
  "deluxe-properties": "https://www.deluxeproperties.sale",
};

export function sitiosWeb(): Record<string, string> {
  try {
    const extra = JSON.parse(process.env.SITIO_URLS ?? "{}") as Record<string, unknown>;
    const validas = Object.fromEntries(Object.entries(extra).filter(([k, v]) => /^[a-z0-9-]+$/.test(k) && typeof v === "string" && v.startsWith("https://")));
    return { ...SITIOS_POR_DEFECTO, ...(validas as Record<string, string>) };
  } catch {
    return SITIOS_POR_DEFECTO;
  }
}

/** Enlace de modo corredor, o null si la casa no está disponible en el sitio o falta la dirección o el slug. */
export function enlaceModoCorredor(i: { sitio: string | null | undefined; slugCasa: string | null | undefined; estado: string }): string | null {
  if (i.estado !== "activa") return null;
  const slug = (i.slugCasa ?? "").trim();
  if (!slug || !i.sitio) return null;
  let base: URL;
  try {
    base = new URL(i.sitio);
  } catch {
    return null;
  }
  if (base.protocol !== "https:") return null;
  return `${base.origin}/share/${encodeURIComponent(slug)}`;
}

/** El slug que el sitio le puso a la casa (lo trae su exportación; el portal no lo guarda). null si no se pudo leer. */
export async function slugDeCasaSitio(urlExportacion: string, codigo: string): Promise<string | null> {
  try {
    const r = await fetch(urlExportacion, { signal: AbortSignal.timeout(4_000), headers: { accept: "application/json" }, next: { revalidate: 300 } });
    if (!r.ok) return null;
    const json = (await r.json()) as { propiedades?: { codigo?: unknown; slug?: unknown }[] };
    const casa = (json.propiedades ?? []).find((c) => typeof c?.codigo === "string" && c.codigo.toUpperCase() === codigo.toUpperCase());
    return typeof casa?.slug === "string" && casa.slug.trim() ? casa.slug.trim() : null;
  } catch {
    return null;
  }
}

/** Para la ficha de la casa en el panel: el enlace, o null si no aplica (nunca falla). */
export async function enlaceModoCorredorDeCasa(db: SupabaseClient, corredorId: string, casa: { codigo: string; estado: string }): Promise<string | null> {
  if (casa.estado !== "activa" || !CODIGO_SITIO.test(casa.codigo.toUpperCase())) return null;
  try {
    const { data } = await db.from("corredores").select("slug").eq("id", corredorId).maybeSingle();
    const slug = (data as { slug?: string } | null)?.slug;
    if (!slug) return null;
    const sitio = sitiosWeb()[slug];
    const exportacion = fuentesSitio()[slug];
    if (!sitio || !exportacion) return null;
    return enlaceModoCorredor({ sitio, slugCasa: await slugDeCasaSitio(exportacion, casa.codigo), estado: casa.estado });
  } catch {
    return null;
  }
}
