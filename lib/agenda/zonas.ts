// Tiempo de traslado aproximado entre zonas de Costa Rica, para que la asistente no agende dos visitas
// seguidas que no dan tiempo de llegar y para que junte las visitas cercanas el mismo día.
// Es una estimación con la distancia en línea recta: en el Valle Central, velocidad de ciudad con presas; más
// lejos (playas de Guanacaste, Jacó), velocidad de carretera. No consulta mapas en vivo. Una zona que no está en
// la lista no se adivina: se usa el margen fijo del corredor.
//
// Cada zona sabe en qué cantón y distrito queda (división territorial de Costa Rica) y si es un cantón, un
// distrito o un barrio dentro de un distrito: con eso `lib/sitio/ubicacion.ts` decide si "Lindora" y el
// distrito "Pozos" se contradicen (no: Lindora queda dentro de Pozos) o si de verdad hay que preguntar.

type Punto = [lat: number, lng: number];

export type NivelZona = "canton" | "distrito" | "barrio";

export interface Zona {
  /** Como se escribe y se muestra ("San Rafael de Escazú"). */
  nombre: string;
  punto: Punto;
  /** Cantón en que queda. */
  canton: string;
  /** Distrito o distritos en que queda (un barrio puede quedar entre dos). */
  distritos: string[];
  nivel: NivelZona;
  /** Provincia (para no confundir "Heredia, Belén" con la ciudad de Heredia). */
  provincia: string;
}

const z = (nombre: string, lat: number, lng: number, provincia: string, canton: string, distritos: string[], nivel: NivelZona): Zona => ({
  nombre,
  punto: [lat, lng],
  provincia,
  canton,
  distritos,
  nivel,
});

/** Las zonas que la agenda conoce, en el orden en que se ofrecen en las listas. */
export const ZONAS: Zona[] = [
  z("Lindora", 9.951, -84.196, "San José", "Santa Ana", ["Pozos"], "barrio"),
  z("Santa Ana", 9.932, -84.183, "San José", "Santa Ana", ["Santa Ana"], "canton"),
  z("Pozos", 9.948, -84.19, "San José", "Santa Ana", ["Pozos"], "distrito"),
  z("Piedades", 9.935, -84.215, "San José", "Santa Ana", ["Piedades"], "distrito"),
  z("Río Oro", 9.915, -84.205, "San José", "Santa Ana", ["Uruca"], "barrio"),
  z("Ciudad Colón", 9.914, -84.243, "San José", "Mora", ["Colón"], "distrito"),
  z("Brasil de Mora", 9.925, -84.226, "San José", "Santa Ana", ["Brasil"], "distrito"),
  z("La Guácima", 9.968, -84.242, "Alajuela", "Alajuela", ["La Guácima"], "distrito"),
  z("Escazú", 9.919, -84.139, "San José", "Escazú", ["Escazú"], "canton"),
  z("San Rafael de Escazú", 9.932, -84.137, "San José", "Escazú", ["San Rafael"], "distrito"),
  z("Guachipelín", 9.938, -84.158, "San José", "Escazú", ["San Rafael"], "barrio"),
  z("Bello Horizonte", 9.924, -84.152, "San José", "Escazú", ["San Antonio", "Escazú"], "barrio"),
  z("San Antonio de Escazú", 9.898, -84.137, "San José", "Escazú", ["San Antonio"], "distrito"),
  z("Rohrmoser", 9.94, -84.11, "San José", "San José", ["Pavas"], "barrio"),
  z("Pavas", 9.952, -84.124, "San José", "San José", ["Pavas"], "distrito"),
  z("Sabana", 9.936, -84.098, "San José", "San José", ["Mata Redonda"], "barrio"),
  z("San José", 9.933, -84.08, "San José", "San José", ["Carmen", "Merced", "Hospital", "Catedral"], "canton"),
  z("Los Yoses", 9.932, -84.058, "San José", "Montes de Oca", ["San Pedro"], "barrio"),
  z("Barrio Escalante", 9.936, -84.065, "San José", "San José", ["Carmen"], "barrio"),
  z("Curridabat", 9.913, -84.035, "San José", "Curridabat", ["Curridabat"], "canton"),
  z("San Pedro", 9.935, -84.05, "San José", "Montes de Oca", ["San Pedro"], "distrito"),
  z("Tres Ríos", 9.906, -83.987, "Cartago", "La Unión", ["Tres Ríos"], "distrito"),
  z("Moravia", 9.961, -84.048, "San José", "Moravia", ["San Vicente"], "canton"),
  z("Santo Domingo", 9.98, -84.09, "Heredia", "Santo Domingo", ["Santo Domingo"], "canton"),
  z("Heredia", 9.998, -84.117, "Heredia", "Heredia", ["Heredia"], "canton"),
  z("Santa Bárbara", 10.035, -84.157, "Heredia", "Santa Bárbara", ["Santa Bárbara"], "canton"),
  z("Belén", 9.98, -84.18, "Heredia", "Belén", ["San Antonio"], "canton"),
  z("La Ribera", 9.983, -84.169, "Heredia", "Belén", ["La Ribera"], "distrito"),
  z("San Antonio de Belén", 9.977, -84.185, "Heredia", "Belén", ["San Antonio"], "distrito"),
  z("Cariari", 9.976, -84.153, "Heredia", "Belén", ["La Asunción", "San Antonio"], "barrio"),
  z("La Asunción", 9.986, -84.168, "Heredia", "Belén", ["La Asunción"], "distrito"),
  z("Alajuela", 10.016, -84.214, "Alajuela", "Alajuela", ["Alajuela"], "canton"),
  z("El Coyol", 10.003, -84.258, "Alajuela", "Alajuela", ["San José"], "barrio"),
  z("Atenas", 9.979, -84.38, "Alajuela", "Atenas", ["Atenas"], "canton"),
  z("Grecia", 10.073, -84.312, "Alajuela", "Grecia", ["Grecia"], "canton"),
  z("San Ramón", 10.088, -84.47, "Alajuela", "San Ramón", ["San Ramón"], "canton"),
  z("Puriscal", 9.846, -84.315, "San José", "Puriscal", ["Santiago"], "canton"),
  z("Desamparados", 9.897, -84.064, "San José", "Desamparados", ["Desamparados"], "canton"),
  z("Coronado", 9.977, -84.008, "San José", "Vázquez de Coronado", ["San Isidro"], "canton"),
  z("Cartago", 9.864, -83.919, "Cartago", "Cartago", ["Oriental", "Occidental"], "canton"),
  // Heredia norte y Flores.
  z("Barva", 10.021, -84.122, "Heredia", "Barva", ["Barva"], "canton"),
  z("San Joaquín de Flores", 9.996, -84.153, "Heredia", "Flores", ["San Joaquín"], "canton"),
  // Pacífico central y Guanacaste (lejos: el traslado se cuenta por carretera).
  z("Jacó", 9.615, -84.629, "Puntarenas", "Garabito", ["Jacó"], "canton"),
  z("Playa Hermosa de Garabito", 9.573, -84.585, "Puntarenas", "Garabito", ["Jacó"], "barrio"),
  z("Playas del Coco", 10.552, -85.697, "Guanacaste", "Carrillo", ["Sardinal"], "barrio"),
  z("Sardinal", 10.517, -85.649, "Guanacaste", "Carrillo", ["Sardinal"], "distrito"),
  z("Playa Hermosa de Guanacaste", 10.573, -85.676, "Guanacaste", "Carrillo", ["Sardinal"], "barrio"),
  z("Bagaces", 10.527, -85.254, "Guanacaste", "Bagaces", ["Bagaces"], "canton"),
  z("Santa Cruz", 10.263, -85.586, "Guanacaste", "Santa Cruz", ["Santa Cruz"], "canton"),
  z("Playa Negra", 10.204, -85.832, "Guanacaste", "Santa Cruz", ["Cabo Velas"], "barrio"),
];

/**
 * Otros nombres de un lugar que ya está en la lista: barrios, condominios o centros comerciales conocidos.
 * "Valle del Sol" (el residencial del golf) queda en Lindora, Pozos; "Distrito 4" es el centro comercial de
 * Guachipelín; Jaboncillos es de San Antonio de Escazú; Hacienda Los Reyes, de La Guácima.
 */
export const ALIAS_ZONAS: Record<string, string> = {
  "valle del sol": "Lindora",
  "distrito 4": "Guachipelín",
  "distrito cuatro": "Guachipelín",
  jaboncillos: "San Antonio de Escazú",
  "hacienda los reyes": "La Guácima",
  "los reyes": "La Guácima",
  guacima: "La Guácima",
  "el coco": "Playas del Coco",
  "playa el coco": "Playas del Coco",
  "playa del coco": "Playas del Coco",
  "san joaquin": "San Joaquín de Flores",
  "san rafael de escazu": "San Rafael de Escazú",
  "san antonio de belen": "San Antonio de Belén",
  "brasil": "Brasil de Mora",
  "la sabana": "Sabana",
  coyol: "El Coyol",
  "ciudad cariari": "Cariari",
};

/** Nombres que existen en más de un lugar: aunque el código los ubique, se le pregunta al corredor. */
export const NOMBRES_AMBIGUOS: Record<string, string[]> = {
  "playa hermosa": ["Playa Hermosa de Garabito", "Playa Hermosa de Guanacaste"],
};

/** "Santa Ana, San José" → "santa ana" si se pide solo lo primero; minúsculas, sin tildes ni espacios de más. */
export function sinTildes(t: string): string {
  return t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

const clave = (zona: string) => sinTildes(zona.split(",")[0]);

const POR_NOMBRE = new Map(ZONAS.map((zz) => [sinTildes(zz.nombre), zz]));

/** La zona de la lista con ese nombre exacto o con ese alias (sin importar tildes ni mayúsculas). */
export function zonaPorNombre(nombre: string | null | undefined): Zona | null {
  if (!nombre) return null;
  const k = sinTildes(nombre);
  const directa = POR_NOMBRE.get(k);
  if (directa) return directa;
  const alias = ALIAS_ZONAS[k];
  return alias ? (POR_NOMBRE.get(sinTildes(alias)) ?? null) : null;
}

export type Mencion = { zona: Zona; texto: string; ambigua?: string[] };

const escapar = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Zonas que se nombran dentro de un texto, como palabras completas y sin pisarse: la más larga primero, así
 * "San Rafael de Escazú" no cuenta además como "Escazú" y "Bosques de Lindora" cuenta como Lindora.
 */
export function zonasEnTexto(textoLibre: string | null | undefined): Mencion[] {
  if (!textoLibre) return [];
  let texto = ` ${sinTildes(textoLibre).replace(/[^a-z0-9ñ]+/g, " ")} `;
  const nombres = [...new Set([...POR_NOMBRE.keys(), ...Object.keys(ALIAS_ZONAS), ...Object.keys(NOMBRES_AMBIGUOS)])].sort((a, b) => b.length - a.length);
  const salida: Mencion[] = [];
  for (const n of nombres) {
    const re = new RegExp(` ${escapar(n)} `);
    if (!re.test(texto)) continue;
    texto = texto.replace(new RegExp(` ${escapar(n)} `, "g"), " | ");
    const ambiguas = NOMBRES_AMBIGUOS[n];
    const zona = ambiguas ? POR_NOMBRE.get(sinTildes(ambiguas[0])) : zonaPorNombre(n);
    if (zona) salida.push({ zona, texto: n, ...(ambiguas ? { ambigua: ambiguas } : {}) });
  }
  return salida;
}

/** Busca la zona conocida dentro del texto ("Condominio en Lindora, Santa Ana" → Lindora). */
function punto(zona: string | null | undefined): Punto | null {
  if (!zona) return null;
  const exacta = zonaPorNombre(clave(zona)) ?? zonaPorNombre(zona);
  if (exacta) return exacta.punto;
  const nivel = { barrio: 0, distrito: 1, canton: 2 };
  // La más específica que se nombra (un barrio antes que su cantón).
  const menciones = zonasEnTexto(zona).sort((a, b) => nivel[a.zona.nivel] - nivel[b.zona.nivel]);
  return menciones[0]?.zona.punto ?? null;
}

export function zonaConocida(zona: string | null | undefined): boolean {
  return punto(zona) !== null;
}

function km(a: Punto, b: Punto): number {
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(b[0] - a[0]);
  const dLng = rad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/**
 * Minutos de traslado entre dos zonas, redondeados a 5. null si alguna no se conoce.
 * Misma zona: 10 minutos (moverse dentro del cantón y estacionar).
 */
export function minutosEntre(a: string | null | undefined, b: string | null | undefined): number | null {
  const pa = punto(a);
  const pb = punto(b);
  if (!pa || !pb) return null;
  const distancia = km(pa, pb);
  // Los primeros 20 km son de ciudad con presas (unos 2,4 minutos por kilómetro en línea recta, más salir y
  // estacionar); lo que pasa de ahí es carretera (Ruta 27, Interamericana): ~1,05 minutos por kilómetro en
  // línea recta. Escazú → Jacó sale ~1 h 40; Escazú → Playas del Coco, ~3 h 50.
  const ciudad = Math.min(distancia, 20);
  const carretera = Math.max(0, distancia - 20);
  const minutos = distancia < 0.5 ? 10 : 8 + ciudad * 2.4 + carretera * 1.05;
  return Math.max(10, Math.round(minutos / 5) * 5);
}

/** Dos zonas están "cerca" si se llega en 20 minutos o menos. */
export function cerca(a: string | null | undefined, b: string | null | undefined): boolean {
  const m = minutosEntre(a, b);
  return m !== null && m <= 20;
}

/** Nombres de las zonas como se escriben, para elegirlas de una lista (mismo orden que el mapa). */
export const ZONAS_CONOCIDAS: string[] = ZONAS.map((zz) => zz.nombre);

/**
 * La zona escrita de muchas formas ("escazu", "ESCAZÚ ", "Guacima") queda con su nombre de la lista ("Escazú",
 * "La Guácima"). Si no está en la lista, queda como la escribieron, sin espacios de más.
 */
export function normalizarZona(zona: string): string {
  return zonaPorNombre(zona)?.nombre ?? zona.replace(/\s+/g, " ").trim();
}
