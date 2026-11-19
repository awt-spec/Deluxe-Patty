import { autenticar } from "@/lib/encuentra24/extension";
import { baseLlenar, conManejo, dependenciasExtension, fallo, responder } from "@/lib/encuentra24/extension-servidor";
import { anunciosListos } from "@/lib/encuentra24/llenar";

export const runtime = "nodejs";

// "Llenar con Patty": los anuncios por publicar (borradores con texto) del corredor del permiso, hasta 20, con la portada
// de su casa. Solo lee; el corredor sale del permiso de la extensión, nunca del pedido.
export async function GET(req: Request) {
  return conManejo("anuncios-listos", async () => {
    const d = dependenciasExtension();
    const corredorId = await autenticar(d.almacen, req.headers.get("authorization"));
    if (!corredorId) return fallo("permiso", 401);
    return responder({ ok: true, anuncios: await anunciosListos(baseLlenar(), corredorId) });
  });
}
