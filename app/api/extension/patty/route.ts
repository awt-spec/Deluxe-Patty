import { autenticar } from "@/lib/encuentra24/extension";
import { conManejo, corredorCompleto, dependenciasExtension, dependenciasPatty, fallo, leerJson, responder } from "@/lib/encuentra24/extension-servidor";
import { leerPedidoPatty, textoParaExtension } from "@/lib/encuentra24/patty-extension";
import { preguntarComoCorredor } from "@/lib/panel/patty-preguntar";

export const runtime = "nodejs";
// Claude contesta (hasta 90 s, con un reintento).
export const maxDuration = 300;

// "Patty en la extensión" (1.7.0): el chat del panel lateral, solo texto. Es la misma Patty del panel
// (lib/panel/patty-preguntar.ts): el mismo contexto del negocio, los mismos topes de energía, el uso sumado y las
// mismas explicaciones si la IA falla. Sin pantalla del panel (no hay guía en pantalla), sin imágenes, 8 pedidos por
// minuto y, en la demo, contestada por el código sin gastar.
export async function POST(req: Request) {
  return conManejo("patty", async () => {
    const d = dependenciasExtension();
    const corredorId = await autenticar(d.almacen, req.headers.get("authorization"));
    if (!corredorId) return fallo("permiso", 401);
    const pedido = leerPedidoPatty(await leerJson(req, 80_000));
    if (!pedido) return fallo("datos");
    const corredor = await corredorCompleto(corredorId);
    if (!corredor) return fallo("sin_corredor", 401);
    const p = dependenciasPatty(corredor);
    if (!(await p.hayTurno())) return fallo("turno_patty", 429);
    const demo = corredor.activo === false;
    const r = await preguntarComoCorredor(p.deps, p.db, corredor, pedido.historial, pedido.mensaje, { ruta: null, simular: demo });
    if (!r.ok) return responder({ ok: false, motivo: "patty", mensaje: r.motivo.slice(0, 600) });
    return responder({ ok: true, texto: textoParaExtension(r.texto), ...(demo ? { demo: true } : {}) });
  });
}
