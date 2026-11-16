import { autenticar, consultarBusqueda, type DependenciasExtension } from "@/lib/encuentra24/extension";
import { conManejo, dependenciasExtension, fallo, leerJson, MENSAJES, responder, UUID } from "@/lib/encuentra24/extension-servidor";
import { energiaDePresupuesto } from "@/lib/ia/energia";
import { tokensDePresupuesto, type EstadoTokens } from "@/lib/ia/tokens";
import { errorSeguro } from "@/lib/monitoreo/errores";

export const runtime = "nodejs";

/**
 * La energía del mes del corredor del permiso. El campo se sigue llamando `tokens` (las extensiones anteriores lo leen tal cual) y
 * trae además `pct_restante`: el porcentaje que queda, de 0 a 100 hacia abajo (lib/ia/energia.ts). Null si no se pudo leer.
 */
async function tokensDe(d: DependenciasExtension, corredorId: string): Promise<(EstadoTokens & { pct_restante: number }) | null> {
  try {
    const p = await d.repo.presupuestoIA(corredorId);
    return { ...tokensDePresupuesto(p), pct_restante: energiaDePresupuesto(p).restante };
  } catch (e) {
    console.error(JSON.stringify({ evento: "error_energia_ia", ruta: "estado", error: errorSeguro(e) }));
    return null;
  }
}

// El panel lateral de la extensión pregunta cuánta energía le queda a la asistente este mes:
// { ok: true, tokens: { total, usados, restantes, pct, nivel, pct_restante } | null }. Solo con el permiso, solo su corredor.
export async function GET(req: Request) {
  return conManejo("estado", async () => {
    const d = dependenciasExtension();
    const corredorId = await autenticar(d.almacen, req.headers.get("authorization"));
    if (!corredorId) return fallo("permiso", 401);
    return responder({ ok: true, tokens: await tokensDe(d, corredorId) });
  });
}

// La extensión pregunta si Haiku ya terminó de revisar la búsqueda (y, de paso, su energía).
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
