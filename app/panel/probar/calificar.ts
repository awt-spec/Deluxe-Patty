"use server";

import { createHash } from "node:crypto";
import { crearRepositorioSupabase } from "@/lib/datos/repositorio";
import { errorSeguro } from "@/lib/monitoreo/errores";
import { ensenarAlCerebro } from "@/lib/panel/cerebro";
import { sesionConCorredor } from "@/lib/panel/sesion";
import { pedidoValido, queGuardar, type PlanGuardado } from "@/lib/simulador/calificar";
import { createAdminClient } from "@/lib/supabase/admin";

export type RespuestaCalificar = { ok: true; plan: PlanGuardado } | { ok: false; error: string };

const comparable = (t: string) => t.replace(/\s+/g, " ").trim().toLowerCase();

/**
 * La respuesta de prueba nunca fue una fila de `mensajes`, pero `correcciones.mensaje_id` es obligatorio
 * (sin llave foránea, nadie lo lee). Se le da un id propio de la respuesta de prueba, estable para el
 * mismo texto: identifica "esta respuesta de prueba y su corrección", no apunta a un mensaje de nadie.
 */
function idRespuestaDePrueba(corredorId: string, original: string, corregido: string): string {
  const h = createHash("sha256").update(`prueba|${corredorId}|${original}|${corregido}`).digest("hex");
  // Formato UUID v8 (definido por la aplicación).
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-8${h.slice(13, 16)}-${((parseInt(h[16], 16) & 3) | 8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/**
 * "No me gustó" → "Enseñárselo" en Probar la asistente. El corredor sale de la sesión: lo que mande el
 * navegador nunca elige a quién se le escribe. Según el motivo y el texto (`queGuardar`):
 * - su versión → corrección (lo mismo que al corregir un borrador en Revisar), ejemplo de tono en `responder`;
 * - con un dato y "guardarlo en lo que sabe" → `conocimiento` activo (como "Enséñale algo" del Cerebro);
 * - con un dato pero sin escribir nada → duda pendiente en el Cerebro (`registrarDuda`, sin repetirse);
 * - "Debió pasármelo" → nada (los temas que van al corredor están en Ajustes).
 * En la demo se escribe igual que en el Cerebro (son datos de prueba que el cron rehace). No llama a la IA.
 */
export async function calificarRespuesta(entrada: unknown): Promise<RespuestaCalificar> {
  const { supabase, corredor } = await sesionConCorredor();
  const pedido = pedidoValido(entrada);
  if (!pedido) return { ok: false, error: "Elige qué estuvo mal." };
  const plan = queGuardar(pedido);
  if (plan.irAAjustes || (!plan.correccion && !plan.conocimiento && !plan.duda)) return { ok: true, plan };
  const repo = crearRepositorioSupabase(createAdminClient());
  try {
    if (plan.correccion) {
      const { original, corregido } = plan.correccion;
      // Tocar dos veces "Enseñárselo" (o reenviar la misma corrección) no deja dos ejemplos iguales.
      const recientes = await repo.correccionesRecientes(corredor.id, 8);
      const repetida = recientes.some((c) => comparable(c.original) === comparable(original) && comparable(c.corregido) === comparable(corregido));
      if (!repetida) await repo.guardarCorreccion(corredor.id, idRespuestaDePrueba(corredor.id, original, corregido), original, corregido);
    }
    if (plan.conocimiento) await ensenarAlCerebro(supabase, corredor.id, plan.conocimiento.tema, plan.conocimiento.respuesta);
    if (plan.duda) await repo.registrarDuda(corredor.id, plan.duda, null);
    return { ok: true, plan };
  } catch (e) {
    console.error(JSON.stringify({ evento: "error_calificar_prueba", corredorId: corredor.id, error: errorSeguro(e) }));
    return { ok: false, error: "No se pudo guardar. Inténtalo de nuevo." };
  }
}
