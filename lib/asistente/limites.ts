import { fechaIso, fechaLocal } from "../agenda/tiempo";
import type { Repositorio } from "../datos/repositorio";
import type { Corredor, PresupuestoIA, UsoMensual } from "../datos/tipos";

// Topes que frenan las llamadas a la IA (no solo avisan): el tope de mensajes del mes del plan, los topes
// de gasto de IA (Claude + imágenes de OpenAI) por día y por mes, y un límite de mensajes por cliente por
// hora contra ráfagas. Los topes de gasto los define el superadministrador (/admin): uno de la plataforma
// y, si hace falta, uno propio por corredor. Cuando se frena, el chat queda para el corredor ("Te
// necesitan") y nadie paga de más.

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
  if (!dentroDelTope(await repo.presupuestoIA(corredor.id))) return "tope_dia";
  const recientes = await repo.entrantesDesde(corredor.id, conversacionId, new Date(ahora.getTime() - 60 * 60_000));
  if (recientes > MAX_MENSAJES_CLIENTE_HORA) return "rafaga";
  return null;
}

/** Gasto de hoy y del mes por debajo de sus topes. */
export function dentroDelTope(p: PresupuestoIA): boolean {
  return p.gastoDia < p.topeDia && p.gastoMes < p.topeMes;
}

/** Las funciones con IA del panel (Patty, agregar casa, anuncio, imágenes) respetan los mismos topes. */
export async function hayPresupuestoHoy(repo: Pick<Repositorio, "presupuestoIA">, corredor: Corredor): Promise<boolean> {
  return dentroDelTope(await repo.presupuestoIA(corredor.id));
}

export const SIN_PRESUPUESTO =
  "Se llegó al límite de uso de la inteligencia artificial. Vuelve a funcionar mañana (o el próximo mes si es el límite del mes); si lo necesitas antes, escríbele a soporte.";
