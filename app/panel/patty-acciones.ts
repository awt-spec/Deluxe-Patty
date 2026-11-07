"use server";

import type { Adjunto } from "@/lib/asistente/cerebro";
import { dependenciasPara } from "@/lib/asistente/dependencias";
import { hablarConPatty, type TurnoPatty } from "@/lib/panel/patty";
import { sesionConCorredor } from "@/lib/panel/sesion";
import { createAdminClient } from "@/lib/supabase/admin";

/** El corredor le escribe a Patty. La sesión dice qué corredor es; los datos se leen solo de él. */
const TIPOS_ADJUNTO = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"]);
// Hasta 4 archivos y 4 MB en total (en base64), lo que deja pasar Vercel en un pedido.
const MAX_ADJUNTOS = 4;
const MAX_BASE64 = 4 * 1024 * 1024;

/** Solo fotos y PDF, en base64 limpio y dentro del tamaño; lo demás se descarta. */
function adjuntosValidos(entrada: unknown): Adjunto[] | null {
  if (!Array.isArray(entrada)) return [];
  const lista = entrada.slice(0, MAX_ADJUNTOS).filter(
    (a): a is Adjunto =>
      !!a &&
      typeof a === "object" &&
      TIPOS_ADJUNTO.has((a as Adjunto).mediaType) &&
      typeof (a as Adjunto).datos === "string" &&
      /^[A-Za-z0-9+/=]+$/.test((a as Adjunto).datos),
  );
  if (lista.reduce((s, a) => s + a.datos.length, 0) > MAX_BASE64) return null;
  return lista.map((a) => ({
    tipo: a.mediaType === "application/pdf" ? "pdf" : "imagen",
    mediaType: a.mediaType,
    datos: a.datos,
    nombre: String(a.nombre ?? "archivo").slice(0, 100),
  }));
}

export async function preguntarAPatty(historial: TurnoPatty[], mensaje: string, ruta?: string, adjuntos?: unknown) {
  const { corredor } = await sesionConCorredor();
  const limpio = (Array.isArray(historial) ? historial : [])
    .filter((t) => (t?.autor === "corredor" || t?.autor === "asistente") && typeof t.texto === "string")
    .slice(-12)
    .map((t) => ({ autor: t.autor, texto: t.texto.slice(0, 4000) }));
  const archivos = adjuntosValidos(adjuntos);
  if (archivos === null) return { ok: false as const, motivo: "Los archivos pesan demasiado. Manda menos o más livianos (hasta 4 MB en total)." };
  return hablarConPatty(
    dependenciasPara(corredor),
    createAdminClient(),
    corredor,
    limpio,
    String(mensaje ?? ""),
    typeof ruta === "string" && ruta.startsWith("/panel") ? ruta.slice(0, 200) : "/panel",
    archivos,
  );
}
