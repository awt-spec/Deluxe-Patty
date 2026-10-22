import { huella, tokenDe } from "@/lib/encuentra24/extension";
import { conManejo, dependenciasExtension, responder } from "@/lib/encuentra24/extension-servidor";

export const runtime = "nodejs";

// "Desconectar" en la extensión: su permiso deja de servir.
export async function POST(req: Request) {
  return conManejo("desconectar", async () => {
    const token = tokenDe(req.headers.get("authorization"));
    if (token) await dependenciasExtension().almacen.revocarToken(huella(token), new Date());
    return responder({ ok: true });
  });
}
