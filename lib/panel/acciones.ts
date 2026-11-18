import { ordenarParaWhatsApp } from "../whatsapp/formato";
import type { Dependencias } from "../asistente/contexto";
import type { Corredor } from "../datos/tipos";
import { LIMITES, textoLibre } from "./texto-libre";
import { contenidoAdjunto } from "./adjuntos-chat";

// Acciones del corredor desde el panel. Quien llama ya verificó con la sesión del corredor (RLS)
// que el mensaje o la conversación son suyos; aquí todo filtra además por corredor_id.

/** `aviso`: lo que se le dice al corredor cuando no es el "Enviado." de siempre (un segundo toque, por ejemplo). */
export type Resultado = { ok: true; aviso?: string } | { ok: false; motivo: string };

const YA_RESUELTO = "Este borrador ya se resolvió.";
/** Un segundo toque en Enviar o No enviar: lo pedido ya está hecho, se responde como hecho (no como error). */
const YA_ENVIADO: Resultado = { ok: true, aviso: "Enviado." };
const YA_DESCARTADO: Resultado = { ok: true, aviso: "Listo, no se envió." };
/** Aprobado y no fallido (enviado o enviándose por el primer toque). */
const yaSalio = (b: { estado_borrador: string | null; estado_entrega?: string | null }) =>
  (b.estado_borrador === "aprobado" || b.estado_borrador === "corregido") && b.estado_entrega !== "fallido";

const VENTANA_MS = 24 * 60 * 60_000;

function ventanaAbierta(ultimo: string | null, ahora: Date): boolean {
  return !!ultimo && ahora.getTime() - new Date(ultimo).getTime() < VENTANA_MS;
}

const VENTANA_CERRADA =
  "Pasaron más de 24 horas desde el último mensaje del cliente: WhatsApp no deja escribirle desde la asistente. " +
  "Escríbele desde tu WhatsApp.";

/** Mensaje del corredor para un cliente: limpio y, si pasa del tope de WhatsApp, no se corta, se rechaza. */
function mensajeParaCliente(texto: string): { ok: true; texto: string } | { ok: false; motivo: string } {
  const r = textoLibre(texto, LIMITES.mensajeCliente, "El mensaje");
  if (!r.ok) return { ok: false, motivo: `${r.motivo} WhatsApp no deja más; divídelo en dos mensajes.` };
  return r.valor ? { ok: true, texto: r.valor } : { ok: false, motivo: "El mensaje está vacío." };
}

/** Un archivo ya subido al Storage propio, listo para mandarlo al cliente. */
export type AdjuntoListo = { clase: "imagen" | "pdf"; url: string; nombre: string };
/** WhatsApp corta el pie de foto o de documento en 1.024 caracteres. */
const LIMITE_LEYENDA = 1024;

/**
 * Fotos y PDF que el corredor le manda al cliente desde el chat. El texto que escribió va como pie del primero.
 * Se mandan en orden; si uno falla, los anteriores ya salieron y se dice cuántos llegaron.
 */
export async function enviarAdjuntosComoCorredor(
  deps: Dependencias,
  corredor: Corredor,
  conversacionId: string,
  adjuntos: AdjuntoListo[],
  texto: string,
): Promise<Resultado> {
  if (adjuntos.length === 0) return { ok: false, motivo: "No llegó ningún archivo." };
  let leyenda: string | null = null;
  if (texto.trim()) {
    const r = textoLibre(texto, LIMITE_LEYENDA, "El texto que acompaña al archivo");
    if (!r.ok) return { ok: false, motivo: `${r.motivo} Mándalo como mensaje aparte.` };
    leyenda = r.valor || null;
  }
  const ahora = deps.ahora?.() ?? new Date();
  const conv = await deps.repo.conversacionConContacto(corredor.id, conversacionId);
  if (!conv) return { ok: false, motivo: "No encontré la conversación." };
  if (!ventanaAbierta(conv.ultimo_mensaje_cliente_at, ahora)) return { ok: false, motivo: VENTANA_CERRADA };

  let enviados = 0;
  for (const [i, a] of adjuntos.entries()) {
    const pie = i === 0 ? leyenda : null;
    let waId: string;
    try {
      waId =
        a.clase === "imagen"
          ? await deps.whatsapp.imagen(corredor.whatsapp_phone_number_id!, conv.telefono, a.url, pie ?? "")
          : await deps.whatsapp.documento(corredor.whatsapp_phone_number_id!, conv.telefono, a.url, a.nombre, pie ?? "");
    } catch {
      break;
    }
    await deps.repo.guardarMensaje({
      corredor_id: corredor.id,
      conversacion_id: conversacionId,
      direccion: "saliente",
      autor: "corredor",
      tipo: a.clase === "imagen" ? "imagen" : "documento",
      contenido: contenidoAdjunto(a.url, pie),
      wa_message_id: waId,
      estado_entrega: "enviado",
    });
    enviados++;
  }
  if (enviados > 0) {
    await deps.repo.registrarUso(corredor.id, { mensajesSalientes: enviados });
    if (conv.control !== "corredor") await deps.repo.actualizarConversacion(corredor.id, conversacionId, { control: "corredor" });
  }
  if (enviados === adjuntos.length) return { ok: true, aviso: enviados === 1 ? "Enviado." : `Enviados los ${enviados} archivos.` };
  if (enviados === 0) return { ok: false, motivo: "WhatsApp no aceptó el archivo. Inténtalo de nuevo." };
  return { ok: false, motivo: `Salieron ${enviados} de ${adjuntos.length}; WhatsApp no aceptó el resto. Inténtalo de nuevo con los que faltan.` };
}

/** Formatos de nota de voz que WhatsApp acepta (Ogg/Opus se ve como nota de voz; los demás, como audio). */
export const MIMES_NOTA_VOZ = ["audio/ogg", "audio/mp4", "audio/aac", "audio/mpeg"] as const;
export const MAX_NOTA_VOZ_BYTES = 4 * 1024 * 1024;

/** Que los primeros bytes digan lo mismo que el tipo (un archivo cualquiera no pasa por nota de voz). */
export function esNotaDeVozValida(datos: Uint8Array, mime: string): boolean {
  const s = (i: number, n: number) => String.fromCharCode(...datos.subarray(i, i + n));
  if (mime === "audio/ogg") return s(0, 4) === "OggS" && s(28, 8) === "OpusHead";
  if (mime === "audio/mp4") return s(4, 4) === "ftyp";
  if (mime === "audio/aac") return datos[0] === 0xff && (datos[1] & 0xf6) === 0xf0;
  if (mime === "audio/mpeg") return s(0, 3) === "ID3" || (datos[0] === 0xff && (datos[1] & 0xe0) === 0xe0);
  return false;
}

/** "0:07", "1:25". */
export const duracionCorta = (segundos: number) => {
  const s = Math.max(1, Math.round(segundos));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** Nota de voz que el corredor graba en el chat con un cliente: sale como nota de voz de WhatsApp. */
export async function enviarNotaDeVozComoCorredor(
  deps: Dependencias,
  corredor: Corredor,
  conversacionId: string,
  datos: Uint8Array,
  mime: string,
  segundos: number,
): Promise<Resultado> {
  if (!(MIMES_NOTA_VOZ as readonly string[]).includes(mime)) return { ok: false, motivo: "Ese formato de audio no se puede mandar." };
  if (datos.length < 100) return { ok: false, motivo: "La nota de voz salió vacía. Vuelve a grabarla." };
  if (datos.length > MAX_NOTA_VOZ_BYTES) return { ok: false, motivo: "La nota de voz es muy larga. Graba menos de 5 minutos." };
  if (!esNotaDeVozValida(datos, mime)) return { ok: false, motivo: "No reconocí el audio. Vuelve a grabarlo." };
  if (!deps.whatsapp.audio) return { ok: false, motivo: "WhatsApp no está configurado para mandar audios." };
  const ahora = deps.ahora?.() ?? new Date();
  const conv = await deps.repo.conversacionConContacto(corredor.id, conversacionId);
  if (!conv) return { ok: false, motivo: "No encontré la conversación." };
  if (!ventanaAbierta(conv.ultimo_mensaje_cliente_at, ahora)) return { ok: false, motivo: VENTANA_CERRADA };
  let waId: string;
  try {
    waId = await deps.whatsapp.audio(corredor.whatsapp_phone_number_id!, conv.telefono, datos, mime);
  } catch {
    return { ok: false, motivo: "WhatsApp no aceptó la nota de voz. Inténtalo de nuevo." };
  }
  const dur = Number.isFinite(segundos) && segundos > 0 && segundos < 3600 ? ` (${duracionCorta(segundos)})` : "";
  await deps.repo.guardarMensaje({
    corredor_id: corredor.id,
    conversacion_id: conversacionId,
    direccion: "saliente",
    autor: "corredor",
    tipo: "audio",
    contenido: `Nota de voz enviada${dur}`,
    wa_message_id: waId,
    estado_entrega: "enviado",
  });
  await deps.repo.registrarUso(corredor.id, { mensajesSalientes: 1 });
  if (conv.control !== "corredor") await deps.repo.actualizarConversacion(corredor.id, conversacionId, { control: "corredor" });
  return { ok: true, aviso: "Nota de voz enviada." };
}

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
  if (b && yaSalio(b)) return YA_ENVIADO;
  if (!b || b.estado_borrador !== "pendiente") return { ok: false, motivo: YA_RESUELTO };
  if (!ventanaAbierta(b.ultimo_mensaje_cliente_at, ahora)) return { ok: false, motivo: VENTANA_CERRADA };

  // Lo que corrige el corredor se limpia (sin caracteres de dirección o control) y no se corta: si pasa del tope, se le dice.
  const propio = textoCorregido === undefined ? null : mensajeParaCliente(textoCorregido);
  if (propio && !propio.ok) return propio;
  // Lo que sale por WhatsApp va en su formato (sin markdown del modelo); idempotente, así que un borrador ya ordenado queda igual.
  const final = ordenarParaWhatsApp(propio?.ok ? propio.texto : b.contenido.trim());
  if (!final) return { ok: false, motivo: "El mensaje está vacío." };
  // Solo cuenta como corrección lo que cambió el corredor, no el formato.
  const corregido = final !== ordenarParaWhatsApp(b.contenido.trim());

  // Se reclama el borrador antes de actuar: un segundo toque encuentra que ya no está pendiente.
  const estado = corregido ? "corregido" : "aprobado";
  if (!(await repo.resolverBorrador(corredor.id, mensajeId, { estado_borrador: estado, contenido: final }))) {
    // Dos toques a la vez: el otro lo reclamó primero y es el que lo manda.
    const ahoraEs = await repo.borrador(corredor.id, mensajeId);
    return ahoraEs && yaSalio(ahoraEs) ? YA_ENVIADO : { ok: false, motivo: YA_RESUELTO };
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
    // En el chat se ve la hora en que salió, no la de cuando la asistente lo propuso (podía ser de madrugada).
    await repo.actualizarMensaje(corredor.id, mensajeId, { wa_message_id: waId, estado_entrega: "enviado", created_at: (deps.ahora?.() ?? new Date()).toISOString() });
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
  if (ok) return { ok: true };
  // Un segundo toque en "No enviar": ya estaba descartado, no es un error.
  const b = await deps.repo.borrador(corredor.id, mensajeId);
  return b?.estado_borrador === "descartado" ? YA_DESCARTADO : { ok: false, motivo: YA_RESUELTO };
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
  const m = mensajeParaCliente(texto);
  if (!m.ok) return m;
  const limpio = m.texto;
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
