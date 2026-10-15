import type { NextRequest } from "next/server";
import { avisarVencimientos } from "@/lib/anuncios/vencimientos";
import { dependencias } from "@/lib/asistente/dependencias";
import { tareaProgramada } from "@/lib/monitoreo/cron";

export const runtime = "nodejs";
export const maxDuration = 60;

// Vercel Cron (vercel.json): aviso de anuncios de Encuentra24 que vencen en 5 días.
export function GET(req: NextRequest) {
  return tareaProgramada(req, "anuncios", () => avisarVencimientos(dependencias()));
}
