import type { NextRequest } from "next/server";
import { dependenciasPara } from "@/lib/asistente/dependencias";
import { CORS, corredorPorSlug, horariosPublicos } from "@/lib/sitio/publico";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// Horas libres de la agenda real para el sitio web: /api/sitio/<slug>/horarios?casa=<id>
// Tiene en cuenta el horario de visitas, los bloqueos, las visitas ya agendadas y el traslado a la zona de la casa.
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const db = createAdminClient();
  const corredor = await corredorPorSlug(db, (await params).slug);
  if (!corredor) return Response.json({ error: "No encontrado" }, { status: 404, headers: CORS });
  const dias = await horariosPublicos(dependenciasPara(corredor), db, corredor, req.nextUrl.searchParams.get("casa"));
  return Response.json({ zona_horaria: corredor.zona_horaria, dias }, { headers: { ...CORS, "Cache-Control": "no-store" } });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}
