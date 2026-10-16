"use server";

import { dependencias } from "@/lib/asistente/dependencias";
import { crearRepositorioSupabase } from "@/lib/datos/repositorio";
import { sesionConCorredor } from "@/lib/panel/sesion";
import {
  MAX_MENSAJES_SIMULACION,
  MAX_TEXTO_SIMULACION,
  estadoValido,
  simularTurno,
  type EstadoSimulacion,
  type TurnoSimulado,
} from "@/lib/simulador/simulador";
import { createAdminClient } from "@/lib/supabase/admin";

export type RespuestaPrueba = { turno: TurnoSimulado; estado: EstadoSimulacion } | { error: string };

/**
 * Un turno de "Probar la asistente". El corredor sale de la sesión (RLS); el repositorio real solo se
 * lee (propiedades, agenda, correcciones) y registra el costo de Claude, siempre con su corredor_id.
 */
export async function probarTurno(estadoNavegador: unknown, texto: string): Promise<RespuestaPrueba> {
  const { corredor } = await sesionConCorredor();
  const mensaje = String(texto ?? "").trim();
  if (!mensaje) return { error: "Escribe un mensaje." };
  if (mensaje.length > MAX_TEXTO_SIMULACION) return { error: "El mensaje es muy largo para una prueba." };
  const estado = estadoValido(estadoNavegador);
  if (estado.mensajes.length >= MAX_MENSAJES_SIMULACION) {
    return { error: "Esta prueba ya es larga: empieza una nueva." };
  }
  try {
    return await simularTurno({
      real: crearRepositorioSupabase(createAdminClient()),
      cerebro: dependencias().cerebro,
      corredor,
      estado,
      texto: mensaje,
      ahora: new Date(),
    });
  } catch (error) {
    console.error(JSON.stringify({ evento: "error_simulador", corredorId: corredor.id, error: error instanceof Error ? error.name : "desconocido" }));
    return { error: "La prueba falló. Inténtalo de nuevo en un rato." };
  }
}
