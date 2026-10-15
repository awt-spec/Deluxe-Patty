const formatos = new Map<string, Intl.DateTimeFormat>();

/** "miércoles 21 de octubre, 10:00 a. m." en la zona del corredor. */
export function etiquetaHorario(fecha: Date, zona: string): string {
  let f = formatos.get(zona);
  if (!f) {
    f = new Intl.DateTimeFormat("es-CR", {
      timeZone: zona,
      weekday: "long",
      day: "numeric",
      month: "long",
      hour: "numeric",
      minute: "2-digit",
    });
    formatos.set(zona, f);
  }
  // Intl usa espacios especiales (U+00A0, U+202F) en "a. m."; se normalizan para WhatsApp y plantillas.
  return f
    .format(fecha)
    .replace(/[\u00a0\u202f]/g, " ")
    .replace(/^(\p{L}+),/u, "$1");
}

/** Cierra una oración sin duplicar el punto de "a. m." / "p. m.". */
export function conPunto(texto: string): string {
  return texto.endsWith(".") ? texto : `${texto}.`;
}
