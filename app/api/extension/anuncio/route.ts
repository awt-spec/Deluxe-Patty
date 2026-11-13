import { leerAnuncio, leerPaginaAnuncio } from "@/lib/encuentra24/anuncio";
import { autenticar } from "@/lib/encuentra24/extension";
import { conManejo, dependenciasAnuncio, dependenciasExtension, fallo, leerJson, responder } from "@/lib/encuentra24/extension-servidor";

export const runtime = "nodejs";
// Claude llena la ficha (hasta 90 s) y luego se copian las fotos (hasta 60 s).
export const maxDuration = 300;

// "Leer este anuncio": la extensión manda lo que muestra la página de un anuncio de Encuentra24. Si es un anuncio
// que preparó la asistente, queda publicado; si no, la casa llega a Mis casas, pausada. El corredor sale del permiso
// de la extensión, nunca del cuerpo del pedido.
export async function POST(req: Request) {
  return conManejo("anuncio", async () => {
    const d = dependenciasExtension();
    const corredorId = await autenticar(d.almacen, req.headers.get("authorization"));
    if (!corredorId) return fallo("permiso", 401);
    const corredor = await d.almacen.corredor(corredorId);
    if (!corredor) return fallo("sin_corredor", 401);
    const cuerpo = await leerJson(req, 400_000);
    const pagina = cuerpo ? leerPaginaAnuncio(cuerpo) : null;
    if (!pagina) return fallo("no_anuncio");
    return responder(await leerAnuncio(dependenciasAnuncio(), corredor, pagina));
  });
}
