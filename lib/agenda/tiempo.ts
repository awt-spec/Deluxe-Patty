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
