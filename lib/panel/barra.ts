// Barra de abajo del teléfono (app/panel/navegacion.tsx): qué hace el botón de la asistente del centro.

/**
 * En su pantalla ya está a la vista (queda marcado, no abre nada encima); donde no hay chat flotante ("Probar la
 * asistente", un chat con un cliente) lleva a su pantalla; en las demás abre el chat encima (evento "abrir-patty").
 */
export function accionAsistente(ruta: string): "aqui" | "ir" | "abrir" {
  if (ruta.startsWith("/panel/patty")) return "aqui";
  if (ruta.startsWith("/panel/conversaciones/") || ruta.startsWith("/panel/probar")) return "ir";
  return "abrir";
}
