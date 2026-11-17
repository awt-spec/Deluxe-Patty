import type { NextRequest } from "next/server";
import { enviarRecordatorios } from "@/lib/agenda/recordatorios";
import { preguntarPorVisitas } from "@/lib/agenda/seguimiento-visitas";
import { dependencias } from "@/lib/asistente/dependencias";
import { avisarSinRespuesta } from "@/lib/asistente/sin-respuesta";
import { tareaProgramada } from "@/lib/monitoreo/cron";

export const runtime = "nodejs";
export const maxDuration = 60;

// Vercel Cron llama cada hora (vercel.json) con Authorization: Bearer $CRON_SECRET: recordatorios de las visitas
// que vienen y, de las que ya terminaron, "¿Cómo te fue?" al corredor. Además, los chats donde un cliente quedó sin
// respuesta (la función se cortó a medias) se le avisan al corredor.
export function GET(req: NextRequest) {
  return tareaProgramada(req, "recordatorios", async () => {
    const deps = dependencias();
    const recordatorios = await enviarRecordatorios(deps);
    const seguimiento = await preguntarPorVisitas(deps);
    const sinRespuesta = await avisarSinRespuesta(deps);
    return { ...recordatorios, fallidos: recordatorios.fallidos + seguimiento.fallidos, seguimiento, sinRespuesta };
  });
}
