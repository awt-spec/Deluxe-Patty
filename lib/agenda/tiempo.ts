// Conversión entre hora local de una zona horaria y UTC, sin dependencias.

export interface FechaLocal {
  anio: number;
  mes: number; // 1–12
  dia: number;
  diaSemana: number; // 0 = domingo
}

const formatos = new Map<string, Intl.DateTimeFormat>();
function formato(zona: string): Intl.DateTimeFormat {
  let f = formatos.get(zona);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: zona,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    });
    formatos.set(zona, f);
  }
  return f;
}

function partes(fecha: Date, zona: string) {
  const p: Record<string, number> = {};
  for (const { type, value } of formato(zona).formatToParts(fecha)) {
    if (type !== "literal") p[type] = Number(value);
  }
  return p;
}

/** Diferencia en ms entre la hora local de la zona y UTC en ese instante. */
function desfase(fecha: Date, zona: string): number {
  const p = partes(fecha, zona);
  const comoUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return comoUtc - Math.floor(fecha.getTime() / 1000) * 1000;
}

export function fechaLocal(fecha: Date, zona: string): FechaLocal {
  const p = partes(fecha, zona);
  return {
    anio: p.year,
    mes: p.month,
    dia: p.day,
    diaSemana: new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay(),
  };
}

/** Suma días a una fecha local (calendario, sin horas). */
export function sumarDias(f: FechaLocal, dias: number): FechaLocal {
  const d = new Date(Date.UTC(f.anio, f.mes - 1, f.dia + dias));
  return { anio: d.getUTCFullYear(), mes: d.getUTCMonth() + 1, dia: d.getUTCDate(), diaSemana: d.getUTCDay() };
}

/** Instante UTC de una hora local (minutos desde medianoche) en una fecha local de la zona. */
export function aUtc(f: FechaLocal, minutos: number, zona: string): Date {
  const ingenuo = Date.UTC(f.anio, f.mes - 1, f.dia, 0, minutos);
  let instante = ingenuo - desfase(new Date(ingenuo), zona);
  // Segunda pasada por si el desfase cambia en ese día (horario de verano).
  instante = ingenuo - desfase(new Date(instante), zona);
  return new Date(instante);
}

/** "08:30" o "08:30:00" → minutos desde medianoche. */
export function minutosDe(hora: string): number {
  const [h, m] = hora.split(":").map(Number);
  return h * 60 + m;
}

/** Minutos desde la medianoche local en la zona. */
export function minutosLocales(fecha: Date, zona: string): number {
  const p = partes(fecha, zona);
  return p.hour * 60 + p.minute;
}

/** "2026-10-20" en la zona. */
export function fechaIso(f: FechaLocal): string {
  return `${f.anio}-${String(f.mes).padStart(2, "0")}-${String(f.dia).padStart(2, "0")}`;
}

/** Inicio y fin (UTC) del día local que contiene `fecha`, desplazado `dias`. */
export function limitesDia(fecha: Date, zona: string, dias = 0): { desde: Date; hasta: Date } {
  const dia = sumarDias(fechaLocal(fecha, zona), dias);
  return { desde: aUtc(dia, 0, zona), hasta: aUtc(sumarDias(dia, 1), 0, zona) };
}

/**
 * "2026-10-20" → fecha local, solo si existe en el calendario (ida y vuelta): "2026-02-31", "2026-13-01" o
 * "9999-99-99" → null, en vez de correrse al mes siguiente sin avisar.
 */
export function fechaDeIso(valor: string): FechaLocal | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor ?? "");
  if (!m) return null;
  const [anio, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(anio, mes - 1, dia));
  if (anio < 2000 || d.getUTCFullYear() !== anio || d.getUTCMonth() + 1 !== mes || d.getUTCDate() !== dia) return null;
  return { anio, mes, dia, diaSemana: d.getUTCDay() };
}

/** "HH:MM" de 00:00 a 23:59 ("25:00" o "9:5" no). */
export const esHora = (hora: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(hora ?? "");

/** Instante UTC de un día ("2026-10-20") y una hora ("09:30") locales de la zona; null si alguno no existe. */
export function instanteLocal(fecha: string, hora: string, zona: string): Date | null {
  const f = fechaDeIso(fecha);
  if (!f || !esHora(hora)) return null;
  return aUtc(f, minutosDe(hora), zona);
}
