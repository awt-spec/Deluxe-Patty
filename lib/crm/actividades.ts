import type { SupabaseClient } from "@supabase/supabase-js";

// Historia del cliente: lo que pasó con él (llamadas, mensajes, visitas, notas, etapas, ofertas, cierre).
// La escribe el backend (tras comprobar la sesión del corredor) y cada fila lleva corredor_id.

export const TIPOS_ACTIVIDAD = ["llamada", "mensaje", "visita", "nota", "correo", "etapa", "oferta", "cierre", "otro"] as const;
export type TipoActividad = (typeof TIPOS_ACTIVIDAD)[number];

/** Lo que el corredor anota a mano, con botones. */
export const ANOTAR: { tipo: TipoActividad; nombre: string }[] = [
  { tipo: "llamada", nombre: "Lo llamé" },
  { tipo: "mensaje", nombre: "Le escribí" },
  { tipo: "visita", nombre: "Lo vi en persona" },
  { tipo: "nota", nombre: "Otra cosa" },
];

export const NOMBRE_ACTIVIDAD: Record<TipoActividad, string> = {
  llamada: "Llamada",
  mensaje: "Mensaje",
  visita: "Visita",
  nota: "Nota",
  correo: "Correo",
  etapa: "Etapa",
  oferta: "Oferta",
  cierre: "Cierre",
  otro: "Otro",
};

export async function anotar(
  db: SupabaseClient,
  corredorId: string,
  contactoId: string,
  tipo: TipoActividad,
  texto: string,
  autor: "corredor" | "asistente" = "corredor",
): Promise<boolean> {
  const limpio = texto.trim().slice(0, 500);
  if (!limpio) return false;
  const { error } = await db.from("actividades").insert({ corredor_id: corredorId, contacto_id: contactoId, tipo, texto: limpio, autor });
  return !error;
}

export { comisionEstimada } from "./dinero";
