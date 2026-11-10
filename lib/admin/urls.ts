import "server-only";
import { headers } from "next/headers";

/** Dirección pública de la app: la de la configuración o, si falta, la del encabezado de la petición. */
export async function urlApp(): Promise<string> {
  const configurada = process.env.NEXT_PUBLIC_URL_APP?.trim().replace(/\/+$/, "");
  if (configurada) return configurada;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  return host ? `https://${host}` : "";
}

export const urlWebhook = async () => `${await urlApp()}/api/whatsapp/webhook`;
