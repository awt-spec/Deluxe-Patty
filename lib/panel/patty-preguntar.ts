import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Adjunto } from "../asistente/cerebro";
import type { Dependencias } from "../asistente/procesar";
import type { Corredor } from "../datos/tipos";
import { hablarConPatty, type TurnoPatty } from "./patty";

// El corazón de "preguntarle a Patty", el mismo para el chat del panel (app/panel/patty-acciones.ts, con la sesión del
// corredor) y para el panel lateral de la extensión (/api/extension/patty, con el permiso de la extensión). Quien
// llama ya sabe qué corredor es; aquí se limpia lo que llega y se arma la respuesta con hablarConPatty (contexto,
// topes de energía, uso, fallas de la IA). La base que se pasa es el cliente del backend y cada consulta de
// lib/panel/patty.ts y lib/panel/negocio-patty.ts filtra por corredor_id.

/** Turnos de la conversación que se le pasan al modelo. */
export const TURNOS_PATTY = 12;
/** Largo máximo de cada turno anterior. */
export const TEXTO_TURNO_PATTY = 4000;

/** Solo turnos del corredor o de la asistente con texto; los últimos 12, cada uno de hasta 4.000 caracteres. */
export function limpiarHistorial(historial: unknown): TurnoPatty[] {
  return (Array.isArray(historial) ? historial : [])
    .filter((t): t is TurnoPatty => !!t && typeof t === "object" && (t.autor === "corredor" || t.autor === "asistente") && typeof t.texto === "string")
    .slice(-TURNOS_PATTY)
    .map((t) => ({ autor: t.autor, texto: t.texto.slice(0, TEXTO_TURNO_PATTY) }));
}

export interface PedidoPatty {
  /** Ruta del panel donde está el corredor; null cuando escribe desde la extensión (no hay pantalla del panel). */
  ruta: string | null;
  adjuntos?: Adjunto[];
  /** Demo: contesta el código con los datos, sin IA ni gasto. */
  simular?: boolean;
}

export function preguntarComoCorredor(
  deps: Dependencias,
  db: SupabaseClient,
  corredor: Corredor,
  historial: unknown,
  mensaje: unknown,
  pedido: PedidoPatty,
) {
  const desdeExtension = pedido.ruta === null;
  const ruta = typeof pedido.ruta === "string" && pedido.ruta.startsWith("/panel") ? pedido.ruta.slice(0, 200) : "/panel";
  return hablarConPatty(
    deps,
    db,
    corredor,
    limpiarHistorial(historial),
    typeof mensaje === "string" ? mensaje : String(mensaje ?? ""),
    ruta,
    pedido.adjuntos ?? [],
    desdeExtension ? { pantalla: false, imagenes: false, simular: pedido.simular === true } : { simular: pedido.simular === true },
  );
}
