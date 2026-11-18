import { createHash, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

// Un toque, un envío. Los formularios que le escriben a un cliente o crean algo (Enviar del chat, Agendar) llevan un
// campo oculto `envio` con un código nuevo en cada pantalla. La acción reclama ese código en la base antes de actuar
// (`reclamar_alerta`, atómico): de dos envíos del mismo formulario (doble toque, "Reintentar" del navegador) solo
// el primero actúa; el segundo responde como si hubiera salido bien, sin mandar nada otra vez. La clave lleva además
// una huella de lo que se pide (el texto, el cliente y la hora): un código viejo (volver con "Atrás") con otro texto
// no se frena. Si lo que se pidió falla, la marca se suelta para que el corredor pueda reintentar.
// La marca no guarda datos del cliente: solo el corredor, la acción, el código y una huella.

export const CAMPO_ENVIO = "envio";

/** Cuánto dura la marca de un envío: de sobra para un doble toque o un reenvío del navegador. */
export const MINUTOS_ENVIO = 10;

/** Un código nuevo para el campo oculto (se genera en el servidor al dibujar la pantalla). */
export const nuevoEnvio = (): string => randomUUID();

const ES_CODIGO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** El código del formulario, o null si no vino o no tiene la forma de uno (entonces no se frena nada). */
export function leerEnvio(f: FormData): string | null {
  const v = String(f.get(CAMPO_ENVIO) ?? "").trim().toLowerCase();
  return ES_CODIGO.test(v) ? v : null;
}

/** La clave en `alertas`: sin texto del cliente (solo una huella corta de lo pedido). */
export function claveEnvio(accion: string, corredorId: string, codigo: string, pedido = ""): string {
  const huella = createHash("sha256").update(pedido).digest("hex").slice(0, 16);
  return `envio:${accion}:${corredorId}:${codigo}:${huella}`;
}

export type Turno = { primero: boolean; soltar: () => Promise<void> };

/**
 * Reclama el envío. `primero: false` = ya se mandó (o se está mandando) este mismo formulario: no hay que actuar.
 * Sin código, o si la base no responde, deja pasar (nunca frena un envío legítimo por una falla de la marca).
 */
export async function reclamarEnvio(
  db: SupabaseClient,
  accion: string,
  corredorId: string,
  codigo: string | null,
  pedido = "",
): Promise<Turno> {
  const nada: Turno = { primero: true, soltar: async () => {} };
  if (!codigo) return nada;
  const clave = claveEnvio(accion, corredorId, codigo, pedido);
  try {
    const { data, error } = await db.rpc("reclamar_alerta", { p_clave: clave, p_minutos: MINUTOS_ENVIO });
    if (error) return nada;
    return {
      primero: data !== false,
      soltar: async () => {
        try {
          await db.from("alertas").delete().eq("clave", clave);
        } catch {
          // Si no se puede soltar, el corredor reintenta con la pantalla nueva (otro código).
        }
      },
    };
  } catch {
    return nada;
  }
}
