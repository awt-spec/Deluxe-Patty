import { autenticar, consultarBusqueda } from "@/lib/encuentra24/extension";
import { conManejo, dependenciasExtension, fallo, leerJson, MENSAJES, responder, UUID } from "@/lib/encuentra24/extension-servidor";

export const runtime = "nodejs";

// La extensión pregunta si Haiku ya terminó de revisar la búsqueda.
export async function POST(req: Request) {
  return conManejo("estado", async () => {
    const d = dependenciasExtension();
    const corredorId = await autenticar(d.almacen, req.headers.get("authorization"));
    if (!corredorId) return fallo("permiso", 401);
    const c = await leerJson(req, 10_000);
    if (!c || typeof c.busqueda !== "string" || !UUID.test(c.busqueda)) return fallo("datos");
    const r = await consultarBusqueda(d, corredorId, c.busqueda);
    if (!r.ok) return responder({ ok: false, motivo: r.motivo, mensaje: MENSAJES[r.motivo] ?? MENSAJES.servidor });
    return responder(r);
  });
}
