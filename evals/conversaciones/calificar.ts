import type { Intencion, Propiedad } from "../../lib/datos/tipos";

// Calificación por código de cada conversación del set: reglas que se pueden revisar sin criterio humano.
// El tono no se califica aquí: lo revisa Patricia con las respuestas a la vista.

export interface Esperado {
  intencion?: Intencion;
  resultado?: "respondido" | "escalado" | "agenda";
  /** Lo que hizo el flujo de agenda en el último turno: propuesto, agendado, cancelado, respondido… */
  accion_agenda?: string;
  /** Si en el último turno le llega un aviso a la corredora. */
  aviso?: boolean;
  /** Expresiones que la respuesta del último turno debe contener ("(?i)" al inicio = sin mayúsculas). */
  debe?: string[];
  /** Expresiones que la respuesta del último turno no puede contener. */
  no_debe?: string[];
}

export interface Caso {
  id: string;
  tags: string[];
  turnos: string[];
  esperado: Esperado;
}

/** Lo que pasó en un turno: lo arma el script que corre el caso. */
export interface Turno {
  cliente: string;
  /** Resultado de procesarMensaje (tipo y, en agenda, la acción). */
  resultado: { tipo: string; accion?: string };
  /** Intención que puso el clasificador al mensaje del cliente. */
  intencion: Intencion | null;
  /** Textos que le llegaron al cliente. */
  respuestas: string[];
  /** Avisos que le llegaron a la corredora. */
  avisos: string[];
  /** Eventos de error registrados por la asistente (error_asistente, error_envio…). */
  errores: string[];
}

export interface Revision {
  regla: string;
  ok: boolean;
  detalle?: string;
}

export const LARGO_MAXIMO = 700;

const DIAS = "lunes|martes|miércoles|miercoles|jueves|viernes|sábado|sabado|domingo";
const MESES = "enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre";
const FECHA = new RegExp(`\\b(?:(?:${DIAS})\\s+)?\\d{1,2}\\s+de\\s+(?:${MESES})\\b`, "gi");
const HORA = /\b\d{1,2}(?::\d{2})?\s*(?:[ap]\.\s?m\.|[ap]m\b)|\b\d{1,2}:\d{2}\b/gi;

export function expresion(patron: string): RegExp {
  return patron.startsWith("(?i)") ? new RegExp(patron.slice(4), "im") : new RegExp(patron, "m");
}

/** Convierte "450.000", "450,000", "450 mil", "$2,200", "3,5" o "3.5" en número. */
export function aNumero(texto: string): number | null {
  const m = /^(\d[\d.,]*?)\s*(mil|k)?$/i.exec(texto.trim().replace(/^\$\s?/, ""));
  if (!m) return null;
  let cifra = m[1].replace(/[.,]$/, "");
  if (/^\d{1,3}(?:[.,]\d{3})+$/.test(cifra)) cifra = cifra.replace(/[.,]/g, "");
  else cifra = cifra.replace(",", ".");
  const n = Number(cifra);
  if (!Number.isFinite(n)) return null;
  return m[2] ? n * 1000 : n;
}

/** Cifras de un texto, sin las fechas ni horas (esas las arma el código desde la agenda). */
export function cifras(texto: string): number[] {
  const limpio = texto.replace(FECHA, " ").replace(HORA, " ");
  const encontradas = limpio.match(/\$?\s?\d[\d.,]*(?:\s?(?:mil|k)\b)?/gi) ?? [];
  return encontradas.map(aNumero).filter((n): n is number => n !== null);
}

/** Cifras que la asistente puede decir: las de las propiedades y las que escribió el cliente. */
export function cifrasPermitidas(propiedades: Propiedad[], cliente: string[]): Set<number> {
  const permitidas = new Set<number>([1]);
  for (const p of propiedades) {
    for (const n of [p.precio, p.habitaciones, p.banos, p.m2_construccion, p.m2_terreno]) {
      if (n === null) continue;
      permitidas.add(n);
      permitidas.add(Math.floor(n));
    }
    for (const t of [p.titulo, p.descripcion ?? "", ...p.amenidades]) cifras(t).forEach((n) => permitidas.add(n));
  }
  for (const t of cliente) cifras(t).forEach((n) => permitidas.add(n));
  return permitidas;
}

export function calificar(caso: Caso, turnos: Turno[], propiedades: Propiedad[]): Revision[] {
  const revisiones: Revision[] = [];
  const ultimo = turnos.at(-1);
  if (!ultimo || turnos.length !== caso.turnos.length) {
    return [{ regla: "completo", ok: false, detalle: `corrieron ${turnos.length} de ${caso.turnos.length} turnos` }];
  }
  const e = caso.esperado;

  const errores = turnos.flatMap((t) => t.errores);
  revisiones.push({ regla: "sin_errores", ok: errores.length === 0, detalle: errores.join(", ") || undefined });

  if (e.resultado) {
    revisiones.push({
      regla: "resultado",
      ok: ultimo.resultado.tipo === e.resultado,
      detalle: `esperado ${e.resultado}, fue ${ultimo.resultado.tipo}`,
    });
  }
  if (e.intencion) {
    revisiones.push({
      regla: "intencion",
      ok: ultimo.intencion === e.intencion,
      detalle: `esperada ${e.intencion}, fue ${ultimo.intencion ?? "ninguna"}`,
    });
  }
  if (e.accion_agenda) {
    revisiones.push({
      regla: "accion_agenda",
      ok: ultimo.resultado.accion === e.accion_agenda,
      detalle: `esperada ${e.accion_agenda}, fue ${ultimo.resultado.accion ?? "ninguna"}`,
    });
  }
  if (e.aviso !== undefined) {
    const hubo = ultimo.avisos.length > 0;
    revisiones.push({
      regla: "aviso_corredora",
      ok: hubo === e.aviso,
      detalle: e.aviso ? (hubo ? undefined : "no le llegó aviso") : hubo ? `aviso de más: ${ultimo.avisos[0]}` : undefined,
    });
  }

  const texto = ultimo.respuestas.join("\n");
  for (const patron of e.debe ?? []) {
    revisiones.push({ regla: "debe", ok: expresion(patron).test(texto), detalle: patron });
  }
  for (const patron of e.no_debe ?? []) {
    const m = expresion(patron).exec(texto);
    revisiones.push({ regla: "no_debe", ok: !m, detalle: m ? `${patron} → "${m[0]}"` : patron });
  }

  // La asistente nunca inventa datos: toda cifra que dice está en las propiedades o la dijo el cliente.
  const permitidas = cifrasPermitidas(propiedades, caso.turnos);
  const inventadas = [...new Set(turnos.flatMap((t) => t.respuestas.flatMap(cifras)))].filter((n) => !permitidas.has(n));
  revisiones.push({
    regla: "sin_cifras_inventadas",
    ok: inventadas.length === 0,
    detalle: inventadas.length ? inventadas.join(", ") : undefined,
  });

  // Fuera de la agenda, la respuesta la redacta el modelo: no puede traer fechas ni horas.
  const fechas = turnos
    .filter((t) => t.resultado.tipo === "respondido")
    .flatMap((t) => t.respuestas.flatMap((r) => [...r.matchAll(FECHA), ...r.matchAll(HORA)].map((m) => m[0])));
  revisiones.push({ regla: "sin_fechas_del_modelo", ok: fechas.length === 0, detalle: fechas.join(", ") || undefined });

  const largas = turnos.flatMap((t) => t.respuestas).filter((r) => r.length > LARGO_MAXIMO);
  revisiones.push({
    regla: "largo",
    ok: largas.length === 0,
    detalle: largas.length ? `${largas.length} respuesta(s) de más de ${LARGO_MAXIMO} caracteres` : undefined,
  });

  return revisiones;
}
