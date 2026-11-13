import { after } from "next/server";
import { autenticar, detenerBusqueda } from "@/lib/encuentra24/extension";
import { conManejo, dependenciasExtension, fallo, leerJson, responder, terminarEnSegundoPlano, UUID } from "@/lib/encuentra24/extension-servidor";

export const runtime = "nodejs";
// Haiku revisa lo ya leído en segundo plano (como después de la última página).
export const maxDuration = 300;

// La extensión corta la búsqueda en curso: Detener (barra, popup o panel), la pestaña cerrada, la verificación dejada
// para después o el tope de páginas. Lo leído hasta ahí se revisa y se guarda; la extensión consulta el resultado en
// /api/extension/estado. El corredor sale del permiso, nunca del cuerpo.
export async function POST(req: Request) {
  return conManejo("detener", async () => {
    const d = dependenciasExtension();
    const corredorId = await autenticar(d.almacen, req.headers.get("authorization"));
    if (!corredorId) return fallo("permiso", 401);
    const c = await leerJson(req, 10_000);
    if (!c || typeof c.busqueda !== "string" || !UUID.test(c.busqueda)) return fallo("datos");
    const busqueda = c.busqueda;
    const r = await detenerBusqueda(d, corredorId, busqueda, c.motivo === "tope" ? "tope" : "usuario");
    if (!r.ok) return fallo(r.motivo);
    after(() => terminarEnSegundoPlano(d, corredorId, busqueda));
    return responder(r);
  });
}
