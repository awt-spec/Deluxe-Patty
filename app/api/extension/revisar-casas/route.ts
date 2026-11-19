import { autenticar } from "@/lib/encuentra24/extension";
import { baseHerramientas, conManejo, corredorCompleto, dependenciasExtension, fallo, responder } from "@/lib/encuentra24/extension-servidor";
import { revisarCasasDe } from "@/lib/panel/herramientas-datos";

export const runtime = "nodejs";

// "Revisar mis casas" desde el panel lateral (1.7.0): lo mismo que la herramienta del chat del panel, sin IA. Solo las
// casas del corredor del permiso y solo lo que se muestra: código, título y qué le falta.
export async function GET(req: Request) {
  return conManejo("revisar-casas", async () => {
    const d = dependenciasExtension();
    const corredorId = await autenticar(d.almacen, req.headers.get("authorization"));
    if (!corredorId) return fallo("permiso", 401);
    const corredor = await corredorCompleto(corredorId);
    if (!corredor) return fallo("sin_corredor", 401);
    const r = await revisarCasasDe(baseHerramientas(), corredor);
    if (!r.ok) return responder({ ok: false, motivo: "servidor", mensaje: r.motivo });
    return responder({
      ok: true,
      pendientes: r.pendientes.slice(0, 10).map((p) => ({ codigo: p.casa.codigo, titulo: p.casa.titulo, problemas: p.problemas.slice(0, 6) })),
      total: r.pendientes.length,
      completas: r.completas,
      pausadas: r.pausadas,
    });
  });
}
