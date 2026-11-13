import { autenticar, iniciarBusqueda } from "@/lib/encuentra24/extension";
import { conManejo, dependenciasExtension, fallo, leerJson, responder } from "@/lib/encuentra24/extension-servidor";

export const runtime = "nodejs";

// Empieza la búsqueda de dueños de la semana y le dice a la extensión qué página abrir primero.
export async function POST(req: Request) {
  return conManejo("busqueda", async () => {
    const d = dependenciasExtension();
    const corredorId = await autenticar(d.almacen, req.headers.get("authorization"));
    if (!corredorId) return fallo("permiso", 401);
    // {"automatica": true}: la empezó la búsqueda semanal de la extensión (no el botón).
    const cuerpo = await leerJson(req, 10_000);
    const inicio = await iniciarBusqueda(d, corredorId, { automatica: cuerpo?.automatica === true });
    if (!inicio.ok) return fallo(inicio.motivo);
    return responder(inicio);
  });
}
