// Calificar las respuestas de "Probar la asistente". Lógica pura (sin servidor): la usan el navegador, para
// mostrar qué se va a guardar, y la acción del servidor, que decide qué escribe. Todo lo que llega del
// navegador es dato del corredor: se recorta y nunca se trata como instrucciones.

export const MAX_TEXTO_CALIFICACION = 1000;
/** Igual que el tema de `conocimiento` (check de la tabla) y que registrarDuda. */
export const MAX_TEMA = 300;

export type Motivo = "dato" | "falta" | "tono" | "pasarmelo" | "otra";

export const MOTIVOS: { id: Motivo; texto: string }[] = [
  { id: "dato", texto: "Dato equivocado" },
  { id: "falta", texto: "Le faltó información" },
  { id: "tono", texto: "El tono no es el mío" },
  { id: "pasarmelo", texto: "Debió pasármelo a mí" },
  { id: "otra", texto: "Otra cosa" },
];

/** Motivos en que lo que escribe el corredor es un dato que la asistente debe saber. */
export const motivoDeDato = (m: Motivo | null | undefined) => m === "dato" || m === "falta";

export function recortar(texto: unknown, max = MAX_TEXTO_CALIFICACION): string {
  return String(texto ?? "")
    .replace(/\r\n?/g, "\n")
    .trim()
    .slice(0, max)
    .trim();
}

const comparable = (t: string) => t.replace(/\s+/g, " ").trim().toLowerCase();

export interface PedidoCalificacion {
  motivo: Motivo;
  /** Lo que escribió el cliente en ese turno. */
  pregunta: string;
  /** Lo que contestó la asistente. */
  original: string;
  /** "¿Cómo lo habrías dicho tú?" (llega precargado con `original`). */
  texto: string;
  /** Con un dato: guardarlo también en lo que sabe. */
  guardarEnLoQueSabe: boolean;
}

/** El pedido viene del navegador: se valida y se recorta. Null si no sirve. */
export function pedidoValido(x: unknown): PedidoCalificacion | null {
  const p = (x ?? {}) as Record<string, unknown>;
  const motivo = MOTIVOS.find((m) => m.id === p.motivo)?.id;
  const original = recortar(p.original);
  if (!motivo || !original) return null;
  return {
    motivo,
    pregunta: recortar(p.pregunta),
    original,
    texto: recortar(p.texto),
    guardarEnLoQueSabe: p.guardarEnLoQueSabe === true,
  };
}

/** ¿Escribió su propia versión? Dejar el texto precargado tal cual (o vacío) no cuenta. */
export function escribioSuVersion(original: string, texto: string): boolean {
  const t = comparable(texto);
  return t.length > 0 && t !== comparable(original);
}

export interface PlanGuardado {
  /** Ejemplo de tono para `responder` (tabla correcciones). */
  correccion: { original: string; corregido: string } | null;
  /** Lo que sabe la asistente (conocimiento activo). */
  conocimiento: { tema: string; respuesta: string } | null;
  /** Duda pendiente en el Cerebro, para contestarla luego. */
  duda: string | null;
  /** "Debió pasármelo": los temas que van al corredor se cambian en Ajustes; aquí no se guarda nada. */
  irAAjustes: boolean;
}

export const NADA: PlanGuardado = { correccion: null, conocimiento: null, duda: null, irAAjustes: false };

/** Qué se guarda según el motivo y lo que escribió el corredor. */
export function queGuardar(p: PedidoCalificacion): PlanGuardado {
  if (p.motivo === "pasarmelo") return { ...NADA, irAAjustes: true };
  const original = recortar(p.original);
  const texto = recortar(p.texto);
  const pregunta = recortar(p.pregunta, MAX_TEMA);
  const escribio = escribioSuVersion(original, texto);
  const dato = motivoDeDato(p.motivo);
  return {
    correccion: escribio ? { original, corregido: texto } : null,
    conocimiento: dato && escribio && p.guardarEnLoQueSabe && pregunta ? { tema: pregunta, respuesta: texto } : null,
    duda: dato && !escribio && pregunta ? pregunta : null,
    irAAjustes: false,
  };
}

/** Cuántas cosas aprende la asistente con este plan (para "Le enseñaste Z cosas"). */
export const cosasEnsenadas = (plan: PlanGuardado) => [plan.correccion, plan.conocimiento, plan.duda].filter(Boolean).length;

/** Lo que el corredor ve después de "Enseñárselo". */
export function fraseGuardado(plan: PlanGuardado, nombre = "la asistente"): string {
  if (plan.irAAjustes) return `Los temas que ${nombre} te debe pasar se cambian en Ajustes.`;
  const partes: string[] = [];
  if (plan.correccion) partes.push("va a escribir como tú");
  if (plan.conocimiento) partes.push("ya sabe ese dato");
  if (plan.duda) partes.push("quedó la pregunta en su cerebro para que la contestes");
  if (!partes.length) return "Anotado en esta prueba. Si escribes cómo lo dirías tú, aprende de eso.";
  const lista = partes.length > 1 ? `${partes.slice(0, -1).join(", ")} y ${partes.at(-1)}` : partes[0];
  return `Listo: ${lista}.`;
}

// Resumen de la prueba (solo en el navegador).

export type Valor = "bien" | "mal";

export interface CalificacionRespuesta {
  valor: Valor;
  motivo?: Motivo;
  /** Cuántas cosas le enseñó con esta respuesta (0 si solo la marcó). */
  ensenadas?: number;
}

export interface ResumenPrueba {
  total: number;
  bien: number;
  mal: number;
  ensenadas: number;
}

export function resumenPrueba(calificaciones: Record<string, CalificacionRespuesta | undefined>): ResumenPrueba {
  const lista = Object.values(calificaciones).filter((c): c is CalificacionRespuesta => !!c);
  return {
    total: lista.length,
    bien: lista.filter((c) => c.valor === "bien").length,
    mal: lista.filter((c) => c.valor === "mal").length,
    ensenadas: lista.reduce((s, c) => s + Math.max(0, Math.floor(c.ensenadas ?? 0)), 0),
  };
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** "Calificaste 3 respuestas: 2 bien, 1 por mejorar". */
export function fraseResumen(r: ResumenPrueba): string {
  if (!r.total) return "Toca el pulgar bajo cada respuesta para calificarla.";
  return `Calificaste ${plural(r.total, "respuesta", "respuestas")}: ${r.bien} bien, ${r.mal} por mejorar`;
}

export const fraseEnsenadas = (n: number) => `Le enseñaste ${plural(n, "cosa", "cosas")} en esta prueba`;

/** Nota de 1 a 5 estrellas para la conversación completa (o null). */
export function notaValida(x: unknown): number | null {
  const n = Number(x);
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null;
}
