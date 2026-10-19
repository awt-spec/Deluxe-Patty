import { fechaIso, fechaLocal } from "../agenda/tiempo";
import type { Repositorio } from "../datos/repositorio";
import type { Corredor, UsoMensual } from "../datos/tipos";

// Topes que frenan las llamadas a la IA (no solo avisan): el tope de mensajes del mes del plan, un tope
// de costo de Claude por día y un límite de mensajes por cliente por hora contra ráfagas. Cuando se
// frena, el chat queda para el corredor ("Te necesitan") y nadie paga de más.

/** Costo de Claude por día y corredor a partir del cual la IA se detiene hasta el día siguiente. */
export function topeCostoDiarioUsd(): number {
  const valor = Number(process.env.COSTO_DIARIO_TOPE_USD ?? "10");
  return Number.isFinite(valor) && valor > 0 ? valor : 10;
}

export const MAX_MENSAJES_CLIENTE_HORA = 20;

export type Freno = "tope_mes" | "tope_dia" | "rafaga";

export function diaLocal(corredor: Corredor, ahora: Date): string {
  return fechaIso(fechaLocal(ahora, corredor.zona_horaria));
}

/** Si hay que frenar la IA antes de contestarle a un cliente, y por qué. */
export async function frenoCliente(
  repo: Repositorio,
  corredor: Corredor,
  uso: UsoMensual,
  conversacionId: string,
  ahora: Date,
): Promise<Freno | null> {
  if (uso.mensajes_total >= corredor.tope_mensajes_mes) return "tope_mes";
  if ((await repo.costoClaudeDelDia(corredor.id, diaLocal(corredor, ahora))) >= topeCostoDiarioUsd()) return "tope_dia";
  const recientes = await repo.entrantesDesde(corredor.id, conversacionId, new Date(ahora.getTime() - 60 * 60_000));
  if (recientes > MAX_MENSAJES_CLIENTE_HORA) return "rafaga";
  return null;
}

/** Las funciones con IA del panel (probar, agregar casa, anuncio, fotos) respetan el mismo tope diario. */
export async function hayPresupuestoHoy(repo: Pick<Repositorio, "costoClaudeDelDia">, corredor: Corredor, ahora = new Date()): Promise<boolean> {
  return (await repo.costoClaudeDelDia(corredor.id, diaLocal(corredor, ahora))) < topeCostoDiarioUsd();
}

export const SIN_PRESUPUESTO =
  "Por hoy se llegó al límite de uso de la inteligencia artificial. Mañana vuelve a funcionar; si lo necesitas antes, escríbele a soporte.";
