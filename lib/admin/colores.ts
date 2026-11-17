// Paleta de /admin (consola del superadministrador). Es el mismo lenguaje que el panel del corredor (WhatsApp Web
// claro, lib/panel/colores-menu.ts) con el menú lateral oscuro, para que se note que es Administración. Las mismas
// cifras están como variables --ad-* en app/admin/admin.css; tests/colores-admin.test.ts comprueba que coincidan y
// que pasen AA.

export const PALETA_ADMIN = {
  /** Contenido: fondo gris claro de WhatsApp Web, tarjetas blancas. */
  fondo: "#f0f2f5",
  tarjeta: "#ffffff",
  linea: "#e1e5e8",
  texto: "#111b21",
  suave: "#54656f",
  hover: "#f5f6f6",
  /** Verde de acción (botones primarios, enlaces fuertes y anillo de foco). */
  verde: "#007a63",
  sobreVerde: "#ffffff",
  /** Menú lateral oscuro (WhatsApp oscuro). */
  lado: "#111b21",
  ladoLinea: "#2a3942",
  ladoTexto: "#e9edef",
  ladoSuave: "#a3b0b8",
  ladoHover: "#202c33",
  ladoActivo: "#1f4d40",
  sobreLadoActivo: "#d9fdd3",
  /** Insignia "Administración" sobre el menú. */
  insignia: "#25d366",
  sobreInsignia: "#0b141a",
  /** Estados: fondo de la píldora y su letra. */
  bienFondo: "#e7f8ee",
  bienTexto: "#0a6b45",
  pocoFondo: "#fff4d6",
  pocoTexto: "#7a4500",
  malFondo: "#fde8e7",
  malTexto: "#a3211a",
  infoFondo: "#e8f1fb",
  infoTexto: "#1d4f87",
  grisFondo: "#e9edef",
  grisTexto: "#3b4a54",
  /** Punto o ícono de estado sobre la tarjeta (3:1 basta: va siempre con texto). */
  bien: "#0a8a52",
  poco: "#b45309",
  mal: "#c4302b",
} as const;
