import { conectar, puedeIntentarConectar } from "@/lib/encuentra24/extension";
import { conManejo, dependenciasExtension, fallo, leerJson, responder } from "@/lib/encuentra24/extension-servidor";

export const runtime = "nodejs";

// La extensión canjea el código que le muestra el panel por su permiso (un solo uso, 10 minutos). Un intento cada
// 6 segundos por conexión: la IP no se guarda, solo su huella en la clave del freno.
export async function POST(req: Request) {
  return conManejo("conectar", async () => {
    const { almacen } = dependenciasExtension();
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "sin-ip";
    if (!(await puedeIntentarConectar(almacen, ip))) return fallo("intentos", 429);
    const cuerpo = await leerJson(req, 10_000);
    if (!cuerpo || typeof cuerpo.codigo !== "string") return fallo("datos");
    const conexion = await conectar(almacen, cuerpo.codigo);
    if (!conexion) return fallo("codigo");
    const corredor = await almacen.corredor(conexion.corredorId);
    return responder({ ok: true, token: conexion.token, corredor: corredor?.nombre ?? "" });
  });
}
