// Envío por WhatsApp Cloud API.

export interface EnviadorWhatsApp {
  /** Texto libre: solo dentro de la ventana de 24 horas desde el último mensaje del destinatario. */
  texto(phoneNumberId: string, para: string, cuerpo: string): Promise<string>;
  /** Imagen por enlace público, con leyenda. Solo dentro de la ventana de 24 horas. */
  imagen(phoneNumberId: string, para: string, url: string, leyenda: string): Promise<string>;
  /** Documento (PDF) por enlace público. Solo dentro de la ventana de 24 horas. */
  documento(phoneNumberId: string, para: string, url: string, nombreArchivo: string, leyenda: string): Promise<string>;
  /** Plantilla aprobada por Meta: sirve fuera de la ventana de 24 horas. */
  plantilla(phoneNumberId: string, para: string, nombre: string, parametros: string[]): Promise<string>;
}

const VERSION_GRAPH = process.env.WHATSAPP_GRAPH_VERSION ?? "v23.0";
// Solo para staging o pruebas locales: apunta los envíos a un servidor que imita a Meta.
const BASE_GRAPH = process.env.WHATSAPP_GRAPH_BASE ?? "https://graph.facebook.com";

export class ErrorWhatsApp extends Error {
  constructor(
    public readonly status: number,
    public readonly codigo: number | undefined,
  ) {
    super(`WhatsApp respondió ${status}${codigo ? ` (código ${codigo})` : ""}`);
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
    plantilla: (phoneNumberId, para, nombre, parametros) =>
      enviar(phoneNumberId, {
        to: para.replace(/^\+/, ""),
        type: "template",
        template: {
          name: nombre,
          language: { code: "es" },
          components: [
            {
              type: "body",
              parameters: parametros.map((p) => ({ type: "text", text: limpiarParametro(p) })),
            },
          ],
        },
      }),
  };
}
