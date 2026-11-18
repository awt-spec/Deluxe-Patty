// Archivos que el corredor le manda a un cliente desde el chat del panel (fotos y PDF). Reglas puras: las usan el
// navegador (qué se puede adjuntar) y el servidor (qué camino es de ese chat y cómo se guarda en el mensaje).
//
// Las fotos van al bucket `fotos` y los PDF al bucket `fichas` (los dos públicos: WhatsApp las baja por enlace), en
// `<corredor>/chats/<conversación>/…` con un nombre al azar. Los buckets solo aceptan imágenes y PDF, así que Word,
// Excel o video no se adjuntan aquí.

export const MAX_ADJUNTOS_CHAT = 5;
/** WhatsApp acepta documentos de hasta 100 MB, pero el bucket `fichas` corta en 20 MB: se deja margen. */
export const MAX_PDF_BYTES = 15 * 1024 * 1024;
/** Las fotos se achican en el teléfono a 2400 px (quedan muy por debajo de los 5 MB de WhatsApp). */
export const MAX_FOTO_ORIGINAL_BYTES = 40 * 1024 * 1024;

export type ClaseAdjunto = "imagen" | "pdf";
export const BUCKET_ADJUNTO: Record<ClaseAdjunto, "fotos" | "fichas"> = { imagen: "fotos", pdf: "fichas" };
export const ACEPTA_ADJUNTOS = "image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf";

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const ES_UUID = new RegExp(`^${UUID}$`);

/** Qué es el archivo elegido, o null si no se puede mandar desde aquí. */
export function claseDeArchivo(tipo: string, nombre: string): ClaseAdjunto | null {
  const t = (tipo || "").toLowerCase();
  const n = (nombre || "").toLowerCase();
  if (t === "application/pdf" || (!t && n.endsWith(".pdf"))) return "pdf";
  if (/^image\/(jpeg|png|webp|heic|heif)$/.test(t) || (!t && /\.(jpe?g|png|webp|heic|heif)$/.test(n))) return "imagen";
  return null;
}

/** Por qué no se puede adjuntar (o null si se puede). */
export function problemaDeArchivo(tipo: string, nombre: string, bytes: number): string | null {
  const clase = claseDeArchivo(tipo, nombre);
  if (!clase) return "Desde aquí se mandan fotos y PDF. Un Word o Excel guárdalo como PDF primero.";
  if (clase === "pdf" && bytes > MAX_PDF_BYTES) return "Ese PDF pesa más de 15 MB. Mándalo desde tu WhatsApp.";
  if (clase === "imagen" && bytes > MAX_FOTO_ORIGINAL_BYTES) return "Esa foto es demasiado pesada.";
  return null;
}

/** Nombre del PDF como lo verá el cliente: sin rutas ni caracteres raros, termina en .pdf. */
export function nombreSeguro(nombre: string): string {
  const base = (nombre || "")
    .split(/[\\/]/)
    .pop()!
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\.pdf$/i, "")
    .replace(/[^A-Za-z0-9 ._-]+/g, " ")
    .replace(/\.+/g, ".")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[.\- ]+|[.\- ]+$/g, "")
    .slice(0, 60)
    .trim();
  return `${base || "documento"}.pdf`;
}

/** Camino del archivo en su bucket. `id` es un UUID nuevo por archivo. */
export function caminoAdjunto(corredorId: string, conversacionId: string, clase: ClaseAdjunto, id: string, nombre = ""): string {
  const carpeta = `${corredorId}/chats/${conversacionId}`;
  return clase === "imagen" ? `${carpeta}/${id}.jpg` : `${carpeta}/${id}/${nombreSeguro(nombre).replace(/ /g, "-")}`;
}

/** Si el camino es un adjunto de ESE chat de ESE corredor, qué es (nunca acepta caminos de otro chat o con `..`). */
export function leerCaminoAdjunto(
  camino: unknown,
  corredorId: string,
  conversacionId: string,
): { clase: ClaseAdjunto; nombre: string } | null {
  if (typeof camino !== "string" || camino.length > 300 || camino.includes("..")) return null;
  if (!ES_UUID.test(corredorId) || !ES_UUID.test(conversacionId)) return null;
  const carpeta = `${corredorId}/chats/${conversacionId}/`;
  if (!camino.startsWith(carpeta)) return null;
  const resto = camino.slice(carpeta.length);
  if (new RegExp(`^${UUID}\\.jpg$`).test(resto)) return { clase: "imagen", nombre: "foto.jpg" };
  const pdf = new RegExp(`^${UUID}/([A-Za-z0-9._-]{1,64}\\.pdf)$`).exec(resto);
  if (pdf) return { clase: "pdf", nombre: pdf[1].replace(/-/g, " ") };
  return null;
}

/** Dirección pública del archivo en el Storage propio. */
export function urlAdjunto(base: string, clase: ClaseAdjunto, camino: string): string {
  return `${base.replace(/\/+$/, "")}/storage/v1/object/public/${BUCKET_ADJUNTO[clase]}/${camino}`;
}

/** Cómo queda en `mensajes.contenido`: la dirección en la primera línea y, si hubo, el texto que la acompañó. */
export const contenidoAdjunto = (url: string, leyenda: string | null): string => (leyenda ? `${url}\n${leyenda}` : url);

/** Para mostrar un archivo enviado: dirección (solo https), leyenda y nombre del PDF. */
export function leerContenidoAdjunto(contenido: string | null): { url: string; leyenda: string | null; nombre: string } | null {
  if (!contenido) return null;
  const [primera, ...resto] = contenido.split("\n");
  let u: URL;
  try {
    u = new URL(primera.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:") return null;
  const ultimo = decodeURIComponent(u.pathname.split("/").pop() ?? "");
  const nombre = /\.pdf$/i.test(ultimo) ? ultimo.replace(/-/g, " ") : "Documento.pdf";
  const leyenda = resto.join("\n").trim() || null;
  return { url: u.toString(), leyenda, nombre };
}

/** "Nota de voz: …" que guarda la asistente al pasar un audio a texto. */
export function leerNotaDeVoz(contenido: string | null): string | null {
  const m = /^Nota de voz:\s*([\s\S]*)$/.exec(contenido ?? "");
  return m ? m[1].trim() : null;
}

/** Foto o PDF de un cliente: su pie (texto suyo) y lo que la asistente vio en el archivo, por separado. */
export function leerMedioCliente(contenido: string | null): { pie: string | null; visto: string | null } {
  const texto = (contenido ?? "").trim();
  const m = /\[El cliente mandó [^\]]*?Lo que se ve: ([\s\S]*)\]$/.exec(texto);
  const pie = (m ? texto.slice(0, m.index) : texto).trim() || null;
  return { pie, visto: m ? m[1].trim() || null : null };
}
