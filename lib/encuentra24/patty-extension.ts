// "Patty en la extensión" (1.7.0): reglas puras de la ruta /api/extension/patty. El panel lateral solo muestra texto:
// lo que es del chat del panel (pasos de la guía en pantalla, pedidos de PDF o PNG, imágenes y diagramas) se quita o se
// cambia por una frase aquí, y el panel lateral lo vuelve a quitar al dibujar (extension/patty.js).

/** Largo máximo del mensaje del corredor desde la extensión. */
export const MENSAJE_MAX_EXTENSION = 2000;
/** Turnos anteriores que puede mandar la extensión. */
export const HISTORIAL_MAX_EXTENSION = 12;
/** Largo máximo de cada turno anterior. */
export const TURNO_MAX_EXTENSION = 4000;
/** Largo máximo de la respuesta que vuelve a la extensión. */
export const RESPUESTA_MAX_EXTENSION = 12_000;

export type PedidoPattyExtension = { historial: { autor: "corredor" | "asistente"; texto: string }[]; mensaje: string };

/** El pedido, si viene bien formado: mensaje de 1 a 2.000 caracteres y hasta 12 turnos de corredor o asistente. */
export function leerPedidoPatty(c: Record<string, unknown> | null): PedidoPattyExtension | null {
  if (!c || typeof c.mensaje !== "string") return null;
  const mensaje = c.mensaje.trim();
  if (!mensaje || c.mensaje.length > MENSAJE_MAX_EXTENSION) return null;
  const h = c.historial ?? [];
  if (!Array.isArray(h) || h.length > HISTORIAL_MAX_EXTENSION) return null;
  const historial: PedidoPattyExtension["historial"] = [];
  for (const t of h) {
    if (!t || typeof t !== "object") return null;
    const { autor, texto } = t as { autor?: unknown; texto?: unknown };
    if ((autor !== "corredor" && autor !== "asistente") || typeof texto !== "string" || texto.length > TURNO_MAX_EXTENSION) return null;
    historial.push({ autor, texto });
  }
  return { historial, mensaje };
}

// Una línea con un paso de la guía o un pedido de documento: <<ir /panel/…>>, <<señalar …>>, <<pdf …>>, <<png …>>…
const MARCA = /<<[^<>\n]{0,300}>>/g;
const IMAGEN = /!\[[^\]\n]{0,200}\]\([^)\s]{1,2000}\)/g;
const DIAGRAMA = /```mermaid[\s\S]*?(```|$)/gi;

/** El texto de Patty listo para el panel lateral: sin pasos de la guía, pedidos de PDF/PNG, imágenes ni diagramas. */
export function textoParaExtension(texto: string): string {
  return String(texto ?? "")
    .replace(DIAGRAMA, "(Aquí va un diagrama: míralo en el chat del panel.)")
    .replace(IMAGEN, "(Imagen: mírala en el chat del panel.)")
    .replace(MARCA, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, RESPUESTA_MAX_EXTENSION);
}
