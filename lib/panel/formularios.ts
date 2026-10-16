import { aUtc, minutosDe, type FechaLocal } from "../agenda/tiempo";
import type { Foto } from "../datos/tipos";

// Lectura y validación de los formularios del panel. Funciones puras: las server actions solo guardan
// lo que sale de aquí.

export type Validado<T> = { ok: true; valor: T } | { ok: false; motivo: string };

const TIPOS = ["casa", "apartamento", "lote", "local", "oficina", "finca", "otro"] as const;
const OPERACIONES = ["venta", "alquiler"] as const;
const ESTADOS = ["activa", "reservada", "vendida", "alquilada", "inactiva"] as const;
const MONEDAS = ["USD", "CRC"] as const;

export const ETIQUETA_TIPO: Record<(typeof TIPOS)[number], string> = {
  casa: "Casa",
  apartamento: "Apartamento",
  lote: "Lote",
  local: "Local",
  oficina: "Oficina",
  finca: "Finca",
  otro: "Otro",
};

export const ETIQUETA_ESTADO: Record<(typeof ESTADOS)[number], string> = {
  activa: "Activa",
  reservada: "Reservada",
  vendida: "Vendida",
  alquilada: "Alquilada",
  inactiva: "Pausada",
};

export { ESTADOS, MONEDAS, OPERACIONES, TIPOS };

export interface DatosPropiedad {
  codigo: string;
  titulo: string;
  tipo: (typeof TIPOS)[number];
  operacion: (typeof OPERACIONES)[number];
  precio: number | null;
  moneda: (typeof MONEDAS)[number];
  provincia: string | null;
  canton: string | null;
  distrito: string | null;
  zona: string | null;
  habitaciones: number | null;
  banos: number | null;
  m2_construccion: number | null;
  m2_terreno: number | null;
  descripcion: string | null;
  amenidades: string[];
  url_e24: string | null;
  estado: (typeof ESTADOS)[number];
}

type Campos = { get(nombre: string): unknown };

const texto = (f: Campos, k: string) => String(f.get(k) ?? "").trim();
const opcional = (f: Campos, k: string) => texto(f, k) || null;

/** "450.000", "450,000", "$ 450000" o "3,5" → número. Vacío → null. */
export function leerNumero(valor: string): number | null | "invalido" {
  const limpio = valor.replace(/[$\s₡]|USD|CRC/gi, "");
  if (!limpio) return null;
  let cifra = limpio;
  if (/^\d{1,3}(?:[.,]\d{3})+$/.test(cifra)) cifra = cifra.replace(/[.,]/g, "");
  else cifra = cifra.replace(",", ".");
  const n = Number(cifra);
  return Number.isFinite(n) && n >= 0 ? n : "invalido";
}

function uno<T extends string>(valor: string, permitidos: readonly T[]): T | null {
  return (permitidos as readonly string[]).includes(valor) ? (valor as T) : null;
}

export function leerPropiedad(f: Campos): Validado<DatosPropiedad> {
  const codigo = texto(f, "codigo").toUpperCase().replace(/\s+/g, "-");
  const titulo = texto(f, "titulo");
  if (!/^[A-Z0-9][A-Z0-9-]{1,19}$/.test(codigo)) {
    return { ok: false, motivo: "El código lleva de 2 a 20 letras, números o guiones, sin espacios (por ejemplo DLX-014)." };
  }
  if (!titulo) return { ok: false, motivo: "Falta el título." };

  const tipo = uno(texto(f, "tipo"), TIPOS);
  const operacion = uno(texto(f, "operacion"), OPERACIONES);
  const moneda = uno(texto(f, "moneda") || "USD", MONEDAS);
  const estado = uno(texto(f, "estado") || "activa", ESTADOS);
  if (!tipo || !operacion || !moneda || !estado) return { ok: false, motivo: "Revisa el tipo, la operación y el estado." };

  const numeros: Record<string, number | null> = {};
  const nombres: Record<string, string> = {
    precio: "el precio",
    habitaciones: "las habitaciones",
    banos: "los baños",
    m2_construccion: "los m² de construcción",
    m2_terreno: "los m² de terreno",
  };
  for (const [k, nombre] of Object.entries(nombres)) {
    const n = leerNumero(texto(f, k));
    if (n === "invalido") return { ok: false, motivo: `Revisa ${nombre}: escribe solo el número.` };
    numeros[k] = n;
  }
  if (numeros.precio === 0) return { ok: false, motivo: "El precio no puede ser cero: déjalo vacío si no se publica." };
  if (numeros.habitaciones !== null && !Number.isInteger(numeros.habitaciones)) {
    return { ok: false, motivo: "Las habitaciones van sin decimales." };
  }
  if (numeros.banos !== null && !Number.isInteger(numeros.banos * 2)) {
    return { ok: false, motivo: "Los baños van enteros o con medio (por ejemplo 2,5)." };
  }
  for (const k of ["m2_construccion", "m2_terreno"]) if (numeros[k] === 0) numeros[k] = null;

  const url = opcional(f, "url_e24");
  if (url && !/^https:\/\/(www\.)?encuentra24\.com\//i.test(url)) {
    return { ok: false, motivo: "El enlace tiene que ser de encuentra24.com." };
  }

  return {
    ok: true,
    valor: {
      codigo,
      titulo,
      tipo,
      operacion,
      precio: numeros.precio,
      moneda,
      provincia: opcional(f, "provincia"),
      canton: opcional(f, "canton"),
      distrito: opcional(f, "distrito"),
      zona: opcional(f, "zona"),
      habitaciones: numeros.habitaciones,
      banos: numeros.banos,
      m2_construccion: numeros.m2_construccion,
      m2_terreno: numeros.m2_terreno,
      descripcion: opcional(f, "descripcion"),
      amenidades: texto(f, "amenidades")
        .split(/[\n,]/)
        .map((a) => a.trim())
        .filter(Boolean),
      url_e24: url,
      estado,
    },
  };
}

/** Siguiente código libre con el prefijo del corredor: P-001, P-002… */
export function siguienteCodigo(existentes: string[], prefijo = "P"): string {
  const usados = new Set(existentes.map((c) => c.toUpperCase()));
  for (let n = existentes.length + 1; ; n++) {
    const codigo = `${prefijo}-${String(n).padStart(3, "0")}`;
    if (!usados.has(codigo)) return codigo;
  }
}

// --- Fotos -----------------------------------------------------------------------------------------

export const MAX_FOTOS_PROPIEDAD = 30;

/** Las fotos en su orden, renumeradas 1…n. */
export function ordenarFotos(fotos: Foto[]): Foto[] {
  return [...fotos]
    .map((f, i) => ({ f, i }))
    .sort((a, b) => (a.f.orden ?? a.i + 1) - (b.f.orden ?? b.i + 1) || a.i - b.i)
    .map(({ f }, i) => ({ ...f, orden: i + 1 }));
}

export function agregarFotos(fotos: Foto[], urls: string[]): Foto[] {
  const actuales = ordenarFotos(fotos);
  const nuevas = urls.filter((u) => !actuales.some((f) => f.url === u));
  return ordenarFotos([...actuales, ...nuevas.map((url, i) => ({ url, orden: actuales.length + i + 1 }))]).slice(
    0,
    MAX_FOTOS_PROPIEDAD,
  );
}

export function moverFoto(fotos: Foto[], url: string, accion: "principal" | "subir" | "bajar" | "quitar"): Foto[] {
  const lista = ordenarFotos(fotos);
  const i = lista.findIndex((f) => f.url === url);
  if (i < 0) return lista;
  if (accion === "quitar") lista.splice(i, 1);
  else {
    const destino = accion === "principal" ? 0 : accion === "subir" ? Math.max(0, i - 1) : Math.min(lista.length - 1, i + 1);
    const [foto] = lista.splice(i, 1);
    lista.splice(destino, 0, foto);
  }
  return lista.map((f, n) => ({ ...f, orden: n + 1 }));
}

/** Ruta de una foto original en el bucket: siempre dentro de la carpeta del corredor y la propiedad. */
export function rutaFotoOriginal(propiedadId: string, nombreArchivo: string, ahora = Date.now()): string {
  const extension = /\.(jpe?g|png|webp|heic)$/i.exec(nombreArchivo)?.[1]?.toLowerCase().replace("jpeg", "jpg") ?? "jpg";
  const azar = Math.random().toString(36).slice(2, 8);
  return `${propiedadId}/originales/${ahora}-${azar}.${extension}`;
}

/** Una ruta subida es válida solo si cae en la carpeta de esa propiedad. */
export function rutaDePropiedad(ruta: string, propiedadId: string): boolean {
  return new RegExp(`^${propiedadId}/originales/[0-9]+-[a-z0-9]+\\.(jpg|png|webp|heic)$`).test(ruta);
}

// --- Horario y bloqueos ----------------------------------------------------------------------------

export const DIAS_SEMANA = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

export interface Franja {
  dia_semana: number;
  hora_inicio: string;
  hora_fin: string;
}

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

export function leerFranja(f: Campos, existentes: Franja[]): Validado<Franja> {
  const dia = Number(texto(f, "dia"));
  const inicio = texto(f, "desde");
  const fin = texto(f, "hasta");
  if (!Number.isInteger(dia) || dia < 0 || dia > 6) return { ok: false, motivo: "Elige el día." };
  if (!HORA.test(inicio) || !HORA.test(fin)) return { ok: false, motivo: "Revisa las horas." };
  if (minutosDe(fin) <= minutosDe(inicio)) return { ok: false, motivo: "La hora de fin tiene que ser después del inicio." };
  const choca = existentes.some(
    (e) => e.dia_semana === dia && minutosDe(inicio) < minutosDe(e.hora_fin) && minutosDe(e.hora_inicio) < minutosDe(fin),
  );
  if (choca) return { ok: false, motivo: `Esa franja se encima con otra del ${DIAS_SEMANA[dia].toLowerCase()}.` };
  return { ok: true, valor: { dia_semana: dia, hora_inicio: inicio, hora_fin: fin } };
}

function fechaDe(valor: string): FechaLocal | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (d.getUTCMonth() + 1 !== Number(m[2])) return null;
  return { anio: Number(m[1]), mes: Number(m[2]), dia: Number(m[3]), diaSemana: d.getUTCDay() };
}

/**
 * Un bloqueo de la agenda en hora local del corredor. Sin horas, bloquea los días completos
 * (del inicio del primer día al final del último).
 */
export function leerBloqueo(
  f: Campos,
  zona: string,
  ahora: Date,
): Validado<{ inicio: Date; fin: Date; motivo: string | null }> {
  const desde = fechaDe(texto(f, "fecha_desde"));
  const hasta = fechaDe(texto(f, "fecha_hasta") || texto(f, "fecha_desde"));
  if (!desde || !hasta) return { ok: false, motivo: "Revisa las fechas." };
  const horaDesde = texto(f, "hora_desde");
  const horaHasta = texto(f, "hora_hasta");
  if ((horaDesde && !HORA.test(horaDesde)) || (horaHasta && !HORA.test(horaHasta))) {
    return { ok: false, motivo: "Revisa las horas." };
  }
  const inicio = aUtc(desde, horaDesde ? minutosDe(horaDesde) : 0, zona);
  const fin = aUtc(hasta, horaHasta ? minutosDe(horaHasta) : 24 * 60, zona);
  if (fin <= inicio) return { ok: false, motivo: "El final tiene que ser después del inicio." };
  if (fin <= ahora) return { ok: false, motivo: "Ese bloqueo ya pasó." };
  return { ok: true, valor: { inicio, fin, motivo: opcional(f, "motivo") } };
}

// --- Corredores conocidos ----------------------------------------------------------------------------

/** Teléfono en formato internacional. Ocho dígitos sin código de país se toman de Costa Rica. */
export function normalizarTelefono(valor: string): string | null {
  const digitos = valor.replace(/[^\d+]/g, "");
  if (/^\+[1-9]\d{7,14}$/.test(digitos)) return digitos;
  const solo = digitos.replace(/\D/g, "");
  if (/^[245678]\d{7}$/.test(solo)) return `+506${solo}`;
  if (/^506[245678]\d{7}$/.test(solo)) return `+${solo}`;
  return null;
}

export interface CorredorConocido {
  nombre: string | null;
  telefono: string | null;
  empresa: string | null;
}

/**
 * Lista pegada, uno por línea: "Nombre, teléfono, empresa" en cualquier orden (el teléfono se
 * reconoce por sus dígitos). Devuelve los válidos y las líneas que no se entendieron.
 */
export function leerCorredoresConocidos(texto: string): { corredores: CorredorConocido[]; ignoradas: string[] } {
  const corredores: CorredorConocido[] = [];
  const ignoradas: string[] = [];
  const vistos = new Set<string>();
  for (const linea of texto.split("\n").map((l) => l.trim()).filter(Boolean)) {
    const partes = linea.split(/[,;\t]|\s[-–]\s/).map((p) => p.trim()).filter(Boolean);
    let telefono: string | null = null;
    let telefonoMalo = false;
    const otras: string[] = [];
    for (const p of partes) {
      // Con tres dígitos o más es un intento de teléfono (RE/MAX o "Casa 2" no lo son).
      if ((p.match(/\d/g) ?? []).length < 3) otras.push(p);
      else if (!telefono && normalizarTelefono(p)) telefono = normalizarTelefono(p);
      else telefonoMalo = true;
    }
    const [nombre = null, empresa = null] = otras;
    if (telefonoMalo || (!telefono && !nombre)) {
      ignoradas.push(linea);
      continue;
    }
    const clave = telefono ?? `n:${nombre!.toLowerCase()}`;
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    corredores.push({ nombre, telefono, empresa });
  }
  return { corredores, ignoradas };
}
