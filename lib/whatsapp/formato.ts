// Formato de WhatsApp para los textos que escribe el modelo (y los avisos que arma el código).
//
// WhatsApp no lee markdown: `**negrita**`, `# Título`, tablas o `[texto](url)` llegan con los símbolos a la vista.
// `ordenarParaWhatsApp` los pasa a la sintaxis de WhatsApp (*negrita*, • viñetas) justo antes de enviar. Es pura,
// idempotente y nunca toca cifras, precios, fechas ni direcciones web: solo mueve símbolos de formato y espacios.

const INICIO_MARCA = "";
const FIN_MARCA = "";
// Las direcciones web se apartan antes de tocar el formato (pueden traer `_`, `*` o `__`) y vuelven intactas al final.
const URL = /\bhttps?:\/\/[^\s<>"'`]+/g;
const ENLACE_MD = /!?\[([^\]\n]*)\]\(\s*<?(https?:\/\/[^\s)>]+)>?(?:\s+"[^"\n]*")?\s*\)/g;
const AUTOENLACE = /<(https?:\/\/[^\s>]+)>/g;
const VIÑETA_MD = /^(\s*)[-*+]\s+(.*)$/;
const VIÑETA_YA = /^(\s*)[•◦]\s*(.*)$/;
const NUMERADA = /^(\s*)(\d{1,3})([.)])\s+(.*)$/;
const ENCABEZADO = /^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$/;
const REGLA = /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/;
const CERCO = /^\s*(```|~~~)/;

/** Pasa el texto de un modelo a la forma de WhatsApp. Pura e idempotente: `f(f(x)) === f(x)`. */
export function ordenarParaWhatsApp(texto: string): string {
  if (!texto) return "";
  let t = texto.replace(/\r\n?/g, "\n").replace(/ /g, " ");
  t = t.replace(/<br\s*\/?>/gi, "\n");
  t = sinCercos(t);
  t = t.replace(ENLACE_MD, (_, etiqueta: string, url: string, pos: number, todo: string) => {
    const e = limpiarEtiqueta(etiqueta);
    if (!e || etiqueta.trim() === url || e === url || URL.test(etiqueta)) return url;
    // "Véala aquí: [Encuentra24](url)" → "Véala aquí: Encuentra24 url" (sin dos ":" seguidos).
    const antes = todo.slice(Math.max(0, todo.lastIndexOf("\n", pos - 1) + 1), pos);
    return /[:：]$/.test(e) || /[:：]\s*$/.test(antes) ? `${e} ${url}` : `${e}: ${url}`;
  });
  t = t.replace(AUTOENLACE, "$1");

  const urls: string[] = [];
  t = t.replace(URL, (u) => {
    urls.push(u);
    return `${INICIO_MARCA}${urls.length - 1}${FIN_MARCA}`;
  });

  t = t.replace(/`([^`\n]+)`/g, "$1");
  t = tablas(t);
  t = t
    .split("\n")
    .map(linea)
    .filter((l): l is string => l !== null)
    .join("\n");

  t = t.replace(new RegExp(`${INICIO_MARCA}(\\d+)${FIN_MARCA}`, "g"), (_, i: string) => urls[Number(i)] ?? "");
  return t
    .split("\n")
    .map((l) => l.replace(/[ \t]+$/, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Bloques de código: se quitan las cercas (``` o ~~~) y queda el contenido. */
function sinCercos(t: string): string {
  return t
    .split("\n")
    .filter((l) => !CERCO.test(l))
    .join("\n");
}

function limpiarEtiqueta(e: string): string {
  return e.replace(/[*_~`]+/g, "").trim();
}

/** Una línea: encabezados, viñetas, numeradas, reglas y negritas. null = la línea se quita. */
function linea(l: string): string | null {
  if (REGLA.test(l)) return "";
  if (/^\s*[-*+•◦]\s*$/.test(l)) return null; // viñeta huérfana
  const enc = ENCABEZADO.exec(l);
  if (enc) {
    const titulo = enc[1].replace(/\*+|__+/g, "").trim();
    return titulo ? `*${titulo}*` : "";
  }
  const md = VIÑETA_MD.exec(l);
  if (md && !/^\*\S/.test(l.trimStart())) {
    const contenido = enLinea(md[2]).trim();
    if (!contenido) return null; // viñeta huérfana
    return `${md[1].length >= 2 ? "  ◦" : "•"} ${contenido}`;
  }
  const ya = VIÑETA_YA.exec(l);
  if (ya) {
    const contenido = enLinea(ya[2]).trim();
    if (!contenido) return null;
    return `${ya[1].length >= 2 || l.trimStart().startsWith("◦") ? "  ◦" : "•"} ${contenido}`;
  }
  const num = NUMERADA.exec(l);
  if (num) {
    const contenido = enLinea(num[4]).trim();
    if (!contenido) return null;
    return `${num[1]}${num[2]}${num[3]} ${contenido}`;
  }
  if (/^\s*\d{1,3}[.)]\s*$/.test(l)) return null; // número de lista sin nada
  return enLinea(l);
}

/** Negritas y tachados de markdown a WhatsApp, dentro de una línea. */
function enLinea(l: string): string {
  return (
    l
      // ***x*** y **x** → *x* (sin espacios pegados a los asteriscos, que WhatsApp no toma como negrita)
      .replace(/\*{2,3}([^*\n]+?)\*{2,3}/g, (_, x: string) => (x.trim() ? `*${x.trim()}*` : ""))
      .replace(/(^|[^\w])__([^_\n]+?)__(?=[^\w]|$)/g, (_, a: string, x: string) => (x.trim() ? `${a}*${x.trim()}*` : a))
      .replace(/~~([^~\n]+?)~~/g, (_, x: string) => `~${x.trim()}~`)
  );
}

function celdas(l: string): string[] {
  return l
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

const SEPARADOR_TABLA = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

/**
 * Tablas de markdown → líneas "• columna: valor". Con dos columnas, cada fila es "• dato: valor"; con más, la
 * primera celda va en negrita y el resto como viñetas. Solo se toma como tabla lo que trae la fila separadora (|---|).
 */
function tablas(t: string): string {
  const lineas = t.split("\n");
  const salida: string[] = [];
  for (let i = 0; i < lineas.length; i++) {
    const cabecera = lineas[i];
    if (!cabecera.includes("|") || i + 1 >= lineas.length || !SEPARADOR_TABLA.test(lineas[i + 1]) || !lineas[i + 1].includes("|")) {
      salida.push(cabecera);
      continue;
    }
    const columnas = celdas(cabecera).map(limpiarEtiqueta);
    const filas: string[][] = [];
    let j = i + 2;
    while (j < lineas.length && lineas[j].includes("|") && lineas[j].trim()) {
      filas.push(celdas(lineas[j]));
      j++;
    }
    const bloque: string[] = [];
    for (const fila of filas) {
      if (fila.every((c) => !c)) continue;
      if (columnas.length <= 2) {
        const [a, b] = fila;
        bloque.push(b ? `• ${a ? `${a}: ` : ""}${b}` : `• ${a}`);
      } else {
        const [primera, ...resto] = fila;
        const partes = resto
          .map((v, k) => (v ? `• ${columnas[k + 1] ? `${columnas[k + 1]}: ` : ""}${v}` : null))
          .filter((x): x is string => x !== null);
        bloque.push([primera ? `*${limpiarEtiqueta(primera)}*` : null, ...partes].filter(Boolean).join("\n"));
      }
    }
    if (bloque.length) {
      // Las de varias columnas son fichas (título y viñetas): van separadas del texto de arriba.
      if (columnas.length > 2 && salida.length && salida[salida.length - 1].trim()) salida.push("");
      salida.push(columnas.length <= 2 ? bloque.join("\n") : bloque.join("\n\n"));
      salida.push("");
    }
    i = j - 1;
  }
  return salida.join("\n");
}

/** Partes de un aviso al corredor; todas menos el título son opcionales. */
export interface PartesAviso {
  /** Qué pasó, en una línea: va en negrita. */
  titulo: string;
  porQue?: string | null;
  /** Lo que dijo el cliente (o lo que se le iba a decir): va entre comillas, en una sola línea. */
  mensaje?: string | null;
  queHacer?: string | null;
  /** Teléfono del cliente, en su propia línea. */
  telefono?: string | null;
  /** Líneas extra (ya armadas por el código), antes de "Qué hacer". */
  detalles?: (string | null | undefined | false)[];
}

const MAX_MENSAJE_AVISO = 200;

/** Lo que dijo el cliente, en una línea y cortado: va citado en los avisos. */
export function citaCorta(texto: string, max = MAX_MENSAJE_AVISO): string {
  const plano = texto.replace(/\s+/g, " ").trim();
  return plano.length > max ? `${plano.slice(0, max - 1).trimEnd()}…` : plano;
}

/**
 * Aviso al corredor con la misma forma siempre: primera línea en negrita con lo que pasó, y debajo "Por qué:",
 * "Mensaje:", "Qué hacer:" y el teléfono en su propia línea. Para la plantilla (ventana cerrada) se aplana con
 * `limpiarParametro`, que une las líneas con " · ".
 */
export function armarAviso(p: PartesAviso): string {
  const sinPunto = (s: string) => s.trim().replace(/[.。]+$/, "");
  const lineas = [
    `*${sinPunto(p.titulo).replace(/\*/g, "")}*`,
    p.porQue ? `Por qué: ${conPuntoFinal(p.porQue)}` : null,
    ...(p.detalles ?? []).filter((d): d is string => typeof d === "string" && d.trim() !== ""),
    p.mensaje ? `Mensaje: "${citaCorta(p.mensaje)}"` : null,
    p.queHacer ? `Qué hacer: ${conPuntoFinal(p.queHacer)}` : null,
    p.telefono ? `Teléfono: ${p.telefono}` : null,
  ];
  return lineas.filter((l): l is string => l !== null).join("\n");
}

function conPuntoFinal(s: string): string {
  const t0 = s.trim();
  const t = t0.charAt(0).toUpperCase() + t0.slice(1);
  return /[.!?…:)"»]$/.test(t) ? t : `${t}.`;
}
