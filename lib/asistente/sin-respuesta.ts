import { avisarAlCorredor, diaDelCorredor, unaVez, type Dependencias } from "./contexto";
import { errorSeguro } from "../monitoreo/errores";
import { armarAviso } from "../whatsapp/formato";

// Red de seguridad: si la función se corta (maxDuration) después de guardar el mensaje de un cliente y antes de
// contestarle, Meta ya recibió su 200 y no reintenta. Cada hora (cron de recordatorios) se buscan chats abiertos de
// la asistente cuyo último mensaje es del cliente, de hace más de 10 minutos y menos de 24 horas, y se le avisa al
// corredor (una vez por chat y día, la misma clave que el aviso de los topes) y a soporte.

const MINUTO = 60_000;

export async function avisarSinRespuesta(
  deps: Pick<Dependencias, "repo" | "whatsapp" | "plantillaAviso" | "registrar" | "ahora">,
): Promise<{ avisados: number }> {
  const log = deps.registrar ?? ((evento, datos) => console.info(JSON.stringify({ evento, ...datos })));
  const ahora = deps.ahora?.() ?? new Date();
  if (!deps.repo.sinRespuesta) return { avisados: 0 };
  let avisados = 0;
  for (const corredor of await deps.repo.corredoresActivos()) {
    try {
      const chats = await deps.repo.sinRespuesta(corredor.id, new Date(ahora.getTime() - 24 * 60 * MINUTO), new Date(ahora.getTime() - 10 * MINUTO));
      if (chats.length) log("error_mensaje_sin_respuesta", { corredorId: corredor.id, cantidad: chats.length });
      for (const chat of chats) {
        const clave = `sin_contestar:${corredor.id}:${chat.conversacion_id}:${diaDelCorredor(corredor, ahora)}`;
        if (!(await unaVez(deps, clave, 24 * 60, log, corredor.id))) continue;
        const ok = await avisarAlCorredor(
          deps,
          corredor,
          armarAviso({
            titulo: `${corredor.nombre_asistente || "La asistente"} no alcanzó a contestarle a ${chat.nombre?.trim() || "un cliente"}`,
            queHacer: "el chat queda para ti: revísalo en el panel",
            telefono: chat.telefono,
          }),
          log,
        );
        if (ok) avisados++;
      }
    } catch (e) {
      log("error_sin_respuesta", { corredorId: corredor.id, error: errorSeguro(e) });
    }
  }
  return { avisados };
}
