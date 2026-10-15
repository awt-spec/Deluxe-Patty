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
  return f.format(fecha).replace(/^(\p{L}+),/u, "$1");
}
