import type { NextRequest } from "next/server";
import { calendarioIcs } from "@/lib/agenda/ics";
import { crearRepositorioSupabase } from "@/lib/datos/repositorio";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const DIA = 24 * 60 * 60_000;

// Enlace secreto de suscripción: /api/calendario/<token_calendario>.ics
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const token = (await params).token.replace(/\.ics$/, "");
  if (!/^[0-9a-f]{64}$/.test(token)) return new Response("No encontrado", { status: 404 });

  const repo = crearRepositorioSupabase(createAdminClient());
  const calendario = await repo.calendarioPorToken(token, new Date(Date.now() - 30 * DIA));
  if (!calendario) return new Response("No encontrado", { status: 404 });

  return new Response(calendarioIcs(calendario.nombre, calendario.citas), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "private, max-age=300",
      "X-Robots-Tag": "noindex",
    },
  });
}
