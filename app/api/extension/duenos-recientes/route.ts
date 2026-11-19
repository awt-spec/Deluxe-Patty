import { autenticar } from "@/lib/encuentra24/extension";
import { baseHerramientas, conManejo, dependenciasExtension, fallo, responder } from "@/lib/encuentra24/extension-servidor";
import { duenosRecientesDe } from "@/lib/panel/herramientas-datos";

export const runtime = "nodejs";

// "Dueños directos" desde el panel lateral (1.7.0): los dueños nuevos sin escribirles, como en el chat del panel. Solo
// los del corredor del permiso y solo enlaces de Encuentra24 (nunca teléfonos ni nombres).
export async function GET(req: Request) {
  return conManejo("duenos-recientes", async () => {
    const d = dependenciasExtension();
    const corredorId = await autenticar(d.almacen, req.headers.get("authorization"));
    if (!corredorId) return fallo("permiso", 401);
    const r = await duenosRecientesDe(baseHerramientas(), corredorId);
    if (!r.ok) return responder({ ok: false, motivo: "servidor", mensaje: r.motivo });
    return responder({
      ok: true,
      recientes: r.recientes.map((x) => ({ titulo: x.titulo, zona: x.zona, precio: x.precio, moneda: x.moneda, url: x.url })),
      sinEscribir: r.sinEscribir,
      ultimaSemana: r.ultimaSemana,
    });
  });
}
