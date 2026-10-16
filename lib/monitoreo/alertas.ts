import type { SupabaseClient } from "@supabase/supabase-js";
import type { EnviadorWhatsApp } from "../whatsapp/enviar";
import { errorSeguro } from "./errores";

// Alertas de operación a soporte (AWT) por WhatsApp, con la plantilla de aviso (funciona fuera de la
// ventana de 24 horas). Nunca llevan datos personales: solo qué falló, dónde y cuándo.

export interface Alertas {
  /** Manda la alerta si la misma `clave` no se mandó en la última hora. true si la mandó. */
  alertar(clave: string, texto: string): Promise<boolean>;
}

export interface ConfigAlertas {
  whatsapp: EnviadorWhatsApp;
  plantilla: string;
  /** Número de soporte que recibe las alertas (E.164). */
  destino: string | undefined;
  /** phone_number_id desde el que salen. */
  phoneNumberId: string | undefined;
  reclamar: (clave: string, minutos: number) => Promise<boolean>;
  minutos?: number;
}

export function crearAlertas(c: ConfigAlertas): Alertas {
  return {
    async alertar(clave, texto) {
      if (!c.destino || !c.phoneNumberId) {
        console.error(JSON.stringify({ evento: "alerta_sin_destino", clave }));
        return false;
      }
      try {
        if (!(await c.reclamar(clave, c.minutos ?? 60))) return false;
        await c.whatsapp.plantilla(c.phoneNumberId, c.destino, c.plantilla, [`[Asistente] ${texto}`]);
        return true;
      } catch (error) {
        // Una alerta que falla no puede tumbar lo que la disparó.
        console.error(JSON.stringify({ evento: "error_alerta", clave, error: errorSeguro(error) }));
        return false;
      }
    },
  };
}

export function reclamarConSupabase(db: SupabaseClient) {
  return async (clave: string, minutos: number) => {
    const { data, error } = await db.rpc("reclamar_alerta", { p_clave: clave, p_minutos: minutos });
    if (error) throw new Error(`reclamar_alerta: ${error.message}`);
    return data === true;
  };
}
