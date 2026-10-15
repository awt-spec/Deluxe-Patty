import "server-only";
import { crearRepositorioSupabase } from "../datos/repositorio";
import { createAdminClient } from "../supabase/admin";
import { crearEditorOpenAI } from "../fotos/editor";
import { crearAlertas, reclamarConSupabase, type Alertas } from "../monitoreo/alertas";
import { crearEnviadorWhatsApp } from "../whatsapp/enviar";
import { crearCerebroClaude } from "./cerebro";
import type { Dependencias } from "./procesar";

let deps: Dependencias | null = null;
let alertas: Alertas | null = null;
const pendientes = new Set<Promise<unknown>>();

/** En serverless, lo que no se espera puede cortarse: cada ruta espera las alertas antes de terminar. */
export async function esperarAlertas() {
  await Promise.allSettled([...pendientes]);
}

/** Alerta a soporte sin bloquear a quien la dispara; esperarAlertas() la deja salir. */
export function alertar(clave: string, texto: string) {
  const p = alertasSoporte()
    .alertar(clave, texto)
    .finally(() => pendientes.delete(p));
  pendientes.add(p);
}

/** Alertas a soporte (SOPORTE_WHATSAPP) desde SOPORTE_PHONE_NUMBER_ID. */
export function alertasSoporte(): Alertas {
  if (!alertas) {
    alertas = crearAlertas({
      whatsapp: crearEnviadorWhatsApp(process.env.WHATSAPP_ACCESS_TOKEN ?? ""),
      plantilla: process.env.WHATSAPP_PLANTILLA_AVISO ?? "aviso_corredor",
      destino: process.env.SOPORTE_WHATSAPP,
      phoneNumberId: process.env.SOPORTE_PHONE_NUMBER_ID,
      reclamar: reclamarConSupabase(createAdminClient()),
    });
  }
  return alertas;
}

export function dependencias(): Dependencias {
  if (!deps) {
    const token = process.env.WHATSAPP_ACCESS_TOKEN;
    if (!token) throw new Error("Falta WHATSAPP_ACCESS_TOKEN");
    deps = {
      repo: crearRepositorioSupabase(createAdminClient()),
      cerebro: crearCerebroClaude(),
      whatsapp: crearEnviadorWhatsApp(token),
      plantillaAviso: process.env.WHATSAPP_PLANTILLA_AVISO ?? "aviso_corredor",
      plantillaRecordatorio: process.env.WHATSAPP_PLANTILLA_RECORDATORIO ?? "recordatorio_visita",
      fotos: process.env.OPENAI_API_KEY ? crearEditorOpenAI() : undefined,
      registrar: (evento, datos) => {
        const linea = JSON.stringify({ evento, ...datos });
        if (evento.startsWith("error_")) {
          console.error(linea);
          // Alerta a soporte por tipo de error y corredor (una por hora como máximo).
          alertar(`${evento}:${String(datos.corredorId ?? "")}`, `${evento} (corredor ${String(datos.corredorId ?? "?")})`);
        } else {
          console.info(linea);
        }
      },
    };
  }
  return deps;
}
