import { aUtc, fechaLocal, minutosDe, sumarDias } from "./tiempo";
import { cerca, minutosEntre } from "./zonas";

export interface Franja {
  dia_semana: number;
  hora_inicio: string;
  hora_fin: string;
}

export interface Intervalo {
  inicio: Date;
  fin: Date;
  /** Zona de la propiedad de la cita, si se sabe (para calcular el traslado). */
  zona?: string | null;
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
  /** Zona de la propiedad que se va a visitar: con ella el margen entre visitas es el traslado real. */
  zonaVisita?: string | null;
  /** De dónde sale el corredor al empezar cada franja (por ejemplo, Lindora). */
  zonaBase?: string | null;
}

const MIN = 60_000;

function cruza(a: Intervalo, b: Intervalo): boolean {
  return a.inicio < b.fin && b.inicio < a.fin;
}

/** Horarios libres para una visita, en orden cronológico. */
export function horariosLibres(p: ParametrosAgenda): Intervalo[] {
  const paso = p.pasoMin ?? 60;
  const desde = new Date(p.ahora.getTime() + p.anticipacionHoras * 60 * MIN);
  // El margen entre visitas da tiempo de traslado antes y después de cada cita. Si se sabe a qué zona
  // va la nueva visita y dónde es la otra, el margen es el traslado estimado entre las dos zonas (nunca
  // menos que el margen del corredor); si no, el margen fijo.
  const traslado = (zona: string | null | undefined) =>
    Math.max(p.margenMin, (p.zonaVisita ? minutosEntre(zona, p.zonaVisita) : null) ?? p.margenMin);
  const ocupados: Intervalo[] = [
    ...p.bloqueos,
    ...p.citas.map((c) => ({
      inicio: new Date(c.inicio.getTime() - traslado(c.zona) * MIN),
      fin: new Date(c.fin.getTime() + traslado(c.zona) * MIN),
    })),
  ];
  // Al empezar la franja el corredor sale de su casa: si la visita es lejos, la primera hora posible se
  // corre lo que tarda en llegar (con 15 minutos de holgura: puede salir un poco antes).
  const salida = p.zonaVisita && p.zonaBase ? Math.max(0, (minutosEntre(p.zonaBase, p.zonaVisita) ?? 0) - 15) : 0;

  const hoy = fechaLocal(p.ahora, p.zona);
  const libres: Intervalo[] = [];
  for (let d = 0; d <= p.horizonteDias; d++) {
    const fecha = sumarDias(hoy, d);
    const franjas = p.horarios
      .filter((h) => h.dia_semana === fecha.diaSemana)
      .sort((a, b) => minutosDe(a.hora_inicio) - minutosDe(b.hora_inicio));
    for (const franja of franjas) {
      const fin = minutosDe(franja.hora_fin);
      const inicioFranja = minutosDe(franja.hora_inicio);
      for (let t = inicioFranja; t + p.duracionMin <= fin; t += paso) {
        const visita = { inicio: aUtc(fecha, t, p.zona), fin: aUtc(fecha, t + p.duracionMin, p.zona) };
        if (visita.inicio < desde) continue;
        // Una casa muy lejos (Guanacaste, Jacó) no deja la franja vacía: el viaje empieza antes de la franja y se
        // ofrece al menos la última hora de esa franja; el día igual queda tomado por el traslado de ida y vuelta.
        const espera = Math.min(salida, fin - inicioFranja - p.duracionMin);
        if (t < inicioFranja + espera && !visitaJustoAntes(p.citas, visita, p.zonaVisita)) continue;
        if (ocupados.some((o) => cruza(visita, o))) continue;
        if (libres.some((l) => l.inicio.getTime() === visita.inicio.getTime())) continue;
        libres.push(visita);
      }
    }
  }
  return libres.sort((a, b) => a.inicio.getTime() - b.inicio.getTime());
}

/** ¿Hay otra visita que termina poco antes en una zona cercana? Entonces no sale de su casa. */
function visitaJustoAntes(citas: Intervalo[], visita: Intervalo, zonaVisita: string | null | undefined): boolean {
  return citas.some((c) => c.fin <= visita.inicio && visita.inicio.getTime() - c.fin.getTime() <= 90 * MIN && cerca(c.zona, zonaVisita));
}

/**
 * Otra visita el mismo día en una zona cercana (a 20 minutos o menos), para juntar visitas y no
 * cruzar el Valle Central dos veces. Devuelve la zona de esa visita, o null.
 */
export function visitaCercana(libre: Intervalo, citas: Intervalo[], zonaVisita: string | null | undefined, zona: string): string | null {
  if (!zonaVisita) return null;
  const dia = fechaLocal(libre.inicio, zona);
  const mismoDia = citas.filter((c) => {
    const f = fechaLocal(c.inicio, zona);
    return f.dia === dia.dia && f.mes === dia.mes && f.anio === dia.anio;
  });
  // Pegada (a menos de 2 horas) primero; si no, cualquiera del día.
  const pegada = mismoDia.find(
    (c) => cerca(c.zona, zonaVisita) && Math.min(Math.abs(c.inicio.getTime() - libre.fin.getTime()), Math.abs(libre.inicio.getTime() - c.fin.getTime())) <= 120 * MIN,
  );
  return (pegada ?? mismoDia.find((c) => cerca(c.zona, zonaVisita)))?.zona ?? null;
}

/**
 * Dos opciones juntando visitas por zona: primero horarios del mismo día que otra visita cercana; si no
 * hay, las dos opciones de siempre.
 */
export function dosOpcionesPorZona(libres: Intervalo[], citas: Intervalo[], zonaVisita: string | null | undefined, zona: string): Intervalo[] {
  const juntas = libres.filter((l) => visitaCercana(l, citas, zonaVisita, zona));
  if (juntas.length === 0) return dosOpciones(libres, zona);
  const primera = juntas[0];
  const segunda = juntas.find((l) => l.inicio.getTime() - primera.inicio.getTime() >= 2 * 60 * MIN) ?? dosOpciones(libres.filter((l) => l !== primera), zona)[0];
  return segunda ? [primera, segunda] : [primera];
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
