import type { NextRequest } from "next/server";
import { enviarRecordatorios } from "@/lib/agenda/recordatorios";
import { dependencias } from "@/lib/asistente/dependencias";
import { tareaProgramada } from "@/lib/monitoreo/cron";

export const runtime = "nodejs";
export const maxDuration = 60;

// Vercel Cron llama cada hora (vercel.json) con Authorization: Bearer $CRON_SECRET.
export function GET(req: NextRequest) {
  return tareaProgramada(req, "recordatorios", () => enviarRecordatorios(dependencias()));
}
