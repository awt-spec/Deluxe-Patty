import type { NextRequest } from "next/server";
import { CORS, casasPublicas, corredorPorSlug } from "@/lib/sitio/publico";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// Casas activas del corredor para su sitio web: /api/sitio/<slug>/casas
export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const db = createAdminClient();
  const corredor = await corredorPorSlug(db, (await params).slug);
  if (!corredor) return Response.json({ error: "No encontrado" }, { status: 404, headers: CORS });
  const casas = await casasPublicas(db, corredor);
  return Response.json(
    { corredor: corredor.marca?.nombre ?? corredor.nombre, casas },
    // Un minuto en la CDN: una casa vendida o pausada desaparece del sitio enseguida.
    { headers: { ...CORS, "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } },
  );
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}
