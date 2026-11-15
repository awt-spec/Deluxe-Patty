// Cifras de un texto, para comprobar que lo que escribió la IA no trae números que no están en la ficha de
// la casa (ni en el texto que le pasó el corredor). Cada cifra se lee por su VALOR, no por sus dígitos:
// "$1.250.000", "USD 1,250,000.00", "1 250 000", "$1,25 millones", "$1.25M" y "1250 mil" son la misma
// cifra (1250000); "3,5" y "3.5" son 3.5. Los teléfonos ("+506 8888 7777", "8888-7777", wa.me/506…) se leen
// enteros, y los códigos ("DP-07") como código, no como el número 7.
//
// Las cantidades en palabras de dinero o medida ("dos millones de dólares", "medio millón", "trescientos mil",
// "cinco habitaciones") también son cifras: se convierten a su valor y se validan igual; si no se pueden
// convertir con certeza, cuentan como cifra que no se puede verificar (y se rechazan).

type Tipo = "numero" | "telefono" | "codigo" | "palabras";
interface Cifra {
  tipo: Tipo;
  /** Valor canónico: "1250000", "3.5", "50688887777", "#DP-07"; "?…" si no se pudo leer. */
  valor: string;
}

const ESP = "\\u00A0\\u202F\\u2009 "; // espacio, espacio duro y espacios finos (miles en es-CR)
const CODIGO = /(?<![\p{L}\d])[A-Za-z]{2,8}-\d[A-Za-z0-9]*(?:-[A-Za-z0-9]+)*/gu;
// "+506 8888 7777", "+506-8888-7777": dígitos con espacios, puntos o guiones después del "+".
const TELEFONO_INTL = new RegExp(`\\+\\d[\\d${ESP}.-]{6,16}\\d`, "gu");
// "8888 7777", "8888-7777".
const TELEFONO_LOCAL = new RegExp(`(?<![\\d.,])\\d{4}[${ESP}-]\\d{4}(?!\\d)`, "gu");
// Cifra con miles (punto, coma o espacio) y decimales, o simple; con sufijo de cantidad opcional ("1.25M",
// "450 mil", "2 millones", "$450K", "1 millón y medio"). La "m" minúscula es de metros, nunca de millones.
const NUMERO = new RegExp(
  `(?<![\\p{L}\\d.,])(\\d{1,3}(?:[.,${ESP}]\\d{3})+(?:[.,]\\d+)?(?!\\d)|\\d+(?:[.,]\\d+)?)` +
    `(?:[${ESP}]?(millones|millón|millon|millions|million|thousand|mil|MM|M|k|K)(?![\\p{L}\\d²³])` +
    `([${ESP}]+(?:y|and[${ESP}]+a)[${ESP}]+(?:medio|half)(?!\\p{L}))?)?`,
  "gu",
);

const MULTIPLICADOR: Record<string, number> = {
  millones: 1e6, millón: 1e6, millon: 1e6, millions: 1e6, million: 1e6, MM: 1e6, M: 1e6,
  thousand: 1e3, mil: 1e3, k: 1e3, K: 1e3,
};

/** Valor canónico de un número: entero sin separadores o decimal con punto, sin ceros de más. */
function canon(n: number): string {
  return String(Math.round(n * 100) / 100);
}

/** "1.250.000,50" → 1250000.5; "1,250,000.00" → 1250000; "3,5" → 3.5; "1.250" → 1250; "1 250" → 1250. */
function leerNumero(crudo: string): number {
  const s = crudo.replace(/[\s   ]/g, "");
  const puntos = (s.match(/\./g) ?? []).length;
  const comas = (s.match(/,/g) ?? []).length;
  let limpio: string;
  if (puntos && comas) {
    const decimal = s.lastIndexOf(".") > s.lastIndexOf(",") ? "." : ",";
    const miles = decimal === "." ? "," : ".";
    limpio = s.split(miles).join("").replace(decimal, ".");
  } else if (puntos + comas === 0) {
    limpio = s;
  } else {
    const sep = puntos ? "." : ",";
    const veces = puntos || comas;
    const despues = s.length - s.lastIndexOf(sep) - 1;
    limpio = veces > 1 || despues === 3 ? s.split(sep).join("") : s.replace(sep, ".");
  }
  return Number(limpio);
}

// --- Cantidades en palabras --------------------------------------------------------------------------

const PALABRA: Record<string, number> = {
  cero: 0, un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9,
  diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciséis: 16, dieciseis: 16, diecisiete: 17,
  dieciocho: 18, diecinueve: 19, veinte: 20, veintiuno: 21, veintiún: 21, veintiun: 21, veintiuna: 21, veintidós: 22,
  veintidos: 22, veintitrés: 23, veintitres: 23, veinticuatro: 24, veinticinco: 25, veintiséis: 26, veintiseis: 26,
  veintisiete: 27, veintiocho: 28, veintinueve: 29, treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60,
  setenta: 70, ochenta: 80, noventa: 90, cien: 100, ciento: 100, doscientos: 200, doscientas: 200, trescientos: 300,
  trescientas: 300, cuatrocientos: 400, cuatrocientas: 400, quinientos: 500, quinientas: 500, seiscientos: 600,
  seiscientas: 600, setecientos: 700, setecientas: 700, ochocientos: 800, ochocientas: 800, novecientos: 900,
  novecientas: 900,
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
  thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};
const CIENTO_EN = new Set(["hundred"]);
const MIL = new Set(["mil", "thousand"]);
const MILLON = new Set(["millón", "millon", "millones", "million", "millions", "billón", "billon", "billones", "billion"]);
const MEDIO = new Set(["medio", "media", "half"]);
const CONECTOR = new Set(["y", "and", "a"]);
const ES_NUMERO = (p: string) => p in PALABRA || CIENTO_EN.has(p) || MIL.has(p) || MILLON.has(p) || MEDIO.has(p);

const UNIDAD_DINERO_MEDIDA =
  /^(dólares?|dolares?|usd|colones|colón|colon|crc|dollars?|bucks|metros?|mts?|m|hectáreas?|hectareas?|ha|km|kilómetros?|kilometros?|varas|pies|feet|ft|acres?|square|sq|meters?|metres?|hectares?|miles|millas?)$/;
const CONTEO =
  /^(habitaciones|cuartos|dormitorios|recámaras|recamaras|baños|banos|parqueos|estacionamientos|cocheras|plantas|pisos|niveles|minutos|bedrooms|bathrooms|baths|beds|rooms|parking|floors|levels|stories|minutes)$/;

/** Valor de una serie de palabras ("dos millones trescientos mil" → 2300000), o null si no cuadra. */
function valorPalabras(palabras: string[]): number | null {
  let total = 0;
  let actual = 0;
  let medio = false;
  let ultimoMult = 0;
  for (let i = 0; i < palabras.length; i++) {
    const p = palabras[i];
    if (CONECTOR.has(p)) continue;
    if (p in PALABRA) {
      actual += PALABRA[p];
    } else if (CIENTO_EN.has(p)) {
      actual = (actual || 1) * 100;
    } else if (MIL.has(p)) {
      actual = (medio ? 0.5 : actual || 1) * 1000;
      medio = false;
      ultimoMult = 1000;
    } else if (MILLON.has(p)) {
      const m = /^bill/.test(p) ? 1e12 : 1e6;
      total += (medio ? 0.5 : actual || 1) * m;
      actual = 0;
      medio = false;
      ultimoMult = m;
    } else if (MEDIO.has(p)) {
      // "medio millón" (antes) o "un millón y medio" (después).
      if (palabras[i - 1] && CONECTOR.has(palabras[i - 1]) && ultimoMult) total += ultimoMult / 2;
      else if (i === palabras.length - 1) return null;
      else medio = true;
    } else {
      return null;
    }
  }
  if (medio) return null;
  return total + actual;
}

function palabrasDe(texto: string): { palabra: string; inicio: number; fin: number }[] {
  return [...texto.matchAll(/\p{L}+/gu)].map((m) => ({ palabra: m[0].toLowerCase(), inicio: m.index!, fin: m.index! + m[0].length }));
}

/** Si la palabra puede unir dos partes de una cantidad: "y" ("treinta y cinco"), "and" o "a" ("half a million"). */
function une(conector: string, siguiente: string | undefined): boolean {
  if (!siguiente || !CONECTOR.has(conector)) return false;
  return conector === "a" ? MIL.has(siguiente) || MILLON.has(siguiente) || CIENTO_EN.has(siguiente) : ES_NUMERO(siguiente);
}

/** Cantidades escritas con palabras que son cifras (dinero, medidas o conteos de la casa). */
function cifrasEnPalabras(texto: string): Cifra[] {
  const ps = palabrasDe(texto);
  const res: Cifra[] = [];
  let i = 0;
  while (i < ps.length) {
    const sig = ps[i + 1]?.palabra;
    // "medio" solo empieza una cantidad delante de mil o millón ("medio millón", "half a million"); no en "baño y medio".
    const medioSuelto = MEDIO.has(ps[i].palabra) && !(sig && (MIL.has(sig) || MILLON.has(sig) || sig === "a"));
    if (!ES_NUMERO(ps[i].palabra) || medioSuelto) {
      i++;
      continue;
    }
    // La serie sigue mientras las palabras van pegadas (solo espacios o guiones entre ellas).
    let j = i;
    while (
      j + 1 < ps.length &&
      /^[\s -]*$/.test(texto.slice(ps[j].fin, ps[j + 1].inicio)) &&
      (ES_NUMERO(ps[j + 1].palabra) || une(ps[j + 1].palabra, ps[j + 2]?.palabra))
    ) {
      j++;
    }
    const serie = ps.slice(i, j + 1).map((p) => p.palabra);
    let k = j + 1;
    if (ps[k] && (ps[k].palabra === "de" || ps[k].palabra === "of")) k++;
    const siguiente = ps[k]?.palabra ?? "";
    const dineroOMedida = UNIDAD_DINERO_MEDIDA.test(siguiente);
    const conMillon = serie.some((p) => MILLON.has(p));
    const conMil = serie.some((p) => MIL.has(p));
    const soloUno = serie.length === 1 && PALABRA[serie[0]] === 1;
    const esCifra =
      dineroOMedida || conMillon || (conMil && serie.length > 1) || (!soloUno && !MIL.has(serie[0]) && CONTEO.test(siguiente)) || (conMil && CONTEO.test(siguiente));
    if (esCifra) {
      const v = valorPalabras(serie);
      res.push({ tipo: "palabras", valor: v === null ? `?${serie.join(" ")}` : canon(v) });
    }
    i = j + 1;
  }
  return res;
}

// --- Extracción -----------------------------------------------------------------------------------------

/** Cada cifra del texto, por su valor. */
function encontradas(texto: string): Cifra[] {
  const res: Cifra[] = [];
  let resto = texto;
  const tapar = (m: RegExpMatchArray) => {
    resto = resto.slice(0, m.index!) + " ".repeat(m[0].length) + resto.slice(m.index! + m[0].length);
  };
  for (const m of [...resto.matchAll(CODIGO)]) {
    res.push({ tipo: "codigo", valor: `#${m[0].toUpperCase()}` });
    tapar(m);
  }
  for (const re of [TELEFONO_INTL, TELEFONO_LOCAL]) {
    for (const m of [...resto.matchAll(re)]) {
      res.push({ tipo: "telefono", valor: m[0].replace(/\D/g, "") });
      tapar(m);
    }
  }
  // "USD450" o "CRC1.000": el código de moneda pegado no debe ocultar la cifra.
  resto = resto.replace(/(USD|CRC|US\$)(?=\d)/gi, (c) => " ".repeat(c.length));
  for (const m of [...resto.matchAll(NUMERO)]) {
    const base = leerNumero(m[1]);
    const mult = m[2] ? MULTIPLICADOR[m[2]] : 1;
    const valor = base * mult + (m[3] ? mult / 2 : 0);
    const digitos = m[1].replace(/\D/g, "");
    // Una serie larga de dígitos sin separadores es un teléfono (wa.me/50688887777).
    if (!m[2] && digitos.length >= 8 && /^\d+$/.test(m[1])) res.push({ tipo: "telefono", valor: digitos });
    else res.push({ tipo: "numero", valor: Number.isFinite(valor) ? canon(valor) : `?${m[0]}` });
    tapar(m);
  }
  res.push(...cifrasEnPalabras(resto));
  return res;
}

/** Valor canónico de una cifra suelta: "1.250.000" → "1250000"; "03" → "3"; "3,5" → "3.5". */
export function normalizarCifra(c: string): string {
  const [cifra] = encontradas(c);
  return cifra ? cifra.valor : c.replace(/[^\d]/g, "").replace(/^0+(?=\d)/, "");
}

/** Todas las cifras que se pueden usar: las de cada texto de referencia (un teléfono, además, sin su código de país). */
export function cifrasPermitidas(...textos: (string | null | undefined)[]): Set<string> {
  const s = new Set<string>();
  for (const t of textos) {
    if (!t) continue;
    for (const c of encontradas(t)) {
      if (c.valor.startsWith("?")) continue;
      s.add(c.valor);
      if (c.tipo === "telefono" && c.valor.length > 8) s.add(c.valor.slice(-8));
    }
  }
  return s;
}

function permitida(c: Cifra, permitidas: Set<string>): boolean {
  if (c.valor.startsWith("?")) return false;
  if (permitidas.has(c.valor)) return true;
  // Un teléfono con o sin el código de país.
  return c.tipo === "telefono" && c.valor.length > 8 && permitidas.has(c.valor.slice(-8));
}

/** Las cifras del texto que no salen de las permitidas (vacío si todo cuadra). */
export function cifrasInventadas(texto: string, permitidas: Set<string>): string[] {
  return encontradas(texto)
    .filter((c) => !permitida(c, permitidas))
    .map((c) => c.valor);
}

/** Si el texto trae esa cifra (por ejemplo el precio 1250000 escrito "$1.250.000", o el teléfono del corredor). */
export function traeCifra(texto: string, cifra: number | string): boolean {
  const buscadas = cifrasPermitidas(typeof cifra === "number" ? canon(cifra) : cifra);
  if (buscadas.size === 0) return false;
  return encontradas(texto).some((c) => permitida(c, buscadas));
}

/**
 * Las permitidas más las cifras que escribió el propio corredor en su pedido («agrégale que tiene 2 parqueos»):
 * son su palabra, no un invento del modelo, así que se aceptan esas mismas cifras y ninguna otra.
 */
export function conCifrasDichas(permitidas: Set<string>, dichoPorCorredor: string | null | undefined): Set<string> {
  const s = new Set(permitidas);
  cifrasPermitidas(dichoPorCorredor).forEach((c) => s.add(c));
  return s;
}
