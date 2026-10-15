import type { NextRequest } from "next/server";
import { dependencias } from "@/lib/asistente/dependencias";
import { enviarRecordatorios } from "@/lib/agenda/recordatorios";

export const runtime = "nodejs";
export const maxDuration = 60;

// Vercel Cron llama cada hora (vercel.json) con Authorization: Bearer $CRON_SECRET.
export async function GET(req: NextRequest) {
  const secreto = process.env.CRON_SECRET;
  if (!secreto || req.headers.get("authorization") !== `Bearer ${secreto}`) {
    return new Response("No autorizado", { status: 401 });
  }
  const resumen = await enviarRecordatorios(dependencias());
  return Response.json(resumen);
}
