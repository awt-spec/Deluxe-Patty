import type { Cerebro } from "../asistente/cerebro";
import type { Consumo } from "../asistente/costo";
import type { Corredor, FichaParcial } from "../datos/tipos";
import { ETIQUETA_TIPO, leerPropiedad, type DatosPropiedad, type Validado } from "../panel/formularios";
import { precio as formatoPrecio } from "../formato";

// "Agregar casa" conversando: el corredor cuenta la propiedad con sus palabras, Claude llena la ficha y
// el código decide si ya se puede guardar (venta o alquiler, tipo, zona y precio) o qué preguntar.

export const MAX_MENSAJES_FICHA = 30;
export const MAX_TEXTO_FICHA = 2000;

export const FICHA_VACIA: FichaParcial = {
  titulo: null,
  tipo: null,
  operacion: null,
  precio: null,
  moneda: null,
  provincia: null,
  canton: null,
  distrito: null,
  zona: null,
  habitaciones: null,
  banos: null,
  m2_construccion: null,
  m2_terreno: null,
  descripcion: null,
  amenidades: [],
};

const PREGUNTAS = {
  operacion: "¿Es para venta o para alquiler?",
  tipo: "¿Qué es: casa, apartamento, lote…?",
  zona: "¿En qué zona está?",
  precio: "¿Cuál es el precio?",
} as const;

/** Lo esencial que falta, en el orden en que se pregunta. */
export function faltantes(f: FichaParcial): (keyof typeof PREGUNTAS)[] {
  const falta: (keyof typeof PREGUNTAS)[] = [];
  if (!f.operacion) falta.push("operacion");
  if (!f.tipo) falta.push("tipo");
  if (!f.zona && !f.canton) falta.push("zona");
  if (f.precio === null || f.precio <= 0) falta.push("precio");
  return falta;
}

const TIPOS = new Set(["casa", "apartamento", "lote", "local", "oficina", "finca", "otro"]);
const corto = (v: unknown, max = 200) => {
  const t = typeof v === "string" ? v.trim().slice(0, max) : "";
  return t || null;
};
const cifra = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null);

/** La ficha viene del navegador entre turnos: se valida campo por campo. */
export function fichaLimpia(x: unknown): FichaParcial {
  const f = (x ?? {}) as Record<string, unknown>;
  return {
    titulo: corto(f.titulo, 120),
    tipo: TIPOS.has(f.tipo as string) ? (f.tipo as FichaParcial["tipo"]) : null,
    operacion: f.operacion === "venta" || f.operacion === "alquiler" ? f.operacion : null,
    precio: cifra(f.precio),
    moneda: f.moneda === "CRC" ? "CRC" : f.moneda === "USD" ? "USD" : null,
    provincia: corto(f.provincia),
    canton: corto(f.canton),
    distrito: corto(f.distrito),
    zona: corto(f.zona),
    habitaciones: cifra(f.habitaciones) === null ? null : Math.round(f.habitaciones as number),
    banos: cifra(f.banos) === null ? null : Math.round((f.banos as number) * 2) / 2,
    m2_construccion: cifra(f.m2_construccion),
    m2_terreno: cifra(f.m2_terreno),
    descripcion: corto(f.descripcion, 3000),
    amenidades: (Array.isArray(f.amenidades) ? f.amenidades : [])
      .map((a) => corto(a, 80))
      .filter((a): a is string => !!a)
      .slice(0, 20),
  };
}

function tituloPorDefecto(f: FichaParcial): string {
  const tipo = f.tipo ? ETIQUETA_TIPO[f.tipo] : "Propiedad";
  const donde = f.zona ?? f.canton;
  return donde ? `${tipo} en ${donde}` : tipo;
}

/** La ficha en palabras de todos los días, para que el corredor la confirme. */
export function resumenFicha(f: FichaParcial): string[] {
  const n = (v: number) => String(v).replace(".", ",");
  const lineas = [
    f.titulo ?? tituloPorDefecto(f),
    [f.tipo && ETIQUETA_TIPO[f.tipo], f.operacion && (f.operacion === "venta" ? "en venta" : "en alquiler")]
      .filter(Boolean)
      .join(" "),
    [f.distrito, f.canton ?? f.zona, f.provincia].filter(Boolean).join(", "),
    f.precio !== null
      ? `${formatoPrecio(f.precio, f.moneda ?? "USD")}${f.operacion === "alquiler" ? " al mes" : ""}`
      : "",
    [
      f.habitaciones !== null ? `${f.habitaciones} ${f.habitaciones === 1 ? "cuarto" : "cuartos"}` : null,
      f.banos !== null ? `${n(f.banos)} ${f.banos === 1 ? "baño" : "baños"}` : null,
      f.m2_construccion !== null ? `${n(f.m2_construccion)} m² de construcción` : null,
      f.m2_terreno !== null ? `${n(f.m2_terreno)} m² de terreno` : null,
    ]
      .filter(Boolean)
      .join(" · "),
    f.amenidades.join(" · "),
    f.descripcion ?? "",
  ];
  return lineas.filter((l) => l.trim());
}

/** Datos listos para la tabla, con las mismas reglas que el formulario. */
export function datosParaGuardar(f: FichaParcial, codigo: string): Validado<DatosPropiedad> {
  const valores: Record<string, string> = {
    codigo,
    titulo: f.titulo ?? tituloPorDefecto(f),
    tipo: f.tipo ?? "",
    operacion: f.operacion ?? "",
    precio: f.precio === null ? "" : String(f.precio),
    moneda: f.moneda ?? "USD",
    provincia: f.provincia ?? "",
    canton: f.canton ?? "",
    distrito: f.distrito ?? "",
    zona: f.zona ?? f.canton ?? "",
    habitaciones: f.habitaciones === null ? "" : String(f.habitaciones),
    banos: f.banos === null ? "" : String(f.banos),
    m2_construccion: f.m2_construccion === null ? "" : String(f.m2_construccion),
    m2_terreno: f.m2_terreno === null ? "" : String(f.m2_terreno),
    descripcion: f.descripcion ?? "",
    amenidades: f.amenidades.join("\n"),
    url_e24: "",
    estado: "activa",
  };
  return leerPropiedad({ get: (k) => valores[k] ?? null });
}

export interface TurnoFicha {
  ficha: FichaParcial;
  /** Lo que la asistente le dice al corredor en el chat. */
  mensaje: string;
  /** true si ya tiene lo esencial y se le puede mostrar el resumen para guardar. */
  lista: boolean;
  consumo: Consumo;
}

export async function conversarFicha(
  cerebro: Cerebro,
  corredor: Corredor,
  mensajes: { autor: "corredor" | "asistente"; texto: string }[],
  actual: FichaParcial | null,
): Promise<TurnoFicha> {
  const r = await cerebro.fichaConversada(corredor, mensajes.slice(-MAX_MENSAJES_FICHA), actual);
  const ficha = fichaLimpia(r.ficha);
  const falta = faltantes(ficha);
  if (falta.length > 0) {
    return { ficha, mensaje: r.pregunta ?? PREGUNTAS[falta[0]], lista: false, consumo: r.consumo };
  }
  return { ficha, mensaje: "Así quedó. ¿Está bien?", lista: true, consumo: r.consumo };
}
