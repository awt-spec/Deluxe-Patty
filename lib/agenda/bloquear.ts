import { aUtc, fechaLocal, sumarDias, type FechaLocal } from "./tiempo";

// "Apartar mañana en la tarde", "aparta tiempo el viernes de 2 a 4", "bloquear hoy todo el día":
// el corredor le pide a la asistente (por WhatsApp o en el chat del panel) que aparte un rato de su
// agenda. En el panel se llama "Apartar tiempo"; "bloquear" se sigue entendiendo igual. Lo entiende el
// código, no el modelo: las fechas siempre salen de aquí.

export type Parte = "manana" | "tarde" | "noche" | "todo";

export const PARTES: Record<Parte, { nombre: string; desde: number; hasta: number }> = {
  manana: { nombre: "en la mañana", desde: 7 * 60, hasta: 12 * 60 },
  tarde: { nombre: "en la tarde", desde: 12 * 60, hasta: 18 * 60 },
  noche: { nombre: "en la noche", desde: 18 * 60, hasta: 22 * 60 },
  todo: { nombre: "todo el día", desde: 0, hasta: 24 * 60 },
};

const DIAS = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];

const sinTildes = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export interface PedidoBloqueo {
  inicio: Date;
  fin: Date;
  /** "jueves 12 de noviembre en la tarde" (para confirmarle al corredor). */
  dia: FechaLocal;
  /** Último día, si son varios ("del 20 al 25"). */
  hastaDia?: FechaLocal;
  parte: Parte | null;
  horas: { desde: number; hasta: number } | null;
  motivo: string | null;
}

/** Lo que puede seguir a "apartar" cuando es de la agenda (y no "aparta la casa para Juan"). */
const RATO_APARTAR =
  "(?:tiempo|un rato|el rato|rato|hoy|manana|pasado|el \\d+|del? \\d+|desde|de las|a las|en la|la manana|la tarde|la noche|todo|este|esta|el (?:lunes|martes|miercoles|jueves|viernes|sabado|domingo)|lunes|martes|miercoles|jueves|viernes|sabado|domingo)\\b";

/**
 * ¿El mensaje pide apartar tiempo de la agenda? Empieza con "apartar", "aparta", "apártame" (seguido de un día o
 * un rato: "aparta la casa" no es de la agenda) o, como antes, "bloquea", "bloquear", "bloquéame"…
 * "Bloquea a Juan" o "bloquea al cliente" no son de la agenda.
 */
export function pideBloqueo(texto: string): boolean {
  const t = sinTildes(texto);
  if (new RegExp(`^\\s*apart(?:a|ar|ame|en)\\s+(?:(?:tiempo|un rato)\\s+)?${RATO_APARTAR}`, "i").test(t)) return true;
  return /^\s*bloque(a|ar|ame|en)\b/i.test(t) && !/^\s*bloque\w*\s+(?:a|al)\s+(?!las?\b)/i.test(t);
}

const MESES_SIN = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** El próximo día N (del mes M si lo dice), desde hoy. */
function proximoDia(hoy: FechaLocal, n: number, mes?: number): FechaLocal | null {
  for (let i = 0; i < 400; i++) {
    const d = sumarDias(hoy, i);
    if (d.dia === n && (mes === undefined || d.mes === mes)) return d;
    if (mes === undefined && i > 62) return null;
  }
  return null;
}

/** Hora escrita ("2", "2:30", "14", "9am", "3 pm") a minutos; sin a. m./p. m., de 1 a 6 se toma de la tarde. */
function hora(h: string, m: string | undefined, sufijo: string | undefined): number | null {
  let n = Number(h);
  if (!Number.isInteger(n) || n > 23) return null;
  const s = (sufijo ?? "").replace(/\./g, "").trim();
  if (s.startsWith("p") && n < 12) n += 12;
  else if (s.startsWith("a") && n === 12) n = 0;
  else if (!s && n >= 1 && n <= 6) n += 12;
  const min = m ? Number(m) : 0;
  return min >= 0 && min < 60 ? n * 60 + min : null;
}

/**
 * Entiende el pedido. Día: hoy, mañana, pasado mañana, un día de la semana (el próximo) o "el 15".
 * Rato: en la mañana, en la tarde, en la noche, todo el día (si no dice nada) o "de 2 a 4".
 * Lo que va después de "por" o "porque" queda como motivo. null si no se entiende el día.
 */
export function entenderBloqueo(texto: string, ahora: Date, zona: string): PedidoBloqueo | null {
  // "por la tarde" es un rato, no un motivo; "para mañana" es un día.
  const original = texto
    .normalize("NFC")
    .replace(/\bpor la (ma[nñ]ana|tarde|noche)\b/gi, "en la $1")
    .replace(/\bpara (?=(?:hoy|ma[nñ]ana|pasado|el|este|lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\b)/gi, "");
  const t = sinTildes(original).replace(/^\s*(?:bloque\w*|apart(?:a|ar|ame|en))\s*(?:(?:un\s+)?(?:rato|tiempo)\b\s*)?/, " ");
  const motivoCrudo = /\b(?:por|porque|para)\s+(.+)$/.exec(original)?.[1];
  const sinMotivo = t.replace(/\b(?:por|porque|para)\s+.+$/, " ");
  const hoy = fechaLocal(ahora, zona);

  let dia: FechaLocal | null = null;
  let hastaDia: FechaLocal | undefined;
  let resto = ` ${sinMotivo} `;
  const mesDe = (txt: string | undefined) => (txt ? MESES_SIN.indexOf(txt) + 1 || undefined : undefined);
  const MES = `(?:\\s+de\\s+(${MESES_SIN.join("|")}))?`;
  const varios = new RegExp(`\\b(?:del?|desde el)\\s+(\\d{1,2})${MES}\\s+(?:al|hasta el)\\s+(\\d{1,2})${MES}`).exec(resto);
  const conMes = new RegExp(`\\bel\\s+(\\d{1,2})${MES}\\b`).exec(resto);
  if (varios) {
    const mesFin = mesDe(varios[4]);
    const a = proximoDia(hoy, Number(varios[1]), mesDe(varios[2]) ?? mesFin);
    const b = a ? proximoDia(a, Number(varios[3]), mesFin) : null;
    if (a && b) {
      dia = a;
      hastaDia = b;
      resto = resto.replace(varios[0], " ");
    }
  } else if (/\bpasado manana\b/.test(resto)) {
    dia = sumarDias(hoy, 2);
    resto = resto.replace(/\bpasado manana\b/, " ");
  } else if (/\bhoy\b/.test(resto)) {
    dia = hoy;
    resto = resto.replace(/\bhoy\b/, " ");
  } else if (/^\s*manana\b/.test(resto) || /\b(?:el|para) manana\b/.test(resto) || /\bmanana (?:en|por|de|todo)\b/.test(resto)) {
    dia = sumarDias(hoy, 1);
    resto = resto.replace(/\bmanana\b/, " ");
  } else {
    const nombre = DIAS.findIndex((d) => new RegExp(`\\b${d}\\b`).test(resto));
    if (nombre >= 0) {
      const faltan = (nombre - hoy.diaSemana + 7) % 7 || 7;
      dia = sumarDias(hoy, faltan);
      resto = resto.replace(new RegExp(`\\b${DIAS[nombre]}\\b`), " ");
    } else {
      if (conMes) {
        dia = proximoDia(hoy, Number(conMes[1]), mesDe(conMes[2]));
        resto = resto.replace(conMes[0], " ");
      }
    }
  }

  let parte: Parte | null = null;
  let horas: { desde: number; hasta: number } | null = null;
  const rango = /\b(?:de|desde)\s+(?:las\s+)?(\d{1,2})(?::(\d{2}))?\s*(a\.?\s?m\.?|p\.?\s?m\.?|am|pm)?\s*(?:a|hasta)\s+(?:las\s+)?(\d{1,2})(?::(\d{2}))?\s*(a\.?\s?m\.?|p\.?\s?m\.?|am|pm)?/.exec(resto);
  if (rango) {
    const desde = hora(rango[1], rango[2], rango[3]);
    let hasta = hora(rango[4], rango[5], rango[6] ?? rango[3]);
    // "de 5 a 7" o "de 6 a 8": la segunda hora también es de la tarde.
    if (desde !== null && hasta !== null && hasta <= desde && !rango[6] && hasta < 12 * 60) hasta += 12 * 60;
    if (desde === null || hasta === null || hasta <= desde || hasta > 24 * 60) return null; // horas que no cuadran: mejor preguntar
    horas = { desde, hasta };
  } else {
    // "a las 3": una hora.
    const una = /\ba las\s+(\d{1,2})(?::(\d{2}))?\s*(a\.?\s?m\.?|p\.?\s?m\.?|am|pm)?/.exec(resto);
    if (una) {
      const desde = hora(una[1], una[2], una[3]);
      if (desde === null) return null;
      horas = { desde, hasta: Math.min(desde + 60, 24 * 60) };
    }
  }
  // Sin día pero con un rato ("apartar de 2 a 4", "bloquear en la tarde"): es hoy.
  if (!dia && (horas || /\b(?:manana|tarde|noche)\b/.test(resto))) dia = hoy;
  if (!dia) return null;
  if (hastaDia) horas = null;
  if (!horas) {
    if (/\btodo el dia\b/.test(resto)) parte = "todo";
    else if (/\b(?:en|por|de) la manana\b|\bmanana\b/.test(resto)) parte = "manana";
    else if (/\btarde\b/.test(resto)) parte = "tarde";
    else if (/\bnoche\b/.test(resto)) parte = "noche";
    else parte = "todo";
  }
  const rato = horas ?? PARTES[hastaDia ? "todo" : parte!];
  return {
    inicio: aUtc(dia, rato.desde, zona),
    fin: aUtc(hastaDia ?? dia, rato.hasta, zona),
    dia,
    ...(hastaDia ? { hastaDia, parte: "todo" as Parte } : {}),
    parte,
    horas,
    motivo: motivoCrudo ? motivoCrudo.trim().slice(0, 120) : null,
  };
}

/** "14:30" o "2:30 p. m." para confirmar. */
function hhmm(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h < 12 ? "a. m." : "p. m."}`;
}

/** "el jueves 12 de noviembre en la tarde" / "… de 2 p. m. a 4 p. m." */
export function describirBloqueo(p: Pick<PedidoBloqueo, "dia" | "parte" | "horas" | "hastaDia">): string {
  const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const DIA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  const fecha = `el ${DIA[p.dia.diaSemana]} ${p.dia.dia} de ${MESES[p.dia.mes - 1]}`;
  if (p.hastaDia) {
    const fin = `${DIA[p.hastaDia.diaSemana]} ${p.hastaDia.dia} de ${MESES[p.hastaDia.mes - 1]}`;
    return `del ${DIA[p.dia.diaSemana]} ${p.dia.dia}${p.dia.mes !== p.hastaDia.mes ? ` de ${MESES[p.dia.mes - 1]}` : ""} al ${fin}, días enteros`;
  }
  return p.horas ? `${fecha}, de ${hhmm(p.horas.desde)} a ${hhmm(p.horas.hasta)}` : `${fecha} ${PARTES[p.parte ?? "todo"].nombre}`;
}

export const AYUDA_BLOQUEO =
  "Para apartar tiempo escríbeme, por ejemplo: «apartar mañana en la tarde», «apartar el viernes de 2 a 4» o «apartar hoy todo el día por una cita médica».";
