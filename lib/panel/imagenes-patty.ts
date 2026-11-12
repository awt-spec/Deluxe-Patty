import type { Adjunto } from "../asistente/cerebro";
import type { Dependencias } from "../asistente/contexto";
import type { Corredor } from "../datos/tipos";
import { puedeUsarImagenes } from "../fotos/variantes";

// Imágenes desde el chat de Patty. Lo entiende el código, sin pasar por el modelo de texto:
//  - "Hazme una imagen de…", "genera un post…", "crea un banner…": imagen nueva.
//  - Con una foto adjunta, "amuebla esta sala", "quítale el carro", "edita…": la edita.
// La imagen se guarda en el bucket del corredor y vuelve al chat; su costo suma al gasto de IA.

const sinTildes = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Pedir que la haga: un verbo de hacer al principio y algo que claramente es una imagen. "Quiero ver la
// foto…", "arma la historia de Laura" o "necesito las fotos de la casa" no son pedidos de imagen.
const HACER = /^\s*(?:por favor,?\s*)?(?:hazme|haz|haceme|genera|generame|crea|creame|dibuja|dibujame|disena|disename)\b/;
const QUIERO = /^\s*(?:por favor,?\s*)?(?:quiero|necesito)\s+(?:una?|otra)\s+(?:imagen|ilustracion|render|banner|flyer|afiche|dibujo)\b/;
const ES_IMAGEN = /\b(?:imagen|imagenes|ilustracion|render|banner|flyer|afiche|dibujo|post|arte)\b|\b(?:una|otra) (?:foto|historia|publicacion|portada)\b/;
// Editar la foto adjunta: un verbo de editar y algo que se ve en una foto (no "cambia el tono del texto").
const EDITAR = /^\s*(?:por favor,?\s*)?(?:amuebla\w*|decora\w*|quita\w*|borra\w*|elimina\w*|edita\w*|cambia\w*|pinta\w*|ponle|agrega\w*|limpia\w*|mejora\w*|convierte\w*)\b/;
const VISUAL = /\b(?:foto|imagen|sala|cuarto|cocina|habitacion|bano|patio|fachada|jardin|terraza|pared|paredes|piso|pisos|techo|carro|carros|cielo|piscina|muebles?|cables?|basura|fondo|luz|colores?|amuebl\w*|decor\w*)\b/;
// Una imagen de sus datos (resumen, tabla, diagrama, infografía, "en PNG"): la arma Patty con el texto y el panel la
// convierte en lámina PNG con su marca; no es una imagen inventada por IA.
const DE_SUS_DATOS = /\b(?:png|lamina|infografia|diagrama|grafico|esquema|tabla|resumen|informe|reporte|lista|comparacion|comparativo)\b/;
// Una casa del corredor: para eso está "Imagen para redes", con la foto y los datos reales.
const CASA_PROPIA = /\b(?:mi|mis|la|esta|esa|una de mis) (?:casa|casas|propiedad|propiedades|apartamento|lote)\b|\b[a-z]{2,5}-\d{1,4}\b/;

export type PedidoImagen =
  | { tipo: "generar"; formato: "cuadrada" | "vertical" | "horizontal" }
  | { tipo: "editar"; foto: Adjunto }
  | { tipo: "casa_propia" };

/** Si el mensaje pide una imagen (nueva o editar la foto adjunta). null si es una conversación normal. */
export function pideImagen(texto: string, adjuntos: Adjunto[] = []): PedidoImagen | null {
  const t = sinTildes(texto);
  if (DE_SUS_DATOS.test(t)) return null;
  const foto = adjuntos.find((a) => a.tipo === "imagen");
  if (foto && ((EDITAR.test(t) && VISUAL.test(t)) || (HACER.test(t) && ES_IMAGEN.test(t)))) return { tipo: "editar", foto };
  if ((HACER.test(t) && ES_IMAGEN.test(t)) || QUIERO.test(t)) {
    if (CASA_PROPIA.test(t)) return { tipo: "casa_propia" };
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
  if (pedido.tipo === "casa_propia") {
    // Sin gastar: una imagen inventada de "su casa" no sería su casa.
    return {
      ok: true,
      texto:
        "Para una casa tuya, lo mejor es la imagen para redes: usa tus fotos reales, el precio y los datos de la ficha, " +
        "con tu marca, en cuadrado y en historia, y te deja el texto listo. Ábrela desde la casa en [Mis casas](/panel/propiedades) → «Imagen para redes». " +
        "Si quieres una imagen inventada (por ejemplo, una idea de decoración), pídemela sin nombrar la casa.",
    };
  }
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
