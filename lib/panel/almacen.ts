// Lectura cuidadosa de lo que el panel guarda en el navegador (localStorage / sessionStorage). Lo guardado puede venir
// de una versión vieja, de una extensión o de una edición a mano: se valida la FORMA antes de usarlo y, si no sirve,
// se borra la clave para que la pantalla no quede rota para siempre (antes un historial de Patty mal formado dejaba
// /panel/patty en "Algo no cargó bien" aunque se recargara).

/** Valida y normaliza un valor ya leído del JSON; `null` si no sirve. */
export type Validador<T> = (valor: unknown) => T | null;

type Almacen = Pick<Storage, "getItem" | "removeItem">;

/**
 * Lee `clave` como JSON y la pasa por `validar`. Si falta, devuelve null; si el JSON está roto o la forma no sirve,
 * borra la clave y devuelve null. Nunca lanza (el almacén puede no existir: modo privado, permisos, vista previa).
 */
export function leerAlmacen<T>(almacen: Almacen | null | undefined, clave: string, validar: Validador<T>): T | null {
  let crudo: string | null = null;
  try {
    crudo = almacen?.getItem(clave) ?? null;
  } catch {
    // Sin acceso al almacén (modo privado, sitio bloqueado): se sigue como si no hubiera nada guardado.
    return null;
  }
  if (crudo === null) return null;
  let valor: T | null = null;
  try {
    valor = validar(JSON.parse(crudo));
  } catch {
    valor = null;
  }
  if (valor === null) {
    try {
      almacen?.removeItem(clave);
    } catch {
      // Si no se puede borrar, la próxima lectura lo vuelve a descartar: no rompe nada.
    }
  }
  return valor;
}

/** El almacén del navegador, o null si no existe o no deja usarlo. */
export function almacenLocal(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    // Acceder a localStorage puede lanzar (cookies bloqueadas): se trabaja sin recordar.
    return null;
  }
}

export function almacenSesion(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    // Igual que localStorage: sin almacén, sin borradores.
    return null;
  }
}

export const esTexto = (x: unknown): x is string => typeof x === "string";
export const esObjeto = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const opcional = (x: unknown, ok: (y: unknown) => boolean) => x === undefined || ok(x);
const textoONulo = (x: unknown) => x === null || typeof x === "string";

// ---- Chat de Patty ----

export type AdjuntoGuardado = { tipo: "imagen" | "pdf" | "texto"; nombre: string; miniatura?: string };
export type TurnoGuardado = {
  autor: "corredor" | "asistente";
  texto: string;
  hora?: string;
  adjuntos?: AdjuntoGuardado[];
  pdf?: string | null;
  png?: string | null;
  casa?: string[];
  id?: string;
  /** Fotos que se subieron al sitio web desde el chat (direcciones del sitio) y el enlace de la casa allá. */
  sitio?: { fotos: string[]; url: string | null };
};

const esHttps = (x: unknown): x is string => typeof x === "string" && x.length <= 1000 && /^https:\/\/[^\s"'<>]+$/.test(x);

/** El resultado de un envío al sitio: solo direcciones https (se muestran como imagen y enlace). */
function sitioValido(s: unknown): TurnoGuardado["sitio"] | null {
  if (!esObjeto(s) || !Array.isArray(s.fotos) || s.fotos.length > 12 || !s.fotos.every(esHttps)) return null;
  if (!(s.url === null || s.url === undefined || esHttps(s.url))) return null;
  return { fotos: s.fotos as string[], url: (s.url ?? null) as string | null };
}

function adjuntoValido(a: unknown): AdjuntoGuardado | null {
  if (!esObjeto(a) || !["imagen", "pdf", "texto"].includes(a.tipo as string) || !esTexto(a.nombre)) return null;
  // La miniatura solo puede ser una imagen en línea (nunca una dirección de afuera).
  const mini = typeof a.miniatura === "string" && a.miniatura.startsWith("data:image/") ? a.miniatura : undefined;
  return { tipo: a.tipo as AdjuntoGuardado["tipo"], nombre: a.nombre, ...(mini ? { miniatura: mini } : {}) };
}

/** Un turno del chat con los campos y tipos esperados; null si no lo es. */
export function turnoValido(t: unknown): TurnoGuardado | null {
  if (!esObjeto(t) || (t.autor !== "corredor" && t.autor !== "asistente") || !esTexto(t.texto)) return null;
  if (!opcional(t.hora, esTexto) || !opcional(t.pdf, textoONulo) || !opcional(t.png, textoONulo) || !opcional(t.id, esTexto)) return null;
  if (!opcional(t.adjuntos, Array.isArray) || !opcional(t.casa, (c) => Array.isArray(c) && c.every(esTexto))) return null;
  const adjuntos = Array.isArray(t.adjuntos) ? t.adjuntos.map(adjuntoValido) : undefined;
  if (adjuntos?.some((a) => a === null)) return null;
  const sitio = t.sitio === undefined ? undefined : sitioValido(t.sitio);
  if (sitio === null) return null;
  const hora = esTexto(t.hora) && !Number.isNaN(Date.parse(t.hora)) ? t.hora : undefined;
  return {
    autor: t.autor,
    texto: t.texto,
    ...(hora ? { hora } : {}),
    ...(adjuntos ? { adjuntos: adjuntos as AdjuntoGuardado[] } : {}),
    ...(t.pdf !== undefined ? { pdf: t.pdf as string | null } : {}),
    ...(t.png !== undefined ? { png: t.png as string | null } : {}),
    ...(t.casa ? { casa: t.casa as string[] } : {}),
    ...(esTexto(t.id) ? { id: t.id } : {}),
    ...(sitio ? { sitio } : {}),
  };
}

/**
 * La conversación guardada: un arreglo de turnos. Los turnos que no tienen la forma se descartan (los demás se
 * conservan); si no es un arreglo, no sirve. `limpiar`: había algo inválido y conviene reescribir lo guardado.
 */
export function turnosGuardados(valor: unknown, max = 40): { turnos: TurnoGuardado[]; limpiar: boolean } | null {
  if (!Array.isArray(valor)) return null;
  const turnos = valor.map(turnoValido).filter((t): t is TurnoGuardado => t !== null);
  return { turnos: turnos.slice(-max), limpiar: turnos.length !== valor.length };
}

/** Casa nueva con el texto pegado (fotos + texto → portal y sitio): en qué paso va y lo ya preguntado. */
export type CasaTextoGuardada = {
  paso: "texto" | "modo" | "preguntas";
  texto: string | null;
  modo: "mejorar" | "tal_cual" | null;
  textos: Record<string, unknown> | null;
  preguntadas: string[];
  sitio: boolean;
  puedeGuardar: boolean;
  resumen: string[];
};

export type CasaGuardada<F> = {
  ficha: F | null;
  mensajes: { autor: "corredor" | "asistente"; texto: string }[];
  tarjeta: string | null;
  conTexto?: CasaTextoGuardada | null;
};

function casaTextoValida(v: unknown): CasaTextoGuardada | null {
  if (!esObjeto(v)) return null;
  if (v.paso !== "texto" && v.paso !== "modo" && v.paso !== "preguntas") return null;
  const lista = (x: unknown) => (Array.isArray(x) ? x.filter(esTexto).map((t) => t.slice(0, 400)).slice(0, 40) : []);
  return {
    paso: v.paso,
    texto: esTexto(v.texto) ? v.texto.slice(0, 8000) : null,
    modo: v.modo === "mejorar" || v.modo === "tal_cual" ? v.modo : null,
    textos: esObjeto(v.textos) ? v.textos : null,
    preguntadas: lista(v.preguntadas),
    sitio: v.sitio === true,
    puedeGuardar: v.puedeGuardar === true,
    resumen: lista(v.resumen),
  };
}

/** La casa que se estaba cargando desde el chat. La ficha la revisa el servidor al seguir; aquí, que sea un objeto. */
export function casaGuardada<F>(valor: unknown): CasaGuardada<F> | null {
  if (!esObjeto(valor) || !Array.isArray(valor.mensajes)) return null;
  if (!(valor.ficha === null || valor.ficha === undefined || esObjeto(valor.ficha))) return null;
  if (!(valor.tarjeta === null || valor.tarjeta === undefined || esTexto(valor.tarjeta))) return null;
  const mensajes = valor.mensajes.filter(
    (m): m is { autor: "corredor" | "asistente"; texto: string } => esObjeto(m) && (m.autor === "corredor" || m.autor === "asistente") && esTexto(m.texto),
  );
  if (mensajes.length !== valor.mensajes.length) return null;
  return {
    ficha: (valor.ficha ?? null) as F | null,
    mensajes,
    tarjeta: (valor.tarjeta ?? null) as string | null,
    ...(casaTextoValida(valor.conTexto) ? { conTexto: casaTextoValida(valor.conTexto) } : {}),
  };
}
