// Pestañas de Redes sociales. Van en un módulo aparte (sin "use client") porque la página del servidor las lee:
// un valor exportado desde un archivo de cliente llega al servidor como referencia, no como arreglo.

export type PestanaEstratega = "post" | "pautas" | "estrategia" | "fotos";
export const PESTANAS_ESTRATEGA: { id: PestanaEstratega; nombre: string; corto: string }[] = [
  { id: "post", nombre: "Mejorar un post", corto: "Post" },
  { id: "pautas", nombre: "Pautas", corto: "Pautas" },
  { id: "estrategia", nombre: "Estrategia por casa", corto: "Estrategia" },
  { id: "fotos", nombre: "Analizar fotos", corto: "Fotos" },
];
