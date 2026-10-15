const formatos = new Map<string, Intl.DateTimeFormat>();

function formatear(fecha: Date, zona: string, clave: string, opciones: Intl.DateTimeFormatOptions): string {
  const id = `${clave}|${zona}`;
  let f = formatos.get(id);
  if (!f) {
    f = new Intl.DateTimeFormat("es-CR", { timeZone: zona, ...opciones });
    formatos.set(id, f);
  }
  return f.format(fecha).replace(/[\u00a0\u202f]/g, " ");
}

/** "10:00 a. m." */
export function horaCorta(fecha: Date, zona: string): string {
  return formatear(fecha, zona, "hora", { hour: "numeric", minute: "2-digit" });
}

/** "martes 20 de octubre" */
export function diaLargo(fecha: Date, zona: string): string {
  return formatear(fecha, zona, "dia", { weekday: "long", day: "numeric", month: "long" }).replace(/^(\p{L}+),/u, "$1");
}

/** "miércoles 21 de octubre, 10:00 a. m." en la zona del corredor. */
export function etiquetaHorario(fecha: Date, zona: string): string {
  // Intl usa espacios especiales (U+00A0, U+202F) en "a. m."; formatear() los normaliza para WhatsApp.
  return formatear(fecha, zona, "horario", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "numeric",
    minute: "2-digit",
  }).replace(/^(\p{L}+),/u, "$1");
}

/** Cierra una oración sin duplicar el punto de "a. m." / "p. m.". */
export function conPunto(texto: string): string {
  return texto.endsWith(".") ? texto : `${texto}.`;
}
