import { autenticar } from "@/lib/encuentra24/extension";
import { baseLlenar, conManejo, dependenciasExtension, fallo, responder, UUID } from "@/lib/encuentra24/extension-servidor";
import { anuncioParaLlenar } from "@/lib/encuentra24/llenar";

export const runtime = "nodejs";

// "Llenar con Patty": todo lo que la extensión pone en el formulario de publicar de Encuentra24 para un anuncio por
// publicar del corredor del permiso (textos con el enlace de WhatsApp al final, datos de la casa y hasta 20 fotos
// originales propias en el orden preparado). De otro corredor, o ya publicado: 404.
export async function GET(req: Request) {
  return conManejo("anuncio-listo", async () => {
    const d = dependenciasExtension();
    const corredorId = await autenticar(d.almacen, req.headers.get("authorization"));
    if (!corredorId) return fallo("permiso", 401);
    const id = new URL(req.url).searchParams.get("id") ?? "";
    if (!UUID.test(id)) return fallo("datos");
    const corredor = await d.almacen.corredor(corredorId);
    if (!corredor) return fallo("sin_corredor", 401);
    const datos = await anuncioParaLlenar(baseLlenar(), corredor, id);
    if (!datos) return fallo("anuncio_no_encontrado", 404);
    return responder({ ok: true, anuncio: datos });
  });
}
