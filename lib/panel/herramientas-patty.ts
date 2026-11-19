// Herramientas del chat de Patty que resuelve el código, sin IA: fotos de una casa, post e historia para redes,
// ficha PDF y video. Se piden con un botón o con palabras ("hazme un post de la casa de Escazú"). Reglas puras.

export type Herramienta = "fotos" | "post" | "historia" | "ficha" | "video";

export const HERRAMIENTAS: { id: Herramienta; nombre: string; ayuda: string }[] = [
  { id: "fotos", nombre: "Fotos de una casa", ayuda: "Para descargarlas o reenviarlas" },
  { id: "post", nombre: "Post de Instagram", ayuda: "Cuadrado, con precio y tu marca" },
  { id: "historia", nombre: "Historia", ayuda: "Vertical, para historias y estados" },
  { id: "ficha", nombre: "Ficha PDF", ayuda: "El folleto de la casa" },
  { id: "video", nombre: "Video", ayuda: "Con las fotos de la casa" },
];

export const NOMBRE_HERRAMIENTA: Record<Herramienta, string> = Object.fromEntries(HERRAMIENTAS.map((h) => [h.id, h.nombre])) as Record<
  Herramienta,
  string
>;

const sinTildes = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

const PIDE = /\b(haz[a-z]*|hace[a-z]*|hag[a-z]*|arm[a-z]*|genera[a-z]*|cre[ae][a-z]*|dam[e]|da(me|nos)|pas[a-z]*|mand[a-z]*|envi[a-z]*|quiero|necesito|ocupo|prepar[a-z]*|diseñ[a-z]*|disen[a-z]*|saca[a-z]*|muestr[a-z]*|ensen[a-z]*)\b/;

/**
 * Qué herramienta pide el mensaje, o null. Las preguntas de "cómo se hace" van a Patty (ella explica y lleva a la
 * pantalla); subir fotos al sitio tiene su propio camino y no pasa por aquí.
 */
export function pideHerramienta(texto: string): Herramienta | null {
  const t = sinTildes(texto).trim();
  if (!t || t.length > 300) return null;
  if (/^\s*¿?\s*(como|donde|que es|para que|se puede|puedo)\b/.test(t)) return null;
  if (/\b(sub[a-z]*|carg[a-z]*|agreg[a-z]*|public[a-z]*)\b.*\b(sitio|pagina|web)\b/.test(t)) return null;
  if (!PIDE.test(t)) return null;
  if (/\b(historia|story|stories|estado)\b/.test(t)) return "historia";
  if (/\b(post|posteo|publicacion|instagram|insta|facebook|redes)\b/.test(t)) return "post";
  if (/\b(video|reel|reels|tiktok)\b/.test(t)) return "video";
  if (/\b(ficha|folleto|brochure|pdf)\b/.test(t)) return "ficha";
  if (/\b(fotos?|imagenes|fotografias)\b/.test(t) && /\b(casa|propiedad|apartamento|apto|lote|terreno|local|oficina|de la|del)\b/.test(t)) return "fotos";
  return null;
}

export type CasaHerramienta = { id: string; codigo: string; titulo: string; zona: string | null; portada: string | null; fotos: number };

const VACIAS = new Set(
  "hazme haz arma armame genera generame crea creame dame pasame mandame enviame quiero necesito ocupo prepara preparame un una el la los las de del al a en y con para por favor patty post posteo publicacion instagram insta historia story estado video reel ficha folleto pdf fotos foto imagenes casa propiedad esta este mi mis que".split(
    " ",
  ),
);

/** La casa que nombra el mensaje (código, o palabras del título o la zona), si es una sola. */
export function casaNombrada(texto: string, casas: CasaHerramienta[]): CasaHerramienta | null {
  const t = sinTildes(texto);
  const codigos = casas.filter((c) => c.codigo && new RegExp(`(^|[^a-z0-9])${sinTildes(c.codigo).replace(/[^a-z0-9]/g, "[^a-z0-9]?")}($|[^a-z0-9])`).test(t));
  if (codigos.length === 1) return codigos[0];
  const palabras = t.split(/[^a-z0-9ñ]+/).filter((p) => p.length >= 3 && !VACIAS.has(p));
  if (!palabras.length) return null;
  const puntos = casas.map((c) => {
    const donde = sinTildes(`${c.titulo} ${c.zona ?? ""}`);
    return { c, n: palabras.filter((p) => new RegExp(`\\b${p}\\b`).test(donde)).length };
  });
  const mejor = Math.max(0, ...puntos.map((p) => p.n));
  if (mejor === 0) return null;
  const ganadoras = puntos.filter((p) => p.n === mejor);
  return ganadoras.length === 1 ? ganadoras[0].c : null;
}

/** Buscador del paso "¿De qué casa?": por código, título o zona, sin tildes. */
export function filtrarCasas(casas: CasaHerramienta[], busqueda: string): CasaHerramienta[] {
  const q = sinTildes(busqueda).trim();
  if (!q) return casas;
  return casas.filter((c) => sinTildes(`${c.codigo} ${c.titulo} ${c.zona ?? ""}`).includes(q));
}

/** Direcciones del panel para cada diseño (las sirven rutas que ya existen y comprueban la sesión). */
export const rutaImagenRedes = (casaId: string, formato: "cuadrado" | "historia", descargar = false) =>
  `/panel/propiedades/${casaId}/redes/imagen?formato=${formato}${descargar ? "&descargar=1" : ""}`;
export const rutaEstudio = (casaId: string, ver: "imagen" | "video" | "texto") => `/panel/propiedades/${casaId}/redes?ver=${ver}`;
