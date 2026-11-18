import { createHmac, randomUUID } from "node:crypto";

// Subir fotos al sitio web del corredor desde el chat de Patty ("puerta segura"). El sitio (el de Deluxe está hecho en
// Lovable, con su propio Supabase) tiene una función `recibir-fotos` que acepta un POST firmado:
//   cuerpo JSON {codigo, fotos:[{url, orden}], portada_url?, ts, nonce}
//   cabecera x-firma = HMAC-SHA256(secreto, cuerpo tal cual), en hexadecimal
// y rechaza la firma mala, un `ts` de más de 5 minutos o un `nonce` repetido. Baja cada foto SOLO del Storage público
// del portal (host exacto), la guarda en su Storage, la suma a la galería de la casa en ese orden (pone la portada si
// viene) y contesta {ok, fotos:[{url}], url_casa}. Nunca borra fotos.
// Las fotos salen del bucket propio del corredor, de la carpeta `<corredor>/<casa>/al-sitio/`: el servidor nunca
// manda al sitio una dirección que no sea suya. Nada de esto va a los registros (solo cuentas y códigos de error).

/** Fotos por envío (como en el resto del panel). */
export const MAX_FOTOS_ENVIO = 12;
/** Tiempo que se le da al sitio para bajar y guardar las fotos. */
export const ESPERA_SITIO_MS = 90_000;
const SLUG_POR_DEFECTO = "deluxe-properties";
const CARPETA = "al-sitio";

type PorSlug = Record<string, string>;

/** `SITIO_FOTOS_URL` / `SITIO_FOTOS_SECRETO`: un valor (para Deluxe) o un JSON {"slug": valor} para varios corredores. */
function porSlug(valor: string | undefined): PorSlug {
  const v = (valor ?? "").trim();
  if (!v) return {};
  if (!v.startsWith("{")) return { [SLUG_POR_DEFECTO]: v };
  try {
    const crudo = JSON.parse(v) as Record<string, unknown>;
    return Object.fromEntries(Object.entries(crudo).filter(([k, x]) => /^[a-z0-9-]+$/.test(k) && typeof x === "string" && x.trim())) as PorSlug;
  } catch {
    return {};
  }
}

export type ConfigFotosSitio = { url: string; secreto: string };

/** La función del sitio y su secreto para este corredor, o null si no está conectado (o la dirección no es https). */
export function configFotosSitio(slug: string | null | undefined, env: Record<string, string | undefined> = process.env): ConfigFotosSitio | null {
  if (!slug) return null;
  const url = porSlug(env.SITIO_FOTOS_URL)[slug];
  const secreto = porSlug(env.SITIO_FOTOS_SECRETO)[slug];
  if (!url || !secreto || secreto.length < 16) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" || u.username || u.password) return null;
  } catch {
    return null;
  }
  return { url, secreto };
}

export function firmarCuerpo(secreto: string, cuerpo: string): string {
  return createHmac("sha256", secreto).update(cuerpo, "utf8").digest("hex");
}

// --- Rutas y direcciones del portal ------------------------------------------------------------------

/** Lote de un envío: hora y azar (sin datos de la casa ni del cliente). */
export const nuevoLote = (ahora = Date.now()) => `${ahora}-${Math.random().toString(36).slice(2, 8).padEnd(6, "0")}`;

/** Dónde sube el teléfono la foto número `n` de un lote (dentro del bucket `fotos`). */
export function caminoEnvio(corredorId: string, propiedadId: string, lote: string, n: number): string {
  return `${corredorId}/${propiedadId}/${CARPETA}/${lote}-${n}.jpg`;
}

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** ¿Es una foto de un envío al sitio de esta casa y este corredor? (`mejorada`: la versión con IA). */
export function esCaminoEnvio(camino: unknown, corredorId: string, propiedadId: string, mejorada = false): camino is string {
  if (typeof camino !== "string" || camino.length > 300 || !new RegExp(`^${UUID}$`).test(corredorId) || !new RegExp(`^${UUID}$`).test(propiedadId)) return false;
  const fin = mejorada ? "-mejorada\\.jpg" : "\\.jpg";
  return new RegExp(`^${escapar(corredorId)}/${escapar(propiedadId)}/${CARPETA}/[0-9]{10,16}-[a-z0-9]{6}-[0-9]{1,2}${fin}$`).test(camino);
}

/** La versión mejorada vive junto a la original, con el mismo nombre y "-mejorada". */
export const caminoMejorada = (camino: string) => camino.replace(/\.jpg$/, "-mejorada.jpg");

/** Dirección pública de un archivo del bucket `fotos` del portal. */
export function urlPublicaFoto(base: string, camino: string): string {
  return `${base.replace(/\/+$/, "")}/storage/v1/object/public/fotos/${camino}`;
}

/** Lo único que el portal le pasa al sitio: fotos de la carpeta de envío de esa casa, en el Storage público propio. */
export function esFotoParaSitio(url: string, base: string, corredorId: string, propiedadId: string): boolean {
  try {
    const u = new URL(url);
    const b = new URL(base);
    if (u.protocol !== "https:" || u.host !== b.host || u.username || u.password || u.search || u.hash) return false;
    const prefijo = "/storage/v1/object/public/fotos/";
    if (!u.pathname.startsWith(prefijo)) return false;
    const camino = u.pathname.slice(prefijo.length);
    return esCaminoEnvio(camino, corredorId, propiedadId) || esCaminoEnvio(camino, corredorId, propiedadId, true);
  } catch {
    return false;
  }
}

// --- El pedido -----------------------------------------------------------------------------------------

export type PedidoSitio = { cuerpo: string; firma: string; nonce: string };

/** Arma el cuerpo (en el orden pedido, sin repetidas) y su firma. La portada tiene que ser una de las fotos. */
export function armarPedido(
  i: { codigo: string; fotos: string[]; portada?: string | null; secreto: string },
  ahora = Date.now(),
  nonce: string = randomUUID(),
): PedidoSitio {
  const fotos = [...new Set(i.fotos)].slice(0, MAX_FOTOS_ENVIO);
  if (fotos.length === 0) throw new Error("sin_fotos");
  const portada = i.portada && fotos.includes(i.portada) ? i.portada : null;
  const datos: Record<string, unknown> = {
    codigo: i.codigo.toUpperCase(),
    fotos: fotos.map((url, n) => ({ url, orden: n + 1 })),
    ...(portada ? { portada_url: portada } : {}),
    ts: Math.floor(ahora / 1000),
    nonce,
  };
  const cuerpo = JSON.stringify(datos);
  return { cuerpo, firma: firmarCuerpo(i.secreto, cuerpo), nonce };
}

// --- La respuesta -----------------------------------------------------------------------------------------

export type RespuestaSitio = { fotos: string[]; urlCasa: string | null };

/**
 * Lo que contestó el sitio, ya revisado: fotos https de su Storage (los mismos hosts que acepta la importación) y el
 * enlace de la casa solo si es de la dirección pública del sitio. null si no tiene la forma esperada.
 */
export function leerRespuestaSitio(json: unknown, i: { hostsFotos: string[]; sitio: string | null }): RespuestaSitio | null {
  if (!json || typeof json !== "object") return null;
  const r = json as { ok?: unknown; fotos?: unknown; url_casa?: unknown };
  if (r.ok !== true || !Array.isArray(r.fotos)) return null;
  const fotos: string[] = [];
  for (const f of r.fotos.slice(0, MAX_FOTOS_ENVIO)) {
    const url = typeof f === "string" ? f : typeof (f as { url?: unknown })?.url === "string" ? (f as { url: string }).url : null;
    if (!url) continue;
    try {
      const u = new URL(url);
      if (u.protocol === "https:" && i.hostsFotos.includes(u.host) && !u.username && !u.password) fotos.push(u.toString());
    } catch {
      // se descarta
    }
  }
  let urlCasa: string | null = null;
  if (typeof r.url_casa === "string" && i.sitio) {
    try {
      const u = new URL(r.url_casa);
      if (u.protocol === "https:" && u.origin === new URL(i.sitio).origin) urlCasa = u.toString();
    } catch {
      urlCasa = null;
    }
  }
  return { fotos, urlCasa };
}

export type CausaSitio = "firma" | "casa" | "casa_fija" | "fotos" | "ocupado" | "pasajera" | "otra";

/** La causa de una respuesta que no fue ok, por su código HTTP y el `error` que manda la función. */
export function causaRespuesta(status: number, error: unknown): CausaSitio {
  const e = typeof error === "string" ? error : "";
  if (status === 401 || status === 403 || e === "firma" || e === "vencido" || e === "repetido") return "firma";
  if (e === "casa_fija" || status === 409) return "casa_fija";
  if (status === 404 || e === "casa_no_encontrada") return "casa";
  if (status === 413 || status === 422 || e.startsWith("foto")) return "fotos";
  if (status === 429) return "ocupado";
  if (status >= 500) return "pasajera";
  return "otra";
}

/** Lo que lee el corredor, con sus palabras. */
export function mensajeFallaSitio(causa: CausaSitio): string {
  switch (causa) {
    case "firma":
      return "El sitio no aceptó el envío: falta terminar de conectarlo. Avisa a soporte; ya les dejé el aviso.";
    case "casa":
      return "El sitio no encontró esa casa. Revisa que siga publicada allá.";
    case "casa_fija":
      return "Esa casa está fija en el código del sitio y no se le pueden sumar fotos desde aquí. Súbelas en el administrador del sitio.";
    case "fotos":
      return "El sitio no pudo usar alguna foto (muy pesada o de un tipo raro). Prueba con menos fotos o con otras.";
    case "ocupado":
      return "El sitio está recibiendo muchos envíos. Inténtalo de nuevo en un minuto.";
    case "pasajera":
      return "El sitio no respondió. Inténtalo de nuevo en un rato: no se subió nada.";
    default:
      return "No pude subir las fotos al sitio. Inténtalo de nuevo en un rato.";
  }
}

export type ResultadoEnvio = { ok: true; json: unknown } | { ok: false; causa: CausaSitio; status: number | null };

/** Manda el pedido firmado. Nunca lanza: red caída o tiempo agotado son "pasajera". */
export async function enviarAlSitio(url: string, pedido: PedidoSitio, f: typeof fetch = fetch): Promise<ResultadoEnvio> {
  try {
    const r = await f(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-firma": pedido.firma },
      body: pedido.cuerpo,
      redirect: "error",
      signal: AbortSignal.timeout(ESPERA_SITIO_MS),
    });
    const json = await r.json().catch(() => null);
    if (!r.ok) return { ok: false, causa: causaRespuesta(r.status, (json as { error?: unknown } | null)?.error), status: r.status };
    return { ok: true, json };
  } catch {
    return { ok: false, causa: "pasajera", status: null };
  }
}
