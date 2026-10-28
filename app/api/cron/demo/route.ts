import type { NextRequest } from "next/server";
import { tareaProgramada } from "@/lib/monitoreo/cron";
import { rehacerDemo } from "@/lib/panel/demo-datos";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

// Vercel Cron (vercel.json), cada noche: la demo vuelve a quedar como nueva, con visitas en los
// próximos días y chats recientes. Sin DEMO_CORREO no hay demo y no hace nada.
export function GET(req: NextRequest) {
  return tareaProgramada(req, "demo", async () => {
    const correo = process.env.DEMO_CORREO?.trim().toLowerCase();
    if (!correo) return { omitida: true };
    return rehacerDemo(createAdminClient(), correo);
  });
}
