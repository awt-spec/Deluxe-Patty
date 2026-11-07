import type { Adjunto } from "../asistente/cerebro";
import type { Dependencias } from "../asistente/contexto";
import type { Corredor } from "../datos/tipos";
import { puedeUsarImagenes } from "../fotos/variantes";

// Imágenes desde el chat de Patty. Lo entiende el código, sin pasar por el modelo de texto:
//  - "Hazme una imagen de…", "genera un post…", "crea un banner…": imagen nueva.
//  - Con una foto adjunta, "amuebla esta sala", "quítale el carro", "edita…": la edita.
// La imagen se guarda en el bucket del corredor y vuelve al chat; su costo suma al gasto de IA.

const sinTildes = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const GENERAR = /^\s*(?:por favor,?\s*)?(?:hazme|haz|haceme|genera|generame|crea|creame|dibuja|dibujame|disena|disename|arma|armame|necesito|quiero)\b/;
const QUE = /\b(?:imagen|imagenes|foto|ilustracion|render|post|publicacion|historia|banner|flyer|afiche|arte|portada|diseno|dibujo)\b/;
const EDITAR = /^\s*(?:por favor,?\s*)?(?:amuebla\w*|decora\w*|quita\w*|quitale|borra\w*|elimina\w*|edita\w*|cambia\w*|pinta\w*|ponle|agrega\w*|limpia\w*|mejora\w*|convierte\w*)\b/;

export type PedidoImagen = { tipo: "generar"; formato: "cuadrada" | "vertical" | "horizontal" } | { tipo: "editar"; foto: Adjunto };

/** Si el mensaje pide una imagen (nueva o editar la foto adjunta). null si es una conversación normal. */
export function pideImagen(texto: string, adjuntos: Adjunto[] = []): PedidoImagen | null {
  const t = sinTildes(texto);
  const foto = adjuntos.find((a) => a.tipo === "imagen");
  if (foto && (EDITAR.test(t) || (GENERAR.test(t) && QUE.test(t)))) return { tipo: "editar", foto };
  if (GENERAR.test(t) && QUE.test(t)) {
    const formato = /\b(?:historia|story|stories|vertical|reel)\b/.test(t)
      ? "vertical"
      : /\b(?:banner|portada|horizontal|encabezado)\b/.test(t)
        ? "horizontal"
        : "cuadrada";
    return { tipo: "generar", formato };
  }
  return null;
}

export async function imagenParaPatty(
  deps: Dependencias,
  corredor: Corredor,
  pedido: PedidoImagen,
  mensaje: string,
): Promise<{ ok: true; texto: string } | { ok: false; motivo: string }> {
  const bloqueo = await puedeUsarImagenes(deps, corredor);
  if (bloqueo) return { ok: false, motivo: bloqueo };
  const editor = deps.fotos!;
  try {
    const r =
      pedido.tipo === "editar"
        ? await editor.editarLibre(Buffer.from(pedido.foto.datos, "base64"), pedido.foto.mediaType, mensaje)
        : await editor.generar(mensaje, pedido.formato);
    await deps.repo.registrarImagenes(corredor.id, 1, r.costoUsd);
    const url = await deps.repo.subirArchivo(corredor.id, "fotos", `patty/${Date.now()}.jpg`, r.imagen, "image/jpeg");
    return {
      ok: true,
      texto:
        `${pedido.tipo === "editar" ? "Listo, así quedó:" : "Aquí está:"}\n\n![Imagen hecha con IA](${url})\n\n` +
        "Es una imagen hecha con inteligencia artificial: revísala antes de usarla y, si muestra una propiedad, " +
        "di que es ilustrativa. Si quieres otra versión, dime qué cambio.",
    };
  } catch (e) {
    const log = deps.registrar ?? ((evento, datos) => console.info(JSON.stringify({ evento, ...datos })));
    log("error_imagen_patty", { corredorId: corredor.id, tipo: pedido.tipo, error: e instanceof Error ? e.name : "desconocido" });
    return { ok: false, motivo: "No pude hacer la imagen ahora. Inténtalo de nuevo en un rato o cambia un poco el pedido." };
  }
}
