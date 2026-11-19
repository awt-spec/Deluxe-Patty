// Cada anuncio lleva un enlace de WhatsApp con su referencia; el primer mensaje del cliente la trae
// y así el contacto queda atribuido al anuncio.

/** Enlace wa.me con un mensaje inicial prellenado. */
export function enlaceWhatsAppConTexto(numero: string, texto: string): string {
  return `https://wa.me/${numero.replace(/\D/g, "")}?text=${encodeURIComponent(texto)}`;
}

/** Enlace wa.me al número de la asistente con la referencia del anuncio. */
export function enlaceWhatsApp(numeroAsistente: string, referencia: string): string {
  return enlaceWhatsAppConTexto(numeroAsistente, `Hola, me interesa la propiedad del anuncio ref. ${referencia}`);
}

/** La invitación que va antes del enlace al final de la descripción, en cada idioma del anuncio. */
export const INVITACION_WHATSAPP = { es: "Escríbeme por WhatsApp", en: "Message me on WhatsApp" } as const;

/**
 * La descripción tal como se publica: termina con el enlace de WhatsApp con la referencia (sin enlace, queda igual).
 * La usan el anuncio que manda la asistente, la guía de publicar y "Llenar con Patty" de la extensión.
 */
export function descripcionConEnlace(descripcion: string, enlace: string | null, idioma: keyof typeof INVITACION_WHATSAPP = "es"): string {
  return enlace ? `${descripcion}\n\n${INVITACION_WHATSAPP[idioma]}: ${enlace}` : descripcion;
}

/**
 * Referencia en un mensaje ("ref. A1B2C3", "Ref: A1B2C3", "ref A1B2C3"). Exige un separador después
 * de "ref" para no leer "me refiero" como "ref. IERO". Solo cuenta si existe un anuncio con esa
 * referencia (lo verifica atribuirContacto).
 */
export function extraerReferencia(texto: string): string | null {
  const m = /\bref(?:\.|:|#|\s)\s*[:#]?\s*([A-Z0-9]{4,10})\b/i.exec(texto);
  return m ? m[1].toUpperCase() : null;
}
