import type { Dependencias } from "../asistente/contexto";
import { conversacionDelCorredor, enviarAlCorredor } from "../asistente/corredor";
import type { CitaTerminada } from "../datos/repositorio";
import type { Corredor, DatosPlan, EstadoCita } from "../datos/tipos";
import { errorSeguro } from "../monitoreo/errores";
import { pideApartarLibre } from "./apartar-ia";
import { pideBloqueo } from "./bloquear";
import { horaCorta } from "./formato";
import { fechaIso, fechaLocal, limitesDia, minutosLocales, sumarDias } from "./tiempo";
import { sinTildes } from "./zonas";

// Seguimiento de cada visita: un rato después de que termina, la asistente le pregunta al corredor por WhatsApp
// cómo le fue (una sola vez por visita: `seguimiento_visita:<cita>` en `alertas` se escribe solo cuando la pregunta
// salió; si el envío falla, la corrida siguiente reintenta). Lo que el corredor responda (texto o nota de voz ya
// transcrita) y de verdad cuente cómo fue queda en la Historia del cliente y la visita pasa a hecha, o a
// "no llegó" / cancelada si lo dice; eso lo detecta el código, no el modelo. "Ya respondido" es la visita que dejó
// de estar agendada o confirmada (no hace falta otra marca). Todo filtra por corredor_id.

const MINUTO = 60_000;
const HORA = 60 * MINUTO;
/** La pregunta sale desde 30 minutos después del fin y hasta 18 horas después (si cae de noche, a la mañana). */
export const ESPERA_TRAS_VISITA_MS = 30 * MINUTO;
export const LIMITE_PREGUNTA_MS = 18 * HORA;
/** La respuesta se toma como resumen durante 36 horas desde que se preguntó: así también vale la que llega después del plan de la mañana, que vuelve a preguntar por las de ayer. */
export const VIGENCIA_PREGUNTA_MS = 36 * HORA;
/** Solo se pregunta entre las 7:00 y las 21:00 en la zona del corredor. */
const DESDE_MIN = 7 * 60;
const HASTA_MIN = 21 * 60;
/** La clave de "ya se preguntó" nunca se vuelve a reclamar: un año de ventana. */
const UNA_VEZ_MIN = 365 * 24 * 60;

export const claveSeguimiento = (citaId: string) => `seguimiento_visita:${citaId}`;

function primerNombre(nombre: string | null): string | null {
  const n = nombre?.trim().split(/\s+/)[0];
  return n ? n : null;
}

/** "de las 3:00 p. m.", "de la 1:00 p. m." */
const deLaHora = (fecha: Date, zona: string) => {
  const hora = horaCorta(fecha, zona);
  return `${/^1:/.test(hora) ? "de la" : "de las"} ${hora}`;
};

/** Cierra la frase sin dejar ".." cuando termina en "p. m.". */
const conPunto = (t: string) => (t.endsWith(".") ? t : `${t}.`);

/** "la visita de las 3:00 p. m. con Robert Miller (Casa X)" */
function deLaVisita(cita: CitaTerminada, zona: string, conNombre: boolean): string {
  const con = conNombre && cita.cliente?.trim() ? ` con ${cita.cliente.trim()}` : "";
  const casa = cita.propiedad ? ` (${cita.propiedad})` : "";
  return `la visita ${deLaHora(cita.inicio, zona)}${con}${casa}`;
}

export function preguntaSeguimiento(cita: CitaTerminada, zona: string): string {
  return (
    `¿Cómo te fue en ${deLaVisita(cita, zona, true)}? Cuéntame en un mensaje o nota de voz y lo anoto en su historia. ` +
    "Si no se hizo, respóndeme «no vino» o «se canceló»."
  );
}

/** Para la plantilla (ventana de 24 horas cerrada): corta y sin el nombre del cliente. */
export function avisoSeguimiento(cita: CitaTerminada, zona: string): string {
  return `Tu visita ${deLaHora(cita.inicio, zona)} ya terminó. Respóndeme cómo te fue y lo anoto en la historia del cliente.`;
}

export interface ResumenSeguimiento {
  preguntadas: number;
  fallidos: number;
}

/**
 * Turno de envío: lo toma una corrida antes de mandar (dos corridas cruzadas no preguntan dos veces) y vence solo,
 * antes de la corrida siguiente (cada hora). Si el envío falla, la próxima corrida vuelve a intentar.
 */
const claveEnvio = (citaId: string) => `seguimiento_visita_envio:${citaId}`;
const TURNO_ENVIO_MIN = 30;

/** Corre cada hora junto con los recordatorios (`/api/cron/recordatorios`). */
export async function preguntarPorVisitas(deps: Dependencias): Promise<ResumenSeguimiento> {
  const ahora = deps.ahora?.() ?? new Date();
  const log = deps.registrar ?? ((evento, datos) => console.info(JSON.stringify({ evento, ...datos })));
  const resumen = { preguntadas: 0, fallidos: 0 };

  for (const corredor of await deps.repo.corredoresActivos()) {
    // La demo (corredor inactivo) nunca manda nada; sin número del corredor no hay a quién preguntarle.
    if (corredor.activo === false || !corredor.whatsapp_corredor || !corredor.whatsapp_phone_number_id) continue;
    const zona = corredor.zona_horaria;
    const minutos = minutosLocales(ahora, zona);
    if (minutos < DESDE_MIN || minutos >= HASTA_MIN) continue;
    try {
      const citas = await deps.repo.citasTerminadas(
        corredor.id,
        new Date(ahora.getTime() - LIMITE_PREGUNTA_MS),
        new Date(ahora.getTime() - ESPERA_TRAS_VISITA_MS),
      );
      if (citas.length === 0) continue;
      const hoy = limitesDia(ahora, zona).desde.getTime();
      const yaPreguntadas = await deps.repo.alertasReclamadas(citas.map((c) => claveSeguimiento(c.id)));
      // De la más vieja a la más nueva, para que la última pregunta del chat sea la última visita.
      for (const cita of [...citas].reverse()) {
        if (yaPreguntadas.has(claveSeguimiento(cita.id))) continue;
        // La visita de anoche (pasadas las 20:30) no se pregunta aparte: la pregunta el plan de la mañana, que al
        // salir la marca como preguntada (marcarPreguntadasEnPlan). Así no llegan dos preguntas a las 7:00.
        if (cita.inicio.getTime() < hoy) continue;
        if (!(await deps.repo.reclamarAlerta(claveEnvio(cita.id), TURNO_ENVIO_MIN))) continue;
        try {
          const conversacion = await conversacionDelCorredor(deps, corredor);
          await enviarAlCorredor(deps, corredor, conversacion, preguntaSeguimiento(cita, zona), {
            plantillaSiCerrada: avisoSeguimiento(cita, zona),
            ahora,
          });
          // Solo una pregunta que salió cuenta como hecha: es la que abre la espera de la respuesta.
          await deps.repo.reclamarAlerta(claveSeguimiento(cita.id), UNA_VEZ_MIN);
          resumen.preguntadas++;
        } catch (error) {
          resumen.fallidos++;
          log("error_seguimiento_visita", { corredorId: corredor.id, citaId: cita.id, error: errorSeguro(error) });
        }
      }
    } catch (error) {
      resumen.fallidos++;
      log("error_seguimiento_visita", { corredorId: corredor.id, error: errorSeguro(error) });
    }
  }
  return resumen;
}

/**
 * El plan de la mañana ya salió (texto o plantilla) y pregunta por las visitas de ayer: cuentan como preguntadas,
 * para que la respuesta del corredor se anote. No cambia la hora si ya se había preguntado.
 */
export async function marcarPreguntadasEnPlan(deps: Pick<Dependencias, "repo">, datos: Pick<DatosPlan, "visitasSinResultado">): Promise<void> {
  for (const v of datos.visitasSinResultado ?? []) {
    if (v.id) await deps.repo.reclamarAlerta(claveSeguimiento(v.id), UNA_VEZ_MIN);
  }
}

/** Visitas preguntadas dentro de la vigencia (36 horas) que siguen sin resultado, la última preguntada primero. */
export async function seguimientosPendientes(
  deps: Pick<Dependencias, "repo">,
  corredor: Corredor,
  ahora: Date,
): Promise<CitaTerminada[]> {
  const citas = await deps.repo.citasTerminadas(
    corredor.id,
    new Date(ahora.getTime() - LIMITE_PREGUNTA_MS - VIGENCIA_PREGUNTA_MS),
    ahora,
  );
  if (citas.length === 0) return [];
  const preguntadas = await deps.repo.alertasReclamadas(citas.map((c) => claveSeguimiento(c.id)));
  const desde = ahora.getTime() - VIGENCIA_PREGUNTA_MS;
  return citas
    .flatMap((c) => {
      const cuando = preguntadas.get(claveSeguimiento(c.id));
      return cuando && cuando.getTime() >= desde ? [{ cita: c, cuando: cuando.getTime() }] : [];
    })
    .sort((a, b) => b.cuando - a.cuando || b.cita.fin.getTime() - a.cita.fin.getTime())
    .map((x) => x.cita);
}

// ---------- ¿El mensaje cuenta cómo fue la visita? (reglas del código, sin modelo; todo sin tildes) ----------

const COMANDO = /^(plan|reporte|anuncios?|fotos|ficha|ayuda)\b/;
/** Pedidos y recordatorios: van a la asistente, no a la historia. */
const PEDIDO =
  /^(analiza(me|la|lo)?|que (opinas|piensas|te parece)|cuanto|dime|explica(me)?|ayuda(me)?|necesito|busca(me|le)?|compara(me)?|recuerda(me|le)?|recordame|recordarme|manda(me|melo|mela|le|lo|la)?|pasa(me|melo|mela)?|envia(me|melo|mela|le)?|dame|hazme|haz|prepara(me|le)?|agenda(me|le|r)?|escribe(me|le)|llama(le)?|muestra(me)?|ensena(me)?|quiero que|puedes|podes|podrias|me (pasas|mandas|das|dices|ayudas|envias|recuerdas|haces|preparas|buscas|agendas))\b/;
/** Preguntas sin signo. */
const PREGUNTA = /^(y )?(que tal|como (esta|estas|va|vas|ves|se ve|vamos)|cual|cuales|cuando|donde|por que|quien|quienes)\b/;
const ENLACE = /https?:\/\/|www\./i;
/** Saludos y acuses ("Hola", "Ok gracias", "Gracias Patty", "ya"): se quitan del principio; si no queda nada, no es un resumen. */
const RELLENO = new Set(
  (
    "hola holi buenas buenos buen dia dias tarde tardes noche noches hey saludos ok okay oki okis okey dale listo listos gracias " +
    "muchas mil perfecto bueno si ya va vale claro genial excelente entendido de acuerdo super chiva pura vida jaja jajaja jeje " +
    "ah oh mmm ajá aja sip ujum patty"
  ).split(" "),
);
/** Palabras de una visita: si están, el mensaje habla de cómo salió. */
const VOCABULARIO =
  /\b(gust(o|a|aron|ado|aria)|encant\w*|ofert\w*|vio la casa|vieron|visita\w*|quieren? (volver|regresar|verla|pensar\w*|comprar\w*|alquilar\w*|negociar|ofertar)|precio|negoci\w*|interesad[ao]s?|no (vino|vinieron|llego|llegaron|pudo|pudieron|se presento|se presentaron|aparecio)|cancel\w*|plantad[ao]|sali[oe] (bien|mal)|(le|les|me|nos) fue|se hizo|pospus\w*|pospuso|vuelve|vuelven|volver|regres\w*|esposa|esposo|familia|financiamiento|credito|prestamo|banco)\b/;
/** Con al menos estas palabras (y sin ser un pedido ni una pregunta) también se toma como resumen. */
const PALABRAS_MINIMAS = 6;
/** Palabras del título de una casa que no la distinguen. */
const GENERICAS = new Set("casa casas apartamento apartamentos lote lotes condominio terreno finca venta alquiler oficina local bodega quinta en de del la el los las con".split(" "));

const normal = (t: string) => sinTildes(t);
const palabrasDe = (t: string) => normal(t).split(/[^a-z0-9ñ]+/).filter(Boolean);
const escapar = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const contiene = (texto: string, palabra: string) => new RegExp(`(^|[^a-z0-9ñ])${escapar(palabra)}($|[^a-z0-9ñ])`).test(texto);

/** Lo que sirve para reconocer de qué visita habla: primer nombre del cliente y lo que distingue a la casa. */
interface Pistas {
  nombres?: string[];
  casas?: string[];
  asistente?: string | null;
}

function nombreNormal(cliente: string | null): string | null {
  const n = primerNombre(cliente);
  return n ? normal(n) : null;
}

function nombraCasa(texto: string, casa: string | null): boolean {
  if (!casa) return false;
  const t = normal(casa);
  if (t.length >= 4 && texto.includes(t)) return true;
  return palabrasDe(casa).some((p) => p.length >= 5 && !GENERICAS.has(p) && contiene(texto, p));
}

/** ¿El texto nombra esta visita (primer nombre del cliente o la casa)? */
function nombraVisita(texto: string, cita: CitaTerminada): boolean {
  const n = nombreNormal(cita.cliente);
  return (!!n && n.length >= 2 && contiene(texto, n)) || nombraCasa(texto, cita.propiedad);
}

/**
 * ¿El mensaje del corredor cuenta cómo fue una visita? Nunca un comando, un enlace (va al análisis), una pregunta,
 * un pedido o recordatorio ("recuérdame…", "mándamelo"), un saludo o acuse ("Hola", "Ok gracias", "👍") ni un
 * mensaje con foto o documento. Sí, si nombra al cliente o la casa, usa palabras de una visita ("le encantó", "no
 * vino", "quiere ofertar") o es un mensaje de al menos seis palabras. En la duda, no.
 */
export function puedeSerResumen(texto: string, conAdjuntos: boolean, pistas: Pistas = {}): boolean {
  const resto = loQueCuenta(texto, conAdjuntos, pistas.asistente);
  if (!resto) return false;
  const n = normal(texto);
  if (VOCABULARIO.test(n)) return true;
  if ((pistas.nombres ?? []).some((x) => x.length >= 2 && contiene(n, normal(x)))) return true;
  if ((pistas.casas ?? []).some((c) => nombraCasa(n, c))) return true;
  return resto.length >= PALABRAS_MINIMAS;
}

/**
 * Las palabras que quedan sin el saludo o acuse del principio, o null si el mensaje no puede ser un resumen
 * (adjunto, enlace, pregunta, apartar tiempo, comando, pedido, solo saludo o acuse).
 */
function loQueCuenta(texto: string, conAdjuntos: boolean, asistente?: string | null): string[] | null {
  const t = texto.trim();
  if (conAdjuntos || t.length < 2) return null;
  if (ENLACE.test(t) || /[?¿]/.test(t)) return null;
  if (pideBloqueo(t) || pideApartarLibre(t)) return null;
  const relleno = new Set(RELLENO);
  for (const p of palabrasDe(asistente ?? "")) relleno.add(p);
  const palabras = palabrasDe(t);
  let i = 0;
  while (i < palabras.length && relleno.has(palabras[i])) i++;
  const resto = palabras.slice(i);
  if (resto.length === 0) return null;
  const frase = resto.join(" ");
  if (COMANDO.test(frase) || PEDIDO.test(frase) || PREGUNTA.test(frase)) return null;
  return resto;
}

/** Lo que puede venir justo después de "no vino" para que de verdad diga que el cliente no llegó. */
const COLA_NO_VINO =
  "(?=\\s*(?:$|[.,;:!?)]|y\\b|pero\\b|porque\\b|pues\\b|ni\\b|nunca\\b|hoy\\b|ayer\\b|al final\\b|a la (?:visita|cita)\\b|nadie\\b|ningun cliente\\b|(?:el|la|los|las|mi|mis) (?:cliente|clientes|clienta|senor|senora|senores|pareja|familia|comprador\\w*|interesad\\w*|muchach\\w*|inquilin\\w*)\\b))";
const NO_ASISTIO = new RegExp(
  `\\bno (?:vino|vinieron|llego|llegaron|se presento|se presentaron|aparecio|aparecieron|asistio|asistieron|pudo venir|pudieron venir|pudo llegar|pudieron llegar)${COLA_NO_VINO}|\\bnadie (?:vino|llego|se presento)\\b|\\bme dej(?:o|aron) plantad[ao]s?\\b`,
);
const CANCELADA = /\b(cancel(o|aron|amos|e|ada|ado|adas|ados)|se cancelo|no se hizo|se suspendio|la pospus\w*|se pospuso)\b/;
/** "no se canceló", "no la cancelamos": la negación no cuenta como cancelada. */
const CANCELACION_NEGADA = /\bno (?:se |la |lo |me |nos |le )?(?:cancel\w*|suspendi\w*|pospus\w*|pospuso)/g;

/** Lo dice el código: cancelada, no llegó o (por defecto) se hizo. */
export function resultadoDeVisita(texto: string): Extract<EstadoCita, "realizada" | "no_asistio" | "cancelada"> {
  const t = normal(texto);
  if (CANCELADA.test(t.replace(CANCELACION_NEGADA, " "))) return "cancelada";
  if (NO_ASISTIO.test(t)) return "no_asistio";
  return "realizada";
}

/** Separa "Robert salió bien, le encantó. Ana no vino" por frase: cada visita con lo suyo. null si no se puede limpio. */
function repartirPorNombre(texto: string, nombradas: CitaTerminada[]): Map<CitaTerminada, string> | null {
  const frases = texto
    .split(/[.!;\n]+/)
    .map((f) => f.trim())
    .filter(Boolean);
  const partes = new Map<CitaTerminada, string[]>();
  let actual: CitaTerminada | null = null;
  for (const frase of frases) {
    const n = normal(frase);
    const en = nombradas.filter((c) => nombraVisita(n, c));
    if (en.length > 1) return null;
    if (en.length === 1) actual = en[0];
    if (!actual) return null;
    partes.set(actual, [...(partes.get(actual) ?? []), frase]);
  }
  if (partes.size !== nombradas.length) return null;
  return new Map([...partes].map(([c, fs]) => [c, fs.join(". ")]));
}

/** Con varias visitas esperando y sin saber de cuál habla: se pregunta y no se anota nada. */
function preguntaCual(pendientes: CitaTerminada[], zona: string, varias: boolean): string {
  const lineas = [...pendientes]
    .sort((a, b) => a.inicio.getTime() - b.inicio.getTime())
    .map((c) => `• ${horaCorta(c.inicio, zona)} · ${primerNombre(c.cliente) ?? "Cliente sin nombre"}${c.propiedad ? ` (${c.propiedad})` : ""}`);
  const intro = varias
    ? "Me cuentas de varias visitas y no supe separar qué fue de cada una. Escríbeme una por una, empezando por el nombre del cliente:"
    : "¿De cuál visita me cuentas? Escríbeme empezando por el nombre del cliente y lo anoto:";
  return [intro, ...lineas].join("\n");
}

type Resultado = ReturnType<typeof resultadoDeVisita>;

/** Anota una visita: estado, Historia y recordatorio. null si la visita ya no estaba pendiente. */
async function anotarUna(
  deps: Pick<Dependencias, "repo">,
  corredor: Corredor,
  cita: CitaTerminada,
  texto: string,
  ahora: Date,
): Promise<{ estado: Resultado; recordatorio: boolean } | null> {
  const estado = resultadoDeVisita(texto);
  if (!(await deps.repo.cambiarEstadoCita(corredor.id, cita.id, estado))) return null;
  const zona = corredor.zona_horaria;
  const deLaCasa = cita.propiedad ? ` a ${cita.propiedad}` : "";
  const historia = {
    realizada: `Fue a ver la casa${cita.propiedad ? ` ${cita.propiedad}` : ""}`,
    no_asistio: `No llegó a la visita${deLaCasa}`,
    cancelada: `Visita${deLaCasa} ${deLaHora(cita.inicio, zona)} cancelada`,
  }[estado];
  await deps.repo.anotarActividad(corredor.id, cita.contacto_id, "visita", historia, "asistente");
  // Lo que contó el corredor, con sus palabras (salvo un "no vino" pelado, que ya dice la línea de arriba).
  const limpio = texto.trim();
  if (estado === "realizada" || limpio.length > 25) {
    const nota = `Cómo fue la visita: ${limpio}`;
    await deps.repo.anotarActividad(corredor.id, cita.contacto_id, "nota", nota.length > 500 ? `${nota.slice(0, 499)}…` : nota, "corredor");
  }
  let recordatorio = false;
  if (estado === "realizada") {
    const manana = fechaIso(sumarDias(fechaLocal(ahora, zona), 1));
    recordatorio = await deps.repo.ponerSeguimiento(corredor.id, cita.contacto_id, manana, `Preguntarle qué le pareció ${cita.propiedad ?? "la casa"}`);
  }
  return { estado, recordatorio };
}

function confirmacion(cita: CitaTerminada, estado: Resultado, zona: string, conHora: boolean): string {
  const quien = primerNombre(cita.cliente);
  const deQuien = quien ? `de ${quien}` : "del cliente";
  const deLaCasa = cita.propiedad ? ` a ${cita.propiedad}` : "";
  const cual = conHora ? ` (visita ${deLaHora(cita.inicio, zona)}${deLaCasa})` : "";
  return {
    realizada: `Listo, lo anoté en la historia ${deQuien}${cual}.`,
    no_asistio: `Anotado: no llegó a ${conPunto(deLaVisita(cita, zona, false))} Lo dejé en la historia ${deQuien}.`,
    cancelada: `Anotado: ${deLaVisita(cita, zona, false)} quedó cancelada. Lo dejé en la historia ${deQuien}.`,
  }[estado];
}

/**
 * Si hay una visita preguntada esperando respuesta y el mensaje cuenta cómo fue, lo anota y devuelve la
 * confirmación para el corredor (armada por el código). Con varias visitas esperando, se anota en la que nombra
 * (o en cada una, si el mensaje se separa limpio por frase); si no nombra ninguna, se le pregunta de cuál habla y
 * no se guarda nada. null: el mensaje sigue su camino normal.
 */
export async function anotarSeguimiento(
  deps: Pick<Dependencias, "repo">,
  corredor: Corredor,
  texto: string,
  conAdjuntos: boolean,
  ahora: Date,
): Promise<string | null> {
  // Primero lo que se descarta sin mirar la base (comandos, preguntas, saludos…).
  if (!loQueCuenta(texto, conAdjuntos, corredor.nombre_asistente)) return null;
  const pendientes = await seguimientosPendientes(deps, corredor, ahora);
  if (pendientes.length === 0) return null;
  const pistas: Pistas = {
    asistente: corredor.nombre_asistente,
    nombres: pendientes.map((c) => nombreNormal(c.cliente)).filter((x): x is string => !!x),
    casas: pendientes.map((c) => c.propiedad).filter((x): x is string => !!x),
  };
  if (!puedeSerResumen(texto, conAdjuntos, pistas)) return null;

  const zona = corredor.zona_horaria;
  let reparto: Map<CitaTerminada, string>;
  if (pendientes.length === 1) {
    reparto = new Map([[pendientes[0], texto]]);
  } else {
    const n = normal(texto);
    const nombradas = pendientes.filter((c) => nombraVisita(n, c));
    if (nombradas.length === 0) return preguntaCual(pendientes, zona, false);
    if (nombradas.length === 1) reparto = new Map([[nombradas[0], texto]]);
    else {
      const separado = repartirPorNombre(texto, nombradas);
      if (!separado) return preguntaCual(pendientes, zona, true);
      reparto = separado;
    }
  }

  const partes: string[] = [];
  let recordatorios = 0;
  const anotadas = new Set<string>();
  for (const [cita, parte] of reparto) {
    const r = await anotarUna(deps, corredor, cita, parte, ahora);
    if (!r) continue;
    anotadas.add(cita.id);
    if (r.recordatorio) recordatorios++;
    partes.push(confirmacion(cita, r.estado, zona, pendientes.length > 1));
  }
  if (partes.length === 0) return null;
  if (recordatorios === 1) partes.push("Mañana te recuerdo darle seguimiento.");
  else if (recordatorios > 1) partes.push("Mañana te recuerdo darles seguimiento.");
  const otra = pendientes.find((c) => !anotadas.has(c.id));
  if (otra) partes.push(`Todavía me falta saber cómo te fue en ${deLaVisita(otra, zona, true)}.`);
  return partes.join(" ");
}
