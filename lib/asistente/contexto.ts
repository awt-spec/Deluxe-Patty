import type { Repositorio } from "../datos/repositorio";
import type { AccionPendiente, Conversacion, Corredor, Intencion, UsoDelta, UsoMensual } from "../datos/tipos";
import type { EditorFotos } from "../fotos/editor";
import { ErrorWhatsApp, codigoWhatsApp, esErrorDeConfiguracion, porQueNoLlego, type EnviadorWhatsApp } from "../whatsapp/enviar";
import type { Medios } from "../whatsapp/media";
import { armarAviso, ordenarParaWhatsApp } from "../whatsapp/formato";
import { telefonoE164 } from "../whatsapp/telefono";
import type { Cerebro } from "./cerebro";
import type { Consumo } from "./costo";
import { errorSeguro } from "../monitoreo/errores";

export interface Dependencias {
  repo: Repositorio;
  cerebro: Cerebro;
  whatsapp: EnviadorWhatsApp;
  /** Plantilla aprobada por Meta con un parámetro {{1}}, para escribirle al corredor fuera de la ventana de 24 h. */
  plantillaAviso: string;
  /** Plantilla aprobada con {{1}} corredor, {{2}} fecha y hora, {{3}} propiedad: recordatorio de visita. */
  plantillaRecordatorio: string;
  registrar?: (evento: string, datos: Record<string, unknown>) => void;
  /** Mejora de fotos con IA; sin configurar si falta OPENAI_API_KEY. */
  fotos?: EditorFotos;
  /** Descarga de archivos de WhatsApp y transcripción de notas de voz. Sin configurar: se avisa al corredor como antes. */
  medios?: Medios;
  /** Reloj inyectable para pruebas. */
  ahora?: () => Date;
  /**
   * Varios mensajes seguidos del mismo cliente: cuánto esperar antes de contestar para hacerlo una sola vez, al último
   * (0 o sin valor: no se espera; así corren las pruebas y el simulador).
   */
  esperaAgruparMs?: number;
  /** Espera inyectable para pruebas (agrupar mensajes, reintentos). */
  dormir?: (ms: number) => Promise<void>;
}

const MINUTOS_DIA = 24 * 60;

/** Fecha local (AAAA-MM-DD) del corredor: las claves "una vez al día" cambian a su medianoche. */
export function diaDelCorredor(corredor: Pick<Corredor, "zona_horaria">, ahora: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: corredor.zona_horaria || "America/Costa_Rica", year: "numeric", month: "2-digit", day: "2-digit" }).format(ahora);
}

/**
 * Aviso al corredor con la plantilla (sirve fuera de la ventana de 24 horas). Queda guardado en su conversación con la
 * asistente para que su estado de entrega se vea (y si Meta no lo entrega, se le avise a soporte). true si salió.
 * Un corredor inactivo (demo) nunca manda nada.
 */
/** Ventana de 24 horas del corredor, con 10 minutos de margen (como en `enviarAlCorredor`). */
const VENTANA_AVISO_MS = 24 * 60 * 60_000 - 10 * 60_000;

export async function avisarAlCorredor(
  deps: Pick<Dependencias, "repo" | "whatsapp" | "plantillaAviso"> & { ahora?: () => Date },
  corredor: Pick<Corredor, "id" | "whatsapp_corredor" | "whatsapp_phone_number_id" | "activo">,
  texto: string,
  log: (evento: string, datos: Record<string, unknown>) => void,
): Promise<boolean> {
  const destino = telefonoE164(corredor.whatsapp_corredor);
  if (!destino || !corredor.whatsapp_phone_number_id) {
    log("error_aviso_sin_destino", { corredorId: corredor.id });
    return false;
  }
  if (corredor.activo === false) {
    log("aviso_simulado", { corredorId: corredor.id });
    return false;
  }
  // Con su ventana de 24 horas abierta el aviso va como texto libre, en varias líneas y ordenado; si no (o si el texto
  // falla), por la plantilla, que lo aplana en una línea.
  let conversacionId: string | null = null;
  let abierta = false;
  try {
    const contacto = await deps.repo.contactoCorredor(corredor.id, destino);
    conversacionId = (await deps.repo.conversacionActiva(corredor.id, contacto.id)).id;
    const ultimo = await deps.repo.ultimoMensajeDe(corredor.id, contacto.id);
    abierta = !!ultimo && (deps.ahora?.() ?? new Date()).getTime() - ultimo.getTime() < VENTANA_AVISO_MS;
  } catch (e) {
    log("aviso_sin_ventana", { corredorId: corredor.id, error: errorSeguro(e) });
  }
  let waId: string | null = null;
  let tipo: "texto" | "plantilla" = "plantilla";
  if (abierta) {
    try {
      waId = await deps.whatsapp.texto(corredor.whatsapp_phone_number_id, destino, texto);
      tipo = "texto";
    } catch (error) {
      log("aviso_texto_fallo", { corredorId: corredor.id, codigo: codigoWhatsApp(error), error: errorSeguro(error) });
    }
  }
  if (!waId) {
    try {
      waId = await deps.whatsapp.plantilla(corredor.whatsapp_phone_number_id, destino, deps.plantillaAviso, [texto]);
    } catch (error) {
      log("error_aviso_corredor", { corredorId: corredor.id, codigo: codigoWhatsApp(error), error: errorSeguro(error) });
      return false;
    }
  }
  // El aviso también es un mensaje de la cuenta y cuenta contra el tope (sin volver a revisar el umbral, para no
  // encadenar avisos).
  await deps.repo.registrarUso(corredor.id, { mensajesSalientes: 1 }).catch((e: unknown) =>
    log("error_uso_aviso", { corredorId: corredor.id, error: errorSeguro(e) }),
  );
  try {
    if (!conversacionId) throw new Error("sin_conversacion");
    await deps.repo.guardarMensaje({
      corredor_id: corredor.id,
      conversacion_id: conversacionId,
      direccion: "saliente",
      autor: "sistema",
      tipo,
      contenido: texto,
      wa_message_id: waId,
      estado_entrega: "enviado",
    });
  } catch (e) {
    // Guardarlo es un extra (sirve para ver su estado): el aviso ya salió.
    log("aviso_sin_guardar", { corredorId: corredor.id, error: errorSeguro(e) });
  }
  return true;
}

/** Reclama una clave de `alertas` (con la del corredor adentro); si la base falla, no frena el flujo. */
export async function unaVez(
  deps: Pick<Dependencias, "repo">,
  clave: string,
  minutos: number,
  log: (evento: string, datos: Record<string, unknown>) => void,
  corredorId: string,
): Promise<boolean> {
  try {
    return await deps.repo.reclamarAlerta(clave, minutos);
  } catch (e) {
    log("error_reclamar", { corredorId, error: errorSeguro(e) });
    return false;
  }
}

export class Contexto {
  constructor(
    readonly deps: Dependencias,
    readonly corredor: Corredor,
    readonly conversacion: Conversacion,
    readonly telefonoCliente: string,
    readonly log: (evento: string, datos: Record<string, unknown>) => void,
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
  async uso(delta: UsoDelta): Promise<UsoMensual> {
    const uso = await this.deps.repo.registrarUso(this.corredor.id, delta);
    if (uso.mensajes_total < this.corredor.aviso_mensajes_mes || uso.aviso_tope_enviado_at) return uso;
    if (!(await this.deps.repo.marcarAvisoTope(this.corredor.id, uso.mes))) return uso;
    await this.avisarCorredor(
      armarAviso({
        titulo: `Tu asistente lleva ${uso.mensajes_total} de ${this.corredor.tope_mensajes_mes} mensajes de WhatsApp este mes`,
        porQue: `al llegar a ${this.corredor.tope_mensajes_mes} deja de contestar sola y los chats te quedan a ti`,
        queHacer: "si necesitas más mensajes este mes, escríbele a soporte",
      }),
    );
    return uso;
  }

  /**
   * Responde al cliente. En piloto en sombra (respuesta_automatica = false) solo guarda el borrador
   * para que el corredor lo apruebe. Devuelve true si quedó como borrador.
   */
  async responderCliente(textoModelo: string, intencion: Intencion | null, accion: AccionPendiente | null = null): Promise<boolean> {
    const { repo, whatsapp } = this.deps;
    // WhatsApp no lee markdown: lo que escribió el modelo se pasa a su formato antes de guardarlo y enviarlo (el
    // borrador que ve el corredor es lo mismo que le llegaría al cliente).
    const texto = ordenarParaWhatsApp(textoModelo);
    const borrador = !this.corredor.respuesta_automatica;
    const id = await repo.guardarMensaje({
      corredor_id: this.corredor.id,
      conversacion_id: this.conversacion.id,
      direccion: "saliente",
      autor: "asistente",
      contenido: texto,
      intencion,
      estado_borrador: borrador ? "pendiente" : null,
      accion: borrador ? accion : null,
    });
    if (borrador || id === null) return borrador;

    // El enviador ya reintentó lo pasajero (límite de Meta, 5xx, red). Si igual falla, el cliente se quedó sin
    // respuesta: se le dice al corredor (una vez por conversación y hora) en vez de dejarlo en silencio.
    try {
      const waId = await whatsapp.texto(this.phoneNumberId, this.telefonoCliente, texto);
      await repo.actualizarMensaje(this.corredor.id, id, { wa_message_id: waId, estado_entrega: "enviado" });
      await this.uso({ mensajesSalientes: 1 });
    } catch (error) {
      await repo.actualizarMensaje(this.corredor.id, id, { estado_entrega: "fallido" });
      const codigo = codigoWhatsApp(error);
      this.log("error_envio_cliente", { corredorId: this.corredor.id, mensajeId: id, codigo, error: errorSeguro(error) });
      if (await this.unaVez(`entrega_fallida:${this.corredor.id}:${this.conversacion.id}`, 60)) {
        await this.avisarCorredor(
          armarAviso({
            titulo: `No le pude mandar la respuesta a ${this.nombre ?? "un cliente"}`,
            porQue: porQueNoLlego(codigo),
            mensaje: texto,
            queHacer: "escríbele desde tu WhatsApp o desde el chat en el panel",
            telefono: this.telefonoCliente,
          }),
        );
      }
      if (esErrorDeConfiguracion(codigo, error instanceof ErrorWhatsApp ? error.status : undefined)) {
        this.log("error_whatsapp_config", { corredorId: this.corredor.id, codigo });
      }
    }
    return false;
  }

  /** Cómo se nombra al cliente en los avisos al corredor (nombre y teléfono; van por WhatsApp, nunca a registros). */
  nombreCliente(): string {
    return this.nombre ? `${this.nombre} (${this.telefonoCliente})` : this.telefonoCliente;
  }

  /** Nombre del cliente para los avisos; lo pone procesarMensaje. */
  nombre: string | null = null;

  /**
   * Lo que está en la lista de escalamiento va al corredor; al cliente solo se le avisa que le escribe, y solo si el
   * aviso al corredor salió (nunca se le promete al cliente algo que el corredor no sabe). true si se avisó.
   */
  async escalar(intencion: Intencion | null, aviso: string): Promise<boolean> {
    await this.deps.repo.actualizarConversacion(this.corredor.id, this.conversacion.id, { estado: "escalada" });
    const avisado = await this.avisarCorredor(aviso);
    if (!avisado) {
      // Queda en "Te esperan" del panel y del plan; soporte recibe la alerta de error_aviso_corredor.
      this.log("escalada_sin_aviso", { corredorId: this.corredor.id, conversacionId: this.conversacion.id });
      return false;
    }
    await this.responderCliente(
      `Gracias por escribir. Esto lo ve ${this.corredor.nombre_contacto} personalmente y le escribe en cuanto pueda.`,
      intencion,
    );
    return true;
  }

  avisarCorredor(texto: string): Promise<boolean> {
    return avisarAlCorredor(this.deps, this.corredor, texto, this.log);
  }

  /** Clave de `alertas` reclamada: true solo la primera vez dentro de `minutos`. */
  unaVez(clave: string, minutos: number): Promise<boolean> {
    return unaVez(this.deps, clave, minutos, this.log, this.corredor.id);
  }

  /** Clave que vale por el día local del corredor. */
  claveDelDia(prefijo: string): string {
    return `${prefijo}:${this.corredor.id}:${this.conversacion.id}:${diaDelCorredor(this.corredor, this.deps.ahora?.() ?? new Date())}`;
  }

  static readonly MINUTOS_DIA = MINUTOS_DIA;

}
