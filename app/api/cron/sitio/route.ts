import type { NextRequest } from "next/server";
import { tareaProgramada } from "@/lib/monitoreo/cron";
import { sincronizarSitios } from "@/lib/sitio/importar";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 300;

// Vercel Cron (vercel.json), cada hora: trae las casas del sitio web de cada corredor (lib/sitio/importar.ts).
export function GET(req: NextRequest) {
  return tareaProgramada(req, "sitio", () => sincronizarSitios(createAdminClient()));
}
