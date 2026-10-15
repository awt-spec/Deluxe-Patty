import { prepararAnuncio } from "../anuncios/preparar";
import { DIAS_REPORTE, armarReporte } from "../anuncios/reporte";
import type { Conversacion, Corredor } from "../datos/tipos";
import type { MensajeEntrante } from "../whatsapp/parsear";
import { RechazoModelo } from "./cerebro";
import { Contexto, type Dependencias } from "./contexto";
import { armarPlan, datosDelPlan, fechaDelPlan } from "./plan";

const VENTANA_MS = 24 * 60 * 60_000 - 10 * 60_000; // 10 minutos de margen

export type ResultadoCorredor =
  | { tipo: "duplicado" }
  | {
      tipo: "corredor";
      accion: "plan" | "plan_pendiente" | "analisis" | "anuncio" | "reporte" | "ayuda" | "error";
    };

export async function conversacionDelCorredor(deps: Pick<Dependencias, "repo">, corredor: Corredor) {
  const contacto = await deps.repo.contactoCorredor(corredor.id, corredor.whatsapp_corredor!);
  return deps.repo.conversacionActiva(corredor.id, contacto.id);
}

/**
 * Le escribe al corredor en su conversación con la asistente. Dentro de la ventana de 24 horas va
 * como texto libre; fuera, solo se puede mandar la plantilla de aviso (si se da `plantillaSiCerrada`).
 */
export async function enviarAlCorredor(
  deps: Dependencias,
  corredor: Corredor,
  conversacion: Conversacion,
  texto: string,
  opciones: { plantillaSiCerrada?: string; ahora?: Date } = {},
): Promise<"texto" | "plantilla" | "nada"> {
  const ahora = opciones.ahora ?? deps.ahora?.() ?? new Date();
  const ultimo = await deps.repo.ultimoMensajeDe(corredor.id, conversacion.contacto_id);
  const abierta = !!ultimo && ahora.getTime() - ultimo.getTime() < VENTANA_MS;
  const destino = corredor.whatsapp_corredor!;
  const phoneNumberId = corredor.whatsapp_phone_number_id!;

  let waId: string;
  let enviado: string;
  if (abierta) {
    waId = await deps.whatsapp.texto(phoneNumberId, destino, texto);
    enviado = texto;
  } else if (opciones.plantillaSiCerrada) {
    waId = await deps.whatsapp.plantilla(phoneNumberId, destino, deps.plantillaAviso, [opciones.plantillaSiCerrada]);
    enviado = opciones.plantillaSiCerrada;
  } else {
    return "nada";
  }
  await deps.repo.guardarMensaje({
    corredor_id: corredor.id,
    conversacion_id: conversacion.id,
    direccion: "saliente",
    autor: "asistente",
    tipo: abierta ? "texto" : "plantilla",
    contenido: enviado,
    wa_message_id: waId,
    estado_entrega: "enviado",
  });
  await deps.repo.registrarUso(corredor.id, { mensajesSalientes: 1 });
  return abierta ? "texto" : "plantilla";
}

const AYUDA =
  "Puedo analizarte una propiedad o una oferta: mándame el enlace de Encuentra24 o los datos (precio, metros, zona). " +
  'Escribe "plan" para tu plan del día, "anuncio" y el código de una propiedad para prepararte el anuncio, ' +
  'o "reporte" para ver qué anuncios te traen contactos.';

/** Mensajes que el corredor le manda a su asistente desde su número personal. */
export async function procesarMensajeCorredor(
  deps: Dependencias,
  corredor: Corredor,
  entrante: MensajeEntrante,
): Promise<ResultadoCorredor> {
  const { repo } = deps;
  const log = deps.registrar ?? ((evento, datos) => console.info(JSON.stringify({ evento, ...datos })));
  const ahora = deps.ahora?.() ?? new Date();

  const conversacion = await conversacionDelCorredor(deps, corredor);
  const mensajeId = await repo.guardarMensaje({
    corredor_id: corredor.id,
    conversacion_id: conversacion.id,
    direccion: "entrante",
    autor: "cliente",
    tipo: entrante.tipo,
    contenido: entrante.texto,
    wa_message_id: entrante.waMessageId,
  });
  if (mensajeId === null) return { tipo: "duplicado" };
  await repo.actualizarConversacion(corredor.id, conversacion.id, {
    ultimo_mensaje_cliente_at: entrante.timestamp.toISOString(),
  });

  // Contexto para contar uso y disparar el aviso de tope; nunca para responder como a un cliente.
  const ctx = new Contexto(deps, corredor, conversacion, corredor.whatsapp_corredor!, log);
  await ctx.uso({ mensajesEntrantes: 1 });
  const responder = (texto: string) => enviarAlCorredor(deps, corredor, conversacion, texto, { ahora });

  // Al escribir, el corredor abre la ventana: si su plan de hoy estaba esperando, sale primero,
  // armado de nuevo porque pudo generarse horas antes.
  const fecha = fechaDelPlan(corredor, ahora);
  const pendiente = await repo.planPendiente(corredor.id, fecha);
  const texto = entrante.texto?.trim() ?? "";
  if (pendiente !== null) {
    await responder(armarPlan(corredor, await datosDelPlan(deps, corredor, ahora), ahora));
    await repo.marcarPlanEnviado(corredor.id, fecha);
  }
  // Lo demás que esperaba la ventana (por ejemplo la lista semanal de dueños).
  const envios = await repo.enviosPendientes(corredor.id);
  for (const envio of envios) {
    if (await repo.marcarEnvioEntregado(corredor.id, envio.id)) await responder(envio.contenido);
  }
  // Una respuesta corta al aviso ("ok", "dale") no es un pedido de análisis.
  if ((pendiente !== null || envios.length > 0) && !/https?:\/\/|\d/.test(texto)) {
    return { tipo: "corredor", accion: "plan_pendiente" };
  }

  if (/^plan\b/i.test(texto)) {
    await responder(armarPlan(corredor, await datosDelPlan(deps, corredor, ahora), ahora));
    return { tipo: "corredor", accion: "plan" };
  }

  if (/^(reporte|anuncios)\b/i.test(texto)) {
    const desde = new Date(ahora.getTime() - DIAS_REPORTE * 24 * 60 * 60_000);
    await responder(armarReporte(await repo.reporteAnuncios(corredor.id, desde), fecha));
    return { tipo: "corredor", accion: "reporte" };
  }

  const pedidoAnuncio = /^anuncio\s+(?:de\s+)?(\S+)/i.exec(texto);
  if (pedidoAnuncio) {
    try {
      const listo = await prepararAnuncio(deps, corredor, pedidoAnuncio[1]);
      if (listo.consumo) await ctx.usoClaude(1, listo.consumo);
      for (const m of listo.mensajes) await responder(m);
      return { tipo: "corredor", accion: "anuncio" };
    } catch (error) {
      if (error instanceof RechazoModelo) await ctx.usoClaude(1, error.consumo);
      log("error_anuncio", { corredorId: corredor.id, error: error instanceof Error ? error.name : "desconocido" });
      await responder("No pude preparar el anuncio ahora. Inténtalo de nuevo en un rato.");
      return { tipo: "corredor", accion: "error" };
    }
  }

  if (!texto) {
    await responder(`Por ahora solo leo texto y enlaces. ${AYUDA}`);
    return { tipo: "corredor", accion: "ayuda" };
  }

  const historial = (await repo.historial(corredor.id, conversacion.id, 11)).filter((m) => m.id !== mensajeId);
  try {
    const propiedades = await repo.propiedadesActivas(corredor.id);
    const analisis = await deps.cerebro.analizar(corredor, propiedades, historial, texto);
    await ctx.usoClaude(1, analisis.consumo);
    await responder(analisis.texto);
    return { tipo: "corredor", accion: "analisis" };
  } catch (error) {
    if (error instanceof RechazoModelo) await ctx.usoClaude(1, error.consumo);
    log("error_analisis", { corredorId: corredor.id, error: error instanceof Error ? error.name : "desconocido" });
    await responder("No pude hacer el análisis ahora. Inténtalo de nuevo en un rato o pégame los datos en el mensaje.");
    return { tipo: "corredor", accion: "error" };
  }
}
