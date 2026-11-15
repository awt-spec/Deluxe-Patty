import type { Dependencias } from "../asistente/contexto";
import { conversacionDelCorredor, enviarAlCorredor } from "../asistente/corredor";
import type { CitaTerminada } from "../datos/repositorio";
import type { Corredor, EstadoCita } from "../datos/tipos";
import { errorSeguro } from "../monitoreo/errores";
import { pideApartarLibre } from "./apartar-ia";
import { pideBloqueo } from "./bloquear";
import { horaCorta } from "./formato";
import { fechaIso, fechaLocal, minutosLocales, sumarDias } from "./tiempo";

// Seguimiento de cada visita: un rato después de que termina, la asistente le pregunta al corredor por WhatsApp
// cómo le fue (una sola vez por visita, `reclamar_alerta('seguimiento_visita:<cita>')`). Lo que el corredor
// responda (texto o nota de voz ya transcrita) queda en la Historia del cliente y la visita pasa a hecha, o a
// "no llegó" / cancelada si lo dice; eso lo detecta el código, no el modelo. "Ya respondido" es la visita que dejó
// de estar agendada o confirmada (no hace falta otra marca). Todo filtra por corredor_id.

const MINUTO = 60_000;
const HORA = 60 * MINUTO;
/** La pregunta sale desde 30 minutos después del fin y hasta 18 horas después (si cae de noche, a la mañana). */
export const ESPERA_TRAS_VISITA_MS = 30 * MINUTO;
export const LIMITE_PREGUNTA_MS = 18 * HORA;
/** La respuesta se toma como resumen durante 36 horas desde que se preguntó: así también vale la que llega después del plan de la mañana, que vuelve a preguntar por las de ayer. */
export const VIGENCIA_PREGUNTA_MS = 36 * HORA;
/** Solo se pregunta entre las 7:00 y las 21:00 en la zona del corredor. */
const DESDE_MIN = 7 * 60;
const HASTA_MIN = 21 * 60;
/** La clave nunca se vuelve a reclamar: un año de ventana. */
const UNA_VEZ_MIN = 365 * 24 * 60;

export const claveSeguimiento = (citaId: string) => `seguimiento_visita:${citaId}`;

function primerNombre(nombre: string | null): string | null {
  const n = nombre?.trim().split(/\s+/)[0];
  return n ? n : null;
}

/** "la visita de las 3:00 p. m. con Robert Miller (Casa X)" */
function deLaVisita(cita: CitaTerminada, zona: string, conNombre: boolean): string {
  const con = conNombre && cita.cliente?.trim() ? ` con ${cita.cliente.trim()}` : "";
  const casa = cita.propiedad ? ` (${cita.propiedad})` : "";
  return `la visita de las ${horaCorta(cita.inicio, zona)}${con}${casa}`;
}

export function preguntaSeguimiento(cita: CitaTerminada, zona: string): string {
  return (
    `¿Cómo te fue en ${deLaVisita(cita, zona, true)}? Cuéntame en un mensaje o nota de voz y lo anoto en su historia. ` +
    "Si no se hizo, respóndeme «no vino» o «se canceló»."
  );
}

/** Para la plantilla (ventana de 24 horas cerrada): corta y sin el nombre del cliente. */
export function avisoSeguimiento(cita: CitaTerminada, zona: string): string {
  return `Tu visita de las ${horaCorta(cita.inicio, zona)} ya terminó. Respóndeme cómo te fue y lo anoto en la historia del cliente.`;
}

export interface ResumenSeguimiento {
  preguntadas: number;
  fallidos: number;
}

/** Corre cada hora junto con los recordatorios (`/api/cron/recordatorios`). */
export async function preguntarPorVisitas(deps: Dependencias): Promise<ResumenSeguimiento> {
  const ahora = deps.ahora?.() ?? new Date();
  const log = deps.registrar ?? ((evento, datos) => console.info(JSON.stringify({ evento, ...datos })));
  const resumen = { preguntadas: 0, fallidos: 0 };

  for (const corredor of await deps.repo.corredoresActivos()) {
    // La demo (corredor inactivo) nunca manda nada; sin número del corredor no hay a quién preguntarle.
    if (corredor.activo === false || !corredor.whatsapp_corredor || !corredor.whatsapp_phone_number_id) continue;
    const minutos = minutosLocales(ahora, corredor.zona_horaria);
    if (minutos < DESDE_MIN || minutos >= HASTA_MIN) continue;
    try {
      const citas = await deps.repo.citasTerminadas(
        corredor.id,
        new Date(ahora.getTime() - LIMITE_PREGUNTA_MS),
        new Date(ahora.getTime() - ESPERA_TRAS_VISITA_MS),
      );
      // De la más vieja a la más nueva, para que la última pregunta del chat sea la última visita.
      for (const cita of [...citas].reverse()) {
        // Se reclama antes de enviar: si dos corridas se cruzan, solo una pregunta.
        if (!(await deps.repo.reclamarAlerta(claveSeguimiento(cita.id), UNA_VEZ_MIN))) continue;
        try {
          const conversacion = await conversacionDelCorredor(deps, corredor);
          await enviarAlCorredor(deps, corredor, conversacion, preguntaSeguimiento(cita, corredor.zona_horaria), {
            plantillaSiCerrada: avisoSeguimiento(cita, corredor.zona_horaria),
            ahora,
          });
          resumen.preguntadas++;
        } catch (error) {
          resumen.fallidos++;
          log("error_seguimiento_visita", { corredorId: corredor.id, citaId: cita.id, error: errorSeguro(error) });
        }
      }
    } catch (error) {
      resumen.fallidos++;
      log("error_seguimiento_visita", { corredorId: corredor.id, error: errorSeguro(error) });
    }
  }
  return resumen;
}

/** Visitas preguntadas dentro de la vigencia (36 horas) que siguen sin resultado, la última preguntada primero. */
export async function seguimientosPendientes(
  deps: Pick<Dependencias, "repo">,
  corredor: Corredor,
  ahora: Date,
): Promise<CitaTerminada[]> {
  const citas = await deps.repo.citasTerminadas(
    corredor.id,
    new Date(ahora.getTime() - LIMITE_PREGUNTA_MS - VIGENCIA_PREGUNTA_MS),
    ahora,
  );
  if (citas.length === 0) return [];
  const preguntadas = await deps.repo.alertasReclamadas(citas.map((c) => claveSeguimiento(c.id)));
  const desde = ahora.getTime() - VIGENCIA_PREGUNTA_MS;
  return citas
    .flatMap((c) => {
      const cuando = preguntadas.get(claveSeguimiento(c.id));
      return cuando && cuando.getTime() >= desde ? [{ cita: c, cuando: cuando.getTime() }] : [];
    })
    .sort((a, b) => b.cuando - a.cuando || b.cita.fin.getTime() - a.cita.fin.getTime())
    .map((x) => x.cita);
}

const COMANDO = /^(plan|reporte|anuncios?|fotos|ficha|ayuda)\b/i;
/** Pedidos de análisis o preguntas sin "¿": van a la asistente, no a la historia. */
const PEDIDO = /^(anal[ií]za(me|la|lo)?|qu[eé] (opinas|piensas|te parece)|cu[aá]nto|dime|expl[ií]ca(me)?|ay[uú]dame|necesito|busca(me)?|compara)\b/i;
const ENLACE = /https?:\/\/|www\./i;
/** "ok", "dale", "gracias": acuse de otro aviso (por ejemplo el plan del día), no el resumen de la visita. */
const ACUSE = /^(ok(ay|is)?|dale|listo|gracias|muchas gracias|va|vale|perfecto|bueno|s[ií]|claro|de acuerdo|entendido)[\s.!¡]*$/i;

/**
 * ¿El mensaje del corredor puede ser el resumen de una visita? No si es un comando, un enlace (va al análisis),
 * una pregunta ("¿cuánto vale…?"), un acuse corto o viene con foto o documento.
 */
export function puedeSerResumen(texto: string, conAdjuntos: boolean): boolean {
  const t = texto.trim();
  if (conAdjuntos || t.length < 2) return false;
  if (COMANDO.test(t) || PEDIDO.test(t) || ENLACE.test(t) || t.startsWith("¿")) return false;
  if (ACUSE.test(t)) return false;
  if (pideBloqueo(t) || pideApartarLibre(t)) return false;
  return true;
}

/** Lo dice el código: cancelada, no llegó o (por defecto) se hizo. */
export function resultadoDeVisita(texto: string): Extract<EstadoCita, "realizada" | "no_asistio" | "cancelada"> {
  const t = texto.toLowerCase();
  // Sin \b al final: en JavaScript "ó" no cuenta como letra para \b.
  if (/\b(se cancel[oó]|la cancel(aron|[oó]|amos|[eé])|cancelad[ao]|no se hizo|se suspendi[oó]|la pospus|se pospuso)/.test(t)) {
    return "cancelada";
  }
  if (/\bno (vino|lleg[oó](?! a tiempo)|se present[oó]|apareci[oó]|asisti[oó])|\bnadie (vino|lleg[oó])|\bme dej[oó] plantad[ao]/.test(t)) {
    return "no_asistio";
  }
  return "realizada";
}

/**
 * Si hay una visita preguntada esperando respuesta y el mensaje sirve como resumen, lo anota y devuelve la
 * confirmación para el corredor (armada por el código). null: el mensaje sigue su camino normal.
 */
export async function anotarSeguimiento(
  deps: Pick<Dependencias, "repo">,
  corredor: Corredor,
  texto: string,
  conAdjuntos: boolean,
  ahora: Date,
): Promise<string | null> {
  if (!puedeSerResumen(texto, conAdjuntos)) return null;
  const pendientes = await seguimientosPendientes(deps, corredor, ahora);
  const cita = pendientes[0];
  if (!cita) return null;

  const estado = resultadoDeVisita(texto);
  if (!(await deps.repo.cambiarEstadoCita(corredor.id, cita.id, estado))) return null;

  const zona = corredor.zona_horaria;
  const deLaCasa = cita.propiedad ? ` a ${cita.propiedad}` : "";
  const historia = {
    realizada: `Fue a ver la casa${cita.propiedad ? ` ${cita.propiedad}` : ""}`,
    no_asistio: `No llegó a la visita${deLaCasa}`,
    cancelada: `Visita${deLaCasa} de las ${horaCorta(cita.inicio, zona)} cancelada`,
  }[estado];
  await deps.repo.anotarActividad(corredor.id, cita.contacto_id, "visita", historia, "asistente");
  // Lo que contó el corredor, con sus palabras (salvo un "no vino" pelado, que ya dice la línea de arriba).
  const limpio = texto.trim();
  if (estado === "realizada" || limpio.length > 25) {
    const nota = `Cómo fue la visita: ${limpio}`;
    await deps.repo.anotarActividad(corredor.id, cita.contacto_id, "nota", nota.length > 500 ? `${nota.slice(0, 499)}…` : nota, "corredor");
  }

  let recordatorio = false;
  if (estado === "realizada") {
    const manana = fechaIso(sumarDias(fechaLocal(ahora, zona), 1));
    recordatorio = await deps.repo.ponerSeguimiento(
      corredor.id,
      cita.contacto_id,
      manana,
      `Preguntarle qué le pareció ${cita.propiedad ?? "la casa"}`,
    );
  }

  const quien = primerNombre(cita.cliente);
  const deQuien = quien ? `de ${quien}` : "del cliente";
  const cual = pendientes.length > 1 ? ` (visita de las ${horaCorta(cita.inicio, zona)}${deLaCasa})` : "";
  const partes = [
    {
      realizada: `Listo, lo anoté en la historia ${deQuien}${cual}.`,
      no_asistio: `Anotado: no llegó a ${deLaVisita(cita, zona, false)}. Lo dejé en la historia ${deQuien}.`,
      cancelada: `Anotado: ${deLaVisita(cita, zona, false)} quedó cancelada. Lo dejé en la historia ${deQuien}.`,
    }[estado],
  ];
  if (recordatorio) partes.push("Mañana te recuerdo darle seguimiento.");
  const otra = pendientes[1];
  if (otra) partes.push(`Todavía me falta saber cómo te fue en ${deLaVisita(otra, zona, true)}.`);
  return partes.join(" ");
}
