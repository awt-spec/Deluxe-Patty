import "server-only";
import { alertar, esperarAlertas } from "../asistente/dependencias";
import { crearCerebroClaude } from "../asistente/cerebro";
import { SIN_PRESUPUESTO } from "../asistente/limites";
import { crearRepositorioSupabase } from "../datos/repositorio";
import { errorSeguro } from "../monitoreo/errores";
import { createAdminClient } from "../supabase/admin";
import type { DependenciasAnuncio } from "./anuncio";
import { crearAlmacenExtension } from "./datos";
import { terminarBusqueda, type DependenciasExtension } from "./extension";

// Piezas comunes de las rutas /api/extension/*: dependencias, respuestas y manejo de errores. Los
// mensajes para el corredor salen de aquí y no de la extensión, para cambiarlos sin reinstalarla.

let deps: DependenciasExtension | null = null;

/** "Leer este anuncio": usa la base directa (anuncios, casas, fotos) además del repositorio y Claude. */
export function dependenciasAnuncio(): DependenciasAnuncio {
  const { repo } = dependenciasExtension();
  return { db: createAdminClient(), repo, cerebro: crearCerebroClaude() };
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function dependenciasExtension(): DependenciasExtension {
  if (!deps) {
    const db = createAdminClient();
    deps = { almacen: crearAlmacenExtension(db), repo: crearRepositorioSupabase(db), cerebro: crearCerebroClaude() };
  }
  return deps;
}

export const MENSAJES: Record<string, string> = {
  codigo: "Ese código no sirve: puede haber vencido (dura 10 minutos) o ya se usó. Pide otro en el panel.",
  permiso: "La extensión ya no está conectada. Conéctala de nuevo desde el panel, en Más y luego Dueños directos.",
  sin_corredor: "La extensión ya no está conectada. Conéctala de nuevo desde el panel, en Más y luego Dueños directos.",
  sin_zonas: "Primero escribe tus zonas de Encuentra24 en el panel, en Más y luego Ajustes, en Búsqueda de dueños.",
  sin_presupuesto: SIN_PRESUPUESTO,
  no_encontrada: "La búsqueda se interrumpió. Vuelve a empezarla.",
  detenida: "La detuviste antes de que leyera anuncios: no hay nada que guardar.",
  fuera_de_orden: "La búsqueda se interrumpió. Vuelve a empezarla.",
  sin_resultados:
    "Encuentra24 no mostró anuncios: pudo pedir la verificación o cambiar su página. Vuelve a intentarlo; si sigue pasando, avísale a soporte.",
  no_anuncio: "Esta página no parece un anuncio de Encuentra24. Abre el anuncio de una casa y vuelve a tocar el botón.",
  datos: "La extensión mandó algo que no se entiende. Actualízala o avísale a soporte.",
  servidor: "Algo falló de nuestro lado. Vuelve a intentarlo en un rato.",
};

export function responder(datos: Record<string, unknown>, status = 200): Response {
  return Response.json(datos, { status, headers: { "Cache-Control": "no-store" } });
}

export function fallo(motivo: string, status = 400): Response {
  return responder({ ok: false, motivo, mensaje: MENSAJES[motivo] ?? MENSAJES.servidor }, status);
}

/** Cuerpo JSON con tope de tamaño (una página de Encuentra24 pesa menos de 2 MB). */
export async function leerJson(req: Request, maxBytes = 4_000_000): Promise<Record<string, unknown> | null> {
  if (Number(req.headers.get("content-length") ?? 0) > maxBytes) return null;
  const texto = await req.text();
  if (texto.length > maxBytes) return null;
  try {
    const v = JSON.parse(texto) as unknown;
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Corre la ruta; un error inesperado se registra sin datos personales y avisa a soporte. */
export async function conManejo(ruta: string, f: () => Promise<Response>): Promise<Response> {
  try {
    return await f();
  } catch (e) {
    console.error(JSON.stringify({ evento: "error_extension", ruta, error: errorSeguro(e) }));
    alertar(`error_extension:${ruta}`, `La extensión de Chrome falló en ${ruta}: ${errorSeguro(e)}`);
    // El detalle (operación y código, sin datos personales) le sirve a soporte para saber qué falló.
    return responder({ ok: false, motivo: "servidor", mensaje: MENSAJES.servidor, detalle: errorSeguro(e) }, 500);
  } finally {
    await esperarAlertas();
  }
}

/**
 * Después de la última página (o al detenerla): Haiku revisa lo leído en segundo plano y los dueños quedan en el panel.
 * Soporte se entera si ninguna página trajo anuncios, salvo en la búsqueda semanal sola (ahí suele ser la verificación
 * de Cloudflare y se reintenta en el siguiente despertar) y cuando la persona la cortó.
 */
export async function terminarEnSegundoPlano(d: DependenciasExtension, corredorId: string, busqueda: string): Promise<void> {
  try {
    const r = await terminarBusqueda(d, corredorId, busqueda);
    if (r && "resumen" in r) console.log(JSON.stringify({ evento: "busqueda_extension", corredorId, cortada: r.cortada, ...r.resumen }));
    if (r && "motivo" in r && r.motivo === "sin_resultados" && !r.automatica && !r.cortada) {
      console.error(JSON.stringify({ evento: "error_busqueda_extension", corredorId, detalle: r.mensaje }));
      alertar(`error_busqueda_extension:${corredorId}`, `Búsqueda desde la extensión sin anuncios: ${r.mensaje}`);
    }
  } catch (e) {
    console.error(JSON.stringify({ evento: "error_busqueda_extension", corredorId, error: errorSeguro(e) }));
    alertar(`error_busqueda_extension:${corredorId}`, `La búsqueda desde la extensión falló: ${errorSeguro(e)}`);
  }
}
