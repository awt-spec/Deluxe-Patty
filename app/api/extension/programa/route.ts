import { autenticar, programaBusqueda } from "@/lib/encuentra24/extension";
import { conManejo, dependenciasExtension, fallo, responder } from "@/lib/encuentra24/extension-servidor";

export const runtime = "nodejs";

// La extensión despierta cada ~6 horas y pregunta si toca la búsqueda semanal sola: { buscar, ultimaDias }.
// Con ?ver=1 (el popup) solo dice hace cuánto fue la última búsqueda, sin reservar nada.
export async function GET(req: Request) {
  return conManejo("programa", async () => {
    const d = dependenciasExtension();
    const corredorId = await autenticar(d.almacen, req.headers.get("authorization"));
    if (!corredorId) return fallo("permiso", 401);
    const soloVer = new URL(req.url).searchParams.get("ver") === "1";
    return responder({ ...(await programaBusqueda(d, corredorId, { soloVer })) });
  });
}
