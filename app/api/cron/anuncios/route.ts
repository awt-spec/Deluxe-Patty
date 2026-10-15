import type { NextRequest } from "next/server";
import { avisarVencimientos } from "@/lib/anuncios/vencimientos";
import { dependencias } from "@/lib/asistente/dependencias";

export const runtime = "nodejs";
export const maxDuration = 60;

// Vercel Cron (vercel.json): aviso de anuncios de Encuentra24 que vencen en 5 días.
export async function GET(req: NextRequest) {
  const secreto = process.env.CRON_SECRET;
  if (!secreto || req.headers.get("authorization") !== `Bearer ${secreto}`) {
    return new Response("No autorizado", { status: 401 });
  }
  return Response.json(await avisarVencimientos(dependencias()));
}
