import OpenAI, { toFile } from "openai";
import type { Transcripcion } from "../whatsapp/media";
import { ErrorMedio } from "../whatsapp/media";

// Notas de voz a texto con la API de audio de OpenAI. El costo se estima por los segundos de audio y se suma al
// gasto de IA del corredor (`registrar_audio`), así los topes también lo frenan.

export const MODELO_TRANSCRIPCION = process.env.OPENAI_MODELO_TRANSCRIPCION ?? "whisper-1";

/** Precio por minuto de audio (USD). Por defecto el de whisper-1; se puede cambiar con OPENAI_PRECIO_TRANSCRIPCION_MIN. */
function precioMinuto(): number {
  const v = Number(process.env.OPENAI_PRECIO_TRANSCRIPCION_MIN);
  return process.env.OPENAI_PRECIO_TRANSCRIPCION_MIN !== undefined && Number.isFinite(v) && v >= 0 ? v : 0.006;
}

export const costoTranscripcion = (segundos: number) => Math.round((segundos / 60) * precioMinuto() * 10_000) / 10_000;

const EXTENSIONES: [RegExp, string][] = [
  [/ogg|opus/, "ogg"],
  [/webm/, "webm"],
  [/mpeg|mp3/, "mp3"],
  [/mp4|m4a|aac|x-m4a/, "m4a"],
  [/wav/, "wav"],
  [/flac/, "flac"],
];

/** Extensión del archivo para el modelo; los formatos que no entiende (por ejemplo AMR) se rechazan. */
export function extensionDeAudio(mime: string): string | null {
  const m = mime.toLowerCase();
  for (const [r, ext] of EXTENSIONES) if (r.test(m)) return ext;
  return null;
}

/** Estimado de segundos cuando la API no informa la duración (nota de voz de WhatsApp: ~2 KB por segundo). */
const segundosPorTamano = (bytes: number) => Math.max(1, Math.round(bytes / 2000));

export function crearTranscriptor(client: OpenAI = new OpenAI({ timeout: 60_000, maxRetries: 1 })) {
  return async (datos: Buffer, mime: string): Promise<Transcripcion> => {
    const ext = extensionDeAudio(mime);
    if (!ext) throw new ErrorMedio("no_disponible");
    const res = (await client.audio.transcriptions.create({
      file: await toFile(datos, `audio.${ext}`, { type: mime.split(";")[0] || "audio/ogg" }),
      model: MODELO_TRANSCRIPCION,
      language: "es",
      response_format: "verbose_json",
    })) as { text?: string; duration?: number };
    const segundos = typeof res.duration === "number" && res.duration > 0 ? Math.ceil(res.duration) : segundosPorTamano(datos.length);
    return { texto: (res.text ?? "").trim(), segundos, costoUsd: costoTranscripcion(segundos) };
  };
}
