// Reglas puras de los asistentes paso a paso del panel (app/panel/pasos/asistente-pasos.tsx): qué paso se ve,
// cuál sigue, cuál va antes y dónde se recuerda en el navegador. Sin React ni navegador, para poder probarlas.
//
// Una guía es una lista de pasos cuyo último es la pantalla final ("listo"). Cada paso puede estar "cumplido"
// según datos reales (hay casas, el anuncio ya está activo…): mientras la persona no haya vuelto atrás a
// propósito, la guía salta los pasos cumplidos y muestra el primero que falta.

/** Lo que la persona eligió: el paso que tocó y si fue hacia atrás (eso apaga el avance automático). */
export interface Eleccion<P extends string> {
  elegido: P | null;
  volvioAtras: boolean;
}

export const indiceDe = <P extends string>(pasos: readonly P[], p: P) => Math.max(0, pasos.indexOf(p));

export const finalDe = <P extends string>(pasos: readonly P[]): P => pasos[pasos.length - 1];

export function siguientePaso<P extends string>(pasos: readonly P[], p: P): P {
  return pasos[Math.min(indiceDe(pasos, p) + 1, pasos.length - 1)];
}

export function anteriorPaso<P extends string>(pasos: readonly P[], p: P): P {
  return pasos[Math.max(indiceDe(pasos, p) - 1, 0)];
}

/** El primer paso que falta desde `desde` (incluido); si no falta ninguno, la pantalla final. */
export function primerNoCumplido<P extends string>(pasos: readonly P[], cumplido: (p: P) => boolean, desde: P | null = null): P {
  const inicio = desde ? indiceDe(pasos, desde) : 0;
  for (let i = inicio; i < pasos.length - 1; i++) if (!cumplido(pasos[i])) return pasos[i];
  return finalDe(pasos);
}

/**
 * El paso que se muestra. Si la persona volvió atrás (o empezó de nuevo), se respeta su paso aunque esté cumplido;
 * si no, desde el paso elegido (o el guardado, o el primero) se salta lo que ya está hecho.
 */
export function pasoVisible<P extends string>(pasos: readonly P[], e: Eleccion<P>, cumplido: (p: P) => boolean): P {
  if (e.volvioAtras && e.elegido) return e.elegido;
  return primerNoCumplido(pasos, cumplido, e.elegido);
}

/** Lo que pasa al tocar "Siguiente": se avanza y vuelve el avance automático. */
export function alSiguiente<P extends string>(pasos: readonly P[], actual: P): Eleccion<P> {
  return { elegido: siguientePaso(pasos, actual), volvioAtras: false };
}

/** Lo que pasa al tocar "Atrás": se va al anterior y se queda ahí aunque esté hecho. */
export function alAtras<P extends string>(pasos: readonly P[], actual: P): Eleccion<P> {
  return { elegido: anteriorPaso(pasos, actual), volvioAtras: true };
}

/** Tocar un paso del progreso: hacia atrás se respeta; hacia adelante vuelve el avance automático. */
export function alElegir<P extends string>(pasos: readonly P[], actual: P, p: P): Eleccion<P> {
  return { elegido: p, volvioAtras: indiceDe(pasos, p) <= indiceDe(pasos, actual) };
}

/** "Empezar de nuevo": el primer paso, aunque esté hecho. */
export function alEmpezarDeNuevo<P extends string>(pasos: readonly P[]): Eleccion<P> {
  return { elegido: pasos[0], volvioAtras: true };
}

/** "Paso 2 de 5" (la pantalla final no cuenta). */
export function numeroDePaso<P extends string>(pasos: readonly P[], p: P): { numero: number; total: number } {
  const total = Math.max(1, pasos.length - 1);
  return { numero: Math.min(indiceDe(pasos, p) + 1, total), total };
}

// --- Dónde se recuerda -------------------------------------------------------------------------------

const SEGURO = /[^a-z0-9-]/g;

/** Clave de localStorage de una guía: "pasos:<guia>" o "pasos:<guia>:<id>" (un anuncio, una casa). */
export function clavePasos(guia: string, id?: string | null): string {
  const g = guia.toLowerCase().replace(SEGURO, "").slice(0, 40) || "guia";
  const i = (id ?? "").toLowerCase().replace(SEGURO, "").slice(0, 60);
  return i ? `pasos:${g}:${i}` : `pasos:${g}`;
}

/**
 * Lo guardado solo vale si es uno de los pasos de esta guía (un valor viejo o ajeno se ignora). Con `cumplido`, la
 * pantalla final guardada tampoco vale si los datos dicen que algo dejó de estar hecho (se apagó, se desconectó).
 */
export function pasoGuardado<P extends string>(pasos: readonly P[], valor: string | null | undefined, cumplido?: (p: P) => boolean): P | null {
  const p = pasos.find((x) => x === valor) ?? null;
  if (p && cumplido && p === finalDe(pasos) && pasos.slice(0, -1).some((x) => !cumplido(x))) return null;
  return p;
}

// --- "Más tarde" --------------------------------------------------------------------------------------

const DIA = 24 * 60 * 60_000;

/** ¿Sigue oculta una tarjeta que se cerró con "Más tarde"? `hasta` es la marca guardada (ms). */
export function sigueOculta(hasta: string | null | undefined, ahora: number): boolean {
  const n = Number(hasta);
  return Number.isFinite(n) && n > ahora;
}

/** Hasta cuándo se oculta al tocar "Más tarde" (3 días). */
export const ocultarHasta = (ahora: number, dias = 3) => String(ahora + dias * DIA);
