import type { NextRequest } from "next/server";
import { alertasSoporte } from "@/lib/asistente/dependencias";

export const runtime = "nodejs";

// Alerta de prueba a soporte: curl -H "Authorization: Bearer $CRON_SECRET" <app>/api/monitoreo/prueba
export async function GET(req: NextRequest) {
  const secreto = process.env.CRON_SECRET;
  if (!secreto || req.headers.get("authorization") !== `Bearer ${secreto}`) {
    return new Response("No autorizado", { status: 401 });
  }
  const enviada = await alertasSoporte().alertar(`prueba:${Date.now()}`, "Alerta de prueba: el monitoreo llega a tu WhatsApp.");
  return Response.json({ enviada });
}
