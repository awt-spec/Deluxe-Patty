import { autenticar, iniciarBusqueda } from "@/lib/encuentra24/extension";
import { conManejo, dependenciasExtension, fallo, responder } from "@/lib/encuentra24/extension-servidor";

export const runtime = "nodejs";

// Empieza la búsqueda de dueños de la semana y le dice a la extensión qué página abrir primero.
export async function POST(req: Request) {
  return conManejo("busqueda", async () => {
    const d = dependenciasExtension();
    const corredorId = await autenticar(d.almacen, req.headers.get("authorization"));
    if (!corredorId) return fallo("permiso", 401);
    const inicio = await iniciarBusqueda(d, corredorId);
    if (!inicio.ok) return fallo(inicio.motivo);
    return responder(inicio);
  });
}
