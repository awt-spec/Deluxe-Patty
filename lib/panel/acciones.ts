import type { Dependencias } from "../asistente/contexto";
import type { Corredor } from "../datos/tipos";

// Acciones del corredor desde el panel. Quien llama ya verificó con la sesión del corredor (RLS)
// que el mensaje o la conversación son suyos; aquí todo filtra además por corredor_id.

export type Resultado = { ok: true } | { ok: false; motivo: string };

const VENTANA_MS = 24 * 60 * 60_000;

function ventanaAbierta(ultimo: string | null, ahora: Date): boolean {
  return !!ultimo && ahora.getTime() - new Date(ultimo).getTime() < VENTANA_MS;
}

const VENTANA_CERRADA =
  "Pasaron más de 24 horas desde el último mensaje del cliente: WhatsApp no deja escribirle desde la asistente. " +
  "Escríbele desde tu WhatsApp.";

/**
 * Aprueba un borrador del piloto en sombra (con o sin corrección): ejecuta su acción pendiente
 * (cita) y lo envía. Si algo falla antes del envío, el borrador vuelve a quedar pendiente.
 */
export async function aprobarBorrador(
  deps: Dependencias,
  corredor: Corredor,
  mensajeId: string,
  textoCorregido?: string,
): Promise<Resultado> {
  const { repo } = deps;
  const ahora = deps.ahora?.() ?? new Date();
  const b = await repo.borrador(corredor.id, mensajeId);
  if (!b || b.estado_borrador !== "pendiente") return { ok: false, motivo: "Este borrador ya se resolvió." };
  if (!ventanaAbierta(b.ultimo_mensaje_cliente_at, ahora)) return { ok: false, motivo: VENTANA_CERRADA };

  const final = (textoCorregido ?? b.contenido).trim();
  if (!final) return { ok: false, motivo: "El mensaje está vacío." };
  const corregido = final !== b.contenido.trim();

  // Se reclama el borrador antes de actuar: un segundo toque encuentra que ya no está pendiente.
  const estado = corregido ? "corregido" : "aprobado";
  if (!(await repo.resolverBorrador(corredor.id, mensajeId, { estado_borrador: estado, contenido: final }))) {
    return { ok: false, motivo: "Este borrador ya se resolvió." };
  }
  const devolver = async (motivo: string): Promise<Resultado> => {
    await repo.resolverBorrador(corredor.id, mensajeId, { estado_borrador: "pendiente", contenido: b.contenido }, estado);
    return { ok: false, motivo };
  };

  const accion = b.accion;
  if (accion?.tipo === "crear_cita") {
    const id = await repo.crearCita({
      corredor_id: corredor.id,
      contacto_id: b.contacto_id,
      conversacion_id: b.conversacion_id,
      propiedad_id: accion.propiedad_id,
      inicio: new Date(accion.inicio),
      fin: new Date(accion.fin),
    });
    if (!id) return devolver("Ese horario ya se ocupó. Descarta este borrador y pídele al cliente otro horario.");
    if (accion.reemplaza_cita_id) await repo.cambiarEstadoCita(corredor.id, accion.reemplaza_cita_id, "cancelada");
    // CRM: con la visita agendada el cliente pasa a "visita" (si todavía estaba antes).
    await repo.actualizarPerfilCliente(corredor.id, b.contacto_id, { etapa: "visita", soloDesde: ["nuevo", "interesado"] });
  } else if (accion?.tipo === "cancelar_cita") {
    await repo.cambiarEstadoCita(corredor.id, accion.cita_id, "cancelada");
  } else if (accion?.tipo === "confirmar_asistencia") {
    await repo.cambiarEstadoCita(corredor.id, accion.cita_id, "confirmada");
  }

  try {
    const waId = await deps.whatsapp.texto(corredor.whatsapp_phone_number_id!, b.telefono, final);
    await repo.actualizarMensaje(corredor.id, mensajeId, { wa_message_id: waId, estado_entrega: "enviado" });
  } catch {
    await repo.actualizarMensaje(corredor.id, mensajeId, { estado_entrega: "fallido" });
    const cita = accion?.tipo === "crear_cita" ? "La cita quedó agendada, pero " : "";
    return {
      ok: false,
      motivo: `${cita}WhatsApp no aceptó el mensaje. Escríbele al cliente desde la conversación o desde tu WhatsApp.`,
    };
  }
  await repo.registrarUso(corredor.id, { mensajesSalientes: 1 });
  if (corregido) await repo.guardarCorreccion(corredor.id, mensajeId, b.contenido, final);
  return { ok: true };
}

export async function descartarBorrador(deps: Dependencias, corredor: Corredor, mensajeId: string): Promise<Resultado> {
  const ok = await deps.repo.resolverBorrador(corredor.id, mensajeId, { estado_borrador: "descartado" });
  return ok ? { ok: true } : { ok: false, motivo: "Este borrador ya se resolvió." };
}

/** El corredor toma la conversación: la asistente deja de contestar en ella. */
export async function tomarControl(deps: Dependencias, corredor: Corredor, conversacionId: string): Promise<Resultado> {
  await deps.repo.actualizarConversacion(corredor.id, conversacionId, { control: "corredor" });
  return { ok: true };
}

/** La asistente vuelve a contestar (también reabre una conversación escalada). */
export async function devolverControl(deps: Dependencias, corredor: Corredor, conversacionId: string): Promise<Resultado> {
  await deps.repo.actualizarConversacion(corredor.id, conversacionId, { control: "asistente", estado: "abierta" });
  return { ok: true };
}

/** El corredor le escribe al cliente desde el panel, por el número de la asistente. */
export async function escribirComoCorredor(
  deps: Dependencias,
  corredor: Corredor,
  conversacionId: string,
  texto: string,
): Promise<Resultado> {
  const limpio = texto.trim();
  if (!limpio) return { ok: false, motivo: "El mensaje está vacío." };
  const ahora = deps.ahora?.() ?? new Date();
  const conv = await deps.repo.conversacionConContacto(corredor.id, conversacionId);
  if (!conv) return { ok: false, motivo: "No encontré la conversación." };
  if (!ventanaAbierta(conv.ultimo_mensaje_cliente_at, ahora)) return { ok: false, motivo: VENTANA_CERRADA };

  let waId: string;
  try {
    waId = await deps.whatsapp.texto(corredor.whatsapp_phone_number_id!, conv.telefono, limpio);
  } catch {
    return { ok: false, motivo: "WhatsApp no aceptó el mensaje. Inténtalo de nuevo." };
  }
  await deps.repo.guardarMensaje({
    corredor_id: corredor.id,
    conversacion_id: conversacionId,
    direccion: "saliente",
    autor: "corredor",
    contenido: limpio,
    wa_message_id: waId,
    estado_entrega: "enviado",
  });
  await deps.repo.registrarUso(corredor.id, { mensajesSalientes: 1 });
  // Si el corredor escribe, la conversación es suya hasta que la devuelva.
  if (conv.control !== "corredor") await deps.repo.actualizarConversacion(corredor.id, conversacionId, { control: "corredor" });
  return { ok: true };
}
