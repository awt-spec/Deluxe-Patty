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

export const VERSION_GRAPH = process.env.WHATSAPP_GRAPH_VERSION ?? "v23.0";
// Solo para staging o pruebas locales: apunta los envíos a un servidor que imita a Meta.
export const BASE_GRAPH = process.env.WHATSAPP_GRAPH_BASE ?? "https://graph.facebook.com";
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

/** Código de Meta de un error de envío (o undefined si no es un error de WhatsApp). */
export function codigoWhatsApp(error: unknown): number | undefined {
  return error instanceof ErrorWhatsApp ? error.codigo : undefined;
}

// Errores pasajeros: vale la pena reintentar en unos segundos (límite de envíos, Meta caído, red).
const CODIGOS_TRANSITORIOS = new Set([130429, 131056, 131000, 1, 2, 4, 80007]);

/** Se reintenta: límite de envíos de Meta (130429, 131056), 5xx, falla de red o tiempo agotado. Nunca la falta de llave. */
export function esErrorTransitorio(error: unknown): boolean {
  if (!(error instanceof ErrorWhatsApp)) return true; // red caída o tiempo agotado
  if (error.status === 0) return false;
  if (error.codigo !== undefined && CODIGOS_TRANSITORIOS.has(error.codigo)) return true;
  return error.status >= 500 || error.status === 429;
}

// Errores de la configuración de la cuenta (no del cliente): los tiene que arreglar soporte.
const CODIGOS_CONFIGURACION = new Set([0, 10, 100, 190, 200, 368, 131031, 131042, 131045, 132000, 132001, 132005, 132007, 132012, 132015, 132016, 133010]);

/** El envío falló por la cuenta o la plantilla (llave, registro, pago, plantilla que no existe): avisar a soporte. */
export function esErrorDeConfiguracion(codigo: number | undefined, status?: number): boolean {
  if (status === 0) return true;
  return codigo !== undefined && CODIGOS_CONFIGURACION.has(codigo);
}

/** Qué significa un error de Meta y qué hacer, en palabras del corredor. Solo usa el código, nunca el texto de Meta. */
export function explicarErrorWhatsApp(error: unknown): string {
  const codigo = error instanceof ErrorWhatsApp ? error.codigo : undefined;
  const estado = error instanceof ErrorWhatsApp ? error.status : undefined;
  if (estado === 0) return "No está la llave de acceso de WhatsApp en el servidor.";
  return explicarCodigoWhatsApp(codigo);
}

/** Lo mismo que explicarErrorWhatsApp, desde el código que trae un estado "failed" del webhook. */
export function explicarCodigoWhatsApp(codigo: number | undefined): string {
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
    case 132005:
    case 132007:
    case 132012:
    case 132015:
    case 132016:
      return "Meta rechazó la plantilla (texto muy largo, parámetros que no calzan o plantilla pausada). Revísala en Meta.";
    case 100:
      return "Meta no encontró el número o la llave no tiene permiso sobre él. Revisa el Phone number ID y los permisos del usuario del sistema.";
    case 131047:
      return "Pasaron más de 24 horas desde el último mensaje de esa persona: WhatsApp solo deja mandarle una plantilla aprobada.";
    case 130429:
    case 131056:
      return "Se mandaron demasiados mensajes seguidos y Meta frenó el envío un rato. Se puede reintentar en unos minutos.";
    case 131049:
      return "Meta frenó el mensaje para cuidar la experiencia de esa persona (le llegan muchos mensajes de empresas). Escríbele desde tu WhatsApp o inténtalo más tarde.";
    case 131051:
      return "WhatsApp no reconoce ese tipo de mensaje.";
    case 131053:
      return "WhatsApp no pudo subir el archivo adjunto. Revisa que el enlace sea público y el archivo no pese demasiado.";
    case 368:
    case 131031:
      return "Meta restringió o bloqueó la cuenta de WhatsApp Business por sus políticas. Revisa el estado de la cuenta en Meta.";
    case 470:
      return "Pasaron más de 24 horas desde el último mensaje de esa persona: solo se le puede escribir con plantilla.";
    case 131000:
    case 1:
    case 2:
      return "WhatsApp tuvo una falla pasajera. Inténtalo de nuevo en unos minutos.";
    default:
      return codigo
        ? `WhatsApp rechazó el envío (código ${codigo}). Revisa el diagnóstico en Administración → WhatsApp.`
        : "WhatsApp rechazó el envío. Revisa el diagnóstico en Administración → WhatsApp.";
  }
}

/** Por qué no le llegó un mensaje a un cliente, en palabras del corredor (para el aviso). */
export function porQueNoLlego(codigo: number | undefined): string {
  switch (codigo) {
    case 131047:
    case 470:
      return "pasaron más de 24 horas desde su último mensaje y WhatsApp ya no deja escribirle desde la asistente";
    case 131049:
      return "Meta frenó el mensaje porque a esa persona le llegan muchos mensajes de empresas";
    case 131026:
      return "ese número no tiene WhatsApp o no puede recibir mensajes";
    case 130429:
    case 131056:
      return "se mandaron demasiados mensajes seguidos y WhatsApp frenó el envío";
    case 131000:
    case 1:
    case 2:
      return "WhatsApp tuvo una falla pasajera";
    default:
      return esErrorDeConfiguracion(codigo)
        ? "hay un problema con la cuenta de WhatsApp (ya se le avisó a soporte)"
        : "WhatsApp no lo entregó";
  }
}

// Meta rechaza parámetros de plantilla con saltos de línea, tabuladores o más de 4 espacios seguidos. Los avisos de
// varias líneas (`armarAviso`) se aplanan uniendo cada línea con " · " (sin líneas vacías ni viñetas sueltas).
export function limpiarParametro(valor: string, max = 900): string {
  const limpio = valor
    .replace(/\t+/g, " ")
    .split(/\r\n?|\n/)
    .map((l) => l.trim().replace(/^[•◦]\s*/, ""))
    .filter(Boolean)
    .join(" · ")
    .replace(/ {4,}/g, "   ")
    .trim();
  return limpio.length > max ? `${limpio.slice(0, max - 1)}…` : limpio;
}

/** Esperas antes de cada reintento de un envío que falló por algo pasajero (máximo 2 reintentos). */
export const ESPERAS_REINTENTO_MS = [1500, 4000];
const TIEMPO_MAXIMO_ENVIO_MS = 20_000;

export interface OpcionesEnviador {
  /** Para pruebas: espera entre reintentos. */
  dormir?: (ms: number) => Promise<void>;
  esperas?: number[];
}

export function crearEnviadorWhatsApp(accessToken: string, opciones: OpcionesEnviador = {}): EnviadorWhatsApp {
  const dormir = opciones.dormir ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const esperas = opciones.esperas ?? ESPERAS_REINTENTO_MS;

  async function intento(phoneNumberId: string, cuerpo: object): Promise<string> {
    const res = await fetch(`${BASE_GRAPH}/${VERSION_GRAPH}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", ...cuerpo }),
      signal: AbortSignal.timeout(TIEMPO_MAXIMO_ENVIO_MS),
    });
    const json = (await res.json().catch(() => ({}))) as {
      messages?: { id: string }[];
      error?: { code?: number };
    };
    if (!res.ok || !json.messages?.[0]?.id) throw new ErrorWhatsApp(res.status, json.error?.code);
    return json.messages[0].id;
  }

  // Lo pasajero (límite de Meta, 5xx, red, tiempo agotado) se reintenta en la misma invocación con espera corta;
  // lo permanente (número sin WhatsApp, plantilla que no existe, 24 horas) no.
  async function enviar(phoneNumberId: string, cuerpo: object): Promise<string> {
    for (let i = 0; ; i++) {
      try {
        return await intento(phoneNumberId, cuerpo);
      } catch (error) {
        if (i >= esperas.length || !esErrorTransitorio(error)) throw error;
        await dormir(esperas[i]);
      }
    }
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
