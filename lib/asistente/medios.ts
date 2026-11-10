import type { Corredor } from "../datos/tipos";
import { errorSeguro } from "../monitoreo/errores";
import { ErrorMedio, LIMITE_AUDIO, LIMITE_IMAGEN, LIMITE_PDF } from "../whatsapp/media";
import type { MensajeEntrante } from "../whatsapp/parsear";
import type { Adjunto } from "./cerebro";
import type { Dependencias } from "./contexto";
import { SIN_PRESUPUESTO, hayPresupuestoHoy } from "./limites";

// Archivos que llegan por WhatsApp: la nota de voz se pasa a texto y la foto o el PDF se lee con Claude. Sin la
// llave que haga falta (WhatsApp, OpenAI) o con un archivo que no se puede leer, el flujo cae al aviso de siempre.
// El contenido de los archivos nunca va a los registros: son datos personales (Ley 8968).

export type MotivoMedio = "sin_llave" | "muy_grande" | "no_disponible" | "formato" | "video" | "sin_presupuesto" | "sin_texto";

export type LecturaMedio =
  | { ok: true; clase: "audio"; texto: string }
  | { ok: true; clase: "imagen" | "documento"; adjunto: Adjunto }
  | { ok: false; motivo: MotivoMedio };

const IMAGENES: Record<string, Adjunto["mediaType"]> = {
  "image/jpeg": "image/jpeg",
  "image/jpg": "image/jpeg",
  "image/png": "image/png",
  "image/webp": "image/webp",
  "image/gif": "image/gif",
};

/** Lee el archivo del mensaje: nota de voz a texto, foto o PDF a un adjunto para Claude. */
export async function leerMedio(deps: Dependencias, corredor: Corredor, entrante: MensajeEntrante): Promise<LecturaMedio> {
  const media = entrante.media;
  if (!media) return { ok: false, motivo: "no_disponible" };
  if (media.clase === "video") return { ok: false, motivo: "video" };
  if (!deps.medios) return { ok: false, motivo: "sin_llave" };
  const mime = media.mime.split(";")[0].trim().toLowerCase();

  // Formato antes de bajar nada: Word, Excel, etc. por WhatsApp no se leen.
  const mediaType = IMAGENES[mime];
  if (media.clase === "imagen" && !mediaType) return { ok: false, motivo: "formato" };
  if (media.clase === "documento" && mime !== "application/pdf") return { ok: false, motivo: "formato" };
  // Cada lectura cuesta IA: con el tope de gasto alcanzado no se hace.
  if (!(await hayPresupuestoHoy(deps.repo, corredor))) return { ok: false, motivo: "sin_presupuesto" };

  try {
    if (media.clase === "audio") {
      const { datos, mime: mimeReal } = await deps.medios.descargar(media.id, LIMITE_AUDIO);
      const t = await deps.medios.transcribir(datos, mimeReal || media.mime);
      // El costo se suma aunque la transcripción salga vacía: ya se pagó.
      await deps.repo.registrarAudio(corredor.id, t.segundos, t.costoUsd);
      if (!t.texto) return { ok: false, motivo: "sin_texto" };
      return { ok: true, clase: "audio", texto: t.texto.slice(0, 4000) };
    }
    const limite = media.clase === "imagen" ? LIMITE_IMAGEN : LIMITE_PDF;
    const { datos } = await deps.medios.descargar(media.id, limite);
    const adjunto: Adjunto =
      media.clase === "imagen"
        ? { tipo: "imagen", mediaType: mediaType!, datos: datos.toString("base64"), nombre: "foto" }
        : { tipo: "pdf", mediaType: "application/pdf", datos: datos.toString("base64"), nombre: (media.nombre ?? "documento.pdf").slice(0, 100) };
    return { ok: true, clase: media.clase, adjunto };
  } catch (e) {
    if (e instanceof ErrorMedio) return { ok: false, motivo: e.razon };
    (deps.registrar ?? (() => {}))("error_medio", { corredorId: corredor.id, error: errorSeguro(e) });
    return { ok: false, motivo: "no_disponible" };
  }
}

/** Lo que se le dice a Patricia cuando no se pudo leer lo que mandó. */
export function mensajeMedioCorredor(motivo: MotivoMedio, nombreAsistente: string): string {
  switch (motivo) {
    case "video":
      return `Los videos no los puedo ver por WhatsApp. Súbelo al chat de ${nombreAsistente} en el panel (Más → ${nombreAsistente}): ahí saco fotogramas del video y lo analizo.`;
    case "formato":
      return `Por WhatsApp solo leo fotos y PDF. Si es un Word o un Excel, súbelo al chat de ${nombreAsistente} en el panel.`;
    case "muy_grande":
      return "Ese archivo pesa demasiado para leerlo por aquí. Mándame uno más liviano (una nota de voz de unos minutos, una foto o un PDF corto).";
    case "sin_llave":
      return "Todavía no puedo leer ni escuchar archivos por WhatsApp (falta activarlo). Escríbemelo o súbelo al chat del panel.";
    case "sin_presupuesto":
      return SIN_PRESUPUESTO;
    case "sin_texto":
      return "No logré entender el audio. ¿Me lo puedes escribir?";
    default:
      return "No pude abrir ese archivo. Mándalo otra vez o escríbemelo.";
  }
}

/** Cómo se llama el archivo cuando hay que avisarle al corredor que no se pudo leer. */
export const NOMBRE_CLASE: Record<NonNullable<MensajeEntrante["media"]>["clase"], string> = {
  audio: "una nota de voz",
  imagen: "una foto",
  documento: "un documento",
  video: "un video",
};
