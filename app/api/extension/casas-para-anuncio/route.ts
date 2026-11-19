import { autenticar } from "@/lib/encuentra24/extension";
import { baseLlenar, conManejo, dependenciasExtension, fallo, responder } from "@/lib/encuentra24/extension-servidor";
import { casasParaAnuncio } from "@/lib/encuentra24/llenar";

export const runtime = "nodejs";

// "Preparar un anuncio" desde el panel lateral: las casas activas (o reservadas) del corredor del permiso, con su portada.
export async function GET(req: Request) {
  return conManejo("casas-para-anuncio", async () => {
    const d = dependenciasExtension();
    const corredorId = await autenticar(d.almacen, req.headers.get("authorization"));
    if (!corredorId) return fallo("permiso", 401);
    return responder({ ok: true, casas: await casasParaAnuncio(baseLlenar(), corredorId) });
  });
}
