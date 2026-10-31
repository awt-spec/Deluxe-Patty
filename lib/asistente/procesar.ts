import { extraerReferencia } from "../anuncios/atribucion";
import { avanzarEtapa, buscaVacia, fusionarBusca, type Etapa } from "../crm/perfil";
import type { Intencion } from "../datos/tipos";
import type { EstadoEntrega, MensajeEntrante } from "../whatsapp/parsear";
import { flujoAgenda } from "./agenda";
import { procesarMensajeCorredor, type ResultadoCorredor } from "./corredor";
import { RechazoModelo } from "./cerebro";
import { Contexto, type Dependencias } from "./contexto";
import { SIN_CONSUMO, sumar, type Consumo } from "./costo";
import { frenoCliente, type Freno } from "./limites";

export type { Dependencias } from "./contexto";

export type Resultado =
  | { tipo: "corredor_desconocido" }
  | { tipo: "duplicado" }
  | { tipo: "sin_respuesta"; motivo: "control_corredor" | "escalada" | Freno }
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

// Ningún dato personal (teléfonos, nombres, contenido) va a los registros: solo ids y estados.
function registroPorDefecto(evento: string, datos: Record<string, unknown>) {
  console.info(JSON.stringify({ evento, ...datos }));
}

export async function procesarMensaje(deps: Dependencias, entrante: MensajeEntrante): Promise<Resultado> {
  const { repo } = deps;
  const log = deps.registrar ?? registroPorDefecto;

  const corredor = await repo.corredorPorPhoneNumberId(entrante.phoneNumberId);
  if (!corredor) {
    log("corredor_desconocido", { phoneNumberId: entrante.phoneNumberId });
    return { tipo: "corredor_desconocido" };
  }

  // El corredor también le escribe a su asistente (análisis, plan del día): no es un cliente.
  if (corredor.whatsapp_corredor && entrante.telefono === corredor.whatsapp_corredor) {
    return procesarMensajeCorredor(deps, corredor, entrante);
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
  const uso = await ctx.uso({ mensajesEntrantes: 1 });

  if (conversacion.control === "corredor") return { tipo: "sin_respuesta", motivo: "control_corredor" };
  if (conversacion.estado === "escalada") return { tipo: "sin_respuesta", motivo: "escalada" };

  // Topes: el chat queda para el corredor sin llamar a la IA ni gastar mensajes.
  const freno = await frenoCliente(repo, corredor, uso, conversacion.id, deps.ahora?.() ?? new Date());
  if (freno) {
    await repo.actualizarConversacion(corredor.id, conversacion.id, { estado: "escalada" });
    log(freno === "rafaga" ? "rafaga_cliente" : `error_${freno === "tope_mes" ? "tope_mensual" : "tope_diario"}`, {
      corredorId: corredor.id,
      conversacionId: conversacion.id,
    });
    return { tipo: "sin_respuesta", motivo: freno };
  }

  const nombreCliente = contacto.nombre ?? contacto.telefono;

  if (!entrante.texto) {
    await ctx.escalar(
      null,
      `${nombreCliente} (${contacto.telefono}) mandó ${DESCRIPCION_TIPO[entrante.tipo]}. Revísalo en WhatsApp.`,
    );
    return { tipo: "escalado", intencion: null };
  }

  const historial = (await repo.historial(corredor.id, conversacion.id, MENSAJES_HISTORIAL + 1)).filter(
    (m) => m.id !== mensajeId,
  );

  let consumo: Consumo = SIN_CONSUMO;
  let llamadas = 0;
  let intencion: Intencion | null = null;
  try {
    const clasificacion = await deps.cerebro.clasificar(corredor, historial, entrante.texto);
    consumo = sumar(consumo, clasificacion.consumo);
    llamadas++;
    intencion = clasificacion.intencion;
    await repo.actualizarMensaje(corredor.id, mensajeId, { intencion });

    // CRM: lo que el cliente dice que busca queda en su ficha y su etapa avanza (nunca retrocede).
    const busca = clasificacion.busca && !buscaVacia(clasificacion.busca) ? fusionarBusca(contacto.busca ?? {}, clasificacion.busca) : null;
    const sugerida: Etapa | null = intencion === "consulta_propiedad" || intencion === "agendar_visita" || busca ? "interesado" : null;
    const etapa = avanzarEtapa(contacto.etapa ?? "nuevo", sugerida);
    if (busca || etapa) {
      await repo.actualizarPerfilCliente(corredor.id, contacto.id, { ...(busca ? { busca } : {}), ...(etapa ? { etapa } : {}) });
      if (etapa) contacto.etapa = etapa;
    }

    if (intencion === "pasar_a_corredor") {
      await ctx.usoClaude(llamadas, consumo);
      [llamadas, consumo] = [0, SIN_CONSUMO]; // ya registrado; el catch no lo vuelve a contar
      await ctx.escalar(
        intencion,
        `${nombreCliente} (${contacto.telefono}) escribió sobre ${clasificacion.tema}: "${entrante.texto}"`,
      );
      return { tipo: "escalado", intencion };
    }

    if (intencion === "agendar_visita") {
      const r = await flujoAgenda(
        ctx,
        { contactoId: contacto.id, nombreCliente, historial, texto: entrante.texto },
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

    const [propiedades, correcciones] = await Promise.all([
      repo.propiedadesActivas(corredor.id),
      repo.correccionesRecientes(corredor.id, 8),
    ]);
    const respuesta = await deps.cerebro.responder(corredor, propiedades, historial, entrante.texto, correcciones);
    consumo = sumar(consumo, respuesta.consumo);
    llamadas++;
    await ctx.usoClaude(llamadas, consumo);
    [llamadas, consumo] = [0, SIN_CONSUMO];

    const borrador = await ctx.responderCliente(respuesta.texto, intencion);
    if (respuesta.avisarCorredor) {
      await ctx.avisarCorredor(
        `${nombreCliente} (${contacto.telefono}): ${respuesta.avisarCorredor}. Mensaje del cliente: "${entrante.texto}"`,
      );
    }
    return { tipo: "respondido", intencion, borrador };
  } catch (error) {
    if (error instanceof RechazoModelo) {
      consumo = sumar(consumo, error.consumo);
      llamadas++;
    }
    await ctx.usoClaude(llamadas, consumo);
    log("error_asistente", {
      corredorId: corredor.id,
      conversacionId: conversacion.id,
      error: error instanceof Error ? error.name : "desconocido",
    });
    await ctx.escalar(
      intencion,
      `La asistente no pudo responder a ${nombreCliente} (${contacto.telefono}). Su mensaje: "${entrante.texto}"`,
    );
    return { tipo: "escalado", intencion };
  }
}

export async function procesarEstado(deps: Pick<Dependencias, "repo">, estado: EstadoEntrega): Promise<void> {
  await deps.repo.actualizarEstadoEntrega(estado.waMessageId, estado.estado);
}
