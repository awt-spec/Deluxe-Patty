import { autenticar } from "@/lib/encuentra24/extension";
import { conManejo, dependenciasExtension, dependenciasPreparar, fallo, leerJson, responder, UUID } from "@/lib/encuentra24/extension-servidor";
import { prepararDesdeExtension } from "@/lib/encuentra24/llenar";

export const runtime = "nodejs";
// Claude escribe el anuncio (hasta 90 s, con un reintento).
export const maxDuration = 300;

// "Preparar un anuncio" desde el panel lateral: la misma preparación que el panel (lib/anuncios/preparar.ts), con los
// mismos topes de energía y 4 pedidos por minuto. El nuevo borrador vuelve para llenarlo enseguida.
export async function POST(req: Request) {
  return conManejo("preparar-anuncio", async () => {
    const d = dependenciasExtension();
    const corredorId = await autenticar(d.almacen, req.headers.get("authorization"));
    if (!corredorId) return fallo("permiso", 401);
    const c = await leerJson(req, 10_000);
    if (!c || typeof c.casaId !== "string" || !UUID.test(c.casaId)) return fallo("datos");
    const corredor = await d.almacen.corredor(corredorId);
    if (!corredor) return fallo("sin_corredor", 401);
    const r = await prepararDesdeExtension(dependenciasPreparar(corredor), corredor, c.casaId);
    if (!r.ok) return responder(r, r.motivo === "no_encontrada" ? 404 : r.motivo === "turno" ? 429 : 200);
    return responder(r);
  });
}
