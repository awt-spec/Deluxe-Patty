// Colores de letra del panel que deben pasar AA (4,5:1) sobre los fondos claros del tema WhatsApp. Las mismas cifras
// están en la capa "Teléfono v4" de app/globals.css (--verde-texto, --verde-fondo, --gris-texto, --suave);
// tests/colores-texto.test.ts comprueba que coincidan y que pasen.
import { contraste } from "./colores-menu";

export const COLORES_TEXTO = {
  /** Verde de letra y enlaces (antes #00a884 / #00876a / #008069 en letra chica: 2,8 a 4,5:1). */
  verdeTexto: "#00664f",
  /** Verde de fondo de los botones llenos, siempre con letra blanca. */
  verdeFondo: "#008069",
  /** Gris de apoyo (antes #667781: 4,0:1 sobre el gris de la página). */
  grisTexto: "#54656f",
  /** Gris de la barra de abajo y de iOS (antes #6e6e73: 4,4:1 sobre los grises de relleno). */
  grisIos: "#5b6670",
} as const;

/** Fondos claros sobre los que va letra: tarjeta, página, barra, relleno de botones grises, verdes claros. */
export const FONDOS_CLAROS = ["#ffffff", "#f0f2f5", "#f3f6f4", "#f9f9f9", "#efeff0", "#e9edef", "#e3f4ee", "#d9fdd3", "#f0faf6"] as const;

/** El peor contraste de un color de letra sobre todos los fondos claros. */
export const peorContraste = (color: string) => Math.min(...FONDOS_CLAROS.map((f) => contraste(color, f)));
