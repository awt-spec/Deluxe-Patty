// Tiempo de traslado aproximado entre zonas del Valle Central, para que la asistente no agende dos
// visitas seguidas que no dan tiempo de llegar y para que junte las visitas cercanas el mismo día.
// Es una estimación con la distancia en línea recta y una velocidad de ciudad con presas; no consulta
// mapas en vivo. Una zona que no está en la lista no se adivina: se usa el margen fijo del corredor.

type Punto = [lat: number, lng: number];

const ZONAS: Record<string, Punto> = {
  lindora: [9.951, -84.196],
  "santa ana": [9.932, -84.183],
  pozos: [9.948, -84.19],
  piedades: [9.935, -84.215],
  "rio oro": [9.915, -84.205],
  "ciudad colon": [9.914, -84.243],
  brasil: [9.925, -84.226],
  "la guacima": [9.968, -84.242],
  escazu: [9.919, -84.139],
  "san rafael de escazu": [9.932, -84.137],
  guachipelin: [9.938, -84.158],
  "bello horizonte": [9.924, -84.152],
  "san antonio de escazu": [9.898, -84.137],
  rohrmoser: [9.94, -84.11],
  pavas: [9.952, -84.124],
  sabana: [9.936, -84.098],
  "san jose": [9.933, -84.08],
  "los yoses": [9.932, -84.058],
  "barrio escalante": [9.936, -84.065],
  curridabat: [9.913, -84.035],
  "san pedro": [9.935, -84.05],
  "tres rios": [9.906, -83.987],
  moravia: [9.961, -84.048],
  "santo domingo": [9.98, -84.09],
  heredia: [9.998, -84.117],
  "santa barbara": [10.035, -84.157],
  belen: [9.98, -84.18],
  "la ribera": [9.983, -84.169],
  "san antonio de belen": [9.977, -84.185],
  cariari: [9.976, -84.153],
  "la asuncion": [9.986, -84.168],
  alajuela: [10.016, -84.214],
  "el coyol": [10.003, -84.258],
  atenas: [9.979, -84.38],
  "grecia": [10.073, -84.312],
  "san ramon": [10.088, -84.47],
  "puriscal": [9.846, -84.315],
  "desamparados": [9.897, -84.064],
  "coronado": [9.977, -84.008],
  "cartago": [9.864, -83.919],
};

/** "Santa Ana, San José" → "santa ana": minúsculas, sin tildes ni provincia. */
function clave(zona: string): string {
  return zona
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(",")[0]
    .replace(/\s+/g, " ")
    .trim();
}

/** Busca la zona conocida dentro del texto ("Condominio en Lindora, Santa Ana" → lindora). */
function punto(zona: string | null | undefined): Punto | null {
  if (!zona) return null;
  const k = clave(zona);
  if (ZONAS[k]) return ZONAS[k];
  // La más larga primero, para que "san rafael de escazu" gane sobre "escazu".
  const nombres = Object.keys(ZONAS).sort((a, b) => b.length - a.length);
  const texto = zona.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const encontrada = nombres.find((n) => texto.includes(n));
  return encontrada ? ZONAS[encontrada] : null;
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
  // Ciudad con presas: unos 2,4 minutos por kilómetro en línea recta, más salir y estacionar.
  const minutos = distancia < 0.5 ? 10 : 8 + distancia * 2.4;
  return Math.max(10, Math.round(minutos / 5) * 5);
}

/** Dos zonas están "cerca" si se llega en 20 minutos o menos. */
export function cerca(a: string | null | undefined, b: string | null | undefined): boolean {
  const m = minutosEntre(a, b);
  return m !== null && m <= 20;
}

/** Nombres de las zonas como se escriben, para elegirlas de una lista (mismo orden que el mapa). */
export const ZONAS_CONOCIDAS = [
  "Lindora", "Santa Ana", "Pozos", "Piedades", "Río Oro", "Ciudad Colón", "Brasil de Mora", "La Guácima",
  "Escazú", "San Rafael de Escazú", "Guachipelín", "Bello Horizonte", "San Antonio de Escazú", "Rohrmoser",
  "Pavas", "Sabana", "San José", "Los Yoses", "Barrio Escalante", "Curridabat", "San Pedro", "Tres Ríos",
  "Moravia", "Santo Domingo", "Heredia", "Santa Bárbara", "Belén", "La Ribera", "San Antonio de Belén",
  "Cariari", "La Asunción", "Alajuela", "El Coyol", "Atenas", "Grecia", "San Ramón", "Puriscal",
  "Desamparados", "Coronado", "Cartago",
];

/**
 * La zona escrita de muchas formas ("escazu", "ESCAZÚ ") queda con su nombre de la lista ("Escazú").
 * Si no está en la lista, queda como la escribieron, sin espacios de más.
 */
export function normalizarZona(zona: string): string {
  const sinTildes = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
  const buscada = sinTildes(zona);
  return ZONAS_CONOCIDAS.find((z) => sinTildes(z) === buscada) ?? zona.replace(/\s+/g, " ").trim();
}
