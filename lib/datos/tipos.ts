// Filas de la base que usa el backend. Reflejan supabase/migrations.

export interface Corredor {
  id: string;
  nombre: string;
  nombre_contacto: string;
  whatsapp_phone_number_id: string | null;
  whatsapp_corredor: string | null;
  zona_horaria: string;
  tono: string;
  reglas_escalamiento: string[];
  tope_mensajes_mes: number;
  aviso_mensajes_mes: number;
  respuesta_automatica: boolean;
  duracion_visita_min: number;
  margen_visitas_min: number;
  anticipacion_min_horas: number;
  horizonte_agenda_dias: number;
  hora_plan_dia: string;
}

export interface Contacto {
  id: string;
  corredor_id: string;
  telefono: string;
  nombre: string | null;
}

export interface Conversacion {
  id: string;
  corredor_id: string;
  contacto_id: string;
  estado: "abierta" | "escalada" | "cerrada";
  control: "asistente" | "corredor";
}

export type Intencion = "consulta_propiedad" | "agendar_visita" | "otro" | "pasar_a_corredor";

export interface Mensaje {
  id: string;
  direccion: "entrante" | "saliente";
  autor: "cliente" | "asistente" | "corredor" | "sistema";
  contenido: string | null;
  estado_borrador: "pendiente" | "aprobado" | "corregido" | "descartado" | null;
  created_at: string;
}

export interface NuevoMensaje {
  corredor_id: string;
  conversacion_id: string;
  direccion: "entrante" | "saliente";
  autor: Mensaje["autor"];
  tipo?: "texto" | "imagen" | "audio" | "documento" | "ubicacion" | "plantilla" | "otro";
  contenido: string | null;
  wa_message_id?: string | null;
  intencion?: Intencion | null;
  estado_borrador?: Mensaje["estado_borrador"];
  estado_entrega?: "enviado" | "entregado" | "leido" | "fallido" | null;
  /** Acción pendiente de un borrador del piloto en sombra; se ejecuta al aprobarlo. */
  accion?: AccionPendiente | null;
}

export type AccionPendiente =
  | { tipo: "crear_cita"; inicio: string; fin: string; propiedad_id: string | null; reemplaza_cita_id: string | null }
  | { tipo: "cancelar_cita"; cita_id: string }
  | { tipo: "confirmar_asistencia"; cita_id: string };

export interface Propiedad {
  id: string;
  codigo: string;
  titulo: string;
  tipo: string;
  operacion: string;
  precio: number | null;
  moneda: string;
  provincia: string | null;
  canton: string | null;
  distrito: string | null;
  zona: string | null;
  habitaciones: number | null;
  banos: number | null;
  m2_construccion: number | null;
  m2_terreno: number | null;
  descripcion: string | null;
  amenidades: string[];
  url_e24: string | null;
  estado: string;
}

export interface UsoDelta {
  mensajesEntrantes?: number;
  mensajesSalientes?: number;
  llamadasClaude?: number;
  tokensEntrada?: number;
  tokensSalida?: number;
  costoClaudeUsd?: number;
}

export interface UsoMensual {
  mes: string;
  mensajes_total: number;
  aviso_tope_enviado_at: string | null;
}

export type EstadoCita = "agendada" | "confirmada" | "cancelada" | "realizada" | "no_asistio";

export interface Cita {
  id: string;
  inicio: Date;
  fin: Date;
  estado: EstadoCita;
  propiedad_titulo: string | null;
}

export interface DatosAgenda {
  horarios: { dia_semana: number; hora_inicio: string; hora_fin: string }[];
  bloqueos: { inicio: Date; fin: Date }[];
  /** Citas activas del corredor (agendadas o confirmadas) en el rango pedido. */
  citas: { inicio: Date; fin: Date }[];
}

export interface NuevaCita {
  corredor_id: string;
  contacto_id: string;
  conversacion_id: string | null;
  propiedad_id: string | null;
  inicio: Date;
  fin: Date;
}

/** Cita a recordar al cliente, con lo necesario para mandarle la plantilla. */
export interface CitaParaRecordar {
  id: string;
  corredor_id: string;
  contacto_id: string;
  conversacion_id: string | null;
  inicio: Date;
  creada: Date;
  telefono: string;
  propiedad_titulo: string | null;
  phone_number_id: string;
  zona_horaria: string;
  nombre_contacto: string;
}

export interface CitaCalendario {
  id: string;
  inicio: Date;
  fin: Date;
  estado: EstadoCita;
  cliente_nombre: string | null;
  cliente_telefono: string;
  propiedad_titulo: string | null;
  propiedad_codigo: string | null;
  notas: string | null;
  updated_at: Date;
}

/** Lo que entra al plan del día de un corredor. */
export interface DatosPlan {
  citasHoy: { inicio: Date; estado: EstadoCita; cliente: string; propiedad: string | null }[];
  prospectosNuevos: string[];
  conversacionesEscaladas: string[];
  borradoresPendientes: number;
  citasManana: number;
}
