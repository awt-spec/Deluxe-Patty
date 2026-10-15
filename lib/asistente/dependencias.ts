import "server-only";
import { crearRepositorioSupabase } from "../datos/repositorio";
import { createAdminClient } from "../supabase/admin";
import { crearEnviadorWhatsApp } from "../whatsapp/enviar";
import { crearCerebroClaude } from "./cerebro";
import type { Dependencias } from "./procesar";

let deps: Dependencias | null = null;

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
    };
  }
  return deps;
}
