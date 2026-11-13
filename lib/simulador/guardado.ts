// Lo que "Probar la asistente" recuerda en el navegador (localStorage, una clave por corredor, 24 h).
// Lógica pura: el componente solo lee y escribe el texto. Todo lo leído se valida y, si no cuadra, se descarta.

import { MAX_MENSAJES_SIMULACION, type EstadoSimulacion } from "./estado";
import { MOTIVOS, NADA, type CalificacionRespuesta, type PlanGuardado } from "./calificar";

export const MAX_LINEAS_GUARDADAS = 60;
export const VIGENCIA_MS = 24 * 60 * 60 * 1000;

export const claveProbar = (corredorId: string) => `probar:${corredorId}:v1`;

export type Linea =
  | { tipo: "cliente"; texto: string }
  /** id: para calificarla; pregunta: lo que escribió el cliente en ese turno. */
  | { tipo: "asistente"; texto: string; id: string; pregunta: string }
  | { tipo: "aviso"; texto: string }
  | { tipo: "nota"; texto: string };

/** Lo que se recuerda de cada respuesta calificada (además de la calificación). */
export type CalificacionEnPrueba = CalificacionRespuesta & { plan?: PlanGuardado; frase?: string };
export type Calificaciones = Record<string, CalificacionEnPrueba | undefined>;

export interface PruebaGuardada {
  estado: EstadoSimulacion;
  lineas: Linea[];
  calificaciones: Calificaciones;
  nota: number | null;
}

const esObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
const esTexto = (x: unknown): x is string => typeof x === "string";

function estadoValido(x: unknown): EstadoSimulacion | null {
  if (!esObj(x) || !Array.isArray(x.mensajes) || !Array.isArray(x.citas) || typeof x.escalada !== "boolean") return null;
  const mensajes: EstadoSimulacion["mensajes"] = [];
  for (const m of x.mensajes) {
    if (!esObj(m) || (m.direccion !== "entrante" && m.direccion !== "saliente") || !esTexto(m.autor) || !esTexto(m.contenido)) return null;
    mensajes.push({ direccion: m.direccion, autor: m.autor as EstadoSimulacion["mensajes"][number]["autor"], contenido: m.contenido });
  }
  const citas: EstadoSimulacion["citas"] = [];
  for (const c of x.citas) {
    if (!esObj(c) || !esTexto(c.id) || !esTexto(c.inicio) || !esTexto(c.fin) || !esTexto(c.estado)) return null;
    if (c.propiedad_id !== null && !esTexto(c.propiedad_id)) return null;
    citas.push({ id: c.id, inicio: c.inicio, fin: c.fin, estado: c.estado as EstadoSimulacion["citas"][number]["estado"], propiedad_id: c.propiedad_id });
  }
  return { mensajes: mensajes.slice(-MAX_MENSAJES_SIMULACION), citas, escalada: x.escalada };
}

function lineaValida(x: unknown): Linea | null {
  if (!esObj(x) || !esTexto(x.texto)) return null;
  if (x.tipo === "cliente" || x.tipo === "aviso" || x.tipo === "nota") return { tipo: x.tipo, texto: x.texto };
  if (x.tipo === "asistente" && esTexto(x.id) && esTexto(x.pregunta)) return { tipo: "asistente", texto: x.texto, id: x.id, pregunta: x.pregunta };
  return null;
}

function planValido(x: unknown): PlanGuardado | null {
  if (!esObj(x) || typeof x.irAAjustes !== "boolean") return null;
  const c = x.correccion;
  const k = x.conocimiento;
  if (c !== null && !(esObj(c) && esTexto(c.original) && esTexto(c.corregido))) return null;
  if (k !== null && !(esObj(k) && esTexto(k.tema) && esTexto(k.respuesta))) return null;
  if (x.duda !== null && !esTexto(x.duda)) return null;
  return {
    correccion: c === null ? null : { original: (c as Record<string, string>).original, corregido: (c as Record<string, string>).corregido },
    conocimiento: k === null ? null : { tema: (k as Record<string, string>).tema, respuesta: (k as Record<string, string>).respuesta },
    duda: x.duda as string | null,
    irAAjustes: x.irAAjustes,
  };
}

function calificacionValida(x: unknown): CalificacionEnPrueba | null {
  if (!esObj(x) || (x.valor !== "bien" && x.valor !== "mal")) return null;
  const r: CalificacionEnPrueba = { valor: x.valor };
  if (x.motivo !== undefined) {
    const m = MOTIVOS.find((o) => o.id === x.motivo);
    if (!m) return null;
    r.motivo = m.id;
  }
  if (x.ensenadas !== undefined) {
    if (typeof x.ensenadas !== "number" || !Number.isFinite(x.ensenadas) || x.ensenadas < 0) return null;
    r.ensenadas = x.ensenadas;
  }
  if (x.plan !== undefined) {
    const p = planValido(x.plan);
    if (!p) return null;
    r.plan = p;
  }
  if (x.frase !== undefined) {
    if (!esTexto(x.frase)) return null;
    r.frase = x.frase;
  }
  return r;
}

/** Recorta a las últimas líneas y deja solo las calificaciones de respuestas que siguen a la vista. */
export function recortarPrueba(p: PruebaGuardada): PruebaGuardada {
  const lineas = p.lineas.slice(-MAX_LINEAS_GUARDADAS);
  const ids = new Set(lineas.flatMap((l) => (l.tipo === "asistente" ? [l.id] : [])));
  const calificaciones: Calificaciones = {};
  for (const [id, c] of Object.entries(p.calificaciones)) if (c && ids.has(id)) calificaciones[id] = c;
  return { ...p, lineas, calificaciones };
}

export function serializarPrueba(p: PruebaGuardada, ahora: number): string {
  const r = recortarPrueba(p);
  return JSON.stringify({ v: 1, en: ahora, estado: r.estado, lineas: r.lineas, calificaciones: r.calificaciones, nota: r.nota });
}

const mismoDia = (a: number, b: number) => new Date(a).toDateString() === new Date(b).toDateString();

/** Lo guardado, o null si no cuadra, es de otro día o tiene más de 24 h. */
export function leerPrueba(texto: string | null | undefined, ahora: number): PruebaGuardada | null {
  if (!texto) return null;
  let x: unknown;
  try {
    x = JSON.parse(texto);
  } catch {
    return null;
  }
  if (!esObj(x) || x.v !== 1 || typeof x.en !== "number" || !Number.isFinite(x.en)) return null;
  if (x.en > ahora + 60_000 || ahora - x.en > VIGENCIA_MS || !mismoDia(x.en, ahora)) return null;
  const estado = estadoValido(x.estado);
  if (!estado || !Array.isArray(x.lineas) || !esObj(x.calificaciones)) return null;
  const lineas: Linea[] = [];
  for (const l of x.lineas) {
    const v = lineaValida(l);
    if (!v) return null;
    lineas.push(v);
  }
  const calificaciones: Calificaciones = {};
  for (const [id, c] of Object.entries(x.calificaciones)) {
    const v = calificacionValida(c);
    if (!v) return null;
    calificaciones[id] = v;
  }
  const nota = x.nota === null ? null : Number.isInteger(x.nota) && (x.nota as number) >= 1 && (x.nota as number) <= 5 ? (x.nota as number) : undefined;
  if (nota === undefined) return null;
  return recortarPrueba({ estado, lineas, calificaciones, nota });
}

/** Número más alto de los ids `r<N>` de las respuestas, para que los nuevos no choquen. */
export function ultimoIdRespuesta(lineas: Linea[]): number {
  return lineas.reduce((m, l) => (l.tipo === "asistente" ? Math.max(m, Number(/^r(\d+)$/.exec(l.id)?.[1] ?? 0)) : m), 0);
}

/**
 * Lo que de verdad quedó guardado en el Cerebro con una respuesta no se deshace al cambiar de motivo:
 * el plan acumulado conserva correcciones, cosas que sabe y dudas. Solo "ir a Ajustes" es del último motivo.
 */
export function acumularPlan(antes: PlanGuardado | undefined, ahora: PlanGuardado): PlanGuardado {
  const a = antes ?? NADA;
  return {
    correccion: ahora.correccion ?? a.correccion,
    conocimiento: ahora.conocimiento ?? a.conocimiento,
    duda: ahora.duda ?? a.duda,
    irAAjustes: ahora.irAAjustes,
  };
}

/** Enlaces del resumen: uno por tipo, mientras alguna respuesta tenga algo guardado de ese tipo. */
export function enlacesCerebro(planes: PlanGuardado[]): { href: string; texto: string }[] {
  return [
    planes.some((p) => p.correccion) && { href: "/panel/cerebro?ver=errores", texto: "Ver correcciones" },
    planes.some((p) => p.conocimiento) && { href: "/panel/cerebro?ver=sabe", texto: "Ver lo que sabe" },
    planes.some((p) => p.duda) && { href: "/panel/cerebro?ver=dudas", texto: "Ver sus preguntas" },
  ].filter((e): e is { href: string; texto: string } => !!e);
}
