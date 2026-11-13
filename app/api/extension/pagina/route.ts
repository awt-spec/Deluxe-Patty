import { after } from "next/server";
import { autenticar, recibirPagina } from "@/lib/encuentra24/extension";
import { conManejo, dependenciasExtension, fallo, leerJson, responder, terminarEnSegundoPlano, UUID } from "@/lib/encuentra24/extension-servidor";

export const runtime = "nodejs";
// Después de la última página Haiku revisa los candidatos (hasta unos 60) en segundo plano.
export const maxDuration = 300;

// Recibe una página de Encuentra24 que abrió la extensión y responde cuál sigue.
export async function POST(req: Request) {
  return conManejo("pagina", async () => {
    const d = dependenciasExtension();
    const corredorId = await autenticar(d.almacen, req.headers.get("authorization"));
    if (!corredorId) return fallo("permiso", 401);
    const c = await leerJson(req);
    if (!c || typeof c.busqueda !== "string" || !UUID.test(c.busqueda) || typeof c.url !== "string" || typeof c.html !== "string") {
      return fallo("datos");
    }
    const busqueda = c.busqueda;
    const avance = await recibirPagina(d, corredorId, { busqueda, url: c.url, html: c.html });
    if (!avance.ok) return fallo(avance.motivo);
    if (avance.siguiente === null) after(() => terminarEnSegundoPlano(d, corredorId, busqueda));
    return responder(avance);
  });
}
