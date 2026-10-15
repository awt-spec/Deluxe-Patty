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
}

export interface Propiedad {
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
