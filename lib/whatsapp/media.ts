import { BASE_GRAPH, VERSION_GRAPH } from "./enviar";

// Archivos que llegan por WhatsApp (notas de voz, fotos, PDF): Meta manda solo un id; con él se pide la
// dirección temporal y luego el archivo, siempre con la llave de acceso. Nada de esto se guarda en disco ni
// se registra: el contenido son datos personales (Ley 8968).

export interface MedioDescargado {
  datos: Buffer;
  mime: string;
}

export type RazonMedio = "muy_grande" | "no_disponible" | "sin_llave";

export class ErrorMedio extends Error {
  constructor(public readonly razon: RazonMedio) {
    super(`Medio no disponible: ${razon}`);
    this.name = "ErrorMedio";
  }
}

export interface Transcripcion {
  texto: string;
  segundos: number;
  costoUsd: number;
}

export interface Medios {
  /** Descarga el archivo de Meta. Falla con ErrorMedio si pesa más de `maxBytes` o no se puede bajar. */
  descargar(mediaId: string, maxBytes: number): Promise<MedioDescargado>;
  /** Pasa una nota de voz a texto (OpenAI). */
  transcribir(datos: Buffer, mime: string): Promise<Transcripcion>;
}

/** Tamaños máximos: lo que aguanta Claude y lo que cabe en una función de Vercel. */
export const LIMITE_AUDIO = 8_000_000;
export const LIMITE_IMAGEN = 5_000_000;
export const LIMITE_PDF = 10_000_000;

export function crearDescargador(accessToken: string, f: typeof fetch = fetch): Medios["descargar"] {
  return async (mediaId, maxBytes) => {
    if (!/^\d{5,40}$/.test(mediaId)) throw new ErrorMedio("no_disponible");
    const cabecera = { Authorization: `Bearer ${accessToken}` };
    try {
      const meta = await f(`${BASE_GRAPH}/${VERSION_GRAPH}/${mediaId}`, { headers: cabecera, signal: AbortSignal.timeout(10_000) });
      if (!meta.ok) throw new ErrorMedio("no_disponible");
      const info = (await meta.json()) as { url?: string; mime_type?: string; file_size?: number };
      if (!info.url) throw new ErrorMedio("no_disponible");
      if (typeof info.file_size === "number" && info.file_size > maxBytes) throw new ErrorMedio("muy_grande");
      // La dirección la da Meta; solo se baja de sus servidores.
      const host = new URL(info.url).hostname;
      if (!/(^|\.)(fbsbx\.com|fbcdn\.net|facebook\.com|whatsapp\.net|whatsapp\.com)$/.test(host)) throw new ErrorMedio("no_disponible");
      const res = await f(info.url, { headers: cabecera, signal: AbortSignal.timeout(20_000) });
      if (!res.ok) throw new ErrorMedio("no_disponible");
      const datos = Buffer.from(await res.arrayBuffer());
      if (datos.length > maxBytes) throw new ErrorMedio("muy_grande");
      return { datos, mime: info.mime_type ?? res.headers.get("content-type") ?? "" };
    } catch (e) {
      throw e instanceof ErrorMedio ? e : new ErrorMedio("no_disponible");
    }
  };
}

/** Sin llave de acceso o de OpenAI: cada operación falla como "sin llave" y el código cae al aviso de antes. */
export function mediosSinConfigurar(): Medios {
  const fallar = async (): Promise<never> => {
    throw new ErrorMedio("sin_llave");
  };
  return { descargar: fallar, transcribir: fallar };
}
