import { aUtc, fechaLocal, minutosDe, sumarDias } from "./tiempo";

export interface Franja {
  dia_semana: number;
  hora_inicio: string;
  hora_fin: string;
}

export interface Intervalo {
  inicio: Date;
  fin: Date;
}

export interface ParametrosAgenda {
  ahora: Date;
  zona: string;
  horarios: Franja[];
  bloqueos: Intervalo[];
  /** Citas activas (agendadas o confirmadas) del corredor. */
  citas: Intervalo[];
  duracionMin: number;
  margenMin: number;
  anticipacionHoras: number;
  horizonteDias: number;
  /** Cada cuántos minutos puede empezar una visita dentro de una franja. */
  pasoMin?: number;
}

const MIN = 60_000;

function cruza(a: Intervalo, b: Intervalo): boolean {
  return a.inicio < b.fin && b.inicio < a.fin;
}

/** Horarios libres para una visita, en orden cronológico. */
export function horariosLibres(p: ParametrosAgenda): Intervalo[] {
  const paso = p.pasoMin ?? 60;
  const desde = new Date(p.ahora.getTime() + p.anticipacionHoras * 60 * MIN);
  const ocupados: Intervalo[] = [
    ...p.bloqueos,
    // El margen entre visitas da tiempo de traslado antes y después de cada cita.
    ...p.citas.map((c) => ({
      inicio: new Date(c.inicio.getTime() - p.margenMin * MIN),
      fin: new Date(c.fin.getTime() + p.margenMin * MIN),
    })),
  ];

  const hoy = fechaLocal(p.ahora, p.zona);
  const libres: Intervalo[] = [];
  for (let d = 0; d <= p.horizonteDias; d++) {
    const fecha = sumarDias(hoy, d);
    const franjas = p.horarios
      .filter((h) => h.dia_semana === fecha.diaSemana)
      .sort((a, b) => minutosDe(a.hora_inicio) - minutosDe(b.hora_inicio));
    for (const franja of franjas) {
      const fin = minutosDe(franja.hora_fin);
      for (let t = minutosDe(franja.hora_inicio); t + p.duracionMin <= fin; t += paso) {
        const visita = { inicio: aUtc(fecha, t, p.zona), fin: aUtc(fecha, t + p.duracionMin, p.zona) };
        if (visita.inicio < desde) continue;
        if (ocupados.some((o) => cruza(visita, o))) continue;
        if (libres.some((l) => l.inicio.getTime() === visita.inicio.getTime())) continue;
        libres.push(visita);
      }
    }
  }
  return libres.sort((a, b) => a.inicio.getTime() - b.inicio.getTime());
}

/**
 * Dos opciones por defecto: la primera libre y otra en un día distinto (o, si no hay,
 * al menos 3 horas después), para que el cliente tenga una alternativa real.
 */
export function dosOpciones(libres: Intervalo[], zona: string): Intervalo[] {
  if (libres.length <= 1) return libres.slice();
  const primera = libres[0];
  const diaPrimera = fechaLocal(primera.inicio, zona);
  const otroDia = libres.find((l) => {
    const f = fechaLocal(l.inicio, zona);
    return f.dia !== diaPrimera.dia || f.mes !== diaPrimera.mes;
  });
  const masTarde = libres.find((l) => l.inicio.getTime() - primera.inicio.getTime() >= 3 * 60 * MIN);
  return [primera, otroDia ?? masTarde ?? libres[1]];
}
