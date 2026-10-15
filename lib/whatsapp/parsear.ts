// Convierte el payload del webhook de WhatsApp Cloud API en eventos simples.
// Referencia: https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/payload-examples

export type TipoMensaje = "texto" | "imagen" | "audio" | "documento" | "ubicacion" | "otro";

export interface MensajeEntrante {
  phoneNumberId: string;
  waMessageId: string;
  telefono: string; // E.164 con "+"
  nombrePerfil: string | null;
  tipo: TipoMensaje;
  texto: string | null;
  timestamp: Date;
}

export interface EstadoEntrega {
  waMessageId: string;
  estado: "enviado" | "entregado" | "leido" | "fallido";
}

export interface EventosWebhook {
  mensajes: MensajeEntrante[];
  estados: EstadoEntrega[];
}

const TIPOS: Record<string, TipoMensaje> = {
  text: "texto",
  image: "imagen",
  audio: "audio",
  document: "documento",
  location: "ubicacion",
};

const ESTADOS: Record<string, EstadoEntrega["estado"]> = {
  sent: "enviado",
  delivered: "entregado",
  read: "leido",
  failed: "fallido",
};

/* eslint-disable @typescript-eslint/no-explicit-any */
export function parsearWebhook(payload: any): EventosWebhook {
  const mensajes: MensajeEntrante[] = [];
  const estados: EstadoEntrega[] = [];
  if (payload?.object !== "whatsapp_business_account") return { mensajes, estados };

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "messages") continue;
      const value = change.value ?? {};
      const phoneNumberId: string | undefined = value.metadata?.phone_number_id;
      if (!phoneNumberId) continue;

      const nombres = new Map<string, string>();
      for (const c of value.contacts ?? []) {
        if (c.wa_id && c.profile?.name) nombres.set(c.wa_id, c.profile.name);
      }

      for (const m of value.messages ?? []) {
        if (!m.id || !m.from) continue;
        const tipo = TIPOS[m.type] ?? "otro";
        let texto: string | null = null;
        if (m.type === "text") texto = m.text?.body ?? null;
        else if (m.type === "button") texto = m.button?.text ?? null;
        else if (m.type === "interactive") {
          texto = m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? null;
        } else if (m.type === "image" || m.type === "document") texto = m[m.type]?.caption ?? null;
        mensajes.push({
          phoneNumberId,
          waMessageId: m.id,
          telefono: `+${m.from}`,
          nombrePerfil: nombres.get(m.from) ?? null,
          tipo: texto !== null && (m.type === "button" || m.type === "interactive") ? "texto" : tipo,
          texto,
          timestamp: new Date(Number(m.timestamp) * 1000),
        });
      }

      for (const s of value.statuses ?? []) {
        const estado = ESTADOS[s.status];
        if (s.id && estado) estados.push({ waMessageId: s.id, estado });
      }
    }
  }
  return { mensajes, estados };
}
