import { after, type NextRequest } from "next/server";
import { dependencias } from "@/lib/asistente/dependencias";
import { procesarEstado, procesarMensaje } from "@/lib/asistente/procesar";
import { firmaValida } from "@/lib/whatsapp/firma";
import { parsearWebhook } from "@/lib/whatsapp/parsear";

export const runtime = "nodejs";
export const maxDuration = 60;

// Verificación del webhook al configurarlo en Meta for Developers.
export function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const token = process.env.WHATSAPP_VERIFY_TOKEN;
  if (token && p.get("hub.mode") === "subscribe" && p.get("hub.verify_token") === token) {
    return new Response(p.get("hub.challenge") ?? "", { status: 200 });
  }
  return new Response("Prohibido", { status: 403 });
}

export async function POST(req: NextRequest) {
  const secreto = process.env.WHATSAPP_APP_SECRET;
  if (!secreto) {
    console.error(JSON.stringify({ evento: "falta_app_secret" }));
    return new Response("Configuración incompleta", { status: 500 });
  }

  const cuerpo = await req.text();
  if (!firmaValida(cuerpo, req.headers.get("x-hub-signature-256"), secreto)) {
    return new Response("Firma inválida", { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(cuerpo);
  } catch {
    return new Response("JSON inválido", { status: 400 });
  }

  const { mensajes, estados } = parsearWebhook(payload);
  if (mensajes.length === 0 && estados.length === 0) return new Response("OK", { status: 200 });

  // Meta espera un 200 rápido; si no llega, reintenta. El trabajo sigue después de responder.
  // Los reintentos no duplican nada: mensajes.wa_message_id es único.
  after(async () => {
    const deps = dependencias();
    for (const estado of estados) {
      await procesarEstado(deps, estado).catch((e) =>
        console.error(JSON.stringify({ evento: "error_estado", error: String(e) })),
      );
    }
    for (const mensaje of mensajes) {
      await procesarMensaje(deps, mensaje).catch((e) =>
        console.error(JSON.stringify({ evento: "error_mensaje", waMessageId: mensaje.waMessageId, error: String(e) })),
      );
    }
  });

  return new Response("OK", { status: 200 });
}
