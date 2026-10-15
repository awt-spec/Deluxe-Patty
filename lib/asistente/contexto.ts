import type { Repositorio } from "../datos/repositorio";
import type { AccionPendiente, Conversacion, Corredor, Intencion, UsoDelta } from "../datos/tipos";
import type { EnviadorWhatsApp } from "../whatsapp/enviar";
import type { Cerebro } from "./cerebro";
import type { Consumo } from "./costo";

export interface Dependencias {
  repo: Repositorio;
  cerebro: Cerebro;
  whatsapp: EnviadorWhatsApp;
  /** Plantilla aprobada por Meta con un parámetro {{1}}, para escribirle al corredor fuera de la ventana de 24 h. */
  plantillaAviso: string;
  /** Plantilla aprobada con {{1}} corredor, {{2}} fecha y hora, {{3}} propiedad: recordatorio de visita. */
  plantillaRecordatorio: string;
  registrar?: (evento: string, datos: Record<string, unknown>) => void;
  /** Reloj inyectable para pruebas. */
  ahora?: () => Date;
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
  async responderCliente(texto: string, intencion: Intencion | null, accion: AccionPendiente | null = null): Promise<boolean> {
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
      accion: borrador ? accion : null,
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
