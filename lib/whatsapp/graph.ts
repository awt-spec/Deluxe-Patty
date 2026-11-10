// Administración de la conexión con Meta (Graph API): estado de un número, registro, suscripción de la app a
// la cuenta de WhatsApp y webhook. Solo lo usa el superadministrador (/admin). Nunca se registran llaves,
// teléfonos ni el texto de Meta: solo el estado HTTP y el código de error.
import { BASE_GRAPH, VERSION_GRAPH } from "./enviar";

export type RespuestaMeta<T> = { ok: true; datos: T } | { ok: false; status: number; codigo?: number };

type Opciones = { token: string; metodo?: "GET" | "POST"; cuerpo?: Record<string, string>; f?: typeof fetch };

async function graph<T>(ruta: string, { token, metodo = "GET", cuerpo, f = fetch }: Opciones): Promise<RespuestaMeta<T>> {
  try {
    const res = await f(`${BASE_GRAPH}/${VERSION_GRAPH}/${ruta}`, {
      method: metodo,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(cuerpo ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      },
      body: cuerpo ? new URLSearchParams(cuerpo).toString() : undefined,
      // Una llamada colgada no puede dejar la pantalla de administración esperando.
      signal: AbortSignal.timeout(8000),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: { code?: number } } & Record<string, unknown>;
    if (!res.ok) return { ok: false, status: res.status, codigo: json.error?.code };
    return { ok: true, datos: json as T };
  } catch {
    return { ok: false, status: 0 };
  }
}

export interface EstadoNumero {
  display_phone_number?: string;
  verified_name?: string;
  quality_rating?: string;
  code_verification_status?: string;
  name_status?: string;
  status?: string;
  platform_type?: string;
  account_mode?: string;
}

/** Estado del número en Meta. Si algún campo no existe en ese número, reintenta con los básicos. */
export async function estadoNumero(token: string, phoneNumberId: string, f?: typeof fetch): Promise<RespuestaMeta<EstadoNumero>> {
  const completo = await graph<EstadoNumero>(
    `${encodeURIComponent(phoneNumberId)}?fields=display_phone_number,verified_name,quality_rating,code_verification_status,name_status,status,platform_type,account_mode`,
    { token, f },
  );
  if (completo.ok || completo.codigo !== 100) return completo;
  return graph<EstadoNumero>(`${encodeURIComponent(phoneNumberId)}?fields=display_phone_number,verified_name`, { token, f });
}

/** Registra el número en la API de WhatsApp (PIN de verificación en dos pasos de 6 dígitos). */
export const registrarNumero = (token: string, phoneNumberId: string, pin: string, f?: typeof fetch) =>
  graph<{ success?: boolean }>(`${encodeURIComponent(phoneNumberId)}/register`, {
    token,
    metodo: "POST",
    cuerpo: { messaging_product: "whatsapp", pin },
    f,
  });

/** Apps suscritas a la cuenta de WhatsApp Business: si la nuestra no está, no llega ningún mensaje. */
export const appsSuscritas = (token: string, wabaId: string, f?: typeof fetch) =>
  graph<{ data?: { whatsapp_business_api_data?: { id?: string; name?: string } }[] }>(`${encodeURIComponent(wabaId)}/subscribed_apps`, { token, f });

export const suscribirApp = (token: string, wabaId: string, f?: typeof fetch) =>
  graph<{ success?: boolean }>(`${encodeURIComponent(wabaId)}/subscribed_apps`, { token, metodo: "POST", cuerpo: {}, f });

/**
 * Registra en Meta la dirección del webhook y el campo `messages` con el token de la app (id|secreto).
 * Meta llama enseguida a nuestra dirección con el token de verificación: tiene que estar ya en Vercel.
 */
export const configurarWebhook = (appId: string, appSecret: string, urlWebhook: string, tokenVerificacion: string, f?: typeof fetch) =>
  graph<{ success?: boolean }>(`${encodeURIComponent(appId)}/subscriptions`, {
    token: `${appId}|${appSecret}`,
    metodo: "POST",
    cuerpo: { object: "whatsapp_business_account", callback_url: urlWebhook, verify_token: tokenVerificacion, fields: "messages" },
    f,
  });
