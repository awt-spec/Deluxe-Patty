import type { NextRequest } from "next/server";
import { dependencias } from "@/lib/asistente/dependencias";
import { enviarPlanes } from "@/lib/asistente/plan";
import { tareaProgramada } from "@/lib/monitoreo/cron";

export const runtime = "nodejs";
export const maxDuration = 60;

// Vercel Cron llama cada hora (vercel.json); cada corredor recibe su plan a su hora_plan_dia.
export function GET(req: NextRequest) {
  return tareaProgramada(req, "plan-dia", () => enviarPlanes(dependencias()));
}
