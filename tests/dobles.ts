import type { Repositorio } from "../lib/datos/repositorio";
import type { Contacto, Conversacion, Corredor, EstadoCita, NuevaCita, NuevoMensaje } from "../lib/datos/tipos";
import type { MensajeEntrante } from "../lib/whatsapp/parsear";

export const PATRICIA = "+50670000000";

export function corredorBase(): Corredor {
  return {
    id: "c1",
    nombre: "Deluxe Properties",
    nombre_contacto: "Patricia",
    whatsapp_phone_number_id: "PNID",
    whatsapp_corredor: PATRICIA,
    zona_horaria: "America/Costa_Rica",
    tono: "",
    reglas_escalamiento: ["negociación de precio", "comisiones"],
    tope_mensajes_mes: 1000,
    aviso_mensajes_mes: 900,
    respuesta_automatica: true,
    duracion_visita_min: 60,
    margen_visitas_min: 30,
    anticipacion_min_horas: 3,
    horizonte_agenda_dias: 14,
    hora_plan_dia: "07:00:00",
  };
}

// Repositorio en memoria que imita las reglas de la base que importan aquí.
export function repoEnMemoria(corredor: Corredor) {
  const mensajes: (NuevoMensaje & { id: string })[] = [];
  const conversaciones: (Conversacion & { ultimo_mensaje_cliente_at?: string })[] = [];
  const contactos: (Contacto & { es_corredor?: boolean; creado?: Date })[] = [];
  const planes = new Map<string, { contenido: string; enviado: boolean }>();
  const citas: (NuevaCita & { id: string; estado: EstadoCita; recordatorio: boolean; creada: Date })[] = [];
  const horarios = [1, 2, 3, 4, 5].map((d) => ({ dia_semana: d, hora_inicio: "08:00:00", hora_fin: "17:00:00" }));
  const activa = (c: { estado: EstadoCita }) => c.estado === "agendada" || c.estado === "confirmada";
  const uso = { mes: "2026-10-01", mensajes_total: 0, aviso_tope_enviado_at: null as string | null };
  let n = 0;
  const repo: Repositorio = {
    corredorPorPhoneNumberId: async (id) => (id === corredor.whatsapp_phone_number_id ? corredor : null),
    contacto: async (corredorId, telefono, nombre) => {
      let c = contactos.find((x) => x.corredor_id === corredorId && x.telefono === telefono);
      if (!c) contactos.push((c = { id: `ct${++n}`, corredor_id: corredorId, telefono, nombre }));
      return c;
    },
    conversacionActiva: async (corredorId, contactoId) => {
      let c = conversaciones.find((x) => x.contacto_id === contactoId && x.estado !== "cerrada");
      if (!c)
        conversaciones.push(
          (c = { id: `cv${++n}`, corredor_id: corredorId, contacto_id: contactoId, estado: "abierta", control: "asistente" }),
        );
      return c;
    },
    guardarMensaje: async (m) => {
      if (m.wa_message_id && mensajes.some((x) => x.wa_message_id === m.wa_message_id)) return null;
      const id = `m${++n}`;
      mensajes.push({ ...m, id });
      return id;
    },
    actualizarMensaje: async (_c, id, cambios) => {
      Object.assign(mensajes.find((m) => m.id === id)!, cambios);
    },
    actualizarConversacion: async (_c, id, cambios) => {
      Object.assign(conversaciones.find((c) => c.id === id)!, cambios);
    },
    historial: async (_c, conversacionId) =>
      mensajes
        .filter((m) => m.conversacion_id === conversacionId)
        .map((m) => ({
          id: m.id,
          direccion: m.direccion,
          autor: m.autor,
          contenido: m.contenido,
          estado_borrador: m.estado_borrador ?? null,
          created_at: "",
        })),
    propiedadesActivas: async () => [],
    registrarUso: async (_c, d) => {
      uso.mensajes_total += (d.mensajesEntrantes ?? 0) + (d.mensajesSalientes ?? 0);
      return { ...uso };
    },
    marcarAvisoTope: async () => {
      if (uso.aviso_tope_enviado_at) return false;
      uso.aviso_tope_enviado_at = "ahora";
      return true;
    },
    actualizarEstadoEntrega: async () => {},
    datosAgenda: async () => ({ horarios, bloqueos: [], citas: citas.filter(activa) }),
    citasProximasContacto: async (_c, contactoId, desde) =>
      citas
        .filter((c) => c.contacto_id === contactoId && activa(c) && c.inicio >= desde)
        .map((c) => ({ id: c.id, inicio: c.inicio, fin: c.fin, estado: c.estado, propiedad_titulo: null })),
    crearCita: async (cita) => {
      if (citas.some((c) => activa(c) && c.inicio < cita.fin && cita.inicio < c.fin)) return null;
      const id = `cita${++n}`;
      citas.push({ ...cita, id, estado: "agendada", recordatorio: false, creada: new Date(0) });
      return id;
    },
    cambiarEstadoCita: async (_c, id, estado) => {
      const c = citas.find((x) => x.id === id && activa(x));
      if (c) c.estado = estado;
      return !!c;
    },
    citasParaRecordar: async (desde, hasta) =>
      citas
        .filter((c) => activa(c) && !c.recordatorio && c.inicio >= desde && c.inicio <= hasta)
        .map((c) => ({
          id: c.id,
          corredor_id: c.corredor_id,
          contacto_id: c.contacto_id,
          conversacion_id: c.conversacion_id,
          inicio: c.inicio,
          creada: c.creada,
          telefono: "+50688880001",
          propiedad_titulo: null,
          phone_number_id: "PNID",
          zona_horaria: "America/Costa_Rica",
          nombre_contacto: "Patricia",
        })),
    marcarRecordatorio: async (_c, id) => {
      const c = citas.find((x) => x.id === id);
      if (!c || c.recordatorio) return false;
      c.recordatorio = true;
      return true;
    },
    calendarioPorToken: async () => null,
    contactoCorredor: async (corredorId, telefono) => {
      let c = contactos.find((x) => x.corredor_id === corredorId && x.telefono === telefono);
      if (!c) contactos.push((c = { id: `ct${++n}`, corredor_id: corredorId, telefono, nombre: null }));
      c.es_corredor = true;
      return c;
    },
    ultimoMensajeDe: async (_c, contactoId) => {
      const fechas = conversaciones
        .filter((c) => c.contacto_id === contactoId && c.ultimo_mensaje_cliente_at)
        .map((c) => new Date(c.ultimo_mensaje_cliente_at!).getTime());
      return fechas.length ? new Date(Math.max(...fechas)) : null;
    },
    corredoresActivos: async () => [corredor],
    datosPlan: async (_c, _ahora, hoy, manana) => ({
      citasHoy: citas
        .filter((c) => activa(c) && c.inicio >= hoy.desde && c.inicio < hoy.hasta)
        .map((c) => ({ inicio: c.inicio, estado: c.estado, cliente: "Ana", propiedad: null })),
      prospectosNuevos: contactos.filter((c) => !c.es_corredor).map((c) => c.nombre ?? c.telefono),
      conversacionesEscaladas: conversaciones
        .filter((c) => c.estado === "escalada")
        .map((c) => contactos.find((x) => x.id === c.contacto_id)?.nombre ?? "Cliente"),
      borradoresPendientes: mensajes.filter((m) => m.estado_borrador === "pendiente").length,
      citasManana: citas.filter((c) => activa(c) && c.inicio >= manana.desde && c.inicio < manana.hasta).length,
    }),
    guardarPlan: async (_c, fecha, contenido) => {
      if (planes.has(fecha)) return false;
      planes.set(fecha, { contenido, enviado: false });
      return true;
    },
    planPendiente: async (_c, fecha) => {
      const p = planes.get(fecha);
      return p && !p.enviado ? p.contenido : null;
    },
    marcarPlanEnviado: async (_c, fecha) => {
      const p = planes.get(fecha);
      if (p) p.enviado = true;
    },
  };
  return { repo, mensajes, conversaciones, uso, citas, contactos, planes };
}

export function entrante(texto: string | null, extra: Partial<MensajeEntrante> = {}): MensajeEntrante {
  return {
    phoneNumberId: "PNID",
    waMessageId: `wamid.${Math.random()}`,
    telefono: "+50688880001",
    nombrePerfil: "Ana",
    tipo: texto === null ? "audio" : "texto",
    texto,
    timestamp: new Date("2026-10-20T15:00:00Z"),
    ...extra,
  };
}
