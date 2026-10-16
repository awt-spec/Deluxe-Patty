import type { EstadoCita, Intencion, Mensaje } from "../datos/tipos";

// Estado de una prueba de la asistente. Sin dependencias de servidor: lo usa también el navegador.

export const MAX_MENSAJES_SIMULACION = 40;
export const MAX_TEXTO_SIMULACION = 1000;

export interface CitaSimulada {
  id: string;
  inicio: string;
  fin: string;
  estado: EstadoCita;
  propiedad_id: string | null;
}

export interface EstadoSimulacion {
  mensajes: { direccion: "entrante" | "saliente"; autor: Mensaje["autor"]; contenido: string }[];
  citas: CitaSimulada[];
  escalada: boolean;
}

export const ESTADO_INICIAL: EstadoSimulacion = { mensajes: [], citas: [], escalada: false };

export interface TurnoSimulado {
  respuestas: string[];
  avisos: string[];
  intencion: Intencion | null;
  resultado: string;
  accionAgenda: string | null;
  error: boolean;
}

