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

/**
 * Referencia en un mensaje ("ref. A1B2C3", "Ref: A1B2C3", "ref A1B2C3"). Exige un separador después
 * de "ref" para no leer "me refiero" como "ref. IERO". Solo cuenta si existe un anuncio con esa
 * referencia (lo verifica atribuirContacto).
 */
export function extraerReferencia(texto: string): string | null {
  const m = /\bref(?:\.|:|#|\s)\s*[:#]?\s*([A-Z0-9]{4,10})\b/i.exec(texto);
  return m ? m[1].toUpperCase() : null;
}
