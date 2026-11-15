import { autenticar, consultarBusqueda, type DependenciasExtension } from "@/lib/encuentra24/extension";
import { conManejo, dependenciasExtension, fallo, leerJson, MENSAJES, responder, UUID } from "@/lib/encuentra24/extension-servidor";
import { tokensDePresupuesto, type EstadoTokens } from "@/lib/ia/tokens";
import { errorSeguro } from "@/lib/monitoreo/errores";

export const runtime = "nodejs";

/** Tokens de IA del mes del corredor del permiso (lib/ia/tokens.ts); null si no se pudieron leer. */
async function tokensDe(d: DependenciasExtension, corredorId: string): Promise<EstadoTokens | null> {
  try {
    return tokensDePresupuesto(await d.repo.presupuestoIA(corredorId));
  } catch (e) {
    console.error(JSON.stringify({ evento: "error_tokens_ia", ruta: "estado", error: errorSeguro(e) }));
    return null;
  }
}

// El panel lateral de la extensión pregunta cuántos tokens de IA le quedan al corredor este mes:
// { ok: true, tokens: { total, usados, restantes, pct, nivel } | null }. Solo con el permiso, solo su corredor.
export async function GET(req: Request) {
  return conManejo("estado", async () => {
    const d = dependenciasExtension();
    const corredorId = await autenticar(d.almacen, req.headers.get("authorization"));
    if (!corredorId) return fallo("permiso", 401);
    return responder({ ok: true, tokens: await tokensDe(d, corredorId) });
  });
}

// La extensión pregunta si Haiku ya terminó de revisar la búsqueda (y, de paso, sus tokens de IA).
export async function POST(req: Request) {
  return conManejo("estado", async () => {
    const d = dependenciasExtension();
    const corredorId = await autenticar(d.almacen, req.headers.get("authorization"));
    if (!corredorId) return fallo("permiso", 401);
    const c = await leerJson(req, 10_000);
    if (!c || typeof c.busqueda !== "string" || !UUID.test(c.busqueda)) return fallo("datos");
    const r = await consultarBusqueda(d, corredorId, c.busqueda);
    if (!r.ok) return responder({ ok: false, motivo: r.motivo, mensaje: MENSAJES[r.motivo] ?? MENSAJES.servidor });
    return responder({ ...r, tokens: await tokensDe(d, corredorId) });
  });
}
