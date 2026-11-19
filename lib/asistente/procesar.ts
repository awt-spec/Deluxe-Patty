import { extraerReferencia } from "../anuncios/atribucion";
import { avanzarEtapa, buscaVacia, fusionarBusca, type Etapa } from "../crm/perfil";
import type { Corredor, Intencion, Mensaje } from "../datos/tipos";
import type { EstadoEntrega, MensajeEntrante } from "../whatsapp/parsear";
import { flujoAgenda } from "./agenda";
import { procesarMensajeCorredor, type ResultadoCorredor } from "./corredor";
import { RechazoModelo } from "./cerebro";
import { esFallaDeConfiguracion, registrarFallaIA } from "./falla-ia";
import { Contexto, avisarAlCorredor, unaVez, type Dependencias } from "./contexto";
import { mismoTelefono, telefonoE164 } from "../whatsapp/telefono";
import { esErrorDeConfiguracion, explicarCodigoWhatsApp, porQueNoLlego } from "../whatsapp/enviar";
import { armarAviso } from "../whatsapp/formato";
import { SIN_CONSUMO, sumar, type Consumo } from "./costo";
import { errorSeguro } from "../monitoreo/errores";
import { MAX_MENSAJES_CLIENTE_HORA, frenoCliente, type Freno } from "./limites";
import { NOMBRE_CLASE, leerMedio } from "./medios";
import { mandarFotosDeCasa } from "./fotos-casa";

export type { Dependencias } from "./contexto";

export type Resultado =
  | { tipo: "corredor_desconocido" }
  | { tipo: "duplicado" }
  | { tipo: "sin_respuesta"; motivo: "control_corredor" | "escalada" | "no_legible" | "agrupado" | Freno }
  | { tipo: "escalado"; intencion: Intencion | null }
  | { tipo: "respondido"; intencion: Intencion; borrador: boolean }
  | { tipo: "agenda"; accion: string; borrador: boolean }
  | ResultadoCorredor;

const MENSAJES_HISTORIAL = 20;

const DESCRIPCION_TIPO: Record<MensajeEntrante["tipo"], string> = {
  texto: "un mensaje",
  imagen: "una imagen",
  audio: "un audio",
  documento: "un documento",
  ubicacion: "una ubicación",
  otro: "un mensaje que la asistente no puede leer",
};

/** Respuesta fija (armada por el código) cuando llega algo que la asistente no lee; sale una vez al día por chat. */
export const TEXTO_NO_LEO = "Por ahora solo leo texto, notas de voz, fotos y PDF. ¿Me lo puedes escribir?";

/** Por qué la IA no contestó, en palabras del corredor. */
const MOTIVO_FRENO: Record<Freno, string> = {
  tope_mes: "se llegó al tope de mensajes de WhatsApp del mes",
  tope_dia: "se quedó sin energía (llegó al tope de gasto de IA)",
  rafaga: `mandó más de ${MAX_MENSAJES_CLIENTE_HORA} mensajes en una hora (freno contra ráfagas; vuelve a contestar sola cuando baje el ritmo)`,
};

/**
 * Derechos de privacidad (Ley 8968): "Privacidad…" (lo que dice /privacidad), también después de un saludo
 * ("Hola, privacidad: …") o como "solicitud de privacidad".
 */
export function esSolicitudPrivacidad(texto: string): boolean {
  return /^[\s\p{P}\p{S}]*(?:(?:hola|buen[oa]s?(?:\s+(?:d[ií]as|tardes|noches))?|saludos|buenas)[\s\p{P}]+)?(?:(?:una\s+)?solicitud\s+de\s+)?privacidad\b/iu.test(texto);
}

// Ningún dato personal (teléfonos, nombres, contenido) va a los registros: solo ids y estados.
function registroPorDefecto(evento: string, datos: Record<string, unknown>) {
  console.info(JSON.stringify({ evento, ...datos }));
}

export interface OpcionesProcesar {
  /** En el mismo aviso de Meta vienen más mensajes de este cliente: se guarda y se contesta con el último. */
  siguenMas?: boolean;
}

export async function procesarMensaje(deps: Dependencias, entrante: MensajeEntrante, opciones: OpcionesProcesar = {}): Promise<Resultado> {
  const { repo } = deps;
  const log = deps.registrar ?? registroPorDefecto;
  const ahora = () => deps.ahora?.() ?? new Date();

  const corredor = await repo.corredorPorPhoneNumberId(entrante.phoneNumberId);
  if (!corredor) {
    // Un Phone number ID mal copiado en /admin o un corredor apagado: el cliente no recibe nada, así que soporte se
    // entera (error_ → alerta, una por hora y número). Solo el id del número, nunca el teléfono del cliente.
    log("error_corredor_desconocido", { phoneNumberId: entrante.phoneNumberId, detalle: "llegó un mensaje a un número que no es de ningún corredor activo" });
    return { tipo: "corredor_desconocido" };
  }

  // El corredor también le escribe a su asistente (análisis, plan del día): no es un cliente. Se comparan los dígitos
  // con código de país: si su número quedó guardado con espacios, guiones o sin "+506", igual se le reconoce.
  if (corredor.whatsapp_corredor && mismoTelefono(entrante.telefono, corredor.whatsapp_corredor)) {
    return procesarMensajeCorredor(deps, { ...corredor, whatsapp_corredor: telefonoE164(corredor.whatsapp_corredor) }, entrante);
  }

  const contacto = await repo.contacto(corredor.id, entrante.telefono, entrante.nombrePerfil);
  const conversacion = await repo.conversacionActiva(corredor.id, contacto.id);

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

  // El enlace de WhatsApp de cada anuncio trae su referencia: el contacto queda atribuido.
  const referencia = entrante.texto ? extraerReferencia(entrante.texto) : null;
  if (referencia) await repo.atribuirContacto(corredor.id, contacto.id, referencia);

  const ctx = new Contexto(deps, corredor, conversacion, contacto.telefono, log);
  ctx.nombre = contacto.nombre ?? null;
  const uso = await ctx.uso({ mensajesEntrantes: 1 });
  const nombreCliente = contacto.nombre ?? contacto.telefono;
  // En los avisos el nombre va en la primera línea y el teléfono en la suya (sin nombre: "Un cliente").
  const quien = contacto.nombre?.trim() || "Un cliente";
  const telefono = contacto.telefono;
  const asistente = corredor.nombre_asistente || "La asistente";
  const avisoPrivacidad = (texto: string) =>
    armarAviso({
      titulo: `${quien} hizo una solicitud de privacidad de sus datos (Ley 8968)`,
      mensaje: texto,
      queHacer: "respóndele en máximo 5 días hábiles",
      telefono,
    });

  // Topes primero (solo lee): con un freno no se gasta IA en nada, ni en pasar un audio a texto.
  const freno = await frenoCliente(repo, corredor, uso, conversacion.id, ahora());

  // Una nota de voz se pasa a texto antes de todo corte: aunque el chat sea del corredor o espere al corredor, él la lee
  // en el panel (y el aviso la trae), y una solicitud de privacidad dicha por voz también pasa directo.
  let lecturaAudio: Awaited<ReturnType<typeof leerMedio>> | null = null;
  if (entrante.media?.clase === "audio" && !entrante.texto && !freno) {
    lecturaAudio = await leerMedio(deps, corredor, entrante);
    if (lecturaAudio.ok && lecturaAudio.clase === "audio") {
      await repo.actualizarMensaje(corredor.id, mensajeId, { contenido: `Nota de voz: ${lecturaAudio.texto}` });
      entrante = { ...entrante, texto: lecturaAudio.texto };
    }
  }

  // Derechos de privacidad (Ley 8968): pasa directo al corredor, que tiene cinco días hábiles para responder. No lo
  // contesta el modelo y va antes de todo corte (chat tomado, escalado o con tope): el plazo corre igual.
  if (entrante.texto && esSolicitudPrivacidad(entrante.texto)) {
    log("solicitud_privacidad", { corredorId: corredor.id, conversacionId: conversacion.id });
    const aviso = avisoPrivacidad(entrante.texto);
    const libre = conversacion.control !== "corredor" && conversacion.estado !== "escalada";
    // En un chat que ya es del corredor no se le escribe al cliente: solo se le avisa a él.
    const avisado = libre ? await ctx.escalar(null, aviso) : await ctx.avisarCorredor(aviso);
    if (!avisado) log("error_privacidad_sin_aviso", { corredorId: corredor.id, conversacionId: conversacion.id });
    return { tipo: "escalado", intencion: null };
  }

  if (conversacion.control === "corredor") return { tipo: "sin_respuesta", motivo: "control_corredor" };
  if (conversacion.estado === "escalada") {
    // El chat espera al corredor: si el cliente vuelve a escribir, se le avisa (una vez cada 2 horas por chat).
    if (await ctx.unaVez(`escalada_nuevo:${corredor.id}:${conversacion.id}`, 120)) {
      await ctx.avisarCorredor(
        armarAviso({
          titulo: `${quien} te volvió a escribir y espera tu respuesta`,
          mensaje: entrante.texto ? (lecturaAudio?.ok ? `Nota de voz: ${entrante.texto}` : entrante.texto) : null,
          detalles: [entrante.texto ? null : `Mandó: ${entrante.media ? NOMBRE_CLASE[entrante.media.clase] : DESCRIPCION_TIPO[entrante.tipo]}`],
          queHacer: "contéstale desde el chat en el panel o desde tu WhatsApp",
          telefono,
        }),
      );
    }
    return { tipo: "sin_respuesta", motivo: "escalada" };
  }

  // Topes: sin llamar a la IA ni gastar mensajes. La conversación NO pasa a "escalada" (eso es "quiere hablar con el
  // corredor" y no se levanta solo): sigue abierta y, cuando el tope se renueva o baja la ráfaga, la asistente vuelve a
  // contestar. Al cliente no se le manda nada; al corredor, un aviso por chat y día ("el chat queda para ti").
  if (freno) {
    log(freno === "rafaga" ? "rafaga_cliente" : `error_${freno === "tope_mes" ? "tope_mensual" : "tope_diario"}`, {
      corredorId: corredor.id,
      conversacionId: conversacion.id,
    });
    if (await ctx.unaVez(ctx.claveDelDia("sin_contestar"), Contexto.MINUTOS_DIA)) {
      await ctx.avisarCorredor(
        armarAviso({
          titulo: `${asistente} no le contestó a ${quien === "Un cliente" ? "un cliente" : quien}`,
          porQue: MOTIVO_FRENO[freno],
          mensaje: entrante.texto ?? null,
          queHacer: "el chat queda para ti: contéstale desde el panel o desde tu WhatsApp",
          telefono,
        }),
      );
    }
    return { tipo: "sin_respuesta", motivo: freno };
  }

  // Notas de voz, fotos y PDF: se pasan a texto y siguen el flujo de siempre.
  if (entrante.media) {
    const lectura = lecturaAudio ?? (await leerMedio(deps, corredor, entrante));
    let leido: string | null = null;
    if (lectura.ok && lectura.clase === "audio") {
      leido = lectura.texto;
      if (!lecturaAudio) await repo.actualizarMensaje(corredor.id, mensajeId, { contenido: `Nota de voz: ${lectura.texto}` });
    } else if (lectura.ok) {
      try {
        const d = await deps.cerebro.describirMedio(corredor, lectura.adjunto);
        await ctx.usoClaude(1, d.consumo);
        const visto = `[El cliente mandó ${lectura.clase === "imagen" ? "una foto" : "un PDF"}. Lo que se ve: ${d.texto}]`;
        leido = [entrante.texto, visto].filter(Boolean).join("\n");
        await repo.actualizarMensaje(corredor.id, mensajeId, { contenido: leido });
      } catch (error) {
        if (error instanceof RechazoModelo) await ctx.usoClaude(1, error.consumo);
        log("error_medio", { corredorId: corredor.id, error: errorSeguro(error) });
      }
    }
    if (leido) {
      entrante = { ...entrante, texto: leido };
    } else if (!(lectura.ok && lectura.clase === "audio")) {
      // Video, Word, archivo muy grande, sin llave: el corredor se entera (una vez por chat y hora) para verlo él.
      if (await ctx.unaVez(`medio_no_leido:${corredor.id}:${conversacion.id}`, 60)) {
        await ctx.avisarCorredor(
          armarAviso({
            titulo: `${quien} mandó ${NOMBRE_CLASE[entrante.media.clase]} que ${asistente} no puede leer por WhatsApp`,
            mensaje: entrante.texto ?? null,
            queHacer: "revísalo en WhatsApp",
            telefono,
          }),
        );
      }
    }
  }

  // Sin nada que leer (tipo que WhatsApp no deja leer a la API, archivo que no se pudo abrir): ni escalada ni silencio
  // eterno. Al cliente, una respuesta fija una vez al día por chat; la conversación sigue abierta para la IA.
  if (!entrante.texto) {
    log("mensaje_no_legible", { corredorId: corredor.id, conversacionId: conversacion.id, tipo: entrante.tipo });
    if (await ctx.unaVez(ctx.claveDelDia("no_leo"), Contexto.MINUTOS_DIA)) await ctx.responderCliente(TEXTO_NO_LEO, null);
    return { tipo: "sin_respuesta", motivo: "no_legible" };
  }

  // Una nota de voz transcrita también puede ser una solicitud de privacidad.
  if (esSolicitudPrivacidad(entrante.texto.replace(/^Nota de voz:\s*/i, ""))) {
    log("solicitud_privacidad", { corredorId: corredor.id, conversacionId: conversacion.id });
    const avisado = await ctx.escalar(null, avisoPrivacidad(entrante.texto));
    if (!avisado) log("error_privacidad_sin_aviso", { corredorId: corredor.id, conversacionId: conversacion.id });
    return { tipo: "escalado", intencion: null };
  }

  // Varios mensajes seguidos ("Hola" / "Me interesa la casa" / "en Escazú"): se contesta una vez, al último, con todo.
  if (opciones.siguenMas) return { tipo: "sin_respuesta", motivo: "agrupado" };
  const agrupados = new Set<string>([mensajeId]);
  const espera = deps.esperaAgruparMs && deps.esperaAgruparMs > 0 ? deps.esperaAgruparMs : 0;
  if (espera) await (deps.dormir ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms))))(espera);
  const recientes = await repo.historial(corredor.id, conversacion.id, MENSAJES_HISTORIAL + 1);
  const ultimoEntrante = [...recientes].reverse().find((m) => m.direccion === "entrante");
  // Llegó otro mientras se esperaba: ese contesta por los dos.
  if (espera && ultimoEntrante && ultimoEntrante.id !== mensajeId) return { tipo: "sin_respuesta", motivo: "agrupado" };
  const previos = anterioresSinRespuesta(recientes, mensajeId, espera);
  if (previos.length) {
    for (const m of previos) agrupados.add(m.id);
    entrante = { ...entrante, texto: [...previos.map((m) => m.contenido ?? ""), entrante.texto].filter(Boolean).join("\n") };
  }
  const textoCliente = entrante.texto!;

  const historial = (await repo.historial(corredor.id, conversacion.id, MENSAJES_HISTORIAL + agrupados.size)).filter(
    (m) => !agrupados.has(m.id),
  );

  let consumo: Consumo = SIN_CONSUMO;
  let llamadas = 0;
  let intencion: Intencion | null = null;
  try {
    const clasificacion = await deps.cerebro.clasificar(corredor, historial, textoCliente);
    consumo = sumar(consumo, clasificacion.consumo);
    llamadas++;
    intencion = clasificacion.intencion;
    await repo.actualizarMensaje(corredor.id, mensajeId, { intencion });

    // CRM: lo que el cliente dice que busca queda en su ficha y su etapa avanza (nunca retrocede).
    const busca = clasificacion.busca && !buscaVacia(clasificacion.busca) ? fusionarBusca(contacto.busca ?? {}, clasificacion.busca) : null;
    const sugerida: Etapa | null = intencion === "consulta_propiedad" || intencion === "agendar_visita" || busca ? "interesado" : null;
    const etapa = avanzarEtapa(contacto.etapa ?? "nuevo", sugerida);
    if (busca || etapa) {
      // El CRM es un extra: si falla, el cliente igual recibe su respuesta.
      try {
        await repo.actualizarPerfilCliente(corredor.id, contacto.id, { ...(busca ? { busca } : {}), ...(etapa ? { etapa } : {}) });
        if (etapa) contacto.etapa = etapa;
      } catch (e) {
        log("error_crm", { corredorId: corredor.id, error: e instanceof Error ? e.name : "desconocido" });
      }
    }

    if (intencion === "pasar_a_corredor") {
      await ctx.usoClaude(llamadas, consumo);
      [llamadas, consumo] = [0, SIN_CONSUMO]; // ya registrado; el catch no lo vuelve a contar
      await ctx.escalar(
        intencion,
        armarAviso({
          titulo: `${quien} quiere hablar contigo`,
          porQue: `escribió sobre ${clasificacion.tema}, que te toca a ti`,
          mensaje: textoCliente,
          queHacer: "escríbele tú; al cliente ya le dije que lo ves personalmente",
          telefono,
        }),
      );
      return { tipo: "escalado", intencion };
    }

    if (intencion === "agendar_visita") {
      const r = await flujoAgenda(
        ctx,
        { contactoId: contacto.id, nombreCliente, historial, texto: textoCliente },
        (c) => {
          consumo = sumar(consumo, c);
          llamadas++;
        },
      );
      await ctx.usoClaude(llamadas, consumo);
      [llamadas, consumo] = [0, SIN_CONSUMO];
      if (r.tipo === "escalar") {
        await ctx.escalar(intencion, r.aviso);
        return { tipo: "escalado", intencion };
      }
      // Visita agendada (sin borrador de por medio): el cliente pasa a "visita".
      const visita = r.tipo === "agendado" && !r.borrador ? avanzarEtapa(contacto.etapa ?? "nuevo", "visita") : null;
      if (visita) await repo.actualizarPerfilCliente(corredor.id, contacto.id, { etapa: visita });
      return { tipo: "agenda", accion: r.tipo, borrador: r.borrador };
    }

    const [propiedades, correcciones, conocimiento] = await Promise.all([
      repo.propiedadesActivas(corredor.id),
      repo.correccionesRecientes(corredor.id, 8),
      // El cerebro es un extra: si no se puede leer, la asistente contesta igual con las casas.
      repo.conocimientoActivo(corredor.id, 60).catch((e: unknown) => {
        log("error_conocimiento", { corredorId: corredor.id, error: e instanceof Error ? e.name : "desconocido" });
        return [];
      }),
    ]);
    const respuesta = await deps.cerebro.responder(corredor, propiedades, historial, textoCliente, correcciones, conocimiento);
    consumo = sumar(consumo, respuesta.consumo);
    llamadas++;
    await ctx.usoClaude(llamadas, consumo);
    [llamadas, consumo] = [0, SIN_CONSUMO];

    const borrador = await ctx.responderCliente(respuesta.texto, intencion);
    // Fotos de la casa que pidió: solo si el texto salió (en piloto en sombra queda solo el borrador del texto).
    if (respuesta.enviarFotos && ctx.respuestaEnviada) {
      await mandarFotosDeCasa(ctx, propiedades, respuesta.enviarFotos).catch((e: unknown) =>
        log("envio_fotos_fallo", { corredorId: corredor.id, conversacionId: conversacion.id, error: errorSeguro(e) }),
      );
    }
    if (respuesta.avisarCorredor) {
      // Lo que la asistente no supo queda como duda en su cerebro: el corredor la contesta una vez.
      await repo.registrarDuda(corredor.id, respuesta.avisarCorredor, conversacion.id).catch((e: unknown) =>
        log("error_conocimiento", { corredorId: corredor.id, error: e instanceof Error ? e.name : "desconocido" }),
      );
      await ctx.avisarCorredor(
        armarAviso({
          titulo: `${quien} preguntó algo que hay que confirmar`,
          detalles: [`Duda: ${respuesta.avisarCorredor}`],
          mensaje: textoCliente,
          queHacer: "contéstala en el Cerebro del panel y desde ahí la sé",
          telefono,
        }),
      );
    }
    return { tipo: "respondido", intencion, borrador };
  } catch (error) {
    if (error instanceof RechazoModelo) {
      consumo = sumar(consumo, error.consumo);
      llamadas++;
    }
    await ctx.usoClaude(llamadas, consumo);
    // Si es de configuración (llave, saldo, modelo), además sale "error_ia_config" a soporte.
    const causa = registrarFallaIA(log, { corredorId: corredor.id, donde: "asistente" }, error);
    log("error_asistente", {
      corredorId: corredor.id,
      conversacionId: conversacion.id,
      causa,
      error: error instanceof Error ? error.name : "desconocido",
    });
    await ctx.escalar(
      intencion,
      armarAviso({
        titulo: `${asistente} no pudo responderle a ${quien === "Un cliente" ? "un cliente" : quien}`,
        porQue: esFallaDeConfiguracion(causa) ? "falta configurar la IA (ya se avisó a soporte)" : "falló la IA al preparar la respuesta",
        mensaje: textoCliente,
        queHacer: "escríbele tú desde el panel o desde tu WhatsApp",
        telefono,
      }),
    );
    return { tipo: "escalado", intencion };
  }
}

/**
 * Mensajes del cliente que quedaron sin respuesta justo antes de `mensajeId` (los "seguidos"): los que vienen después
 * de lo último que se le contestó y llegaron poco antes. Los viejos sin respuesta (un freno, un chat tomado) no entran.
 */
export function anterioresSinRespuesta(recientes: Mensaje[], mensajeId: string, ventanaMs: number): Mensaje[] {
  const i = recientes.findIndex((m) => m.id === mensajeId);
  if (i < 0) return [];
  const propio = Date.parse(recientes[i].created_at);
  if (!Number.isFinite(propio)) return [];
  const limite = propio - Math.max(ventanaMs * 3, 60_000);
  const previos: Mensaje[] = [];
  for (let j = i - 1; j >= 0; j--) {
    const m = recientes[j];
    if (m.direccion !== "entrante") break;
    const t = Date.parse(m.created_at);
    if (!Number.isFinite(t) || t < limite) break;
    previos.unshift(m);
  }
  return previos.slice(-5);
}

/** Espera antes de reintentar un aviso de entrega cuyo mensaje todavía no estaba guardado. */
export const REINTENTO_ESTADO_MS = 2000;

type DepsEstado = Pick<Dependencias, "repo"> & Partial<Pick<Dependencias, "whatsapp" | "plantillaAviso" | "registrar">>;

export async function procesarEstado(
  deps: DepsEstado,
  estado: EstadoEntrega,
  esperar: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<void> {
  const log = deps.registrar ?? registroPorDefecto;
  // El corredor sale del número que recibió el aviso; sin corredor conocido no se toca nada.
  const corredor = await deps.repo.corredorPorPhoneNumberId(estado.phoneNumberId);
  if (!corredor) {
    if (estado.estado === "fallido") log("whatsapp_fallido_sin_corredor", { phoneNumberId: estado.phoneNumberId, codigo: estado.codigo });
    return;
  }
  if (!(await deps.repo.actualizarEstadoEntrega(corredor.id, estado.waMessageId, estado.estado))) {
    // Meta puede avisar antes de que se guarde el mensaje con su wa_message_id (se guarda después de que la API
    // responde): un reintento corto lo alcanza. Si tampoco (o el aviso era viejo y no debía retroceder), se deja así.
    await esperar(REINTENTO_ESTADO_MS);
    await deps.repo.actualizarEstadoEntrega(corredor.id, estado.waMessageId, estado.estado);
  }
  if (estado.estado === "fallido") await entregaFallida(deps, corredor, estado, log);
}

/**
 * Meta aceptó un envío y después avisó que no lo entregó. Se guarda el código en el registro (nunca el teléfono), se
 * le dice al corredor en palabras simples qué mensaje a qué cliente no llegó (una vez por chat y hora) y, si el
 * problema es de la cuenta (plantilla, llave, pago), se alerta a soporte.
 */
async function entregaFallida(
  deps: DepsEstado,
  corredor: Corredor,
  estado: EstadoEntrega,
  log: (evento: string, datos: Record<string, unknown>) => void,
): Promise<void> {
  const codigo = estado.codigo;
  const mensaje = deps.repo.mensajePorWaId ? await deps.repo.mensajePorWaId(corredor.id, estado.waMessageId).catch(() => null) : null;
  log("whatsapp_fallido", { corredorId: corredor.id, mensajeId: mensaje?.id ?? null, codigo });
  if (esErrorDeConfiguracion(codigo)) log("error_whatsapp_config", { corredorId: corredor.id, codigo, detalle: explicarCodigoWhatsApp(codigo) });
  if (!mensaje) return;
  if (mensaje.es_corredor) {
    // No le llegó un aviso al propio corredor: solo soporte puede enterarse.
    log("error_aviso_no_entregado", { corredorId: corredor.id, codigo });
    return;
  }
  if (!deps.whatsapp || !deps.plantillaAviso) return;
  const clave = `entrega_fallida:${corredor.id}:${mensaje.conversacion_id}`;
  if (!(await unaVez(deps, clave, 60, log, corredor.id))) return;
  await avisarAlCorredor(
    { repo: deps.repo, whatsapp: deps.whatsapp, plantillaAviso: deps.plantillaAviso },
    corredor,
    armarAviso({
      titulo: `No le llegó un mensaje a ${mensaje.nombre?.trim() || "un cliente"}`,
      porQue: porQueNoLlego(codigo),
      mensaje: mensaje.contenido ? mensaje.contenido.slice(0, 160) : null,
      queHacer: "escríbele desde tu WhatsApp o revisa el chat en el panel",
      telefono: mensaje.telefono,
    }),
    log,
  );
}
