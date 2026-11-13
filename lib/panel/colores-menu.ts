// Colores del menú lateral del panel (computadora): oscuro, con la marca del corredor. Es una función pura
// para poder probarla: recibe los colores de la marca (o nada) y devuelve las variables CSS del menú, con
// contraste AA comprobado para el texto (4,5:1) y para íconos y acentos (3:1).

export interface ColoresMarcaMenu {
  principal?: string | null;
  profundo?: string | null;
  base?: string | null;
}

export interface ColoresMenu {
  fondo: string;
  /** Fondo un poco más claro: menú de la cuenta, tarjetas, aviso flotante. */
  fondo2: string;
  texto: string;
  /** Texto secundario (títulos de grupo, correo, íconos sin elegir): al menos 4,5:1 sobre el fondo. */
  suave: string;
  acento: string;
  /** Texto sobre el acento (botón de la asistente, contadores). */
  sobreAcento: string;
  hover: string;
  activo: string;
  borde: string;
  /** Si se usó la marca (false: neutro verde-carbón con el verde de WhatsApp). */
  deMarca: boolean;
}

/** Respaldo sin marca (o con una marca clara): verde-carbón con el verde de WhatsApp. */
export const NEUTRO = { fondo: "#0f1f1a", acento: "#25d366", texto: "#f2f6f4" } as const;

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

type Rgb = [number, number, number];

export function aRgb(color: string | null | undefined): Rgb | null {
  const m = color?.trim().match(HEX);
  if (!m) return null;
  let h = m[1]!;
  if (h.length === 3) h = h.replace(/./g, (c) => c + c);
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb;
}

const aHex = (c: Rgb) => `#${c.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("")}`;

/** Luminancia relativa (WCAG 2.x). */
export function luminancia(c: Rgb): number {
  const [r, g, b] = c.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as Rgb;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Razón de contraste WCAG entre dos colores hex (1 a 21); 1 si alguno no se entiende. */
export function contraste(a: string, b: string): number {
  const x = aRgb(a);
  const y = aRgb(b);
  if (!x || !y) return 1;
  const [l1, l2] = [luminancia(x), luminancia(y)].sort((p, q) => q - p) as [number, number];
  return (l1 + 0.05) / (l2 + 0.05);
}

/** `t` de `b` sobre `a` (0: a, 1: b). */
export function mezclar(a: string, b: string, t: number): string {
  const x = aRgb(a) ?? [0, 0, 0];
  const y = aRgb(b) ?? [0, 0, 0];
  return aHex(x.map((v, i) => v + (y[i]! - v) * t) as Rgb);
}

/** El color de texto con la mezcla más baja (desde `desde`) que llega a `minimo` sobre el fondo. */
function suaveCon(fondo: string, texto: string, minimo: number, desde: number): string {
  for (let t = desde; t < 1; t += 0.02) {
    const c = mezclar(fondo, texto, t);
    if (contraste(c, fondo) >= minimo) return c;
  }
  return texto;
}

/**
 * Colores del menú. El fondo es el `profundo` de la marca si es oscuro de verdad (el texto claro llega a 7:1,
 * así el secundario también pasa AA); si no, el neutro. El acento es el `principal` si se distingue del fondo
 * (3:1, como pide AA para íconos y bordes); si no, el verde de WhatsApp.
 */
export function coloresMenu(marca: ColoresMarcaMenu | null | undefined): ColoresMenu {
  const profundo = aRgb(marca?.profundo) ? aHex(aRgb(marca!.profundo)!) : null;
  const claroMarca = aRgb(marca?.base) ? aHex(aRgb(marca!.base)!) : null;
  const deMarca = !!profundo && contraste(profundo, "#ffffff") >= 7;
  const fondo = deMarca ? profundo! : NEUTRO.fondo;

  const texto = deMarca && claroMarca && contraste(claroMarca, fondo) >= 7 ? claroMarca : deMarca ? "#ffffff" : NEUTRO.texto;

  const principal = aRgb(marca?.principal) ? aHex(aRgb(marca!.principal)!) : null;
  const acento = deMarca && principal && contraste(principal, fondo) >= 3 ? principal : NEUTRO.acento;
  const sobreAcento = contraste(fondo, acento) >= contraste("#ffffff", acento) ? fondo : "#ffffff";

  return {
    fondo,
    fondo2: mezclar(fondo, texto, 0.07),
    texto,
    suave: suaveCon(fondo, texto, 4.5, 0.55),
    acento,
    sobreAcento,
    hover: mezclar(fondo, texto, 0.07),
    activo: mezclar(fondo, acento, 0.16),
    borde: mezclar(fondo, texto, 0.11),
    deMarca,
  };
}

/** Las variables CSS que lee `.lateral` en globals.css ("Menú lateral v3"). */
export function variablesMenu(c: ColoresMenu): Record<string, string> {
  return {
    "--m-fondo": c.fondo,
    "--m-fondo-2": c.fondo2,
    "--m-texto": c.texto,
    "--m-suave": c.suave,
    "--m-acento": c.acento,
    "--m-sobre-acento": c.sobreAcento,
    "--m-hover": c.hover,
    "--m-activo": c.activo,
    "--m-borde": c.borde,
  };
}
