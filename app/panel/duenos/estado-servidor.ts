import "server-only";
import { crearAlmacenExtension } from "@/lib/encuentra24/datos";
import type { sesionConCorredor } from "@/lib/panel/sesion";
import { createAdminClient } from "@/lib/supabase/admin";

type Sesion = Pick<Awaited<ReturnType<typeof sesionConCorredor>>, "supabase" | "corredor">;

const DIA = 24 * 60 * 60_000;

/** Lo que sabe el servidor de la extensión del corredor: si hay una conectada y cuándo buscó por última vez. */
export async function estadoDelServidor({ supabase, corredor }: Sesion): Promise<{
  conectada: boolean;
  ultimaBusquedaDias: number | null;
  demo: boolean;
  corredor: string;
  /** Nombre de la asistente (el que se ve en la barra sobre Encuentra24). */
  asistente: string;
}> {
  const demo = corredor.activo === false;
  const { data: conexiones } = await supabase
    .from("extension_conexiones")
    .select("conectada_at")
    .eq("corredor_id", corredor.id)
    .not("conectada_at", "is", null)
    .is("revocada_at", null)
    .limit(1);
  const conectada = !demo && (conexiones?.length ?? 0) > 0;
  let ultimaBusquedaDias: number | null = null;
  if (conectada) {
    // La última búsqueda vive en alertas (solo el backend la lee): se consulta filtrando por el corredor de la sesión.
    const ultima = await crearAlmacenExtension(createAdminClient())
      .ultimaBusqueda(corredor.id)
      .catch(() => null);
    if (ultima) ultimaBusquedaDias = Math.max(0, Math.floor((Date.now() - ultima.getTime()) / DIA));
  }
  return { conectada, ultimaBusquedaDias, demo, corredor: corredor.nombre ?? "", asistente: corredor.nombre_asistente?.trim() || "Patty" };
}
