import { timingSafeEqual } from "node:crypto";
import { after, type NextRequest } from "next/server";
import { alertar, dependencias, esperarAlertas } from "@/lib/asistente/dependencias";
import { procesarEstado, procesarMensaje } from "@/lib/asistente/procesar";
import { firmaValida } from "@/lib/whatsapp/firma";
import { parsearWebhook, type MensajeEntrante } from "@/lib/whatsapp/parsear";
import { errorSeguro } from "@/lib/monitoreo/errores";

export const runtime = "nodejs";
// La mejora de fotos (varias imágenes con OpenAI) corre en after() y puede tardar unos minutos.
export const maxDuration = 300;

function iguales(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function porRemitente(mensajes: MensajeEntrante[]): Map<string, MensajeEntrante[]> {
  const grupos = new Map<string, MensajeEntrante[]>();
  for (const m of mensajes) {
    const clave = `${m.phoneNumberId}:${m.telefono}`;
    grupos.set(clave, [...(grupos.get(clave) ?? []), m]);
  }
  for (const lista of grupos.values()) lista.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  return grupos;
}

// Verificación del webhook al configurarlo en Meta for Developers.
export function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const token = process.env.WHATSAPP_VERIFY_TOKEN;
  if (token && p.get("hub.mode") === "subscribe" && iguales(p.get("hub.verify_token") ?? "", token)) {
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
    // Los avisos de entrega van en paralelo (cada uno puede esperar 2 s a que su mensaje se guarde). Un "failed"
    // avisa al corredor y, si es de la cuenta, a soporte (procesarEstado).
    await Promise.allSettled(
      estados.map((estado) =>
        procesarEstado(deps, estado).catch((e) => console.error(JSON.stringify({ evento: "error_estado", error: errorSeguro(e) }))),
      ),
    );
    // Mensajes: cada cliente en orden y los clientes en paralelo. Si en el mismo aviso vienen varios del mismo
    // cliente, se guardan todos y se contesta una vez, con el último.
    await Promise.allSettled(
      [...porRemitente(mensajes).values()].map(async (lista) => {
        for (const [i, mensaje] of lista.entries()) {
          await procesarMensaje(deps, mensaje, { siguenMas: i < lista.length - 1 }).catch((e) => {
            console.error(JSON.stringify({ evento: "error_mensaje", waMessageId: mensaje.waMessageId, error: errorSeguro(e) }));
            alertar("error_webhook", `El webhook falló procesando un mensaje: ${errorSeguro(e)}`);
          });
        }
      }),
    );
    await esperarAlertas();
  });

  return new Response("OK", { status: 200 });
}
