import type { NextRequest } from "next/server";
import { dependenciasPara } from "@/lib/asistente/dependencias";
import { errorSeguro } from "@/lib/monitoreo/errores";
import { CORS, corredorPorSlug, huella, leerPedido, pedirVisita } from "@/lib/sitio/publico";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// El sitio web pide una visita: /api/sitio/<slug>/visita (POST, JSON). Queda "por confirmar" en la agenda del
// corredor y le llega el aviso. Nunca se registran el nombre, el teléfono ni el comentario del cliente.
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const db = createAdminClient();
  const corredor = await corredorPorSlug(db, (await params).slug);
  if (!corredor) return Response.json({ ok: false, motivo: "No encontrado" }, { status: 404, headers: CORS });

  let cuerpo: unknown = null;
  try {
    cuerpo = await req.json();
  } catch {
    return Response.json({ ok: false, motivo: "Pedido inválido." }, { status: 400, headers: CORS });
  }
  const leido = leerPedido(cuerpo);
  // A un robot se le contesta como si todo hubiera salido bien, sin hacer nada.
  if (!leido.ok) return Response.json(leido.robot ? { ok: true } : { ok: false, motivo: leido.motivo }, { status: leido.robot ? 200 : 400, headers: CORS });

  // Un pedido por minuto desde la misma conexión y por teléfono (sin guardar la IP ni el número).
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "sin-ip";
  for (const clave of [`sitio_visita_ip:${huella(`${corredor.id}:${ip}`)}`, `sitio_visita_tel:${huella(`${corredor.id}:${leido.pedido.telefono}`)}`]) {
    const { data: puede } = await db.rpc("reclamar_alerta", { p_clave: clave, p_minutos: 1 });
    if (puede === false) return Response.json({ ok: false, motivo: "Espera un momento antes de volver a intentarlo." }, { status: 429, headers: CORS });
  }

  try {
    const r = await pedirVisita(dependenciasPara(corredor), db, corredor, leido.pedido);
    return r.ok
      ? Response.json({ ok: true, cuando: r.cuando, casa: r.casa, corredor: corredor.nombre_contacto }, { headers: CORS })
      : Response.json({ ok: false, motivo: r.motivo }, { status: r.estado, headers: CORS });
  } catch (e) {
    console.error(JSON.stringify({ evento: "error_visita_sitio", corredorId: corredor.id, error: errorSeguro(e) }));
    return Response.json({ ok: false, motivo: "No se pudo agendar ahora. Escríbenos por WhatsApp." }, { status: 500, headers: CORS });
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}
