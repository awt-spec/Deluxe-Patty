import { minutosLocales } from "./tiempo";

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

/** Un bloqueo para leer: "jueves 24 de diciembre, todo el día", "… al sábado 26 de diciembre" o con horas. */
export function rangoBloqueo(b: { inicio: string; fin: string }, zona: string): string {
  const inicio = new Date(b.inicio);
  const fin = new Date(b.fin);
  if (minutosLocales(inicio, zona) === 0 && minutosLocales(fin, zona) === 0) {
    const primero = diaLargo(inicio, zona);
    const ultimo = diaLargo(new Date(fin.getTime() - 1), zona);
    return primero === ultimo ? `${primero}, todo el día` : `${primero} al ${ultimo}`;
  }
  if (diaLargo(inicio, zona) === diaLargo(fin, zona)) return `${diaLargo(inicio, zona)}, de ${horaCorta(inicio, zona)} a ${horaCorta(fin, zona)}`;
  return `del ${etiquetaHorario(inicio, zona)} al ${etiquetaHorario(fin, zona)}`;
}

/** Momento del día según la hora local: madrugada (0–6), mañana (6–12), tarde (12–18) o noche (18–24). */
export function momentoDelDia(fecha: Date, zona: string): "madrugada" | "mañana" | "tarde" | "noche" {
  const h = Math.floor(minutosLocales(fecha, zona) / 60);
  return h < 6 ? "madrugada" : h < 12 ? "mañana" : h < 18 ? "tarde" : "noche";
}

const NOMBRES_ZONA: Record<string, string> = { "America/Costa_Rica": "Costa Rica" };

/** "Ahora: martes 18 de noviembre de 2026, 5:34 a. m. (madrugada), hora de Costa Rica": armada por el código para el modelo. */
export function lineaAhora(fecha: Date, zona: string): string {
  const dia = formatear(fecha, zona, "ahora-dia", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).replace(/^(\p{L}+),/u, "$1");
  return `Ahora: ${dia}, ${horaCorta(fecha, zona)} (${momentoDelDia(fecha, zona)}), hora de ${NOMBRES_ZONA[zona] ?? zona}.`;
}
