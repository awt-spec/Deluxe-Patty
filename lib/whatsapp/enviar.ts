// Envío por WhatsApp Cloud API.

export interface EnviadorWhatsApp {
  /** Texto libre: solo dentro de la ventana de 24 horas desde el último mensaje del destinatario. */
  texto(phoneNumberId: string, para: string, cuerpo: string): Promise<string>;
  /** Imagen por enlace público, con leyenda. Solo dentro de la ventana de 24 horas. */
  imagen(phoneNumberId: string, para: string, url: string, leyenda: string): Promise<string>;
  /** Documento (PDF) por enlace público. Solo dentro de la ventana de 24 horas. */
  documento(phoneNumberId: string, para: string, url: string, nombreArchivo: string, leyenda: string): Promise<string>;
  /** Plantilla aprobada por Meta: sirve fuera de la ventana de 24 horas. */
  plantilla(phoneNumberId: string, para: string, nombre: string, parametros: string[], idioma?: string): Promise<string>;
}

const VERSION_GRAPH = process.env.WHATSAPP_GRAPH_VERSION ?? "v23.0";
// Solo para staging o pruebas locales: apunta los envíos a un servidor que imita a Meta.
const BASE_GRAPH = process.env.WHATSAPP_GRAPH_BASE ?? "https://graph.facebook.com";
// Idioma con que se crearon las plantillas en Meta. Tiene que coincidir exactamente ("es", "es_ES",
// "es_MX"…): si no, Meta rechaza el envío con el código 132001 y el aviso al corredor no sale.
export const IDIOMA_PLANTILLAS = process.env.WHATSAPP_PLANTILLA_IDIOMA ?? "es";

export class ErrorWhatsApp extends Error {
  constructor(
    public readonly status: number,
    public readonly codigo: number | undefined,
  ) {
    super(`WhatsApp respondió ${status}${codigo ? ` (código ${codigo})` : ""}`);
  }
}

/** Qué significa un error de Meta y qué hacer, en palabras del corredor. Solo usa el código, nunca el texto de Meta. */
export function explicarErrorWhatsApp(error: unknown): string {
  const codigo = error instanceof ErrorWhatsApp ? error.codigo : undefined;
  const estado = error instanceof ErrorWhatsApp ? error.status : undefined;
  if (estado === 0) return "No está la llave de acceso de WhatsApp en el servidor.";
  switch (codigo) {
    case 190:
      return "La llave de acceso venció o no es válida. Genera la permanente del usuario del sistema, ponla en Vercel y redespliega.";
    case 133010:
      return "El número todavía no está registrado en la API de WhatsApp (en Meta aparece como Pending). Termina el registro del número en Meta.";
    case 131030:
      return "Ese celular no está en la lista de destinatarios de prueba de Meta. Agrégalo y verifícalo con el código.";
    case 131026:
      return "Ese celular no tiene WhatsApp o no puede recibir el mensaje.";
    case 131042:
      return "La cuenta de WhatsApp Business no tiene método de pago. Agrégalo en Meta.";
    case 132000:
    case 132001:
      return "La plantilla no existe en ese idioma. Revisa su nombre e idioma en Meta.";
    case 100:
      return "Meta no encontró el número o la llave no tiene permiso sobre él. Revisa el Phone number ID y los permisos del usuario del sistema.";
    default:
      return "Revisa la llave, el número y que el celular esté en la lista de prueba.";
  }
}

// Meta rechaza parámetros de plantilla con saltos de línea, tabuladores o más de 4 espacios seguidos.
export function limpiarParametro(valor: string, max = 900): string {
  const limpio = valor.replace(/[\r\n\t]+/g, " · ").replace(/ {4,}/g, "   ").trim();
  return limpio.length > max ? `${limpio.slice(0, max - 1)}…` : limpio;
}

export function crearEnviadorWhatsApp(accessToken: string): EnviadorWhatsApp {
  async function enviar(phoneNumberId: string, cuerpo: object): Promise<string> {
    const res = await fetch(`${BASE_GRAPH}/${VERSION_GRAPH}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", ...cuerpo }),
    });
    const json = (await res.json().catch(() => ({}))) as {
      messages?: { id: string }[];
      error?: { code?: number };
    };
    if (!res.ok || !json.messages?.[0]?.id) throw new ErrorWhatsApp(res.status, json.error?.code);
    return json.messages[0].id;
  }

  return {
    texto: (phoneNumberId, para, cuerpo) =>
      enviar(phoneNumberId, {
        recipient_type: "individual",
        to: para.replace(/^\+/, ""),
        type: "text",
        text: { body: cuerpo, preview_url: true },
      }),
    imagen: (phoneNumberId, para, url, leyenda) =>
      enviar(phoneNumberId, {
        recipient_type: "individual",
        to: para.replace(/^\+/, ""),
        type: "image",
        image: { link: url, caption: leyenda },
      }),
    documento: (phoneNumberId, para, url, nombreArchivo, leyenda) =>
      enviar(phoneNumberId, {
        recipient_type: "individual",
        to: para.replace(/^\+/, ""),
        type: "document",
        document: { link: url, filename: nombreArchivo, caption: leyenda },
      }),
    plantilla: (phoneNumberId, para, nombre, parametros, idioma = IDIOMA_PLANTILLAS) =>
      enviar(phoneNumberId, {
        to: para.replace(/^\+/, ""),
        type: "template",
        template: {
          name: nombre,
          language: { code: idioma },
          // Sin parámetros no va el componente (Meta rechaza un body vacío, p. ej. en hello_world).
          ...(parametros.length
            ? { components: [{ type: "body", parameters: parametros.map((p) => ({ type: "text", text: limpiarParametro(p) })) }] }
            : {}),
        },
      }),
  };
}

/** Sin WHATSAPP_ACCESS_TOKEN: cada envío falla como si Meta lo rechazara, y el panel lo dice. */
export function enviadorSinConfigurar(): EnviadorWhatsApp {
  const fallar = async (): Promise<string> => {
    throw new ErrorWhatsApp(0, undefined);
  };
  return { texto: fallar, imagen: fallar, documento: fallar, plantilla: fallar };
}

/** Cuenta de demo (corredor inactivo): nada sale de verdad; cada envío devuelve un id inventado. */
export function enviadorDemo(): EnviadorWhatsApp {
  const simular = async () => `demo-${crypto.randomUUID()}`;
  return { texto: simular, imagen: simular, documento: simular, plantilla: simular };
}
