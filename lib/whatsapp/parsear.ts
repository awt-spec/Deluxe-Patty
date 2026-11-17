// Convierte el payload del webhook de WhatsApp Cloud API en eventos simples.
// Referencia: https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/payload-examples

export type TipoMensaje = "texto" | "imagen" | "audio" | "documento" | "ubicacion" | "otro";

/** Archivo que viene con el mensaje (audio, imagen, documento o video): se descarga después con su id. */
export interface MedioEntrante {
  id: string;
  mime: string;
  clase: "audio" | "imagen" | "documento" | "video";
  nombre?: string;
}

export interface MensajeEntrante {
  phoneNumberId: string;
  waMessageId: string;
  telefono: string; // E.164 con "+"
  nombrePerfil: string | null;
  tipo: TipoMensaje;
  texto: string | null;
  timestamp: Date;
  media?: MedioEntrante;
}

export interface EstadoEntrega {
  /** Número de la asistente al que llegó el aviso: dice de qué corredor es el mensaje. */
  phoneNumberId: string;
  waMessageId: string;
  estado: "enviado" | "entregado" | "leido" | "fallido";
  /** Código de error de Meta cuando el envío falló (131047, 131049, 131026…). Nunca su texto. */
  codigo?: number;
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

/* eslint-disable @typescript-eslint/no-explicit-any -- el payload de Meta llega sin tipos; se lee con cuidado campo por campo */
// Lo que no es un mensaje nuevo del cliente no se guarda ni se contesta: reacciones, stickers, ediciones,
// mensajes borrados y avisos del sistema (cambio de número, etc.). Así no silencian a la asistente.
const IGNORADOS = new Set(["reaction", "sticker", "edit", "edited", "revoke", "revoked", "deleted", "ephemeral", "system", "request_welcome"]);

const MAX_DESCRIPCION = 500;

/** Ubicación compartida como texto para la asistente (nombre, dirección y coordenadas). */
function textoUbicacion(l: any): string | null {
  if (!l || typeof l !== "object") return null;
  const partes = [l.name, l.address].filter((x) => typeof x === "string" && x.trim()).map((x: string) => x.trim());
  const lat = Number(l.latitude);
  const lon = Number(l.longitude);
  const coords = Number.isFinite(lat) && Number.isFinite(lon) && l.latitude != null && l.longitude != null ? `${lat}, ${lon}` : null;
  if (!partes.length && !coords) return null;
  return `[El cliente compartió una ubicación: ${[...partes, coords && `coordenadas ${coords}`].filter(Boolean).join(" · ")}]`.slice(0, MAX_DESCRIPCION);
}

/** Tarjeta de contacto como texto (nombre y teléfonos). */
function textoContactos(lista: any): string | null {
  if (!Array.isArray(lista) || lista.length === 0) return null;
  const uno = (c: any) => {
    const nombre = typeof c?.name?.formatted_name === "string" ? c.name.formatted_name.trim() : "";
    const tels = Array.isArray(c?.phones) ? c.phones.map((t: any) => t?.phone ?? t?.wa_id).filter((t: unknown) => typeof t === "string") : [];
    return [nombre, ...tels].filter(Boolean).join(" ");
  };
  const datos = lista.slice(0, 5).map(uno).filter(Boolean);
  return `[El cliente compartió ${lista.length === 1 ? "un contacto" : "contactos"}: ${datos.join("; ") || "sin datos"}]`.slice(0, MAX_DESCRIPCION);
}

const ESTADOS: Record<string, EstadoEntrega["estado"]> = {
  sent: "enviado",
  delivered: "entregado",
  read: "leido",
  failed: "fallido",
};

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
        if (IGNORADOS.has(m.type)) continue;
        const tipo = TIPOS[m.type] ?? "otro";
        let texto: string | null = null;
        if (m.type === "text") texto = m.text?.body ?? null;
        else if (m.type === "location") texto = textoUbicacion(m.location);
        else if (m.type === "contacts") texto = textoContactos(m.contacts);
        else if (m.type === "button") texto = m.button?.text ?? null;
        else if (m.type === "interactive") {
          texto = m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? null;
        } else if (m.type === "image" || m.type === "document" || m.type === "video") texto = m[m.type]?.caption ?? null;
        const claseMedio = ({ audio: "audio", image: "imagen", document: "documento", video: "video", sticker: null } as Record<string, MedioEntrante["clase"] | null>)[m.type];
        const bruto = claseMedio ? m[m.type] : null;
        const media: MedioEntrante | undefined =
          claseMedio && typeof bruto?.id === "string"
            ? { id: bruto.id, mime: String(bruto.mime_type ?? ""), clase: claseMedio, ...(typeof bruto.filename === "string" ? { nombre: bruto.filename.slice(0, 120) } : {}) }
            : undefined;
        mensajes.push({
          phoneNumberId,
          waMessageId: m.id,
          telefono: `+${m.from}`,
          nombrePerfil: nombres.get(m.from) ?? null,
          tipo: texto !== null && (m.type === "button" || m.type === "interactive" || m.type === "contacts") ? "texto" : tipo,
          texto,
          // Sin timestamp válido, la hora de llegada: un dato raro de Meta no debe tumbar el mensaje.
          ...(media ? { media } : {}),
          timestamp: Number.isFinite(Number(m.timestamp)) && m.timestamp ? new Date(Number(m.timestamp) * 1000) : new Date(),
        });
      }

      for (const s of value.statuses ?? []) {
        const estado = ESTADOS[s.status];
        if (!s.id || !estado) continue;
        const codigo = Number(s.errors?.[0]?.code);
        estados.push({ phoneNumberId, waMessageId: s.id, estado, ...(estado === "fallido" && Number.isFinite(codigo) && codigo > 0 ? { codigo } : {}) });
      }
    }
  }
  return { mensajes, estados };
}
