import type { NextRequest } from "next/server";
import { dependencias } from "@/lib/asistente/dependencias";
import { tareasGoogle } from "@/lib/google/tareas";
import { tareaProgramada } from "@/lib/monitoreo/cron";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 120;

// Cada 15 minutos (vercel.json): visitas a Google Calendar, correos de clientes y resumen del día.
export function GET(req: NextRequest) {
  return tareaProgramada(req, "google", () => tareasGoogle(dependencias(), createAdminClient()));
}
