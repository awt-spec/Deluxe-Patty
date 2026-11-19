import type { Cerebro } from "../asistente/cerebro";
import type { Consumo } from "../asistente/costo";
import type { Corredor, FichaParcial } from "../datos/tipos";
import type { TextosCasa } from "../sitio/casa";
import { faltantes, fichaLimpia, resumenFicha } from "./conversar";

// Casa nueva desde el chat de Patty con el texto pegado: Claude arma la ficha y los textos (mejorados o tal cual) y
// el código decide qué preguntar, una cosa a la vez: primero lo esencial (no se guarda sin eso), después lo que
// conviene tener (cuartos, baños, metros; se pregunta una sola vez y se puede saltar) y por último lo que la IA vio
// ambiguo. Las cifras las decide la ficha; el texto que pegó el corredor es dato, nunca instrucciones.

export type ModoTexto = "mejorar" | "tal_cual";
export const MAX_TEXTO_CASA = 8000;

const ESENCIAL = {
  operacion: "¿Es para venta o para alquiler?",
  tipo: "¿Qué es: casa, apartamento, lote…?",
  zona: "¿En qué zona está? (por ejemplo, Escazú, Santa Ana, Lindora)",
  precio: "¿Cuál es el precio? Dime también si es en dólares o colones.",
} as const;

const CONVIENE = {
  habitaciones: "¿Cuántos cuartos tiene? (Si no sabes, dime «después».)",
  banos: "¿Y cuántos baños?",
  m2_construccion: "¿Cuántos metros de construcción tiene?",
  m2_terreno: "¿De cuántos metros es el terreno?",
} as const;
type Conviene = keyof typeof CONVIENE;

/** Lo que conviene tener según el tipo: en un lote, el terreno; en una casa, cuartos, baños y metros. */
export function convieneTener(f: FichaParcial): Conviene[] {
  if (f.tipo === "lote" || f.tipo === "finca") return f.m2_terreno === null ? ["m2_terreno"] : [];
  if (f.tipo === "local" || f.tipo === "oficina") return f.m2_construccion === null ? ["m2_construccion"] : [];
  const falta: Conviene[] = [];
  if (f.habitaciones === null) falta.push("habitaciones");
  if (f.banos === null) falta.push("banos");
  if (f.m2_construccion === null) falta.push("m2_construccion");
  return falta;
}

/**
 * La siguiente pregunta: lo esencial siempre; lo que conviene y las dudas de la IA, solo si no se preguntaron ya
 * (`preguntadas` guarda la clave de cada pregunta hecha). null si ya no hay nada que preguntar.
 */
export function siguientePregunta(f: FichaParcial, dudas: string[], preguntadas: string[]): { clave: string; texto: string } | null {
  const esencial = faltantes(f)[0];
  if (esencial) return { clave: esencial, texto: ESENCIAL[esencial] };
  const conviene = convieneTener(f).find((c) => !preguntadas.includes(c));
  if (conviene) return { clave: conviene, texto: CONVIENE[conviene] };
  const duda = dudas.find((d) => !preguntadas.includes(`duda:${claveDuda(d)}`));
  return duda ? { clave: `duda:${claveDuda(duda)}`, texto: duda } : null;
}

/** Clave estable de una duda (para no repetirla aunque la IA la redacte con otra puntuación). */
export const claveDuda = (d: string) =>
  d
    .toLowerCase()
    .normalize("NFD")
    .replace(/[^a-z0-9 ]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 6)
    .join("-");

const corto = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const lista = (v: unknown) => (Array.isArray(v) ? v.map((x) => corto(x, 200)).filter(Boolean).slice(0, 20) : []);

/** Los textos vienen del navegador entre turnos: se validan campo por campo. */
export function textosLimpios(x: unknown): TextosCasa | null {
  if (!x || typeof x !== "object") return null;
  const t = x as Record<string, unknown>;
  const r: TextosCasa = {
    titulo_es: corto(t.titulo_es, 120),
    titulo_en: corto(t.titulo_en, 120),
    descripcion_es: corto(t.descripcion_es, 6000),
    descripcion_en: corto(t.descripcion_en, 6000),
    destacados_es: lista(t.destacados_es),
    destacados_en: lista(t.destacados_en),
  };
  return r.titulo_es && r.descripcion_es ? r : null;
}

export interface TurnoCasaTexto {
  ficha: FichaParcial;
  textos: TextosCasa;
  mensaje: string;
  /** Clave de la pregunta que se hizo (para no repetirla), o null si ya está lista. */
  pregunta: string | null;
  lista: boolean;
  /** Ya tiene lo esencial: se puede guardar aunque queden preguntas que conviene contestar. */
  puedeGuardar: boolean;
  resumen: string[];
  consumo: Consumo;
}

export async function conversarCasaTexto(
  cerebro: Pick<Cerebro, "casaDesdeTexto">,
  corredor: Corredor,
  i: {
    texto: string;
    modo: ModoTexto;
    mensajes: { autor: "corredor" | "asistente"; texto: string }[];
    actual: FichaParcial | null;
    preguntadas: string[];
  },
): Promise<TurnoCasaTexto> {
  const texto = i.texto.slice(0, MAX_TEXTO_CASA);
  const r = await cerebro.casaDesdeTexto(corredor, { texto, modo: i.modo, mensajes: i.mensajes.slice(-20), actual: i.actual });
  const ficha = fichaLimpia({ ...r.ficha, titulo: r.textos.titulo_es || r.ficha.titulo, descripcion: null });
  // "Tal cual": la descripción en español es el texto que pegó, sin tocarle palabras (lo garantiza el código).
  const descripcionEs = i.modo === "tal_cual" ? texto.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim() : r.textos.descripcion_es.trim();
  const textos: TextosCasa = {
    titulo_es: (r.textos.titulo_es || ficha.titulo || "").trim().slice(0, 120),
    titulo_en: r.textos.titulo_en.trim().slice(0, 120),
    descripcion_es: descripcionEs.slice(0, 6000),
    descripcion_en: r.textos.descripcion_en.trim().slice(0, 6000),
    destacados_es: lista(r.textos.destacados_es),
    destacados_en: lista(r.textos.destacados_en),
  };
  // La ficha del portal guarda la descripción en español (la misma que va al sitio).
  ficha.descripcion = textos.descripcion_es.slice(0, 3000) || null;
  const siguiente = siguientePregunta(ficha, r.dudas, i.preguntadas);
  return {
    ficha,
    textos,
    mensaje: siguiente?.texto ?? "Así quedó. ¿Está bien?",
    pregunta: siguiente?.clave ?? null,
    lista: !siguiente,
    puedeGuardar: faltantes(ficha).length === 0,
    resumen: resumenFicha(ficha),
    consumo: r.consumo,
  };
}
