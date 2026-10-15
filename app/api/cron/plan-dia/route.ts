import type { NextRequest } from "next/server";
import { dependencias } from "@/lib/asistente/dependencias";
import { enviarPlanes } from "@/lib/asistente/plan";

export const runtime = "nodejs";
export const maxDuration = 60;

// Vercel Cron llama cada hora (vercel.json); cada corredor recibe su plan a su hora_plan_dia.
export async function GET(req: NextRequest) {
  const secreto = process.env.CRON_SECRET;
  if (!secreto || req.headers.get("authorization") !== `Bearer ${secreto}`) {
    return new Response("No autorizado", { status: 401 });
  }
  return Response.json(await enviarPlanes(dependencias()));
}
