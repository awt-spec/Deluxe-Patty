import type { Dependencias } from "../asistente/procesar";
import { conPunto, etiquetaHorario } from "./formato";
import { errorSeguro } from "../monitoreo/errores";
import { avisarAlCorredor } from "../asistente/contexto";
import { codigoWhatsApp, esErrorDeConfiguracion, esErrorTransitorio, ErrorWhatsApp, porQueNoLlego } from "../whatsapp/enviar";

const HORA = 60 * 60_000;

export interface ResumenRecordatorios {
  enviados: number;
  fallidos: number;
}

/**
 * Manda el recordatorio de las visitas de las próximas 24 horas. Corre cada hora (Vercel Cron).
 * Solo recuerda citas agendadas con más de un día y medio de anticipación: a las demás no se les
 * prometió recordatorio al confirmarlas.
 *
 * Sale también en piloto en sombra (respuesta_automatica = false): es una plantilla fija armada por el código, y en
 * sombra una cita solo existe si el corredor la aprobó o la agendó él. Si el envío falla por algo pasajero, la cita se
 * desmarca y la próxima corrida lo reintenta; si falla por algo permanente, se le avisa al corredor para que le
 * escriba él (y, si es la cuenta o la plantilla, a soporte).
 */
export async function enviarRecordatorios(
  deps: Pick<Dependencias, "repo" | "whatsapp" | "plantillaRecordatorio" | "registrar" | "ahora"> &
    Partial<Pick<Dependencias, "plantillaAviso">>,
): Promise<ResumenRecordatorios> {
  const ahora = deps.ahora?.() ?? new Date();
  const log = deps.registrar ?? ((evento, datos) => console.info(JSON.stringify({ evento, ...datos })));
  const citas = await deps.repo.citasParaRecordar(new Date(ahora.getTime() + 2 * HORA), new Date(ahora.getTime() + 24 * HORA));

  const resumen = { enviados: 0, fallidos: 0 };
  for (const cita of citas) {
    if (cita.inicio.getTime() - cita.creada.getTime() < 36 * HORA) continue;
    // Se marca antes de enviar: si dos ejecuciones se cruzan, solo una manda el recordatorio.
    if (!(await deps.repo.marcarRecordatorio(cita.corredor_id, cita.id))) continue;

    const cuando = etiquetaHorario(cita.inicio, cita.zona_horaria);
    const propiedad = cita.propiedad_titulo ?? "la propiedad";
    try {
      const waId = await deps.whatsapp.plantilla(cita.phone_number_id, cita.telefono, deps.plantillaRecordatorio, [
        cita.nombre_contacto,
        cuando,
        propiedad,
      ]);
      const conversacionId =
        cita.conversacion_id ?? (await deps.repo.conversacionActiva(cita.corredor_id, cita.contacto_id)).id;
      await deps.repo.guardarMensaje({
        corredor_id: cita.corredor_id,
        conversacion_id: conversacionId,
        direccion: "saliente",
        autor: "sistema",
        tipo: "plantilla",
        contenido: conPunto(`Recordatorio de visita con ${cita.nombre_contacto} el ${cuando} para ver ${propiedad}`),
        wa_message_id: waId,
        estado_entrega: "enviado",
      });
      await deps.repo.registrarUso(cita.corredor_id, { mensajesSalientes: 1 });
      resumen.enviados++;
    } catch (error) {
      resumen.fallidos++;
      const codigo = codigoWhatsApp(error);
      log("error_recordatorio", { corredorId: cita.corredor_id, citaId: cita.id, codigo, error: errorSeguro(error) });
      if (esErrorDeConfiguracion(codigo, error instanceof ErrorWhatsApp ? error.status : undefined)) {
        log("error_whatsapp_config", { corredorId: cita.corredor_id, codigo });
      }
      if (esErrorTransitorio(error) && deps.repo.desmarcarRecordatorio) {
        await deps.repo.desmarcarRecordatorio(cita.corredor_id, cita.id).catch((e: unknown) =>
          log("error_recordatorio", { corredorId: cita.corredor_id, citaId: cita.id, error: errorSeguro(e) }),
        );
      } else if (deps.plantillaAviso && cita.whatsapp_corredor) {
        const quien = cita.nombre_cliente ? `${cita.nombre_cliente} (${cita.telefono})` : cita.telefono;
        await avisarAlCorredor(
          { repo: deps.repo, whatsapp: deps.whatsapp, plantillaAviso: deps.plantillaAviso },
          { id: cita.corredor_id, whatsapp_corredor: cita.whatsapp_corredor, whatsapp_phone_number_id: cita.phone_number_id, activo: true },
          `No le pude mandar a ${quien} el recordatorio de la visita del ${cuando}: ${porQueNoLlego(codigo)}. Escríbele tú para confirmarla.`,
          log,
        );
      }
    }
  }
  return resumen;
}

