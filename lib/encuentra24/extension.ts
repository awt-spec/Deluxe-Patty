import { createHash, randomBytes, randomInt } from "node:crypto";
import type { Cerebro } from "../asistente/cerebro";
import { hayPresupuestoHoy } from "../asistente/limites";
import type { Repositorio } from "../datos/repositorio";
import {
  anotarPagina,
  evaluarAnuncios,
  iniciarRecorrido,
  semanaDe,
  siguienteDelRecorrido,
  sinResultados,
  esCandidato,
  type Bloqueado,
  type EstadoRecorrido,
  type LeadDueno,
} from "./busqueda";
import type { CorredorBusqueda } from "./datos";
import { anunciosDePagina, esDesafio, urlListado, type AnuncioE24 } from "./parsear";

// Búsqueda de dueños desde la extensión de Chrome del corredor (extension/). La extensión es tonta a
// propósito: pide la próxima dirección, la abre en una pestaña y manda lo que trae la página. El
// recorrido, la lectura, los filtros y Haiku son los mismos del worker y viven aquí, así que si
// Encuentra24 cambia se arregla el servidor y no hay que reinstalar la extensión.

export const MAX_LEADS = 30;
const VIGENCIA_CODIGO_MS = 10 * 60_000;
// Sin letras ni números que se confundan al copiarlos (0/O, 1/I/L).
const ALFABETO = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export interface EstadoBusqueda {
  recorrido: EstadoRecorrido;
  /** Candidatos para Haiku entre los anuncios leídos (corta el recorrido cuando sobran). */
  candidatos: number;
  /** La dirección que se le pidió a la extensión; solo se acepta esa. */
  esperada: string | null;
  /** La empezó la extensión sola (búsqueda semanal): si Encuentra24 no deja leer, no se avisa a soporte. */
  automatica?: boolean;
  /**
   * La cortó la extensión antes de que el servidor dijera "no hay más": "usuario" (la persona tocó Detener, cerró la
   * pestaña o dejó la verificación para después) o "tope" (llegó al máximo de páginas por búsqueda o por día). Lo
   * leído hasta ahí se revisa y se guarda igual.
   */
  cortada?: "usuario" | "tope";
  /** Al terminar: cuántos dueños salieron, o por qué no. */
  resultado?: { resumen: Resumen } | { motivo: "sin_resultados" | "servidor" | "detenida"; mensaje?: string };
}

export interface AlmacenExtension {
  guardarCodigo(corredorId: string, codigoHash: string, vence: Date): Promise<void>;
  /** Canjea un código vigente por un permiso (en un solo paso, para que no sirva dos veces). */
  canjearCodigo(codigoHash: string, tokenHash: string, ahora: Date): Promise<string | null>;
  corredorDeToken(tokenHash: string, ahora: Date): Promise<string | null>;
  revocarToken(tokenHash: string, ahora: Date): Promise<void>;
  revocarTodas(corredorId: string, ahora: Date): Promise<void>;
  /** Solo corredores activos (la demo no busca). */
  corredor(corredorId: string): Promise<CorredorBusqueda | null>;
  idsVistos(corredorId: string): Promise<Set<string>>;
  bloqueados(corredorId: string): Promise<Bloqueado[]>;
  /** Crea la búsqueda y descarta las que quedaron a medias. */
  crearBusqueda(corredorId: string, estado: EstadoBusqueda): Promise<string>;
  /** Búsqueda en curso (sin terminar). */
  busqueda(corredorId: string, id: string): Promise<EstadoBusqueda | null>;
  /** Estado de una búsqueda, terminada o no. */
  estadoDe(corredorId: string, id: string): Promise<EstadoBusqueda | null>;
  guardarEstado(corredorId: string, id: string, estado: EstadoBusqueda): Promise<void>;
  /** Guarda los anuncios y devuelve los ids que no estaban en esta búsqueda. */
  agregarAnuncios(corredorId: string, id: string, anuncios: AnuncioE24[]): Promise<string[]>;
  anuncios(corredorId: string, id: string): Promise<AnuncioE24[]>;
  terminar(corredorId: string, id: string, ahora: Date): Promise<void>;
  guardarLeads(corredorId: string, semana: string, leads: LeadDueno[]): Promise<void>;
  /** Anota que una búsqueda terminó bien (la usa la búsqueda semanal para saber cuándo toca otra). */
  marcarBusquedaHecha(corredorId: string): Promise<void>;
  /** Cuándo terminó la última búsqueda del corredor, o null si no se sabe. */
  ultimaBusqueda(corredorId: string): Promise<Date | null>;
  /** Reserva la búsqueda automática por unas horas (atómico): false si otra ya la tomó. */
  reservarBusquedaAuto(corredorId: string, horas: number): Promise<boolean>;
}

export interface DependenciasExtension {
  almacen: AlmacenExtension;
  repo: Pick<Repositorio, "registrarUso" | "presupuestoIA">;
  cerebro: Pick<Cerebro, "clasificarAnuncio">;
}

export const huella = (s: string) => createHash("sha256").update(s).digest("hex");

/** Código de un solo uso que el panel le muestra al corredor, como "K7PM-4QXR". */
export async function nuevoCodigo(almacen: AlmacenExtension, corredorId: string, ahora = new Date()): Promise<string> {
  const letras = Array.from({ length: 8 }, () => ALFABETO[randomInt(ALFABETO.length)]).join("");
  await almacen.guardarCodigo(corredorId, huella(letras), new Date(ahora.getTime() + VIGENCIA_CODIGO_MS));
  return `${letras.slice(0, 4)}-${letras.slice(4)}`;
}

/** La extensión canjea el código por su permiso. null si el código no existe, venció o ya se usó. */
export async function conectar(
  almacen: AlmacenExtension,
  codigo: string,
  ahora = new Date(),
): Promise<{ token: string; corredorId: string } | null> {
  const limpio = codigo.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (limpio.length !== 8) return null;
  const token = randomBytes(32).toString("hex");
  const corredorId = await almacen.canjearCodigo(huella(limpio), huella(token), ahora);
  return corredorId ? { token, corredorId } : null;
}

/** Corredor dueño del permiso de la cabecera `Authorization: Bearer …`. */
export async function autenticar(almacen: AlmacenExtension, cabecera: string | null, ahora = new Date()): Promise<string | null> {
  const token = tokenDe(cabecera);
  return token ? almacen.corredorDeToken(huella(token), ahora) : null;
}

export function tokenDe(cabecera: string | null): string | null {
  return /^Bearer ([0-9a-f]{64})$/.exec(cabecera ?? "")?.[1] ?? null;
}

export type Inicio =
  | { ok: true; busqueda: string; siguiente: string; zonas: number; asistente: string }
  | { ok: false; motivo: "sin_corredor" | "sin_zonas" | "sin_presupuesto" };

export async function iniciarBusqueda(d: DependenciasExtension, corredorId: string, opciones: { automatica?: boolean } = {}): Promise<Inicio> {
  const corredor = await d.almacen.corredor(corredorId);
  if (!corredor) return { ok: false, motivo: "sin_corredor" };
  if (corredor.zonas_e24.length === 0) return { ok: false, motivo: "sin_zonas" };
  if (!(await hayPresupuestoHoy(d.repo, corredor))) return { ok: false, motivo: "sin_presupuesto" };

  const recorrido = iniciarRecorrido(corredor.zonas_e24);
  const t = siguienteDelRecorrido(recorrido, false)!;
  const estado: EstadoBusqueda = {
    recorrido,
    candidatos: 0,
    esperada: urlListado(corredor.categoria_busqueda_e24, t.zona, t.pagina),
    ...(opciones.automatica ? { automatica: true } : {}),
  };
  const busqueda = await d.almacen.crearBusqueda(corredorId, estado);
  // El nombre de la asistente va en la barra que se ve sobre Encuentra24 ("Patty está buscando dueños…").
  const asistente = (corredor.nombre_asistente ?? "").trim().slice(0, 40) || "Patty";
  return { ok: true, busqueda, siguiente: estado.esperada!, zonas: recorrido.activas.length, asistente };
}

export interface Resumen {
  duenos: number;
  paginas: number;
  anuncios: number;
  candidatos: number;
}

export type Avance =
  | { ok: true; desafio: boolean; siguiente: string | null; paginas: number }
  | { ok: false; motivo: "no_encontrada" | "fuera_de_orden" | "sin_corredor" };

/**
 * Recibe una página que abrió la extensión y dice cuál sigue. Con `siguiente: null` la ruta corre
 * terminarBusqueda en segundo plano y la extensión consulta el resultado: Haiku puede tardar más de lo
 * que Chrome deja vivir a la extensión esperando una respuesta.
 */
export async function recibirPagina(
  d: DependenciasExtension,
  corredorId: string,
  entrada: { busqueda: string; url: string; html: string },
): Promise<Avance> {
  const estado = await d.almacen.busqueda(corredorId, entrada.busqueda);
  if (!estado || !estado.esperada) return { ok: false, motivo: "no_encontrada" };
  if (entrada.url !== estado.esperada) return { ok: false, motivo: "fuera_de_orden" };
  const corredor = await d.almacen.corredor(corredorId);
  if (!corredor) return { ok: false, motivo: "sin_corredor" };

  const t = siguienteDelRecorrido(estado.recorrido, false)!;
  const desafio = esDesafio(entrada.html);
  if (desafio) {
    anotarPagina(estado.recorrido, t.zona, "desafio");
  } else {
    const anuncios = anunciosDePagina(entrada.html);
    const nuevos = new Set(await d.almacen.agregarAnuncios(corredorId, entrada.busqueda, anuncios));
    const candidato = esCandidato(await parametros(d, corredor));
    estado.candidatos += anuncios.filter((a) => nuevos.has(a.id) && candidato(a)).length;
    anotarPagina(estado.recorrido, t.zona, { nuevos: nuevos.size });
  }

  const sig = siguienteDelRecorrido(estado.recorrido, estado.candidatos >= MAX_LEADS * 2);
  estado.esperada = sig ? urlListado(corredor.categoria_busqueda_e24, sig.zona, sig.pagina) : null;
  await d.almacen.guardarEstado(corredorId, entrada.busqueda, estado);
  return { ok: true, desafio, siguiente: estado.esperada, paginas: estado.recorrido.paginas };
}

async function parametros(d: DependenciasExtension, corredor: CorredorBusqueda) {
  return {
    yaVistos: await d.almacen.idsVistos(corredor.id),
    bloqueados: await d.almacen.bloqueados(corredor.id),
    precioMin: corredor.precio_busqueda_min,
    precioMax: corredor.precio_busqueda_max,
    maxLeads: MAX_LEADS,
  };
}

/** Después de la última página: Haiku revisa los candidatos y los dueños quedan en el panel. */
export async function terminarBusqueda(d: DependenciasExtension, corredorId: string, id: string, ahora = new Date()) {
  const estado = await d.almacen.busqueda(corredorId, id);
  const corredor = await d.almacen.corredor(corredorId);
  if (!estado || estado.esperada || !corredor) return;
  try {
    const leidos = await d.almacen.anuncios(corredorId, id);
    if (leidos.length === 0 && estado.cortada) {
      // La detuvo antes de leer anuncios: no hay nada que revisar ni que avisarle a soporte.
      estado.resultado = { motivo: "detenida" };
    } else if (leidos.length === 0) {
      estado.resultado = { motivo: "sin_resultados", mensaje: sinResultados(estado.recorrido).message };
    } else {
      const r = await evaluarAnuncios(leidos, await parametros(d, corredor), d.cerebro);
      await d.almacen.guardarLeads(corredorId, semanaDe(ahora, corredor.zona_horaria), r.leads);
      await d.repo.registrarUso(corredorId, {
        llamadasClaude: r.llamadasClaude,
        tokensEntrada: r.consumo.tokensEntrada,
        tokensSalida: r.consumo.tokensSalida,
        costoClaudeUsd: r.consumo.costoUsd,
      });
      estado.resultado = {
        resumen: { duenos: r.leads.length, paginas: estado.recorrido.paginas, anuncios: leidos.length, candidatos: r.candidatos },
      };
      // Detenida por la persona: lo leído se guarda, pero la de la semana no cuenta como hecha (la sola vuelve a
      // intentarlo). Cortada por el tope de páginas, sí.
      if (estado.cortada !== "usuario") await d.almacen.marcarBusquedaHecha(corredorId);
    }
  } catch (e) {
    estado.resultado = { motivo: "servidor" };
    throw e;
  } finally {
    await d.almacen.guardarEstado(corredorId, id, estado);
    await d.almacen.terminar(corredorId, id, ahora);
  }
  return { ...estado.resultado, automatica: estado.automatica === true, cortada: estado.cortada ?? null };
}

export type Corte =
  | { ok: true; paginas: number }
  | { ok: false; motivo: "no_encontrada" };

/**
 * La extensión corta la búsqueda (Detener, la pestaña cerrada, la verificación dejada para después o el tope de
 * páginas). No se pierde lo leído: la búsqueda queda sin página esperada y la ruta corre terminarBusqueda en segundo
 * plano, igual que después de la última página. Solo una búsqueda en curso y del mismo corredor.
 */
export async function detenerBusqueda(
  d: DependenciasExtension,
  corredorId: string,
  id: string,
  motivo: "usuario" | "tope" = "usuario",
): Promise<Corte> {
  const estado = await d.almacen.busqueda(corredorId, id);
  if (!estado || !estado.esperada) return { ok: false, motivo: "no_encontrada" };
  estado.esperada = null;
  estado.cortada = motivo;
  await d.almacen.guardarEstado(corredorId, id, estado);
  return { ok: true, paginas: estado.recorrido.paginas };
}

export type Consulta =
  | { ok: true; listo: false; paginas: number }
  | { ok: true; listo: true; resumen: Resumen }
  | { ok: false; motivo: "no_encontrada" | "sin_resultados" | "servidor" | "detenida"; mensaje?: string };

/** La extensión pregunta si la búsqueda ya terminó. */
export async function consultarBusqueda(d: DependenciasExtension, corredorId: string, id: string): Promise<Consulta> {
  const estado = await d.almacen.estadoDe(corredorId, id);
  if (!estado) return { ok: false, motivo: "no_encontrada" };
  const r = estado.resultado;
  if (!r) return { ok: true, listo: false, paginas: estado.recorrido.paginas };
  return "resumen" in r ? { ok: true, listo: true, resumen: r.resumen } : { ok: false, ...r };
}

// --- Búsqueda semanal sola ---------------------------------------------------------------------------

export const DIAS_ENTRE_BUSQUEDAS = 7;
/** La extensión despierta cada ~6 horas: una vez que el servidor le dice "busca", no se lo repite en ese rato. */
export const HORAS_RESERVA_AUTO = 6;
const DIA_MS = 86_400_000;

export interface Programa {
  ok: true;
  buscar: boolean;
  /** Días desde la última búsqueda terminada (null si no hay ninguna). */
  ultimaDias: number | null;
}

/**
 * ¿Toca la búsqueda automática? Sí, si la última búsqueda terminada (manual o sola) fue hace más de 7 días. Al decir
 * que sí se reserva el turno por 6 horas en la base (reclamar_alerta, atómico): dos Chrome conectados al mismo
 * corredor no buscan a la vez, y si la búsqueda se corta (Cloudflare) se reintenta en el siguiente despertar.
 * Con `soloVer` (el popup) solo informa y no reserva nada.
 */
export async function programaBusqueda(d: DependenciasExtension, corredorId: string, opciones: { soloVer?: boolean; ahora?: Date } = {}): Promise<Programa> {
  const ahora = opciones.ahora ?? new Date();
  const ultima = await d.almacen.ultimaBusqueda(corredorId);
  const ultimaDias = ultima ? Math.max(0, Math.floor((ahora.getTime() - ultima.getTime()) / DIA_MS)) : null;
  if (opciones.soloVer) return { ok: true, buscar: false, ultimaDias };
  const vencida = !ultima || ahora.getTime() - ultima.getTime() >= DIAS_ENTRE_BUSQUEDAS * DIA_MS;
  if (!vencida) return { ok: true, buscar: false, ultimaDias };
  const corredor = await d.almacen.corredor(corredorId);
  if (!corredor || corredor.zonas_e24.length === 0) return { ok: true, buscar: false, ultimaDias };
  if (!(await hayPresupuestoHoy(d.repo, corredor))) return { ok: true, buscar: false, ultimaDias };
  return { ok: true, buscar: await d.almacen.reservarBusquedaAuto(corredorId, HORAS_RESERVA_AUTO), ultimaDias };
}
