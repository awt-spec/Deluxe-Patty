import { entenderBloqueo, PARTES, type Parte, type PedidoBloqueo } from "./bloquear";
import { aUtc, fechaIso, fechaLocal, minutosLocales, sumarDias, type FechaLocal } from "./tiempo";

// "Apartar tiempo" con IA: el corredor lo dice con sus palabras ("el martes tengo dentista de 2 a 4 y el viernes no
// trabajo") y el modelo devuelve operaciones (solo fechas ISO y horas HH:MM). Aquí, en código y sin efectos, se
// validan, se expanden las repeticiones a días concretos y se arman los textos que ve el corredor: el modelo nunca
// escribe una fecha que se muestre. También vive aquí la regla que decide si un mensaje es de la agenda propia y si
// el intérprete de código lo entendió entero (entonces no hace falta el modelo).

export type Rato = Parte | "horas";
export const RATOS_IA: Rato[] = ["todo", "manana", "tarde", "noche", "horas"];

/** Lo que devuelve el modelo (o el intérprete de la demo), sin revisar. */
export interface OperacionApartarCruda {
  tipo: "apartar" | "quitar" | "duda";
  desde?: string | null;
  hasta?: string | null;
  rato?: Rato | null;
  hora_inicio?: string | null;
  hora_fin?: string | null;
  repetir?: { dias_semana: number[]; hasta: string } | null;
  motivo?: string | null;
  pregunta?: string | null;
  opciones?: string[] | null;
}

/** Un rato concreto ya revisado (un día, o varios días enteros seguidos). */
export interface Apartado {
  clave: string;
  desde: string;
  hasta: string;
  rato: Rato;
  hora_inicio: string | null;
  hora_fin: string | null;
  motivo: string | null;
  /** Instantes UTC en ISO. */
  inicio: string;
  fin: string;
  /** "Martes 17 de noviembre · 2:00 a 4:00 p. m. · Dentista" (armado aquí). */
  texto: string;
}

export interface RangoQuitar {
  desde: string;
  hasta: string;
  inicio: string;
  fin: string;
  texto: string;
}

export interface Duda {
  pregunta: string;
  opciones: string[];
}

export interface Revisado {
  apartados: Apartado[];
  quitar: RangoQuitar[];
  dudas: Duda[];
  /** Lo que se descartó y por qué, para decírselo al corredor. */
  notas: string[];
}

export const MAX_PEDIDO_APARTAR = 500;
export const DIAS_ADELANTE = 60;
export const DIAS_REPETIR = 90;
export const MAX_APARTADOS = 40;

const DIA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const DIA_SIN = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];
const MES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

const sinTildes = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
/** Texto de afuera que se muestra: sin etiquetas, sin saltos ni caracteres de control, recortado. */
export const textoLimpio = (t: unknown, max: number) =>
  String(t ?? "")
    .replace(/[<>]/g, "")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

/** "2026-11-17" → fecha real (o null si no existe, como el 31 de noviembre). */
export function fechaDeIso(s: unknown): FechaLocal | null {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [a, m, d] = s.split("-").map(Number);
  const f = new Date(Date.UTC(a, m - 1, d));
  if (f.getUTCFullYear() !== a || f.getUTCMonth() !== m - 1 || f.getUTCDate() !== d) return null;
  return { anio: a, mes: m, dia: d, diaSemana: f.getUTCDay() };
}

const diasEntre = (a: FechaLocal, b: FechaLocal) => Math.round((Date.UTC(b.anio, b.mes - 1, b.dia) - Date.UTC(a.anio, a.mes - 1, a.dia)) / 86_400_000);

/** "14:30" → minutos, solo en pasos de 15 minutos. */
function minutosHora(s: unknown): number | null {
  if (typeof s !== "string" || !/^\d{2}:\d{2}$/.test(s)) return null;
  const [h, m] = s.split(":").map(Number);
  if (h > 23 || m > 59 || m % 15 !== 0) return null;
  return h * 60 + m;
}

const hhmmIso = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/** "martes 17 de noviembre" */
export const fechaTexto = (f: FechaLocal) => `${DIA[f.diaSemana]} ${f.dia} de ${MES[f.mes - 1]}`;

const sufijo = (min: number) => (min < 12 * 60 ? "a. m." : "p. m.");
const reloj = (min: number) => {
  const h = Math.floor(min / 60) % 24;
  return `${h % 12 === 0 ? 12 : h % 12}:${String(min % 60).padStart(2, "0")}`;
};

/** "2:00 a 4:00 p. m." o "11:00 a. m. a 1:00 p. m." */
export function rangoHorasTexto(desde: number, hasta: number): string {
  return sufijo(desde) === sufijo(hasta)
    ? `${reloj(desde)} a ${reloj(hasta)} ${sufijo(hasta)}`
    : `${reloj(desde)} ${sufijo(desde)} a ${reloj(hasta)} ${sufijo(hasta)}`;
}

const RATO_TEXTO: Record<Parte, string> = {
  todo: "Todo el día",
  manana: "En la mañana (7 a 12)",
  tarde: "En la tarde (12 a 6)",
  noche: "En la noche (6 a 10)",
};

function textoApartado(desde: FechaLocal, hasta: FechaLocal, rato: Rato, horas: [number, number] | null, motivo: string | null): string {
  const partes =
    diasEntre(desde, hasta) > 0
      ? [`Del ${fechaTexto(desde)} al ${fechaTexto(hasta)}`, "Días enteros"]
      : [cap(fechaTexto(desde)), horas ? rangoHorasTexto(horas[0], horas[1]) : RATO_TEXTO[rato as Parte]];
  return [...partes, motivo].filter(Boolean).join(" · ");
}

/** Arma un apartado concreto (un día, o días enteros seguidos) con sus instantes y su texto. */
function armar(desde: FechaLocal, hasta: FechaLocal, rato: Rato, horas: [number, number] | null, motivo: string | null, zona: string): Apartado {
  const enteros = rato === "todo" || diasEntre(desde, hasta) > 0;
  const tramo = horas ?? [PARTES[(rato === "horas" ? "todo" : rato) as Parte].desde, PARTES[(rato === "horas" ? "todo" : rato) as Parte].hasta];
  const inicio = aUtc(desde, enteros ? 0 : tramo[0], zona);
  const fin = aUtc(enteros ? sumarDias(hasta, 1) : hasta, enteros ? 0 : tramo[1], zona);
  const r: Rato = enteros ? "todo" : rato;
  return {
    clave: `${fechaIso(desde)}|${fechaIso(hasta)}|${r}|${horas ? `${hhmmIso(horas[0])}-${hhmmIso(horas[1])}` : ""}`,
    desde: fechaIso(desde),
    hasta: fechaIso(hasta),
    rato: r,
    hora_inicio: !enteros && horas ? hhmmIso(horas[0]) : null,
    hora_fin: !enteros && horas ? hhmmIso(horas[1]) : null,
    motivo,
    inicio: inicio.toISOString(),
    fin: fin.toISOString(),
    texto: textoApartado(desde, hasta, r, enteros ? null : horas, motivo),
  };
}

/** Días de la semana que nombró el corredor, si los únicos días que dijo son esos (para revisar al modelo). */
function diasNombrados(texto: string): Set<number> | null {
  const t = ` ${sinTildes(texto)} `;
  const otros =
    /\b(?:hoy|pasado|semana|mes|quincena|dias?\s+\d|el\s+\d{1,2}\b|(?:lunes|martes|miercoles|jueves|viernes|sabado|domingo)\s+\d{1,2}\b|del?\s+\d{1,2}\s+(?:al|de|hasta)\b|\d{1,2}\s+de\s+(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre))/.test(t) ||
    /(?<!la |por la |en la |de la )\bmanana\b/.test(t);
  if (otros) return null;
  const dias = new Set<number>();
  DIA_SIN.forEach((d, i) => new RegExp(`\\b${d}s?\\b`).test(t) && dias.add(i));
  return dias.size ? dias : null;
}

/** El próximo día de la semana `ds` desde `hoy` (hoy incluido). */
const proximo = (hoy: FechaLocal, ds: number) => sumarDias(hoy, (ds - hoy.diaSemana + 7) % 7);

/**
 * Revisa lo que devolvió el modelo: fechas reales y no pasadas, hasta 60 días adelante (90 si es una repetición
 * explícita), horas en pasos de 15 minutos con el inicio antes del fin, horas de madrugada como duda, repeticiones
 * expandidas a días concretos, hasta 40 apartados por pedido, y un día de la semana que no coincide con lo que dijo
 * el corredor como duda. Lo que no sirve se descarta con una nota.
 */
export function revisarOperaciones(crudas: unknown, ctx: { ahora: Date; zona: string; texto: string }): Revisado {
  const { ahora, zona } = ctx;
  const hoy = fechaLocal(ahora, zona);
  const limite = sumarDias(hoy, DIAS_ADELANTE);
  const limiteRepetir = sumarDias(hoy, DIAS_REPETIR);
  const ahoraMin = minutosLocales(ahora, zona);
  const nombrados = diasNombrados(ctx.texto);
  const out: Revisado = { apartados: [], quitar: [], dudas: [], notas: [] };
  const nota = (t: string) => !out.notas.includes(t) && out.notas.push(t);
  const lista = Array.isArray(crudas) ? crudas.slice(0, 30) : [];
  const vistos = new Set<string>();
  let recortado = false;
  const poner = (a: Apartado) => {
    if (vistos.has(a.clave)) return;
    if (out.apartados.length >= MAX_APARTADOS) {
      recortado = true;
      return;
    }
    vistos.add(a.clave);
    out.apartados.push(a);
  };
  /** ¿Ese rato de hoy ya terminó? */
  const yaPaso = (f: FechaLocal, finMin: number) => fechaIso(f) === fechaIso(hoy) && finMin <= ahoraMin;

  for (const c of lista as OperacionApartarCruda[]) {
    if (!c || typeof c !== "object") continue;
    if (c.tipo === "duda") {
      const pregunta = textoLimpio(c.pregunta, 200);
      if (!pregunta) continue;
      const opciones = (Array.isArray(c.opciones) ? c.opciones : []).map((o) => textoLimpio(o, 40)).filter(Boolean).slice(0, 4);
      out.dudas.push({ pregunta, opciones });
      continue;
    }
    const desde = fechaDeIso(c.desde);
    const hasta = c.hasta ? fechaDeIso(c.hasta) : desde;
    if (!desde || !hasta || diasEntre(desde, hasta) < 0) {
      nota("Una parte traía una fecha que no existe; esa no la tomé.");
      continue;
    }
    if (c.tipo === "quitar") {
      if (diasEntre(hoy, hasta) < 0) {
        nota(`Lo del ${fechaTexto(hasta)} ya pasó: no hay nada que quitar.`);
        continue;
      }
      const d = diasEntre(hoy, desde) < 0 ? hoy : desde;
      const h = diasEntre(d, hasta) > DIAS_REPETIR ? sumarDias(d, DIAS_REPETIR) : hasta;
      out.quitar.push({
        desde: fechaIso(d),
        hasta: fechaIso(h),
        inicio: aUtc(d, 0, zona).toISOString(),
        fin: aUtc(sumarDias(h, 1), 0, zona).toISOString(),
        texto: diasEntre(d, h) > 0 ? `Del ${fechaTexto(d)} al ${fechaTexto(h)}` : cap(fechaTexto(d)),
      });
      continue;
    }
    if (c.tipo !== "apartar") {
      nota("Una parte no la entendí.");
      continue;
    }
    const rato = RATOS_IA.includes(c.rato as Rato) ? (c.rato as Rato) : null;
    if (!rato) {
      nota(`No entendí qué parte del día del ${fechaTexto(desde)}.`);
      continue;
    }
    let horas: [number, number] | null = null;
    if (rato === "horas") {
      const a = minutosHora(c.hora_inicio);
      const b = minutosHora(c.hora_fin);
      if (a === null || b === null || b <= a) {
        nota(`Las horas del ${fechaTexto(desde)} no cuadran (tienen que ser en cuartos de hora y la primera antes que la segunda).`);
        continue;
      }
      if (a < 6 * 60) {
        out.dudas.push({
          pregunta: `¿Las ${reloj(a)} del ${fechaTexto(desde)} son de la mañana o de la tarde?`,
          opciones: [`A las ${reloj(a)} de la mañana`, `A las ${reloj(a)} de la tarde`],
        });
        continue;
      }
      horas = [a, b];
    }
    const motivo = textoLimpio(c.motivo, 60) || null;
    const r = c.repetir;
    if (r && typeof r === "object") {
      const dias = (Array.isArray(r.dias_semana) ? r.dias_semana : []).filter((n) => Number.isInteger(n) && n >= 1 && n <= 7).map((n) => n % 7);
      let fin = fechaDeIso(r.hasta);
      if (!dias.length || !fin || diasEntre(desde, fin) < 0) {
        nota("No entendí hasta cuándo se repite; esa parte no la tomé.");
        continue;
      }
      if (diasEntre(hoy, fin) > DIAS_REPETIR) {
        fin = limiteRepetir;
        nota(`Lo que se repite lo aparté hasta el ${fechaTexto(fin)} (máximo ${DIAS_REPETIR} días).`);
      }
      for (let d = diasEntre(hoy, desde) < 0 ? hoy : desde; diasEntre(d, fin) >= 0; d = sumarDias(d, 1)) {
        if (!dias.includes(d.diaSemana)) continue;
        if (yaPaso(d, horas ? horas[1] : rato === "horas" ? 24 * 60 : PARTES[rato as Parte].hasta)) continue;
        poner(armar(d, d, rato, horas, motivo, zona));
      }
      continue;
    }
    if (diasEntre(hoy, hasta) < 0 || (diasEntre(hoy, desde) < 0 && desde === hasta)) {
      nota(`El ${fechaTexto(desde)} ya pasó; no lo aparté.`);
      continue;
    }
    if (diasEntre(hoy, hasta) > DIAS_ADELANTE) {
      nota(`Solo aparto hasta ${DIAS_ADELANTE} días adelante (hasta el ${fechaTexto(limite)}); lo del ${fechaTexto(hasta)} pídemelo más cerca.`);
      continue;
    }
    const inicioReal = diasEntre(hoy, desde) < 0 ? hoy : desde;
    // Un solo día que no cae en el día de la semana que dijo el corredor: mejor preguntar.
    if (nombrados && diasEntre(inicioReal, hasta) === 0 && !nombrados.has(inicioReal.diaSemana)) {
      const dijo = [...nombrados].map((n) => DIA[n]);
      out.dudas.push({
        pregunta: `Dijiste ${dijo.join(" o ")}, pero el ${inicioReal.dia} de ${MES[inicioReal.mes - 1]} es ${DIA[inicioReal.diaSemana]}. ¿Qué día es?`,
        opciones: [...nombrados].map((n) => `El ${fechaTexto(proximo(sumarDias(hoy, 1), n))}`).slice(0, 3),
      });
      continue;
    }
    const finMin = horas ? horas[1] : PARTES[(rato === "horas" ? "todo" : rato) as Parte].hasta;
    if (rato === "todo" || diasEntre(inicioReal, hasta) === 0) {
      if (diasEntre(inicioReal, hasta) === 0 && yaPaso(inicioReal, finMin)) {
        nota(`Ese rato de hoy ya pasó; no lo aparté.`);
        continue;
      }
      poner(armar(inicioReal, hasta, rato, horas, motivo, zona));
    } else {
      // La mañana (o unas horas) de varios días: uno por día, como en el formulario.
      for (let d = inicioReal; diasEntre(d, hasta) >= 0; d = sumarDias(d, 1)) {
        if (!yaPaso(d, finMin)) poner(armar(d, d, rato, horas, motivo, zona));
      }
    }
  }
  if (recortado) nota(`Aparto hasta ${MAX_APARTADOS} ratos por pedido; el resto pídemelo aparte.`);
  out.apartados.sort((a, b) => a.inicio.localeCompare(b.inicio));
  return out;
}

/** Lo que entendió el intérprete de código, como operación (para pasar por la misma revisión). */
export function operacionDeCodigo(p: PedidoBloqueo): OperacionApartarCruda {
  return {
    tipo: "apartar",
    desde: fechaIso(p.dia),
    hasta: p.hastaDia ? fechaIso(p.hastaDia) : null,
    rato: p.horas ? "horas" : (p.parte ?? "todo"),
    hora_inicio: p.horas ? hhmmIso(p.horas.desde) : null,
    hora_fin: p.horas ? hhmmIso(Math.min(p.horas.hasta, 23 * 60 + 45)) : null,
    motivo: p.motivo,
  };
}

// --- ¿Es de la agenda propia? ------------------------------------------------------------------------------------

const DIA_O_RATO = "(?:hoy|manana|pasado|lunes|martes|miercoles|jueves|viernes|sabado|domingo|semana|mes|el \\d|del? \\d|las? \\d|en la|toda?)";
const PREFIJO_DIA = `(?:(?:hoy|manana|pasado manana|el (?:lunes|martes|miercoles|jueves|viernes|sabado|domingo|\\d{1,2})|este (?:lunes|martes|miercoles|jueves|viernes|sabado|domingo)|la (?:otra|proxima) semana|esta semana)\\s*,?\\s+)?`;
const VERBOS =
  "(?:no puedo|no voy a poder|no podre|no trabajo|no voy a trabajar|estoy ocupad[ao]|estare ocupad[ao]|voy a estar ocupad[ao]|estoy de vacaciones|me voy de vacaciones|voy a estar de vacaciones|estare de vacaciones|llego tarde|voy a llegar tarde|salgo temprano|me tengo que ir temprano|tengo (?:una? )?(?:cita (?:medica|con el (?:doctor|medico|dentista))|dentista|medico|doctor|reunion|compromiso|clase|examen|viaje|evento personal))";

/**
 * ¿El mensaje habla de la agenda propia aunque no empiece con "apartar"? Regla conservadora para no robarle mensajes
 * a los demás flujos: "no puedo el viernes", "la otra semana estoy de vacaciones", "mañana llego tarde…", "el
 * martes tengo dentista…", "todos los jueves en la mañana llevo a mi mamá…", "quita lo del viernes". Nada con
 * enlaces, preguntas, clientes, visitas o casas, ni textos largos.
 */
export function pideApartarLibre(texto: string): boolean {
  const t = sinTildes(texto).trim();
  if (!t || t.length > 300 || /https?:\/\/|\?|¿/.test(t)) return false;
  if (/\b(?:cliente|clienta|visita|casa|propiedad|lote|apartamento|anuncio|foto)s?\b/.test(t)) return false;
  if (/^(?:quit(?:a|ar|ame|en)|borr(?:a|ar|ame)|elimin(?:a|ar))\s+(?:lo\s+(?:del?\b|que\s+apart|apartado|bloqueado)|el\s+(?:apartado|bloqueo|tiempo apartado)|los\s+(?:apartados|bloqueos)|todo\s+lo\s+(?:apartado|del?\b))/.test(t)) return true;
  if (/^desbloque(?:a|ar|ame)\s+/.test(t) && new RegExp(`\\b${DIA_O_RATO}`).test(t)) return true;
  if (new RegExp(`^${PREFIJO_DIA}${VERBOS}\\b`).test(t)) return new RegExp(`\\b${DIA_O_RATO}`).test(t);
  if (/^(?:todos los|cada) (?:lunes|martes|miercoles|jueves|viernes|sabado|domingo)\b/.test(t)) {
    return /\b(?:no puedo|tengo|llevo|voy|estoy|apart|bloque|ocupad)/.test(t);
  }
  return false;
}

/**
 * ¿El intérprete de código lo entiende entero? Un solo día (o "del 20 al 25"), sin "y" que junte otra cosa, sin
 * semanas, repeticiones, "después de las…", "quitar" ni nada que el código no sepa leer. Si sí, no hace falta el
 * modelo. Lo que va después de "por" o "porque" es el motivo y no cuenta.
 */
export function codigoLoEntiende(texto: string, ahora: Date, zona: string): PedidoBloqueo | null {
  const t = ` ${sinTildes(texto).replace(/\b(?:por|porque|para)\s+(?!la (?:manana|tarde|noche)\b)(?!(?:hoy|manana|pasado|el|este|lunes|martes|miercoles|jueves|viernes|sabado|domingo)\b).+$/, " ")} `;
  if (/\by\b|,|;|\bsemana|\btodos\b|\bcada\b|\bmes\b|\bexcepto\b|\bmenos\b|\bsalvo\b|\bdespues\b|\bantes\b|\bllego\b|\bsalgo\b|\bquit|\bdesbloque|\botra\b|\bproxim|\bsiguiente\b|\bfin de semana\b|\bferiado\b|\bmedia\b|\bcuarto\b|\bo\b/.test(t)) return null;
  let dias = DIA_SIN.filter((d) => new RegExp(`\\b${d}\\b`).test(t)).length;
  if (/\bhoy\b/.test(t)) dias++;
  if (/\bpasado manana\b/.test(t)) dias++;
  else if (/(?<!la |por la |en la |de la )\bmanana\b/.test(t)) dias++;
  if (/\bdel?\s+\d{1,2}\b.*\b(?:al|hasta el)\s+\d{1,2}\b/.test(t)) dias++;
  else dias += (t.match(/\bel\s+\d{1,2}\b/g) ?? []).length;
  if (dias > 1) return null;
  return entenderBloqueo(texto, ahora, zona);
}

// --- Choques con visitas -----------------------------------------------------------------------------------------

export interface VisitaAgenda {
  id?: string;
  inicio: string | Date;
  fin: string | Date;
  nombre?: string | null;
}

/** Las visitas que caen dentro de cada apartado (por clave). No se cancela nada: solo se avisa. */
export function choquesConVisitas(apartados: Pick<Apartado, "clave" | "inicio" | "fin">[], visitas: VisitaAgenda[]): Record<string, VisitaAgenda[]> {
  const ms = (d: string | Date) => (d instanceof Date ? d.getTime() : Date.parse(d));
  const out: Record<string, VisitaAgenda[]> = {};
  for (const a of apartados) {
    const encima = visitas.filter((v) => ms(v.inicio) < ms(a.fin) && ms(v.fin) > ms(a.inicio));
    if (encima.length) out[a.clave] = encima;
  }
  return out;
}

// --- Contexto para el modelo y la demo ---------------------------------------------------------------------------

/** Hoy y los próximos días con su día de la semana, para que el modelo no tenga que calcularlos. */
export function contextoFechas(ahora: Date, zona: string, horarios: { dia_semana: number; hora_inicio: string; hora_fin: string }[]): string {
  const hoy = fechaLocal(ahora, zona);
  const min = minutosLocales(ahora, zona);
  const calendario = Array.from({ length: 35 }, (_, i) => {
    const d = sumarDias(hoy, i);
    return `${fechaIso(d)} ${DIA_SIN[d.diaSemana]}${i === 0 ? " (hoy)" : i === 1 ? " (mañana)" : ""}`;
  });
  const porDia = DIA_SIN.map((d, i) => {
    const franjas = horarios.filter((h) => h.dia_semana === i).map((h) => `${h.hora_inicio.slice(0, 5)}-${h.hora_fin.slice(0, 5)}`);
    return `${d}: ${franjas.join(", ") || "no enseña casas"}`;
  });
  return [
    `<ahora>Hoy es ${DIA_SIN[hoy.diaSemana]} ${fechaIso(hoy)}; son las ${hhmmIso(min)} (zona ${zona}).</ahora>`,
    `<calendario>\n${calendario.join("\n")}\n</calendario>`,
    `<horario_de_visitas>\n${porDia.join("\n")}\n</horario_de_visitas>`,
  ].join("\n\n");
}

/**
 * Demo: lo entiende el código, sin gastar. Parte el texto en pedazos ("… y el viernes …") y lee cada uno con el
 * intérprete de código; "quita lo del…" quita ese día y "la otra semana" es de lunes a domingo.
 */
export function interpretarApartadoDemo(texto: string, ahora: Date, zona: string): OperacionApartarCruda[] {
  const hoy = fechaLocal(ahora, zona);
  const ops: OperacionApartarCruda[] = [];
  for (const pedazo of texto.split(/\s*(?:[,;.]|\by\b)\s*/i).filter((p) => p.trim())) {
    const p = sinTildes(pedazo);
    if (/\b(?:otra|proxima|siguiente) semana\b/.test(p)) {
      const lunes = sumarDias(hoy, ((1 - hoy.diaSemana + 7) % 7) || 7);
      ops.push({ tipo: /^\s*quit/.test(p) ? "quitar" : "apartar", desde: fechaIso(lunes), hasta: fechaIso(sumarDias(lunes, 6)), rato: "todo" });
      continue;
    }
    const leido = entenderBloqueo(`apartar ${pedazo.replace(/^\s*(?:quit\w*|apart\w*|bloque\w*)\s+(?:lo\s+del?\s+)?/i, "")}`, ahora, zona);
    if (!leido) continue;
    if (/^\s*quit/.test(p)) ops.push({ tipo: "quitar", desde: fechaIso(leido.dia), hasta: leido.hastaDia ? fechaIso(leido.hastaDia) : null });
    else ops.push(operacionDeCodigo(leido));
  }
  if (!ops.length) {
    ops.push({ tipo: "duda", pregunta: "En la demostración entiendo frases como «el martes de 2 a 4 y el viernes todo el día». ¿Me lo dices así?", opciones: [] });
  }
  return ops;
}

// --- Para pasar una propuesta por un enlace (de Patty a la pantalla) ---------------------------------------------

/** Texto y operaciones en base64url (sin caracteres que el chat no acepte en un enlace del panel). */
export function empacarPropuesta(texto: string, ops: OperacionApartarCruda[]): string {
  return Buffer.from(JSON.stringify({ t: texto.slice(0, MAX_PEDIDO_APARTAR), o: ops.slice(0, 30) }), "utf8").toString("base64url");
}

export function desempacarPropuesta(p: unknown): { texto: string; ops: OperacionApartarCruda[] } | null {
  if (typeof p !== "string" || p.length > 12_000 || !/^[A-Za-z0-9_-]+$/.test(p)) return null;
  try {
    const x = JSON.parse(Buffer.from(p, "base64url").toString("utf8")) as { t?: unknown; o?: unknown };
    if (typeof x.t !== "string" || !Array.isArray(x.o)) return null;
    return { texto: x.t.slice(0, MAX_PEDIDO_APARTAR), ops: x.o as OperacionApartarCruda[] };
  } catch {
    return null;
  }
}

/** "Aparté 3 ratos" / "Aparté el martes 17…" para el resumen. */
export function resumenGuardado(n: number, quitados: number): string {
  const a = n ? `Aparté ${n === 1 ? "1 rato" : `${n} ratos`}` : "";
  const q = quitados ? `${a ? " y quité" : "Quité"} ${quitados === 1 ? "1 rato apartado" : `${quitados} ratos apartados`}` : "";
  return `${a}${q}.` === "." ? "No había nada que cambiar." : `${a}${q}.`;
}
