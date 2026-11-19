import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { alertar, dependenciasPara, esperarAlertas } from "../asistente/dependencias";
import { crearCerebroClaude } from "../asistente/cerebro";
import { SIN_PRESUPUESTO } from "../asistente/limites";
import { COLUMNAS_CORREDOR, crearRepositorioSupabase } from "../datos/repositorio";
import { leerConTope } from "../http/cuerpo";
import { errorSeguro } from "../monitoreo/errores";
import { createAdminClient } from "../supabase/admin";
import type { DependenciasAnuncio } from "./anuncio";
import type { Dependencias } from "../asistente/procesar";
import type { Corredor } from "../datos/tipos";
import { hayTurnoPorMinuto } from "../panel/turno-ia";
import { crearAlmacenExtension } from "./datos";
import { TURNOS_PREPARAR_MINUTO, type DependenciasPreparar } from "./llenar";
import { terminarBusqueda, type DependenciasExtension } from "./extension";

// Piezas comunes de las rutas /api/extension/*: dependencias, respuestas y manejo de errores. Los
// mensajes para el corredor salen de aquí y no de la extensión, para cambiarlos sin reinstalarla.

let deps: DependenciasExtension | null = null;

/** "Leer este anuncio": usa la base directa (anuncios, casas, fotos) además del repositorio y Claude. */
export function dependenciasAnuncio(): DependenciasAnuncio {
  const { repo } = dependenciasExtension();
  return { db: createAdminClient(), repo, cerebro: crearCerebroClaude() };
}

/** "Llenar con Patty": la base directa (anuncios por publicar, casas y fotos), siempre filtrada por corredor. */
export function baseLlenar(): SupabaseClient {
  return createAdminClient();
}

/** "Preparar un anuncio" desde el panel lateral: la misma IA, topes y freno que el panel (4 por minuto). */
export function dependenciasPreparar(corredor: Corredor): DependenciasPreparar {
  return {
    db: createAdminClient(),
    deps: dependenciasPara(corredor),
    hayTurno: () => hayTurnoPorMinuto("extension_anuncio", corredor.id, TURNOS_PREPARAR_MINUTO),
  };
}

/** Pedidos por minuto al chat con Patty desde el panel lateral (por corredor). */
export const TURNOS_PATTY_EXTENSION = 8;

export interface DependenciasPattyExtension {
  /** El cliente del backend: cada consulta de Patty filtra por corredor_id. */
  db: SupabaseClient;
  deps: Dependencias;
  hayTurno: () => Promise<boolean>;
}

/** "Patty en la extensión" (1.7.0): la misma Patty del panel, con el freno propio de la extensión (8 por minuto). */
export function dependenciasPatty(corredor: Corredor): DependenciasPattyExtension {
  return {
    db: createAdminClient(),
    deps: dependenciasPara(corredor),
    hayTurno: () => hayTurnoPorMinuto("patty_ext", corredor.id, TURNOS_PATTY_EXTENSION),
  };
}

/** La base para las herramientas de Patty en la extensión (Revisar mis casas, Dueños directos), filtrada por corredor. */
export function baseHerramientas(): SupabaseClient {
  return createAdminClient();
}

/**
 * La ficha entera del corredor del permiso (Patty necesita su nombre, zona, marca y topes). A diferencia de
 * `almacen.corredor`, también trae la demo (inactiva): ahí Patty contesta simulada, sin IA ni gasto.
 */
export async function corredorCompleto(corredorId: string): Promise<Corredor | null> {
  const { data, error } = await createAdminClient().from("corredores").select(COLUMNAS_CORREDOR).eq("id", corredorId).maybeSingle();
  if (error) throw new Error(`corredorCompleto: ${error.code ?? "error"}`);
  return (data as Corredor | null) ?? null;
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
  intentos: "Hubo muchos intentos seguidos. Espera unos segundos y vuelve a probar el código.",
  permiso: "La extensión ya no está conectada. Conéctala de nuevo desde el panel, en Más y luego Dueños directos.",
  sin_corredor: "La extensión ya no está conectada. Conéctala de nuevo desde el panel, en Más y luego Dueños directos.",
  sin_zonas: "Primero escribe tus zonas de Encuentra24 en el panel, en Más y luego Ajustes, en Búsqueda de dueños.",
  sin_presupuesto: SIN_PRESUPUESTO,
  tope_dia: "Hoy ya leí 24 páginas de Encuentra24, el máximo del día. Sigo mañana.",
  no_encontrada: "La búsqueda se interrumpió. Vuelve a empezarla.",
  detenida: "La detuviste antes de que leyera anuncios: no hay nada que guardar.",
  fuera_de_orden: "La búsqueda se interrumpió. Vuelve a empezarla.",
  sin_resultados:
    "Encuentra24 no mostró anuncios: pudo pedir la verificación o cambiar su página. Vuelve a intentarlo; si sigue pasando, avísale a soporte.",
  no_anuncio: "Esta página no parece un anuncio de Encuentra24. Abre el anuncio de una casa y vuelve a tocar el botón.",
  anuncio_no_encontrado:
    "Ese anuncio ya no está por publicar (se publicó, se borró o la casa se vendió). Vuelve a elegir uno de la lista.",
  turno_patty: "Me escribiste muchas veces seguidas. Espera un minuto y vuelve a preguntarme.",
  casa_no_encontrada: "No encontré esa casa entre tus casas activas. Vuelve a elegirla.",
  datos: "La extensión mandó algo que no se entiende. Actualízala o avísale a soporte.",
  servidor: "Algo falló de nuestro lado. Vuelve a intentarlo en un rato.",
};

export function responder(datos: Record<string, unknown>, status = 200): Response {
  return Response.json(datos, { status, headers: { "Cache-Control": "no-store" } });
}

export function fallo(motivo: string, status = 400): Response {
  return responder({ ok: false, motivo, mensaje: MENSAJES[motivo] ?? MENSAJES.servidor }, status);
}

/** Cuerpo JSON con tope de tamaño en bytes (una página de Encuentra24 pesa menos de 2 MB). */
export async function leerJson(req: Request, maxBytes = 4_000_000): Promise<Record<string, unknown> | null> {
  if (Number(req.headers.get("content-length") ?? 0) > maxBytes) return null;
  // Sin content-length (chunked) se cuenta mientras llega: al pasar el tope se corta, sin leer el resto.
  const bytes = await leerConTope(req.body, maxBytes);
  if (!bytes) return null;
  try {
    const v = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
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
