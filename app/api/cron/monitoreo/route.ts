import type { NextRequest } from "next/server";
import { alertar } from "@/lib/asistente/dependencias";
import { tareaProgramada } from "@/lib/monitoreo/cron";
import { revisarSalud } from "@/lib/monitoreo/salud";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// Vercel Cron cada hora: costo diario por corredor y mensajes no entregados.
export function GET(req: NextRequest) {
  return tareaProgramada(req, "monitoreo", async () => {
    const hallazgos = await revisarSalud(createAdminClient());
    for (const h of hallazgos) alertar(h.clave, h.texto);
    return { hallazgos: hallazgos.length };
  });
}
