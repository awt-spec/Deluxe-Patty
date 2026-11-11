import { vi } from "vitest";
import { estado } from "../entorno";

// lib/asistente/dependencias: nada sale de verdad. El repositorio solo responde lo que las acciones consultan.
export const presupuesto = { gastoDia: 0, gastoMes: 0, topeDia: 10, topeMes: 150 };
export const registrarAudio = vi.fn(async () => {});
export const dependenciasPara = vi.fn(() => ({
  repo: { presupuestoIA: async () => presupuesto, registrarAudio },
  whatsapp: {},
  db: estado.admin,
}));
export const dependencias = dependenciasPara;
export const alertar = vi.fn();
export const esperarAlertas = async () => {};
export const crearMedios = () => ({});
