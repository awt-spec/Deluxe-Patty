import type { Repositorio } from "../datos/repositorio";
import type { Conversacion, Corredor, Intencion, UsoDelta } from "../datos/tipos";
import type { EnviadorWhatsApp } from "../whatsapp/enviar";
import type { EstadoEntrega, MensajeEntrante } from "../whatsapp/parsear";
import { RechazoModelo, type Cerebro } from "./cerebro";
import { SIN_CONSUMO, sumar, type Consumo } from "./costo";

export interface Dependencias {
  repo: Repositorio;
  cerebro: Cerebro;
  whatsapp: EnviadorWhatsApp;
  /** Plantilla aprobada por Meta con un parámetro {{1}}, para escribirle al corredor fuera de la ventana de 24 h. */
  plantillaAviso: string;
  registrar?: (evento: string, datos: Record<string, unknown>) => void;
}

export type Resultado =
  | { tipo: "corredor_desconocido" }
  | { tipo: "duplicado" }
  | { tipo: "sin_respuesta"; motivo: "control_corredor" | "escalada" }
  | { tipo: "escalado"; intencion: Intencion | null }
  | { tipo: "respondido"; intencion: Intencion; borrador: boolean };

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

  const ctx = new Contexto(deps, corredor, conversacion, contacto.telefono, log);
  await ctx.uso({ mensajesEntrantes: 1 });

  if (conversacion.control === "corredor") return { tipo: "sin_respuesta", motivo: "control_corredor" };
  if (conversacion.estado === "escalada") return { tipo: "sin_respuesta", motivo: "escalada" };

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

    if (intencion === "pasar_a_corredor") {
      await ctx.usoClaude(llamadas, consumo);
      [llamadas, consumo] = [0, SIN_CONSUMO]; // ya registrado; el catch no lo vuelve a contar
      await ctx.escalar(
        intencion,
        `${nombreCliente} (${contacto.telefono}) escribió sobre ${clasificacion.tema}: "${entrante.texto}"`,
      );
      return { tipo: "escalado", intencion };
    }

    const propiedades = await repo.propiedadesActivas(corredor.id);
    const respuesta = await deps.cerebro.responder(corredor, propiedades, historial, entrante.texto);
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

class Contexto {
  constructor(
    private readonly deps: Dependencias,
    private readonly corredor: Corredor,
    private readonly conversacion: Conversacion,
    private readonly telefonoCliente: string,
    private readonly log: (evento: string, datos: Record<string, unknown>) => void,
  ) {}

  private get phoneNumberId(): string {
    // Garantizado: el corredor se encontró por este id.
    return this.corredor.whatsapp_phone_number_id!;
  }

  async usoClaude(llamadas: number, consumo: Consumo) {
    if (llamadas === 0) return;
    await this.uso({
      llamadasClaude: llamadas,
      tokensEntrada: consumo.tokensEntrada,
      tokensSalida: consumo.tokensSalida,
      costoClaudeUsd: consumo.costoUsd,
    });
  }

  /** Suma uso y, al cruzar el umbral de aviso, le avisa al corredor una sola vez por mes. */
  async uso(delta: UsoDelta) {
    const uso = await this.deps.repo.registrarUso(this.corredor.id, delta);
    if (uso.mensajes_total < this.corredor.aviso_mensajes_mes || uso.aviso_tope_enviado_at) return;
    if (!(await this.deps.repo.marcarAvisoTope(this.corredor.id, uso.mes))) return;
    await this.avisarCorredor(
      `Tu asistente lleva ${uso.mensajes_total} de ${this.corredor.tope_mensajes_mes} mensajes de WhatsApp este mes.`,
    );
  }

  /**
   * Responde al cliente. En piloto en sombra (respuesta_automatica = false) solo guarda el borrador
   * para que el corredor lo apruebe. Devuelve true si quedó como borrador.
   */
  async responderCliente(texto: string, intencion: Intencion | null): Promise<boolean> {
    const { repo, whatsapp } = this.deps;
    const borrador = !this.corredor.respuesta_automatica;
    const id = await repo.guardarMensaje({
      corredor_id: this.corredor.id,
      conversacion_id: this.conversacion.id,
      direccion: "saliente",
      autor: "asistente",
      contenido: texto,
      intencion,
      estado_borrador: borrador ? "pendiente" : null,
    });
    if (borrador || id === null) return borrador;

    try {
      const waId = await whatsapp.texto(this.phoneNumberId, this.telefonoCliente, texto);
      await repo.actualizarMensaje(this.corredor.id, id, { wa_message_id: waId, estado_entrega: "enviado" });
      await this.uso({ mensajesSalientes: 1 });
    } catch (error) {
      await repo.actualizarMensaje(this.corredor.id, id, { estado_entrega: "fallido" });
      this.log("error_envio_cliente", { corredorId: this.corredor.id, mensajeId: id, error: String(error) });
    }
    return false;
  }

  /** Lo que está en la lista de escalamiento va al corredor; al cliente solo se le avisa que le escribe. */
  async escalar(intencion: Intencion | null, aviso: string) {
    await this.deps.repo.actualizarConversacion(this.corredor.id, this.conversacion.id, { estado: "escalada" });
    await this.avisarCorredor(aviso);
    await this.responderCliente(
      `Gracias por escribir. Esto lo ve ${this.corredor.nombre_contacto} personalmente y te escribe en cuanto pueda.`,
      intencion,
    );
  }

  async avisarCorredor(texto: string) {
    const destino = this.corredor.whatsapp_corredor;
    if (!destino) {
      this.log("aviso_sin_destino", { corredorId: this.corredor.id });
      return;
    }
    try {
      await this.deps.whatsapp.plantilla(this.phoneNumberId, destino, this.deps.plantillaAviso, [texto]);
      // El aviso también es un mensaje de la cuenta y cuenta contra el tope (sin volver a revisar el
      // umbral, para no encadenar avisos).
      await this.deps.repo.registrarUso(this.corredor.id, { mensajesSalientes: 1 });
    } catch (error) {
      this.log("error_aviso_corredor", { corredorId: this.corredor.id, error: String(error) });
    }
  }

}
