// Paleta del menú lateral del panel (computadora): la de WhatsApp en tema claro, igual para todos los corredores
// (la marca del corredor solo aparece en su logo). Las mismas cifras están como variables --m-* en la capa
// "Menú lateral v3" de app/globals.css; tests/colores-menu.test.ts comprueba que coincidan y que pasen AA.

export const PALETA_MENU = {
  /** Fondo del menú (como la lista de chats de WhatsApp) y del menú de la cuenta. */
  fondo: "#ffffff",
  /** Línea que lo separa del contenido y divide la cabecera y el pie. */
  linea: "#e9edef",
  texto: "#111b21",
  /** Texto secundario e íconos sin elegir (correo, flecha de la cuenta). */
  suave: "#54656f",
  hover: "#f5f6f6",
  /** Pastilla del elemento activo y el texto e ícono sobre ella. */
  activo: "#d9fdd3",
  sobreActivo: "#006b56",
  /** Verde de acción: botón de la asistente, títulos de grupo y anillo de foco. */
  verde: "#008069",
  sobreVerde: "#ffffff",
  /** Burbuja de no leídos (clientes que esperan). */
  burbuja: "#25d366",
  sobreBurbuja: "#111b21",
  /** Burbuja tranquila (visitas de hoy). */
  burbujaSuave: "#e9edef",
  sobreBurbujaSuave: "#3b4a54",
  /** Globo del menú contraído. */
  globo: "#3b4a54",
  sobreGlobo: "#ffffff",
} as const;

/** Luminancia relativa (WCAG 2.x) de un color #rrggbb. */
export function luminancia(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const s = parseInt(hex.slice(i, i + 2), 16) / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Razón de contraste WCAG entre dos colores #rrggbb (1 a 21). */
export function contraste(a: string, b: string): number {
  const [l1, l2] = [luminancia(a), luminancia(b)].sort((p, q) => q - p) as [number, number];
  return (l1 + 0.05) / (l2 + 0.05);
}
