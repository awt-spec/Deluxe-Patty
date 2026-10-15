import { diaLargo, horaCorta } from "../agenda/formato";
import { fechaIso, fechaLocal, limitesDia, minutosDe, minutosLocales } from "../agenda/tiempo";
import type { Corredor, DatosPlan } from "../datos/tipos";
import type { Dependencias } from "./contexto";
import { conversacionDelCorredor, enviarAlCorredor } from "./corredor";

const ESTADO: Record<string, string> = { agendada: "por confirmar", confirmada: "confirmada" };

function lista(nombres: string[], max = 5): string {
  const vistos = nombres.slice(0, max).join(", ");
  return nombres.length > max ? `${vistos} y ${nombres.length - max} más` : vistos;
}

/** Texto del plan del día. Lo arma el código: ningún dato pasa por el modelo. */
export function armarPlan(corredor: Corredor, datos: DatosPlan, ahora: Date): string {
  const zona = corredor.zona_horaria;
  const l: string[] = [`*Buenos días, ${corredor.nombre_contacto}.* Tu plan para hoy, ${diaLargo(ahora, zona)}:`, ""];

  if (datos.citasHoy.length === 0) {
    l.push("*Visitas:* hoy no tienes visitas agendadas.");
  } else {
    l.push(`*Visitas de hoy (${datos.citasHoy.length})*`);
    for (const c of datos.citasHoy) {
      const propiedad = c.propiedad ? ` · ${c.propiedad}` : "";
      l.push(`• ${horaCorta(c.inicio, zona)} · ${c.cliente}${propiedad} (${ESTADO[c.estado] ?? c.estado})`);
    }
  }
  l.push("");

  l.push(
    datos.prospectosNuevos.length
      ? `*Prospectos nuevos (${datos.prospectosNuevos.length}):* ${lista(datos.prospectosNuevos)}`
      : "*Prospectos nuevos:* ninguno en las últimas 24 horas.",
  );
  if (datos.conversacionesEscaladas.length) {
    l.push(`*Te esperan (${datos.conversacionesEscaladas.length}):* ${lista(datos.conversacionesEscaladas)}`);
  }
  if (datos.borradoresPendientes) {
    l.push(`*Respuestas por aprobar:* ${datos.borradoresPendientes}`);
  }
  if (datos.citasManana) {
    l.push(`Mañana tienes ${datos.citasManana} ${datos.citasManana === 1 ? "visita" : "visitas"}.`);
  }
  return l.join("\n");
}

/** Resumen en una línea para la plantilla de aviso (fuera de la ventana de 24 horas). */
export function resumenPlan(corredor: Corredor, datos: DatosPlan): string {
  const partes = [
    `${datos.citasHoy.length} ${datos.citasHoy.length === 1 ? "visita" : "visitas"} hoy`,
    `${datos.prospectosNuevos.length} ${datos.prospectosNuevos.length === 1 ? "prospecto nuevo" : "prospectos nuevos"}`,
  ];
  if (datos.conversacionesEscaladas.length) partes.push(`${datos.conversacionesEscaladas.length} esperando tu respuesta`);
  return `Buenos días, ${corredor.nombre_contacto}. Tu plan de hoy: ${partes.join(", ")}. Respóndeme cualquier cosa y te lo mando completo.`;
}

export async function datosDelPlan(deps: Pick<Dependencias, "repo">, corredor: Corredor, ahora: Date): Promise<DatosPlan> {
  const zona = corredor.zona_horaria;
  return deps.repo.datosPlan(corredor.id, ahora, limitesDia(ahora, zona), limitesDia(ahora, zona, 1));
}

export function fechaDelPlan(corredor: Corredor, ahora: Date): string {
  return fechaIso(fechaLocal(ahora, corredor.zona_horaria));
}

export interface ResumenPlanes {
  enviados: number;
  avisados: number;
  fallidos: number;
}

/**
 * Genera y manda el plan del día a cada corredor cuya hora ya llegó. Corre cada hora (Vercel Cron);
 * planes_dia evita duplicados. Si el corredor no ha escrito en 24 horas, WhatsApp no deja mandar texto
 * libre: le llega un resumen por plantilla y el plan completo en cuanto responda.
 */
export async function enviarPlanes(deps: Dependencias): Promise<ResumenPlanes> {
  const ahora = deps.ahora?.() ?? new Date();
  const log = deps.registrar ?? ((evento, datos) => console.info(JSON.stringify({ evento, ...datos })));
  const resumen = { enviados: 0, avisados: 0, fallidos: 0 };

  for (const corredor of await deps.repo.corredoresActivos()) {
    if (minutosLocales(ahora, corredor.zona_horaria) < minutosDe(corredor.hora_plan_dia)) continue;
    const fecha = fechaDelPlan(corredor, ahora);
    try {
      const datos = await datosDelPlan(deps, corredor, ahora);
      const texto = armarPlan(corredor, datos, ahora);
      if (!(await deps.repo.guardarPlan(corredor.id, fecha, texto))) continue;

      const conversacion = await conversacionDelCorredor(deps, corredor);
      const entregado = await enviarAlCorredor(deps, corredor, conversacion, texto, {
        plantillaSiCerrada: resumenPlan(corredor, datos),
        ahora,
      });
      if (entregado === "texto") {
        await deps.repo.marcarPlanEnviado(corredor.id, fecha);
        resumen.enviados++;
      } else {
        resumen.avisados++;
      }
    } catch (error) {
      resumen.fallidos++;
      log("error_plan_dia", { corredorId: corredor.id, error: String(error) });
    }
  }
  return resumen;
}
