// Ritmo de persona para la búsqueda de dueños: cuánto se "lee" cada página, cómo se baja por ella, cuánto se espera
// entre páginas y cuándo se descansa. Reglas puras (sin chrome.*) con azar de semilla inyectable: las prueba
// tests/ritmo-extension.test.ts y las usa background.js.
//
// No es para engañar a nadie: es el ritmo al que una persona revisaría los listados, con pocas páginas por día, una
// sola pestaña y a la vista. La identidad del navegador no se toca.

export const RITMO = Object.freeze({
  /** Lectura de una página: 6 s más 0,7 s por anuncio, entre 8 y 25 s (±15 % de azar). */
  lecturaBaseMs: 6_000,
  lecturaPorAnuncioMs: 700,
  lecturaMinMs: 8_000,
  lecturaMaxMs: 25_000,
  /** La bajada por la página va en tramos (uno cada ~4 anuncios, de 3 a 8). */
  tramosMin: 3,
  tramosMax: 8,
  /** Pausa entre una página y la siguiente. */
  pausaEntreMinMs: 6_000,
  pausaEntreMaxMs: 20_000,
  /** Descanso largo cada 4 a 6 páginas. */
  descansoCadaMin: 4,
  descansoCadaMax: 6,
  descansoMinMs: 45_000,
  descansoMaxMs: 120_000,
  /** Topes: por búsqueda y por día (en este Chrome). El servidor además corta a 8 páginas por zona. */
  maxPaginasSesion: 12,
  maxPaginasDia: 24,
  /** Para estimar el tiempo que falta. */
  cargaEstimadaMs: 4_000,
  anunciosTipicos: 20,
});

/** Azar repetible (mulberry32): con la misma semilla, la misma secuencia. */
export function azar(semilla) {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Entero al azar entre min y max (ambos incluidos). */
export function entre(rng, min, max) {
  return Math.min(max, Math.floor(min + rng() * (max - min + 1)));
}

const limitar = (v, min, max) => Math.max(min, Math.min(max, v));

/** Cuánto tarda en leer una página con `anuncios` anuncios, sin azar (para estimar). */
export function lecturaEsperada(anuncios) {
  const n = limitar(Math.round(Number(anuncios) || 0), 0, 60);
  return limitar(RITMO.lecturaBaseMs + n * RITMO.lecturaPorAnuncioMs, RITMO.lecturaMinMs, RITMO.lecturaMaxMs);
}

/**
 * Plan de lectura de una página: el tiempo total y los tramos en que se baja por ella. Cada tramo dice hasta dónde
 * se baja (fracción de la página, de 0 a 1, siempre hacia abajo) y cuánto se queda mirando ahí.
 */
export function planLectura(anuncios, rng) {
  const base = lecturaEsperada(anuncios);
  const ms = Math.round(limitar(base * (0.85 + rng() * 0.3), RITMO.lecturaMinMs, RITMO.lecturaMaxMs));
  const n = limitar(Math.ceil((Number(anuncios) || 0) / 4), RITMO.tramosMin, RITMO.tramosMax);
  const pesos = Array.from({ length: n }, () => 0.6 + rng() * 0.8);
  const suma = pesos.reduce((a, b) => a + b, 0);
  let usado = 0;
  const tramos = pesos.map((p, i) => {
    const t = i === n - 1 ? ms - usado : Math.round((ms * p) / suma);
    usado += t;
    // Al principio se mira lo de arriba; el último tramo llega al fondo (donde está "Siguiente").
    const hasta = i === n - 1 ? 1 : Math.min(0.97, Number(((i + rng() * 0.4) / (n - 1)).toFixed(3)));
    return { hasta: Math.max(0, hasta), ms: t };
  });
  // Nunca vuelve hacia arriba.
  for (let i = 1; i < tramos.length; i++) tramos[i].hasta = Math.max(tramos[i].hasta, tramos[i - 1].hasta);
  return { ms, tramos };
}

/** Estado del ritmo entre páginas: cuántas faltan para el siguiente descanso. */
export function ritmoInicial(rng) {
  return { paraDescanso: entre(rng, RITMO.descansoCadaMin, RITMO.descansoCadaMax) };
}

/**
 * La espera después de leer una página: una pausa corta, o un descanso largo cuando se cumplen 4 a 6 páginas.
 * Devuelve la espera y el estado nuevo (no cambia el que recibe).
 */
export function siguientePausa(estado, rng) {
  const falta = estado.paraDescanso - 1;
  if (falta <= 0) {
    return {
      tipo: "descanso",
      ms: entre(rng, RITMO.descansoMinMs, RITMO.descansoMaxMs),
      estado: { paraDescanso: entre(rng, RITMO.descansoCadaMin, RITMO.descansoCadaMax) },
    };
  }
  return { tipo: "pausa", ms: entre(rng, RITMO.pausaEntreMinMs, RITMO.pausaEntreMaxMs), estado: { paraDescanso: falta } };
}

/** "2026-11-13" en la hora del aparato: el tope diario cuenta por día local. */
export function hoyLocal(fecha = new Date()) {
  const d = new Date(fecha);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Páginas que quedan hoy según lo guardado ({fecha, paginas}); otro día empieza en cero. */
export function quedanHoy(registro, hoy) {
  const usadas = registro && registro.fecha === hoy && Number.isFinite(registro.paginas) ? registro.paginas : 0;
  return Math.max(0, RITMO.maxPaginasDia - usadas);
}

/** Suma una página al registro del día (otro día empieza en cero). */
export function anotarPaginaDelDia(registro, hoy) {
  const usadas = registro && registro.fecha === hoy && Number.isFinite(registro.paginas) ? registro.paginas : 0;
  return { fecha: hoy, paginas: usadas + 1 };
}

/**
 * Cuántas páginas leerá como mucho esta búsqueda: el tope por búsqueda, lo que queda del día y lo que da el servidor
 * (hasta 8 páginas por zona). Es lo que se muestra como "Página 3 de 12".
 */
export function totalEstimado(zonas, restantesHoy, porZona = 8) {
  const z = Math.max(1, Math.round(Number(zonas) || 1));
  return Math.max(0, Math.min(RITMO.maxPaginasSesion, restantesHoy, z * porZona));
}

/** Lo que tarda, en promedio, cada página que falta: carga, lectura, pausa y la parte del descanso. */
export function msPorPagina() {
  const pausa = (RITMO.pausaEntreMinMs + RITMO.pausaEntreMaxMs) / 2;
  const descanso = (RITMO.descansoMinMs + RITMO.descansoMaxMs) / 2;
  const cada = (RITMO.descansoCadaMin + RITMO.descansoCadaMax) / 2;
  return RITMO.cargaEstimadaMs + lecturaEsperada(RITMO.anunciosTipicos) + pausa + descanso / cada;
}

/** Tiempo que falta: las páginas por leer más lo que queda de la espera en curso. */
export function estimarRestanteMs(paginasPorLeer, esperaEnCursoMs = 0) {
  return Math.max(0, Math.round(Math.max(0, paginasPorLeer) * msPorPagina() + Math.max(0, esperaEnCursoMs)));
}

/** "quedan ~6 min", "queda menos de 1 min". */
export function textoRestante(ms) {
  const min = Math.round(ms / 60_000);
  if (min < 1) return "queda menos de 1 min";
  return `quedan ~${min} min`;
}

/** "unos 10 minutos" para avisar antes de empezar. */
export function textoDuracion(paginas) {
  const min = Math.max(1, Math.round(estimarRestanteMs(paginas) / 60_000));
  return min === 1 ? "un minuto" : `unos ${min} minutos`;
}
