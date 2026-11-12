import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizarZona } from "../agenda/zonas";
import type { Corredor, Foto } from "../datos/tipos";
import { errorSeguro } from "../monitoreo/errores";
import { ordenarFotos } from "../panel/formularios";

// Casas del sitio web del corredor → sus casas en el portal (para la asistente, la ficha, la agenda y el CRM).
// El sitio publica una exportación JSON (en el de Deluxe, una función de su Supabase) y un cron la lee cada hora:
//  - crea o pone al día cada casa por su código del sitio (DP-XXXXXX): el sitio manda en esas casas;
//  - copia las fotos al bucket propio (la ficha PDF y la imagen para redes solo usan fotos propias), unas cuantas
//    por vuelta para no pasarse de tiempo, y quita las que allá ya no están;
//  - una casa vendida allá queda vendida (o alquilada); una oculta o que desaparece de la exportación, pausada;
//  - las casas de ejemplo de la semilla (EJEMPLO-*) se borran (o se pausan si algo las usa).
// Las casas que el corredor agrega en el portal no se tocan.

/** Exportación de cada corredor, por slug. Se puede cambiar o sumar otra con SITIO_FUENTES = {"slug":"url"}. */
const FUENTES_POR_DEFECTO: Record<string, string> = {
  "deluxe-properties": "https://gaogmucqywqhybaezzpo.supabase.co/functions/v1/exportar-propiedades",
};

export function fuentesSitio(): Record<string, string> {
  try {
    const extra = JSON.parse(process.env.SITIO_FUENTES ?? "{}") as Record<string, unknown>;
    const validas = Object.fromEntries(Object.entries(extra).filter(([k, v]) => /^[a-z0-9-]+$/.test(k) && typeof v === "string" && v.startsWith("https://")));
    return { ...FUENTES_POR_DEFECTO, ...(validas as Record<string, string>) };
  } catch {
    return FUENTES_POR_DEFECTO;
  }
}

export type CasaSitio = {
  codigo: string;
  titulo: { es: string; en?: string };
  descripcion?: { es?: string; en?: string } | null;
  destacados?: { es?: string[]; en?: string[] } | null;
  operacion: string;
  tipo: string;
  precio: number | null;
  moneda: string;
  ubicacion?: string | null;
  region?: string | null;
  provincia?: string | null;
  canton?: string | null;
  distrito?: string | null;
  habitaciones?: number | null;
  banos?: number | null;
  m2_construccion?: number | null;
  m2_terreno?: number | null;
  amenidades?: string[];
  imagenes?: string[];
  url_e24?: string | null;
  estado?: string;
  oculta?: boolean;
};

/** Código que viene del sitio (DP- y 6 letras o números): así se distinguen de las casas hechas en el portal. */
export const CODIGO_SITIO = /^DP-[0-9A-Z]{6}$/;

const TIPOS: Record<string, string> = { house: "casa", villa: "casa", apartment: "apartamento", penthouse: "apartamento", condo: "apartamento", lot: "lote" };
const AMENIDADES: Record<string, string> = {
  pool: "piscina",
  security: "seguridad 24/7",
  view: "vista",
  gym: "gimnasio",
  smart: "casa inteligente",
  garden: "jardín",
  beach: "playa",
  golf: "campo de golf",
};

const numero = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);
const texto = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

/** Lo que se guarda en propiedades a partir de una casa del sitio (sin fotos). null si no se puede usar. */
export function filaDesdeSitio(c: CasaSitio): Record<string, unknown> | null {
  if (!c || typeof c.codigo !== "string" || !CODIGO_SITIO.test(c.codigo.toUpperCase())) return null;
  const titulo = texto(c.titulo?.es, 200);
  if (!titulo) return null;
  const operacion = c.operacion === "rent" ? "alquiler" : "venta";
  const destacados = (c.destacados?.es ?? []).filter((d) => typeof d === "string" && d.trim()).slice(0, 30);
  // Los destacados entran en la descripción: así la asistente los conoce (y no inventa nada que no esté).
  const descripcion = [texto(c.descripcion?.es, 6000), destacados.length ? `Destacados:\n${destacados.map((d) => `- ${d.trim()}`).join("\n")}` : null]
    .filter(Boolean)
    .join("\n\n");
  const lugar = texto(c.canton, 80) ?? texto(c.ubicacion, 80);
  const estado = c.oculta ? "inactiva" : c.estado === "sold" ? (operacion === "alquiler" ? "alquilada" : "vendida") : "activa";
  return {
    codigo: c.codigo.toUpperCase(),
    titulo,
    tipo: TIPOS[c.tipo] ?? "casa",
    operacion,
    precio: numero(c.precio),
    moneda: c.moneda === "CRC" ? "CRC" : "USD",
    provincia: texto(c.provincia, 80),
    canton: texto(c.canton, 80),
    distrito: texto(c.distrito, 80),
    zona: lugar ? normalizarZona(lugar) : null,
    habitaciones: numero(c.habitaciones),
    banos: numero(c.banos),
    m2_construccion: numero(c.m2_construccion),
    m2_terreno: numero(c.m2_terreno),
    descripcion: descripcion || null,
    amenidades: [...new Set((c.amenidades ?? []).map((a) => AMENIDADES[a] ?? null).filter((a): a is string => !!a))],
    url_e24: texto(c.url_e24, 500)?.startsWith("https://") ? texto(c.url_e24, 500) : null,
    estado,
  };
}

export async function leerExportacion(url: string): Promise<CasaSitio[]> {
  const r = await fetch(url, { signal: AbortSignal.timeout(30_000), headers: { accept: "application/json" } });
  if (!r.ok) throw Object.assign(new Error("exportacion"), { operacion: "leer_exportacion", status: r.status });
  const json = (await r.json()) as { propiedades?: unknown };
  if (!Array.isArray(json.propiedades)) throw Object.assign(new Error("exportacion"), { operacion: "exportacion_sin_propiedades" });
  return json.propiedades as CasaSitio[];
}

const MAX_FOTO = 12 * 1024 * 1024;

/** Solo se copian fotos públicas del mismo servidor que la exportación (nada de pedir otras direcciones: SSRF). */
export function esFotoDelSitio(url: string, hostPermitido: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.host === hostPermitido && u.pathname.startsWith("/storage/v1/object/public/") && !u.pathname.includes("..");
  } catch {
    return false;
  }
}

/** Copia una foto del sitio al bucket del corredor. */
async function copiarFoto(db: SupabaseClient, corredorId: string, propiedadId: string, url: string, hostPermitido: string): Promise<string | null> {
  if (!esFotoDelSitio(url, hostPermitido)) return null;
  const r = await fetch(url, { signal: AbortSignal.timeout(30_000), redirect: "error" });
  const tipo = (r.headers.get("content-type") ?? "").split(";")[0];
  if (!r.ok || !/^image\/(jpeg|png|webp)$/.test(tipo)) return null;
  const datos = Buffer.from(await r.arrayBuffer());
  if (datos.length === 0 || datos.length > MAX_FOTO) return null;
  const ext = tipo === "image/png" ? "png" : tipo === "image/webp" ? "webp" : "jpg";
  const camino = `${corredorId}/${propiedadId}/originales/web-${createHash("sha256").update(url).digest("hex").slice(0, 16)}.${ext}`;
  const { error } = await db.storage.from("fotos").upload(camino, datos, { contentType: tipo, upsert: true });
  if (error) return null;
  return db.storage.from("fotos").getPublicUrl(camino).data.publicUrl;
}

export type ResultadoSincronizacion = {
  creadas: number;
  actualizadas: number;
  pausadas: number;
  ejemplosBorrados: number;
  fotosCopiadas: number;
  fotosPendientes: number;
  fallidos: number;
};

type Existente = { id: string; codigo: string; fotos: Foto[] | null; estado: string };

export async function sincronizarSitio(
  db: SupabaseClient,
  corredor: Pick<Corredor, "id">,
  casas: CasaSitio[],
  host: string,
  opciones: { maxFotos?: number; hasta?: number } = {},
): Promise<ResultadoSincronizacion> {
  const res: ResultadoSincronizacion = { creadas: 0, actualizadas: 0, pausadas: 0, ejemplosBorrados: 0, fotosCopiadas: 0, fotosPendientes: 0, fallidos: 0 };
  let presupuesto = opciones.maxFotos ?? 80;
  const hasta = opciones.hasta ?? Date.now() + 240_000;

  const { data } = await db.from("propiedades").select("id, codigo, fotos, estado").eq("corredor_id", corredor.id).limit(1000);
  const existentes = new Map(((data ?? []) as Existente[]).map((p) => [p.codigo.toUpperCase(), p]));

  // Las casas de ejemplo de la semilla: fuera (si algo las usa, se pausan).
  for (const [codigo, p] of existentes) {
    if (!codigo.startsWith("EJEMPLO-")) continue;
    const { error } = await db.from("propiedades").delete().eq("corredor_id", corredor.id).eq("id", p.id);
    if (error) await db.from("propiedades").update({ estado: "inactiva" }).eq("corredor_id", corredor.id).eq("id", p.id);
    res.ejemplosBorrados++;
    existentes.delete(codigo);
  }

  const enSitio = new Set<string>();
  for (const casa of casas) {
    const fila = filaDesdeSitio(casa);
    if (!fila) continue;
    const codigo = fila.codigo as string;
    if (enSitio.has(codigo)) continue;
    enSitio.add(codigo);
    try {
      let propiedad = existentes.get(codigo);
      if (propiedad) {
        const { error } = await db.from("propiedades").update(fila).eq("corredor_id", corredor.id).eq("id", propiedad.id);
        if (error) throw Object.assign(new Error("propiedad"), { operacion: "actualizar", code: error.code });
        res.actualizadas++;
      } else {
        const { data: nueva, error } = await db
          .from("propiedades")
          .insert({ ...fila, corredor_id: corredor.id, fotos: [] })
          .select("id, codigo, fotos, estado")
          .single();
        if (error || !nueva) throw Object.assign(new Error("propiedad"), { operacion: "crear", code: error?.code });
        propiedad = nueva as Existente;
        res.creadas++;
      }

      // Fotos: las del sitio en su orden; se copian las nuevas (con presupuesto) y se quitan las que allá ya no están.
      const imagenes = (casa.imagenes ?? []).filter((u) => typeof u === "string" && esFotoDelSitio(u, host)).slice(0, 30);
      const actuales = (propiedad.fotos ?? []) as Foto[];
      const porFuente = new Map(actuales.filter((f) => f.fuente).map((f) => [f.fuente!, f]));
      const propias = actuales.filter((f) => !f.fuente);
      const delSitio: Foto[] = [];
      for (const url of imagenes) {
        const ya = porFuente.get(url);
        if (ya) {
          delSitio.push(ya);
          continue;
        }
        if (presupuesto <= 0 || Date.now() > hasta) {
          res.fotosPendientes++;
          continue;
        }
        presupuesto--;
        const copia = await copiarFoto(db, corredor.id, propiedad.id, url, host).catch(() => null);
        if (copia) {
          delSitio.push({ url: copia, fuente: url });
          res.fotosCopiadas++;
        }
      }
      const fotos = ordenarFotos([...delSitio, ...propias].map((f, i) => ({ ...f, orden: i + 1 })));
      const cambiaron = JSON.stringify(fotos.map((f) => f.url)) !== JSON.stringify(ordenarFotos(actuales).map((f) => f.url));
      if (cambiaron) await db.from("propiedades").update({ fotos }).eq("corredor_id", corredor.id).eq("id", propiedad.id);
    } catch (e) {
      res.fallidos++;
      console.error(JSON.stringify({ evento: "error_importar_casa_sitio", corredorId: corredor.id, error: errorSeguro(e) }));
    }
  }

  // Las que vinieron del sitio y allá ya no están: pausadas (no se borran: pueden tener clientes y visitas).
  for (const [codigo, p] of existentes) {
    if (!CODIGO_SITIO.test(codigo) || enSitio.has(codigo) || p.estado !== "activa") continue;
    await db.from("propiedades").update({ estado: "inactiva" }).eq("corredor_id", corredor.id).eq("id", p.id);
    res.pausadas++;
  }
  return res;
}

/** El cron: cada corredor con exportación configurada. */
export async function sincronizarSitios(db: SupabaseClient): Promise<{ resultados: Record<string, ResultadoSincronizacion | { error: string }>; fallidos: number }> {
  const salida: Record<string, ResultadoSincronizacion | { error: string }> = {};
  let fallidos = 0;
  for (const [slug, url] of Object.entries(fuentesSitio())) {
    const { data: corredor } = await db.from("corredores").select("id").eq("slug", slug).maybeSingle();
    if (!corredor) continue;
    try {
      const casas = await leerExportacion(url);
      const r = await sincronizarSitio(db, corredor as { id: string }, casas, new URL(url).host);
      fallidos += r.fallidos;
      salida[slug] = r;
    } catch (e) {
      fallidos++;
      salida[slug] = { error: errorSeguro(e) };
    }
  }
  return { resultados: salida, fallidos };
}
