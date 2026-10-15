// Identidad visual con la que se arma la ficha de un corredor. Es dato, no código: cada corredor
// trae la suya (Deluxe: Manual de Identidad Visual v1.0).

export interface Marca {
  nombre: string;
  /** Logo oficial para fondo `profundo` (ruta local o URL). */
  logoSobreProfundo: string;
  /**
   * Color exacto del fondo del archivo del logo, si difiere del `profundo` oficial: la franja lo
   * usa para que no se vea el borde de la imagen.
   */
  fondoLogo?: string;
  colores: {
    /** Color principal (acentos, líneas, cifras grandes). */
    principal: string;
    /** Color de soporte (etiquetas, líneas finas). */
    soporte: string;
    /** Fondo profundo y texto principal. */
    profundo: string;
    /** Fondo base. */
    base: string;
  };
  eslogan: string | null;
  firma: { nombre: string; cargo: string } | null;
}

export const MARCA_DELUXE: Marca = {
  nombre: "Deluxe Properties",
  logoSobreProfundo: "marcas/deluxe/logo-onyx.jpg",
  // El JPEG extraído del manual tiene fondo #1A1408 (1/255 del onyx oficial #1A1308).
  fondoLogo: "#1A1408",
  colores: { principal: "#D4AF6A", soporte: "#B89968", profundo: "#1A1308", base: "#F5F0E8" },
  eslogan: "Where rare addresses live",
  firma: { nombre: "Patricia Quintanilla", cargo: "CEO · Deluxe Properties" },
};
