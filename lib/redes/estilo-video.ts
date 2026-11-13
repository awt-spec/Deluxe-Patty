import { cifrasInventadas } from "./cifras";
import type { DatosVideo, Escena, TipoEscena } from "./video";

// Dirección de arte del video para redes, como datos y funciones puras (sin canvas): estilos, cómo se trata
// cada foto según su proporción, qué movimiento y qué transición lleva cada escena, los tiempos y curvas del
// texto, las zonas seguras de Instagram/TikTok, el contraste del texto sobre la foto y los textos que
// pueden llegar al video. El dibujo (app/panel/propiedades/[id]/redes/dibujo.ts) solo sigue estas reglas.

export type EstiloVideo = "elegante" | "moderno" | "limpio";
export type Transicion = "fundido" | "deslizar" | "barrido" | "zoom";
export type Movimiento = "acercar" | "alejar" | "paneo-izq" | "paneo-der" | "subir" | "bajar";
export type Tratamiento = "llenar" | "paneo" | "enmarcada";
export type Curva = "entra" | "suave" | "expo" | "sale";

export interface DefEstilo {
  nombre: string;
  descripcion: string;
  /** Transiciones que se van alternando entre fotos. */
  transiciones: Transicion[];
  /** Segundos que dura cada transición. */
  transicion: number;
  /** Cómo entra el texto: por líneas con máscara, por palabras o con un fundido corto. */
  entradaTexto: "lineas" | "palabras" | "fundido";
  /** Segundos que tarda en entrar una línea o palabra, y la pausa entre una y la siguiente. */
  duracionEntrada: number;
  escalonado: number;
  curvaTexto: Curva;
  /** Cuánto se acerca o se mueve la foto en la escena (0,06 = 6 %). */
  amplitud: number;
  /** Barra de avance por segmentos arriba, como en las historias. */
  barra: boolean;
  /** Logo pequeño en una esquina mientras pasan las fotos. */
  marcaAgua: boolean;
}

export const ESTILOS_VIDEO: Record<EstiloVideo, DefEstilo> = {
  elegante: {
    nombre: "Elegante",
    descripcion: "Letra fina, detalles dorados y movimientos lentos",
    transiciones: ["fundido", "barrido", "fundido", "zoom"],
    transicion: 0.9,
    entradaTexto: "lineas",
    duracionEntrada: 1,
    escalonado: 0.14,
    curvaTexto: "entra",
    amplitud: 0.07,
    barra: true,
    marcaAgua: true,
  },
  moderno: {
    nombre: "Moderno",
    descripcion: "Letra grande, bloques de color y cortes rápidos",
    transiciones: ["deslizar", "zoom", "barrido", "deslizar"],
    transicion: 0.45,
    entradaTexto: "palabras",
    duracionEntrada: 0.55,
    escalonado: 0.07,
    curvaTexto: "expo",
    amplitud: 0.11,
    barra: true,
    marcaAgua: true,
  },
  limpio: {
    nombre: "Limpio",
    descripcion: "Texto pequeño abajo: la foto manda",
    transiciones: ["fundido", "fundido", "deslizar"],
    transicion: 0.7,
    entradaTexto: "fundido",
    duracionEntrada: 0.8,
    escalonado: 0.1,
    curvaTexto: "suave",
    amplitud: 0.05,
    barra: false,
    marcaAgua: false,
  },
};

export const ESTILOS_LISTA = Object.keys(ESTILOS_VIDEO) as EstiloVideo[];

/** Con marca propia (como Deluxe) sale Elegante; sin marca, Moderno con colores neutros. */
export const estiloPorDefecto = (conMarca: boolean): EstiloVideo => (conMarca ? "elegante" : "moderno");

export interface ColoresVideo {
  principal: string;
  soporte: string;
  profundo: string;
  base: string;
}

/** Colores para un corredor sin marca: grafito y marfil, sin el verde de WhatsApp. */
export const COLORES_NEUTROS: ColoresVideo = { principal: "#E8E2D6", soporte: "#A39E95", profundo: "#17191C", base: "#F7F6F3" };

export const coloresDelVideo = (conMarca: boolean, colores: ColoresVideo): ColoresVideo => (conMarca ? colores : COLORES_NEUTROS);

// --- Curvas ----------------------------------------------------------------------------------------

export const recortar = (x: number) => Math.max(0, Math.min(1, x));

export const CURVAS: Record<Curva, (x: number) => number> = {
  entra: (x) => 1 - Math.pow(1 - recortar(x), 3),
  suave: (x) => {
    const t = recortar(x);
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  },
  expo: (x) => {
    const t = recortar(x);
    return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
  },
  sale: (x) => Math.pow(recortar(x), 3),
};

// --- Fotos -----------------------------------------------------------------------------------------

/**
 * Cómo se pone una foto en el cuadro, según cuánto difieren sus proporciones (r = proporción de la foto /
 * proporción del cuadro):
 * - r entre 0,8 y 1,25: casi igual, la foto llena el cuadro (con zoom lento).
 * - r entre 1,25 y 2,2 (más ancha) o entre 0,5 y 0,8 (más alta): llena el cuadro recortando un poco y el
 *   movimiento es un paneo lento hacia el lado que sobra, para que se vea casi toda.
 * - Más extrema (una foto horizontal 3:2 o 4:3 en un video vertical 9:16, r ≈ 2,4–2,7): se ve COMPLETA,
 *   encima de la misma foto desenfocada y oscurecida, con sombra. Nunca se recorta a lo bruto.
 * La portada siempre llena el cuadro (lleva el título encima) y se recorre con paneo.
 */
export function tratamientoFoto(fotoAncho: number, fotoAlto: number, ancho: number, alto: number, tipo: TipoEscena = "foto"): Tratamiento {
  if (!fotoAncho || !fotoAlto) return "llenar";
  const r = fotoAncho / fotoAlto / (ancho / alto);
  if (r >= 0.8 && r <= 1.25) return "llenar";
  if (tipo === "portada") return "paneo";
  if (r <= 2.2 && r >= 0.5) return "paneo";
  return "enmarcada";
}

/** El movimiento de cada escena: va cambiando para que no se vean todas iguales. */
export function movimientoFoto(indice: number, tratamiento: Tratamiento, fotoAncho: number, fotoAlto: number, ancho: number, alto: number): Movimiento {
  if (tratamiento === "enmarcada") return indice % 2 === 0 ? "acercar" : "alejar";
  if (tratamiento === "paneo") {
    const masAncha = fotoAncho / fotoAlto > ancho / alto;
    if (masAncha) return indice % 2 === 0 ? "paneo-der" : "paneo-izq";
    return indice % 2 === 0 ? "bajar" : "subir";
  }
  const ciclo: Movimiento[] = ["acercar", "paneo-der", "alejar", "paneo-izq"];
  return ciclo[indice % ciclo.length];
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Dónde se dibuja la foto que llena el cuadro en el momento `avance` (0 a 1) de la escena. Siempre cubre todo
 * el cuadro (nunca deja bordes) y se mueve con una curva suave, no lineal.
 */
export function encuadre(mov: Movimiento, avance: number, fotoAncho: number, fotoAlto: number, ancho: number, alto: number, amplitud: number): Rect {
  const p = CURVAS.suave(avance);
  const base = Math.max(ancho / fotoAncho, alto / fotoAlto);
  const zoom = mov === "acercar" ? 1 + amplitud * p : mov === "alejar" ? 1 + amplitud * (1 - p) : 1 + amplitud * 0.35;
  const w = fotoAncho * base * zoom;
  const h = fotoAlto * base * zoom;
  const libreX = w - ancho;
  const libreY = h - alto;
  // Fracción del espacio libre que se recorre en el paneo (0 = pegado a un lado, 1 = al otro).
  let fx = 0.5;
  let fy = 0.5;
  if (mov === "paneo-der") fx = 0.12 + 0.76 * p;
  else if (mov === "paneo-izq") fx = 0.88 - 0.76 * p;
  else if (mov === "bajar") fy = 0.15 + 0.7 * p;
  else if (mov === "subir") fy = 0.85 - 0.7 * p;
  return { x: -libreX * fx, y: -libreY * fy, w, h };
}

export interface Zonas {
  arriba: number;
  abajo: number;
  izquierda: number;
  derecha: number;
}

/**
 * Zonas seguras: en vertical (reels, historias, TikTok) la app tapa ~14 % de arriba (nombre, botones) y ~20 %
 * de abajo (texto y botones); nada importante va ahí. En cuadrado, un margen parejo.
 */
export function zonaSegura(ancho: number, alto: number): Zonas {
  const vertical = alto / ancho > 1.3;
  if (vertical) return { arriba: Math.round(alto * 0.14), abajo: Math.round(alto * 0.2), izquierda: Math.round(ancho * 0.075), derecha: Math.round(ancho * 0.075) };
  const m = Math.round(Math.min(ancho, alto) * 0.07);
  return { arriba: m, abajo: m, izquierda: m, derecha: m };
}

/** Si un rectángulo (texto, logo, precio) queda dentro de la zona segura. */
export function dentroDeZona(r: Rect, ancho: number, alto: number): boolean {
  const z = zonaSegura(ancho, alto);
  const e = 0.5;
  return r.x >= z.izquierda - e && r.y >= z.arriba - e && r.x + r.w <= ancho - z.derecha + e && r.y + r.h <= alto - z.abajo + e;
}

/**
 * La foto completa, encima de su fondo desenfocado: tan ancha como deja la zona segura (con un poco de aire en
 * Elegante) y centrada un poco arriba, para dejar lugar al texto. `avance` agranda la foto apenas (2–4 %).
 */
export function marcoFoto(fotoAncho: number, fotoAlto: number, ancho: number, alto: number, estilo: EstiloVideo): Rect {
  const z = zonaSegura(ancho, alto);
  const margen = estilo === "elegante" ? z.izquierda * 0.55 : estilo === "moderno" ? 0 : z.izquierda * 0.4;
  const maxW = ancho - margen * 2;
  const maxH = alto - z.arriba - z.abajo;
  const s = Math.min(maxW / fotoAncho, maxH / fotoAlto);
  const w = fotoAncho * s;
  const h = fotoAlto * s;
  const centro = z.arriba + maxH * 0.44;
  return { x: (ancho - w) / 2, y: Math.max(z.arriba, centro - h / 2), w, h };
}

// --- Transiciones ----------------------------------------------------------------------------------

/** La transición con que entra la escena `indice` (la primera no tiene). */
export function transicionDe(estilo: EstiloVideo, escenas: Pick<Escena, "tipo">[], indice: number): Transicion | null {
  if (indice <= 0 || indice >= escenas.length) return null;
  const def = ESTILOS_VIDEO[estilo];
  const tipo = escenas[indice].tipo;
  // A los datos y al cierre se entra siempre con algo sobrio.
  if (tipo === "datos" || tipo === "cierre") return estilo === "moderno" ? "deslizar" : "fundido";
  return def.transiciones[(indice - 1) % def.transiciones.length];
}

/** Segundos de la transición, sin pasar de un tercio de la escena más corta de las dos. */
export function duracionTransicion(estilo: EstiloVideo, anterior: number, actual: number): number {
  return Math.min(ESTILOS_VIDEO[estilo].transicion, anterior / 3, actual / 3);
}

// --- Texto -----------------------------------------------------------------------------------------

/** Segundos antes del final de la escena en que el texto empieza a salir (sale limpio antes del corte). */
export const SALIDA_TEXTO = 0.4;
/** Pausa al empezar la escena antes de que entre el primer texto. */
export const RETRASO_TEXTO = 0.25;

/**
 * Cuánto ha entrado (0 a 1, ya con su curva) y cuánto ha salido (0 a 1) el elemento número `orden` de la
 * escena en el segundo `local`. `ultima`: la última escena no saca el texto (el video termina con él).
 */
export function tiempoTexto(estilo: EstiloVideo, local: number, duracion: number, orden: number, o: { ultima?: boolean; retraso?: number } = {}) {
  const def = ESTILOS_VIDEO[estilo];
  const inicio = (o.retraso ?? RETRASO_TEXTO) + orden * def.escalonado;
  const entrada = CURVAS[def.curvaTexto]((local - inicio) / def.duracionEntrada);
  const salida = o.ultima ? 0 : CURVAS.sale((local - (duracion - SALIDA_TEXTO)) / SALIDA_TEXTO);
  // Sin restos de coma flotante: 0,9999… es 1 (el texto ya salió del todo).
  const redondo = (x: number) => (x > 0.9995 ? 1 : x < 0.0005 ? 0 : x);
  return { entrada: redondo(entrada), salida: redondo(salida) };
}

// --- Contraste -------------------------------------------------------------------------------------

function canal(c: number): number {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

export function hexARgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = h.length === 3 ? h.split("").map((x) => x + x).join("") : h.padEnd(6, "0").slice(0, 6);
  return [parseInt(n.slice(0, 2), 16) || 0, parseInt(n.slice(2, 4), 16) || 0, parseInt(n.slice(4, 6), 16) || 0];
}

export function luminancia([r, g, b]: [number, number, number]): number {
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
}

export function contraste(a: [number, number, number], b: [number, number, number]): number {
  const [x, y] = [luminancia(a), luminancia(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

/** El peor fondo bajo el texto: un píxel blanco de la foto tapado por el degradado negro con esa opacidad. */
export const peorFondo = (opacidad: number): [number, number, number] => {
  const v = Math.round(255 * (1 - opacidad));
  return [v, v, v];
};

/** Opacidad del degradado donde va el texto: con ella el blanco cumple AA (4,5:1) sobre cualquier foto. */
export const SCRIM_TEXTO = 0.62;
/** Donde va el precio o un texto de color: más oscuro. */
export const SCRIM_ACENTO = 0.78;

/** El color de acento para escribir sobre la foto: el de la marca si se lee (3:1, texto grande); si no, blanco. */
export function acentoSobreFoto(principal: string): string {
  return contraste(hexARgb(principal), peorFondo(SCRIM_ACENTO)) >= 3 ? principal : "#FFFFFF";
}

/** Texto sobre un fondo de color: el oscuro de la marca o blanco, el que más se lea. */
export function textoSobre(fondo: string, oscuro: string): string {
  const f = hexARgb(fondo);
  return contraste(f, hexARgb(oscuro)) >= contraste(f, [255, 255, 255]) ? oscuro : "#FFFFFF";
}

// --- Datos con cifra -------------------------------------------------------------------------------

/** "3,5" o "1 250": como se escribe en Costa Rica, igual que en el resto de la app. */
export function formatoCifra(valor: number, decimales: number): string {
  return valor.toLocaleString("es-CR", { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
}

/** La cifra mientras cuenta (de 0 a su valor, con curva) y exacta al terminar. */
export function cifraEn(valor: number, decimales: number, avance: number): string {
  if (avance >= 1) return formatoCifra(valor, decimales);
  const paso = decimales ? 0.5 : 1;
  const v = Math.round((valor * CURVAS.expo(avance)) / paso) * paso;
  return formatoCifra(Math.min(valor, v), Number.isInteger(v) && decimales ? 0 : decimales);
}

/** Segundos que tarda en contar cada cifra. */
export const CUENTA = 1.3;

/**
 * Todo lo que el video puede escribir: los textos de las escenas (los que pasan la revisión) y lo que sale de
 * la ficha. Sirve para comprobar que ninguna cifra fuera de la ficha llega al video.
 */
export function textosDelVideo(escenas: Escena[], d: DatosVideo): string[] {
  return [
    ...escenas.map((e) => textoEscena(e, d)),
    d.operacionCorta,
    d.titulo,
    d.lugar ?? "",
    d.precio ?? "",
    ...d.cifras.flatMap((c) => [formatoCifra(c.valor, c.decimales), c.unidad, c.etiqueta]),
    ...d.extras,
    d.contacto ? `WhatsApp ${d.contacto}` : "",
    `Código ${d.codigo}`,
    d.nombreCorredor,
    "Imagen ilustrativa",
  ].filter(Boolean);
}

/**
 * El texto de una escena tal como sale en el video: si trae una cifra que no está en la ficha (un número que
 * escribió alguien o la IA), no sale. El editor avisa con `cifrasFueraDeFicha`.
 */
export function textoEscena(e: Pick<Escena, "texto" | "tipo">, d: Pick<DatosVideo, "permitidas" | "titulo">): string {
  const t = e.texto.trim() || (e.tipo === "portada" ? d.titulo : "");
  return cifrasFueraDeFicha(t, d).length ? "" : t;
}

export function cifrasFueraDeFicha(texto: string, d: Pick<DatosVideo, "permitidas">): string[] {
  return cifrasInventadas(texto, new Set(d.permitidas));
}
