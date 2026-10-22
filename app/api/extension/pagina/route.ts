import { after } from "next/server";
import { alertar } from "@/lib/asistente/dependencias";
import { autenticar, recibirPagina, terminarBusqueda } from "@/lib/encuentra24/extension";
import { conManejo, dependenciasExtension, fallo, leerJson, responder, UUID } from "@/lib/encuentra24/extension-servidor";
import { errorSeguro } from "@/lib/monitoreo/errores";

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

    if (avance.siguiente === null) {
      after(async () => {
        try {
          const r = await terminarBusqueda(d, corredorId, busqueda);
          if (r && "resumen" in r) console.log(JSON.stringify({ evento: "busqueda_extension", corredorId, ...r.resumen }));
          // Ninguna página trajo anuncios: Encuentra24 pudo cambiar. Soporte se entera como con el worker.
          if (r && "motivo" in r) {
            console.error(JSON.stringify({ evento: "error_busqueda_extension", corredorId, detalle: r.mensaje }));
            alertar(`error_busqueda_extension:${corredorId}`, `Búsqueda desde la extensión sin anuncios: ${r.mensaje}`);
          }
        } catch (e) {
          console.error(JSON.stringify({ evento: "error_busqueda_extension", corredorId, error: errorSeguro(e) }));
          alertar(`error_busqueda_extension:${corredorId}`, `La búsqueda desde la extensión falló: ${errorSeguro(e)}`);
        }
      });
    }
    return responder(avance);
  });
}
