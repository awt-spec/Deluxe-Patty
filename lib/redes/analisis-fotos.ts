import { cifrasInventadas } from "./cifras";

// "Analizar fotos" de Redes sociales: la IA (con visión) califica cada foto real de la casa y dice qué muestra; el
// código hace el resto: puntaje, portada para el feed (4:5) y para historias (9:16) según la proporción real de la
// foto, cuáles mejorar con IA, qué espacios faltan y el orden del carrusel. También lee el tamaño de la imagen de
// sus primeros bytes (JPEG, PNG y WebP) sin librerías.

export const ESPACIOS = [
  "fachada",
  "sala",
  "cocina",
  "comedor",
  "dormitorio_principal",
  "dormitorio",
  "bano_principal",
  "bano",
  "vista",
  "piscina",
  "jardin",
  "terraza",
  "area_social",
  "cochera",
  "terreno",
  "otro",
] as const;
export type Espacio = (typeof ESPACIOS)[number];

export const NOMBRE_ESPACIO: Record<Espacio, string> = {
  fachada: "Fachada",
  sala: "Sala",
  cocina: "Cocina",
  comedor: "Comedor",
  dormitorio_principal: "Dormitorio principal",
  dormitorio: "Dormitorio",
  bano_principal: "Baño principal",
  bano: "Baño",
  vista: "Vista",
  piscina: "Piscina",
  jardin: "Jardín",
  terraza: "Terraza",
  area_social: "Área social",
  cochera: "Cochera",
  terreno: "Terreno",
  otro: "Otro",
};

/** Cuántas fotos se analizan por vez, cuánto pesa cada una como máximo y cuánto entre todas (bytes). */
export const MAX_FOTOS_ANALISIS = 12;
export const MAX_BYTES_FOTO = 3_500_000;
export const MAX_BYTES_TOTAL = 16_000_000;

export interface FotoParaAnalisis {
  id: string;
  url: string;
  nombre: string;
  ancho: number | null;
  alto: number | null;
  /** Ya es la versión mejorada con IA (no se vuelve a sugerir mejorarla). */
  mejorada: boolean;
  /** La foto original (para el enlace a "Mejorar esta foto con IA"). */
  original: string;
}

export interface AnalisisCrudo {
  foto: string;
  espacio: string;
  muestra: string;
  luz: number;
  encuadre: number;
  orden: number;
  nitidez: number;
  mejorar: boolean;
  consejo: string;
}

export interface Notas {
  luz: number;
  encuadre: number;
  orden: number;
  nitidez: number;
}

export interface FotoAnalizada extends FotoParaAnalisis {
  espacio: Espacio;
  muestra: string;
  notas: Notas;
  puntaje: number;
  mejorar: boolean;
  consejo: string;
}

const sinTildes = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();

/** "Baño principal", "bano_principal", "master bedroom" → su espacio; si no se reconoce, "otro". */
export function normalizarEspacio(x: unknown): Espacio {
  const s = sinTildes(String(x ?? "")).replace(/[\s-]+/g, "_");
  if ((ESPACIOS as readonly string[]).includes(s)) return s as Espacio;
  if (/principal|master/.test(s) && /bano|bath/.test(s)) return "bano_principal";
  if (/principal|master/.test(s)) return "dormitorio_principal";
  if (/dormitorio|habitacion|cuarto|bedroom/.test(s)) return "dormitorio";
  if (/bano|bath/.test(s)) return "bano";
  if (/sala|living/.test(s)) return "sala";
  if (/cocina|kitchen/.test(s)) return "cocina";
  if (/comedor|dining/.test(s)) return "comedor";
  if (/fachada|frente|exterior_de_la_casa|facade/.test(s)) return "fachada";
  if (/piscina|pool/.test(s)) return "piscina";
  if (/jardin|garden|patio/.test(s)) return "jardin";
  if (/terraza|balcon|deck/.test(s)) return "terraza";
  if (/vista|view|paisaje/.test(s)) return "vista";
  if (/social|rancho|bbq|estar/.test(s)) return "area_social";
  if (/cochera|garaje|parqueo|garage/.test(s)) return "cochera";
  if (/terreno|lote/.test(s)) return "terreno";
  return "otro";
}

const nota = (x: unknown) => {
  const n = Math.round(Number(x));
  return Number.isFinite(n) ? Math.min(5, Math.max(1, n)) : 3;
};

/** Puntaje de 0 a 100: la luz y el encuadre pesan más que el orden y la nitidez. */
export function puntajeFoto(n: Notas): number {
  const promedio = n.luz * 0.3 + n.encuadre * 0.3 + n.orden * 0.2 + n.nitidez * 0.2;
  return Math.round(((promedio - 1) / 4) * 100);
}

const textoCorto = (x: unknown, max: number, permitidas?: Set<string> | null) => {
  const t = typeof x === "string" ? x.replace(/\s+/g, " ").trim().slice(0, max) : "";
  return permitidas && cifrasInventadas(t, permitidas).length ? "" : t;
};

/**
 * Lo que devolvió el modelo, solo para fotos que se le mandaron (por su id), una vez cada una, con las notas acotadas
 * de 1 a 5. Textos con cifras que no están en la ficha se vacían.
 */
export function revisarAnalisis(crudo: unknown, fotos: FotoParaAnalisis[], permitidas?: Set<string> | null): FotoAnalizada[] {
  const porId = new Map(fotos.map((f) => [f.id, f]));
  const vistos = new Set<string>();
  const res: FotoAnalizada[] = [];
  for (const c of (Array.isArray(crudo) ? crudo : []) as Partial<AnalisisCrudo>[]) {
    const id = typeof c?.foto === "string" ? c.foto.trim().toUpperCase() : "";
    const f = porId.get(id);
    if (!f || vistos.has(id)) continue;
    vistos.add(id);
    const notas = { luz: nota(c.luz), encuadre: nota(c.encuadre), orden: nota(c.orden), nitidez: nota(c.nitidez) };
    res.push({
      ...f,
      espacio: normalizarEspacio(c.espacio),
      muestra: textoCorto(c.muestra, 160, permitidas),
      notas,
      puntaje: puntajeFoto(notas),
      mejorar: c.mejorar === true,
      consejo: textoCorto(c.consejo, 220, permitidas),
    });
  }
  return res;
}

export interface ResumenFotos {
  /** De mejor a peor. */
  fotos: FotoAnalizada[];
  promedio: number;
  portadaFeed: FotoAnalizada | null;
  portadaHistoria: FotoAnalizada | null;
  aMejorar: FotoAnalizada[];
  faltan: string[];
  carrusel: FotoAnalizada[];
}

/** Espacios que lucen de portada. */
const HEROE = new Set<Espacio>(["fachada", "vista", "piscina", "sala", "area_social", "terraza", "jardin"]);
/** Puntaje mínimo para ser portada o entrar al carrusel. */
export const MIN_PORTADA = 40;
export const MIN_CARRUSEL = 35;
export const MAX_CARRUSEL = 10;

const proporcion = (f: Pick<FotoParaAnalisis, "ancho" | "alto">) => (f.ancho && f.alto ? f.ancho / f.alto : null);

/** Qué tan buena es como portada: su puntaje, si es un espacio de portada y si su proporción calza con el formato. */
export function puntajePortada(f: FotoAnalizada, formato: "feed" | "historia"): number {
  let p = f.puntaje + (HEROE.has(f.espacio) ? 12 : 0);
  const r = proporcion(f);
  if (r !== null) {
    if (formato === "historia") p += r <= 0.8 ? 15 : r > 1.6 ? -10 : 0;
    else p += r <= 1.0 ? 6 : r > 1.8 ? -8 : 0;
  }
  return p;
}

function mejorPortada(fotos: FotoAnalizada[], formato: "feed" | "historia"): FotoAnalizada | null {
  const candidatas = fotos.filter((f) => f.puntaje >= MIN_PORTADA);
  if (!candidatas.length) return null;
  return candidatas.reduce((a, b) => (puntajePortada(b, formato) > puntajePortada(a, formato) ? b : a));
}

type Requisito = { espacios: Espacio[]; nombre: string };
const REQUISITOS: Record<string, Requisito[]> = {
  casa: [
    { espacios: ["fachada"], nombre: "Fachada" },
    { espacios: ["sala", "area_social"], nombre: "Sala o área social" },
    { espacios: ["cocina"], nombre: "Cocina" },
    { espacios: ["dormitorio_principal", "dormitorio"], nombre: "Dormitorio principal" },
    { espacios: ["bano_principal", "bano"], nombre: "Baño principal" },
    { espacios: ["vista", "jardin", "terraza", "piscina"], nombre: "Vista o exteriores (jardín, terraza, piscina)" },
  ],
  apartamento: [
    { espacios: ["sala", "area_social"], nombre: "Sala" },
    { espacios: ["cocina"], nombre: "Cocina" },
    { espacios: ["dormitorio_principal", "dormitorio"], nombre: "Dormitorio principal" },
    { espacios: ["bano_principal", "bano"], nombre: "Baño principal" },
    { espacios: ["vista", "terraza"], nombre: "Vista o balcón" },
    { espacios: ["fachada", "piscina", "area_social"], nombre: "Edificio o áreas comunes" },
  ],
  lote: [
    { espacios: ["terreno"], nombre: "El terreno completo" },
    { espacios: ["vista"], nombre: "La vista o el entorno" },
  ],
  local: [
    { espacios: ["fachada"], nombre: "Fachada o entrada" },
    { espacios: ["sala", "area_social", "otro"], nombre: "Interior" },
  ],
};
REQUISITOS.finca = REQUISITOS.lote;
REQUISITOS.oficina = REQUISITOS.local;

/** Espacios que la galería debería tener según el tipo de propiedad y no tiene. */
export function espaciosQueFaltan(fotos: Pick<FotoAnalizada, "espacio">[], tipo: string): string[] {
  const hay = new Set(fotos.map((f) => f.espacio));
  return (REQUISITOS[tipo] ?? REQUISITOS.casa).filter((r) => !r.espacios.some((e) => hay.has(e))).map((r) => r.nombre);
}

/** Orden de un carrusel que cuenta la casa: la portada, lo social, la cocina, lo privado y el afuera. */
export const ORDEN_CARRUSEL: Espacio[] = [
  "sala",
  "area_social",
  "cocina",
  "comedor",
  "terraza",
  "piscina",
  "jardin",
  "dormitorio_principal",
  "bano_principal",
  "dormitorio",
  "bano",
  "vista",
  "fachada",
  "terreno",
  "cochera",
  "otro",
];

export function ordenCarrusel(fotos: FotoAnalizada[], portada: FotoAnalizada | null): FotoAnalizada[] {
  const res: FotoAnalizada[] = portada ? [portada] : [];
  const usadas = new Set(res.map((f) => f.id));
  for (const espacio of ORDEN_CARRUSEL) {
    const delEspacio = fotos
      .filter((f) => f.espacio === espacio && !usadas.has(f.id) && f.puntaje >= MIN_CARRUSEL)
      .sort((a, b) => b.puntaje - a.puntaje)
      .slice(0, 2);
    for (const f of delEspacio) {
      if (res.length >= MAX_CARRUSEL) return res;
      res.push(f);
      usadas.add(f.id);
    }
  }
  return res;
}

/** Fotos para mejorar con IA (las más flojas primero): las que la IA marcó o con luz o nitidez bajas. */
export function fotosAMejorar(fotos: FotoAnalizada[]): FotoAnalizada[] {
  return fotos.filter((f) => !f.mejorada && (f.mejorar || f.notas.luz <= 2 || f.notas.nitidez <= 2)).sort((a, b) => a.puntaje - b.puntaje);
}

export function resumirFotos(analizadas: FotoAnalizada[], tipo: string): ResumenFotos {
  const fotos = [...analizadas].sort((a, b) => b.puntaje - a.puntaje);
  const portadaFeed = mejorPortada(fotos, "feed");
  return {
    fotos,
    promedio: fotos.length ? Math.round(fotos.reduce((s, f) => s + f.puntaje, 0) / fotos.length) : 0,
    portadaFeed,
    portadaHistoria: mejorPortada(fotos, "historia"),
    aMejorar: fotosAMejorar(fotos),
    faltan: espaciosQueFaltan(fotos, tipo),
    carrusel: ordenCarrusel(fotos, portadaFeed),
  };
}

// ---------------------------------------------------------------- Tamaño de la imagen y tipo, por sus bytes

export function tipoImagen(b: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b.length > 12 && String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP") return "image/webp";
  return null;
}

/** Ancho y alto de un JPEG, PNG o WebP leyendo su cabecera; null si no se puede. */
export function dimensionesImagen(b: Uint8Array): { ancho: number; alto: number } | null {
  const tipo = tipoImagen(b);
  const u16 = (i: number) => (b[i] << 8) | b[i + 1];
  const u32 = (i: number) => ((b[i] << 24) >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3];
  if (tipo === "image/png") {
    if (b.length < 24) return null;
    return valido(u32(16), u32(20));
  }
  if (tipo === "image/jpeg") {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) return null;
      const marca = b[i + 1];
      if (marca === 0xff) {
        i++;
        continue;
      }
      // Marcas sin largo: inicio/fin y reinicios.
      if (marca === 0xd8 || marca === 0x01 || (marca >= 0xd0 && marca <= 0xd7)) {
        i += 2;
        continue;
      }
      if (marca === 0xd9 || marca === 0xda) return null;
      if (marca >= 0xc0 && marca <= 0xcf && marca !== 0xc4 && marca !== 0xc8 && marca !== 0xcc) return valido(u16(i + 7), u16(i + 5));
      i += 2 + u16(i + 2);
    }
    return null;
  }
  if (tipo === "image/webp") {
    if (b.length < 30) return null;
    const trozo = String.fromCharCode(...b.slice(12, 16));
    if (trozo === "VP8 ") return valido(((b[27] << 8) | b[26]) & 0x3fff, ((b[29] << 8) | b[28]) & 0x3fff);
    if (trozo === "VP8L") return valido(1 + (((b[22] & 0x3f) << 8) | b[21]), 1 + (((b[24] & 0x0f) << 10) | (b[23] << 2) | ((b[22] & 0xc0) >> 6)));
    if (trozo === "VP8X") return valido(1 + (b[24] | (b[25] << 8) | (b[26] << 16)), 1 + (b[27] | (b[28] << 8) | (b[29] << 16)));
  }
  return null;
}

const valido = (ancho: number, alto: number) => (ancho > 0 && alto > 0 && ancho < 50_000 && alto < 50_000 ? { ancho, alto } : null);

// ---------------------------------------------------------------- Demo: notas fijas por posición, sin IA

const ESPACIOS_DEMO: Espacio[] = ["sala", "cocina", "fachada", "dormitorio_principal", "piscina", "bano_principal", "comedor", "terraza", "dormitorio", "vista", "jardin", "bano"];

export function analisisDemo(fotos: FotoParaAnalisis[]): AnalisisCrudo[] {
  return fotos.map((f, i) => {
    const luz = [5, 4, 3, 4, 5, 2, 4, 3, 3, 5, 4, 2][i % 12];
    const encuadre = [4, 4, 4, 3, 5, 3, 4, 3, 2, 5, 3, 3][i % 12];
    const espacio = ESPACIOS_DEMO[i % ESPACIOS_DEMO.length];
    return {
      foto: f.id,
      espacio,
      muestra: `${NOMBRE_ESPACIO[espacio]} (ejemplo de la demostración)`,
      luz,
      encuadre,
      orden: [4, 5, 4, 3, 5, 3, 4, 4, 3, 5, 4, 3][i % 12],
      nitidez: [5, 4, 4, 4, 5, 3, 4, 4, 3, 5, 4, 2][i % 12],
      mejorar: luz <= 3,
      consejo: luz <= 3 ? "Repítela de día con las cortinas abiertas, o mejórala con IA." : "Buena para el feed: úsala tal cual.",
    };
  });
}
