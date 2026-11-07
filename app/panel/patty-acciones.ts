"use server";

import { dependenciasPara } from "@/lib/asistente/dependencias";
import { hablarConPatty, type TurnoPatty } from "@/lib/panel/patty";
import { sesionConCorredor } from "@/lib/panel/sesion";
import { createAdminClient } from "@/lib/supabase/admin";

/** El corredor le escribe a Patty. La sesión dice qué corredor es; los datos se leen solo de él. */
export async function preguntarAPatty(historial: TurnoPatty[], mensaje: string, ruta?: string) {
  const { corredor } = await sesionConCorredor();
  const limpio = (Array.isArray(historial) ? historial : [])
    .filter((t) => (t?.autor === "corredor" || t?.autor === "asistente") && typeof t.texto === "string")
    .slice(-12)
    .map((t) => ({ autor: t.autor, texto: t.texto.slice(0, 4000) }));
  return hablarConPatty(dependenciasPara(corredor), createAdminClient(), corredor, limpio, String(mensaje ?? ""), typeof ruta === "string" && ruta.startsWith("/panel") ? ruta.slice(0, 200) : "/panel");
}
