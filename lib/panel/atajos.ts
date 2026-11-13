// Atajos de teclado del panel en computadora (menú lateral): "g" y luego una letra para ir a una sección,
// y "/" o Ctrl/⌘+K para abrir el chat de la asistente. Puro, para probarlo sin navegador.

export const ATAJOS_IR: Record<string, string> = {
  i: "/panel",
  c: "/panel/clientes",
  a: "/panel/agenda",
  m: "/panel/propiedades",
};

/** Cuánto espera la segunda tecla después de "g". */
export const ESPERA_G_MS = 1200;

export interface Tecla {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  /** Si la tecla se escribió en un campo (input, textarea, select o editable). */
  enCampo: boolean;
}

export type Atajo = { tipo: "ir"; ruta: string } | { tipo: "asistente" } | { tipo: "esperar-g" } | null;

/** Qué hace una tecla, sabiendo cuándo se tocó la última "g" (o null). */
export function atajoDe(t: Tecla, gEn: number | null, ahora: number): Atajo {
  if (t.enCampo || t.altKey) return null;
  const k = t.key.toLowerCase();
  if ((t.ctrlKey || t.metaKey) && k === "k") return { tipo: "asistente" };
  if (t.ctrlKey || t.metaKey) return null;
  if (gEn !== null && ahora - gEn <= ESPERA_G_MS && ATAJOS_IR[k]) return { tipo: "ir", ruta: ATAJOS_IR[k]! };
  if (t.key === "/") return { tipo: "asistente" };
  if (k === "g") return { tipo: "esperar-g" };
  return null;
}

/** Si el elemento donde se tocó la tecla es un lugar para escribir. */
export function esCampo(e: EventTarget | null): boolean {
  const el = e as HTMLElement | null;
  if (!el || typeof el.tagName !== "string") return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}
