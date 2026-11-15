import { diaLargo, horaCorta } from "../agenda/formato";
import { fechaIso, fechaLocal, limitesDia, minutosDe, minutosLocales } from "../agenda/tiempo";
import type { Corredor, DatosPlan } from "../datos/tipos";
import type { Dependencias } from "./contexto";
import { conversacionDelCorredor, enviarAlCorredor } from "./corredor";
import { errorSeguro } from "../monitoreo/errores";
import { minutosEntre } from "../agenda/zonas";
import { hayMonto, montoExacto, sumar, type Montos } from "../crm/dinero";
import { comisiones, delMes, mesLocal } from "../crm/ganado";
import { marcarPreguntadasEnPlan } from "../agenda/seguimiento-visitas";

const ESTADO: Record<string, string> = { agendada: "por confirmar", confirmada: "confirmada" };

function lista(nombres: string[], max = 5): string {
  const vistos = nombres.slice(0, max).join(", ");
  return nombres.length > max ? `${vistos} y ${nombres.length - max} más` : vistos;
}

/** "Rosa, Juan y 3 más": los nombres que se muestran y cuántos faltan del total. */
const conResto = (nombres: string[], total: number) =>
  total > nombres.length ? `${nombres.join(", ")} y ${total - nombres.length} más` : nombres.join(", ");

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/**
 * Nombres de clientes, casas y notas vienen de la base o del perfil de WhatsApp: sin `*`, `_`, `~` ni `` ` ``,
 * que WhatsApp tomaría como formato (negrita, cursiva) y emparejaría con los del plan.
 */
export const sinFormato = (t: string) => t.replace(/[*_~`]+/g, " ").replace(/\s{2,}/g, " ").trim();

/** Cuántas visitas de hoy se muestran una por una (cada una ocupa hasta dos líneas); el resto va en "y N más". */
const MAX_VISITAS = 5;
const MAX_AYER = 3;

/**
 * Hora de salida a cada visita de hoy (misma regla que "Qué hacer hoy" en Inicio): la primera desde la zona base del
 * corredor y las demás desde la visita anterior, con el traslado estimado de lib/agenda/zonas.ts. null si no se sabe
 * de dónde sale o a qué zona va.
 */
export function horasDeSalida(
  citas: Pick<DatosPlan["citasHoy"][number], "inicio" | "zona" | "fin">[],
  zonaBase: string | null | undefined,
  zonaHoraria: string,
): (string | null)[] {
  const conArticulo = (hora: string) => `${/^1:/.test(hora) ? "a la" : "a las"} ${hora}`; // "a la 1:40 p. m.", "a las 9:35 a. m."
  return citas.map((c, i) => {
    const antes = citas[i - 1];
    const desde = antes ? (antes.zona ?? null) : (zonaBase ?? null);
    const min = desde ? minutosEntre(desde, c.zona) : null;
    if (min === null || !desde) return null;
    const salida = c.inicio.getTime() - min * 60_000;
    // Si para llegar a tiempo habría que salir antes de que termine la visita anterior, se dice que no da el tiempo.
    if (antes?.fin && salida < antes.fin.getTime()) {
      const tarde = Math.ceil((antes.fin.getTime() - salida) / 60_000);
      return `Sales de la anterior ${conArticulo(horaCorta(antes.fin, zonaHoraria))}: llegas ${tarde} min tarde (${min} min de traslado)`;
    }
    const hora = conArticulo(horaCorta(new Date(salida), zonaHoraria));
    return antes ? `Sal ${hora} (${min} min desde la anterior)` : `Sal de ${desde} ${hora} (${min} min)`;
  });
}

/** "$350.000 · ₡95.000.000": cada moneda por su lado, nunca sumadas. Vacío si no hay montos. */
function porMoneda(m: Montos): string {
  return (["USD", "CRC"] as const)
    .filter((k) => m[k] > 0)
    .map((k) => montoExacto(m[k], k))
    .join(" · ");
}

/** Comisiones de los cierres del mes local de `ahora`, por moneda, y cuántos cierres son. */
function ganadoDelMes(datos: DatosPlan, ahora: Date, zona: string): { cierres: number; montos: Montos } {
  const clave = mesLocal(ahora.toISOString(), zona);
  const delMesActual = clave ? delMes(datos.cierres ?? [], clave, zona, (c) => c.cierre_at) : [];
  return { cierres: delMesActual.length, montos: comisiones(delMesActual) };
}

/**
 * Texto del plan del día (WhatsApp: *negrita*, líneas cortas, unas 25 como máximo). Lo arma el código: ningún dato
 * pasa por el modelo. Cada sección sale solo si tiene algo. Orden: visitas de hoy, lo que hay que hacer (visitas de
 * ayer sin anotar, seguimientos, clientes que no contestan), lo que te espera, el negocio y la pregunta de siempre.
 */
export function armarPlan(corredor: Corredor, datos: DatosPlan, ahora: Date): string {
  const zona = corredor.zona_horaria;
  const l: string[] = [`*Buenos días, ${sinFormato(corredor.nombre_contacto)}.* Tu plan para hoy, ${diaLargo(ahora, zona)}:`, ""];
  const seccion = (lineas: (string | null | false | undefined)[]) => {
    const con = lineas.filter((x): x is string => !!x);
    if (con.length) l.push(...con, "");
  };

  // Visitas de hoy (y cuántas hay mañana).
  const citas = datos.citasHoy ?? [];
  if (citas.length === 0) {
    seccion([
      "Hoy no tienes visitas agendadas.",
      datos.citasManana ? `Mañana tienes ${plural(datos.citasManana, "visita", "visitas")}.` : null,
    ]);
  } else {
    const salidas = horasDeSalida(citas, corredor.zona_base, zona);
    const lineas: string[] = [`*Visitas de hoy (${citas.length})*`];
    citas.slice(0, MAX_VISITAS).forEach((c, i) => {
      const casa = c.propiedad ? ` · ${sinFormato(c.propiedad)}${c.zona && !c.propiedad.includes(c.zona) ? `, ${sinFormato(c.zona)}` : ""}` : "";
      lineas.push(`• ${horaCorta(c.inicio, zona)} · ${sinFormato(c.cliente)}${casa} (${ESTADO[c.estado] ?? c.estado})`);
      if (salidas[i]) lineas.push(`   _${salidas[i]}_`);
    });
    if (citas.length > MAX_VISITAS) lineas.push(`• y ${citas.length - MAX_VISITAS} más en tu agenda`);
    if (datos.citasManana) lineas.push(`Mañana tienes ${plural(datos.citasManana, "visita", "visitas")}.`);
    seccion(lineas);
  }

  // Visitas de ayer que no dicen cómo salieron.
  const ayer = datos.visitasSinResultado ?? [];
  if (ayer.length) {
    seccion([
      `*¿Cómo salieron las de ayer?* Respóndeme y lo anoto.`,
      ...ayer.slice(0, MAX_AYER).map((v) => `• ${horaCorta(v.inicio, zona)} · ${sinFormato(v.cliente)}${v.propiedad ? ` · ${sinFormato(v.propiedad)}` : ""}`),
      ayer.length > MAX_AYER ? `• y ${ayer.length - MAX_AYER} más` : null,
    ]);
  }

  // Para hoy: seguimientos que vencen y clientes que no contestan.
  const seguimientos = datos.seguimientos ?? [];
  const totalSeg = Math.max(datos.seguimientosTotal ?? 0, seguimientos.length);
  const sinRespuesta = (datos.sinRespuesta ?? []).map(sinFormato);
  const nombresSeg = seguimientos.slice(0, 3).map((s) => {
    const nota = s.nota ? sinFormato(s.nota) : "";
    return nota ? `${sinFormato(s.cliente)} (${nota.length > 40 ? `${nota.slice(0, 39)}…` : nota})` : sinFormato(s.cliente);
  });
  seccion([
    (totalSeg > 0 || sinRespuesta.length > 0) && "*Para hoy*",
    totalSeg > 0 && `• Llamar (${totalSeg}): ${conResto(nombresSeg, totalSeg)}`,
    sinRespuesta.length > 0 && `• No contestan hace 3 días: ${lista(sinRespuesta, 3)}`,
  ]);

  // Lo que te espera en el panel.
  const escaladas = (datos.conversacionesEscaladas ?? []).map(sinFormato);
  const dudas = datos.dudasPendientes ?? 0;
  seccion([
    (datos.borradoresPendientes > 0 || escaladas.length > 0 || dudas > 0) && "*Te esperan*",
    datos.borradoresPendientes > 0 && `• ${plural(datos.borradoresPendientes, "respuesta", "respuestas")} por aprobar`,
    escaladas.length > 0 && `• Quieren hablar contigo (${escaladas.length}): ${lista(escaladas, 3)}`,
    dudas > 0 && `• ${plural(dudas, "pregunta que no supe contestar", "preguntas que no supe contestar")}`,
  ]);

  // El negocio: ofertas, lo ganado en el mes, prospectos y dueños nuevos.
  const ofertas = datos.ofertas ?? [];
  const enOferta = sumar(ofertas);
  const ganado = ganadoDelMes(datos, ahora, zona);
  const prospectos = (datos.prospectosNuevos ?? []).map(sinFormato);
  const duenos = datos.duenosNuevos ?? 0;
  seccion([
    (hayMonto(enOferta) || ganado.cierres > 0 || prospectos.length > 0 || duenos > 0) && "*Tu negocio*",
    hayMonto(enOferta) && `• Ofertas en negociación (${ofertas.length}): ${porMoneda(enOferta)}`,
    ganado.cierres > 0 &&
      `• Ganado este mes: ${hayMonto(ganado.montos) ? `${porMoneda(ganado.montos)} (${plural(ganado.cierres, "cierre", "cierres")})` : plural(ganado.cierres, "cierre", "cierres")}`,
    prospectos.length > 0 && `• Prospectos nuevos (${prospectos.length}): ${lista(prospectos, 3)}`,
    duenos > 0 && `• ${plural(duenos, "dueño directo nuevo", "dueños directos nuevos")} esta semana`,
  ]);

  // Todos los días la asistente pregunta por compromisos, para no agendar visitas encima.
  l.push("¿Tienes algún compromiso hoy o mañana? Escríbeme, por ejemplo, «apartar mañana en la tarde» y no agendo visitas ahí.");
  return l.join("\n");
}

/** Largo máximo del resumen de la plantilla (WhatsApp lo muestra en la notificación). */
export const MAX_RESUMEN_PLAN = 300;

/**
 * Resumen en una línea para la plantilla de aviso (fuera de la ventana de 24 horas). Solo cifras: ni nombres de
 * clientes ni montos, porque la notificación se ve fuera del chat. Menos de MAX_RESUMEN_PLAN caracteres.
 */
export function resumenPlan(corredor: Corredor, datos: DatosPlan): string {
  const n = (x: number | undefined) => x ?? 0;
  const seg = Math.max(n(datos.seguimientosTotal), (datos.seguimientos ?? []).length);
  const partes = [
    plural((datos.citasHoy ?? []).length, "visita hoy", "visitas hoy"),
    (datos.visitasSinResultado ?? []).length && plural(datos.visitasSinResultado.length, "visita de ayer por anotar", "visitas de ayer por anotar"),
    seg && `${seg} por llamar`,
    (datos.sinRespuesta ?? []).length && plural(datos.sinRespuesta.length, "cliente sin contestar", "clientes sin contestar"),
    n(datos.borradoresPendientes) && `${datos.borradoresPendientes} por aprobar`,
    (datos.conversacionesEscaladas ?? []).length &&
      plural(datos.conversacionesEscaladas.length, "cliente esperando tu respuesta", "clientes esperando tu respuesta"),
    (datos.prospectosNuevos ?? []).length && plural(datos.prospectosNuevos.length, "prospecto nuevo", "prospectos nuevos"),
    n(datos.duenosNuevos) && plural(datos.duenosNuevos, "dueño nuevo", "dueños nuevos"),
  ].filter((x): x is string => typeof x === "string");
  const armar = (p: string[]) =>
    `Buenos días, ${sinFormato(corredor.nombre_contacto)}. Tu plan de hoy: ${p.join(", ")}. Respóndeme cualquier cosa y te lo mando completo.`;
  // Si no cabe (un nombre de corredor muy largo), se quitan las cifras del final; las visitas siempre quedan.
  while (partes.length > 1 && armar(partes).length > MAX_RESUMEN_PLAN) partes.pop();
  const texto = armar(partes);
  return texto.length > MAX_RESUMEN_PLAN ? `${texto.slice(0, MAX_RESUMEN_PLAN - 1)}…` : texto;
}

export async function datosDelPlan(deps: Pick<Dependencias, "repo">, corredor: Corredor, ahora: Date): Promise<DatosPlan> {
  const zona = corredor.zona_horaria;
  return deps.repo.datosPlan(corredor.id, ahora, limitesDia(ahora, zona), limitesDia(ahora, zona, 1), limitesDia(ahora, zona, -1));
}

export function fechaDelPlan(corredor: Corredor, ahora: Date): string {
  return fechaIso(fechaLocal(ahora, corredor.zona_horaria));
}

/** Cada cuántos minutos corre el cron del plan del día (vercel.json: "0 * * * *"). */
export const PASO_CRON_PLAN = 60;

/**
 * ¿Ya toca mandar el plan (o el resumen por correo) de hoy? Regla: sale en la primera corrida del cron cuya hora
 * local es igual o posterior a la hora elegida; si la hora elegida cae después de la última corrida del día (23:30
 * con el cron de cada hora, 23:46 con el de cada 15 min), sale en esa última corrida, para que nunca se pierda el día.
 * Con cron cada hora: 07:00 → 7:00, 07:30 → 8:00, 23:30 → 23:00. No se duplica: planes_dia y
 * google_conexiones.resumen_enviado_fecha guardan la fecha ya enviada.
 */
export function yaTocaPlan(corredor: Pick<Corredor, "zona_horaria" | "hora_plan_dia">, ahora: Date, pasoMin = PASO_CRON_PLAN): boolean {
  const ultimaCorrida = 24 * 60 - pasoMin;
  const elegida = minutosDe(corredor.hora_plan_dia || "07:00");
  return minutosLocales(ahora, corredor.zona_horaria) >= Math.min(elegida, ultimaCorrida);
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
    if (!yaTocaPlan(corredor, ahora)) continue;
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
      // El plan pregunta por las visitas de ayer: desde ya, la respuesta del corredor se anota en cada una.
      if (entregado !== "nada") await marcarPreguntadasEnPlan(deps, datos);
      if (entregado === "texto") {
        await deps.repo.marcarPlanEnviado(corredor.id, fecha);
        resumen.enviados++;
      } else {
        resumen.avisados++;
      }
    } catch (error) {
      resumen.fallidos++;
      log("error_plan_dia", { corredorId: corredor.id, error: errorSeguro(error) });
    }
  }
  return resumen;
}
