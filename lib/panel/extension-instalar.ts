// Instalar y conectar la extensión de Chrome (extension/) desde el panel: reglas puras, sin navegador, para
// poder probarlas. Las usan el asistente paso a paso de /panel/duenos/extension y la tarjeta de estado de
// Dueños directos.
//
// Canal página ↔ extensión: la extensión tiene un content script (extension/canal.js + extension/panel.js) que
// corre solo en las páginas /panel/duenos* del panel. La página y ese script se hablan con window.postMessage:
//  - página → extensión: "hola" (¿estás?), "conectar" con un código de un solo uso (el mismo del método a mano) y
//    "busqueda" con una orden sin parámetros (estado, pausar, seguir, detener, buscar; desde la versión 1.3.0);
//  - extensión → página: "presente" (versión, si está conectada y a quién), "resultado" de la conexión y "busqueda"
//    (cómo va la búsqueda de dueños: fase, página, total, tiempo que falta).
// El permiso que la extensión canjea con el código nunca vuelve a la página.

/** Quién habla en cada sentido (se repite en extension/canal.js; una prueba revisa que coincidan). */
export const CANAL = { pagina: "panel-duenos", extension: "buscador-duenos" } as const;

export type Sistema = "windows" | "mac" | "linux" | "chromeos" | "otro";
export type Navegador = "chrome" | "edge" | "brave" | "opera" | "samsung" | "safari" | "firefox" | "otro";

export interface Entorno {
  sistema: Sistema;
  navegador: Navegador;
  /** Teléfono o tableta: ahí no se instalan extensiones. */
  movil: boolean;
}

/** Lo que el navegador dice de sí mismo además del userAgent (navigator.userAgentData, toques, Brave). */
export interface Pistas {
  plataforma?: string;
  movil?: boolean;
  marcas?: string[];
  /** navigator.maxTouchPoints: un iPad se presenta como Mac, pero con pantalla táctil. */
  toques?: number;
  /** Brave se presenta como Chrome; se reconoce por navigator.brave. */
  brave?: boolean;
}

export function detectarEntorno(ua: string, pistas: Pistas = {}): Entorno {
  const plataforma = (pistas.plataforma ?? "").toLowerCase();
  const marcas = (pistas.marcas ?? []).map((m) => m.toLowerCase());
  const ipad = /Macintosh/.test(ua) && (pistas.toques ?? 0) > 1;
  const movil =
    pistas.movil === true || ipad || /Android|iPhone|iPad|iPod|Mobile|Silk|Kindle|Opera Mini|IEMobile/i.test(ua);

  let sistema: Sistema = "otro";
  if (plataforma.includes("windows") || /Windows NT/.test(ua)) sistema = "windows";
  else if (plataforma.includes("chrome os") || plataforma.includes("chromeos") || /CrOS/.test(ua)) sistema = "chromeos";
  else if (plataforma.includes("macos") || plataforma.includes("mac") || /Macintosh|Mac OS X/.test(ua)) sistema = "mac";
  else if (plataforma.includes("linux") || /Linux|X11/.test(ua)) sistema = "linux";

  let navegador: Navegador = "otro";
  if (/Firefox\/|FxiOS\//.test(ua)) navegador = "firefox";
  else if (/Edg(e|A|iOS)?\//.test(ua) || marcas.some((m) => m.includes("edge"))) navegador = "edge";
  else if (/OPR\/|Opera/.test(ua) || marcas.some((m) => m.includes("opera"))) navegador = "opera";
  else if (/SamsungBrowser\//.test(ua)) navegador = "samsung";
  else if (pistas.brave || marcas.some((m) => m.includes("brave"))) navegador = "brave";
  else if (/CriOS\//.test(ua) || /Chrome\/|Chromium\//.test(ua)) navegador = "chrome";
  else if (/Safari\//.test(ua) && /Version\//.test(ua)) navegador = "safari";
  return { sistema, navegador, movil };
}

/** Los navegadores que cargan una extensión de Chrome descomprimida. */
export const esChromium = (n: Navegador) => n === "chrome" || n === "edge" || n === "brave" || n === "opera";

export type Lugar = "aqui" | "movil" | "otro_navegador";

/** ¿Se puede instalar en este aparato y este navegador? */
export function dondeInstalar(e: Entorno): Lugar {
  if (e.movil) return "movil";
  return esChromium(e.navegador) ? "aqui" : "otro_navegador";
}

/** La dirección de la página de extensiones (chrome:// no se puede enlazar: se copia y se pega). */
export function direccionExtensiones(n: Navegador): string {
  if (n === "edge") return "edge://extensions";
  if (n === "brave") return "brave://extensions";
  if (n === "opera") return "opera://extensions";
  return "chrome://extensions";
}

export function nombreNavegador(n: Navegador): string {
  return { chrome: "Chrome", edge: "Edge", brave: "Brave", opera: "Opera", samsung: "Samsung Internet", safari: "Safari", firefox: "Firefox", otro: "este navegador" }[n];
}

/** Compara "1.2.0" con "1.10.0" número por número. Lo que no es número cuenta como 0. */
export function compararVersiones(a: string, b: string): -1 | 0 | 1 {
  const pa = a.split(".").map((x) => Number.parseInt(x, 10) || 0);
  const pb = b.split(".").map((x) => Number.parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

// --- Lo que se sabe de la extensión -------------------------------------------------------------------

/** Lo que la página ve de la extensión en este navegador. */
export type Deteccion =
  | { estado: "buscando" }
  | { estado: "no" }
  /** La página llegó por navegación interna desde otra pantalla: el content script no se cargó y no se puede saber. */
  | { estado: "no_se_sabe" }
  | { estado: "si"; version: string; conectada: boolean; corredor: string };

/** Lo que sabe el servidor (extension_conexiones y la última búsqueda). */
export interface DelServidor {
  conectada: boolean;
  ultimaBusquedaDias: number | null;
}

export type EstadoExtension =
  | { tipo: "buscando" }
  | { tipo: "conectada"; corredor: string; ultimaBusquedaDias: number | null }
  | { tipo: "sin_conectar" }
  | { tipo: "no_instalada" }
  /** Instalada con el canal, pero hay una versión más nueva en el panel. */
  | { tipo: "nueva_version"; version: string; conectada: boolean }
  /** El servidor la tiene conectada pero este navegador no la ve: versión anterior (sin canal) u otra computadora. */
  | { tipo: "vieja" }
  /** Sin poder mirar el navegador y sin conexión en el servidor. */
  | { tipo: "sin_conectar_servidor" };

export function estadoExtension(d: Deteccion, s: DelServidor, versionActual: string): EstadoExtension {
  if (d.estado === "buscando") return { tipo: "buscando" };
  if (d.estado === "no_se_sabe") {
    return s.conectada ? { tipo: "conectada", corredor: "", ultimaBusquedaDias: s.ultimaBusquedaDias } : { tipo: "sin_conectar_servidor" };
  }
  if (d.estado === "no") return s.conectada ? { tipo: "vieja" } : { tipo: "no_instalada" };
  const conectada = d.conectada && s.conectada;
  if (compararVersiones(d.version, versionActual) < 0) return { tipo: "nueva_version", version: versionActual, conectada };
  return conectada ? { tipo: "conectada", corredor: d.corredor, ultimaBusquedaDias: s.ultimaBusquedaDias } : { tipo: "sin_conectar" };
}

/** ¿La extensión está en este navegador (con el canal)? */
export const instalada = (e: EstadoExtension) => e.tipo === "conectada" || e.tipo === "sin_conectar" || e.tipo === "nueva_version";

/** Hay que actualizarla: el asistente corto de "versión anterior". */
export const pideActualizar = (e: EstadoExtension) => e.tipo === "vieja" || e.tipo === "nueva_version";

export function haceDias(n: number | null): string {
  if (n === null) return "todavía no ha buscado";
  if (n <= 0) return "última búsqueda hoy";
  if (n === 1) return "última búsqueda ayer";
  return `última búsqueda hace ${n} días`;
}

// --- Pasos del asistente -----------------------------------------------------------------------------

export const PASOS = ["descargar", "descomprimir", "abrir", "cargar", "conectar", "listo"] as const;
export type Paso = (typeof PASOS)[number];
export const PASOS_ACTUALIZAR = ["descargar", "reemplazar", "recargar"] as const;
export type PasoActualizar = (typeof PASOS_ACTUALIZAR)[number];

const indice = (p: Paso) => PASOS.indexOf(p);

/** El paso guardado en el navegador, o el que corresponde al llegar. */
export function pasoInicial(guardado: string | null, estado: EstadoExtension): Paso {
  const valido = PASOS.find((p) => p === guardado) ?? null;
  if (estado.tipo === "conectada") return valido === "conectar" ? "conectar" : "listo";
  if (!valido) return instalada(estado) ? "conectar" : "descargar";
  // Si quedó en "listo" pero ya no está conectada, se vuelve a conectar.
  if (valido === "listo") return instalada(estado) ? "conectar" : "descargar";
  return valido;
}

/**
 * El paso que se muestra: en cuanto la página ve la extensión instalada (pasos 1 a 4 hechos) salta a Conectar,
 * salvo que la persona haya vuelto atrás a propósito.
 */
export function pasoVisible(elegido: Paso, estado: EstadoExtension, volvioAtras: boolean): Paso {
  if (!volvioAtras && instalada(estado) && indice(elegido) < indice("conectar")) return "conectar";
  return elegido;
}

export function siguiente(p: Paso): Paso {
  return PASOS[Math.min(indice(p) + 1, PASOS.length - 1)];
}

export function anterior(p: Paso): Paso {
  return PASOS[Math.max(indice(p) - 1, 0)];
}

/** "Paso 2 de 5" (el final no cuenta). */
export function numeroDePaso(p: Paso): { numero: number; total: number } {
  return { numero: Math.min(indice(p) + 1, 5), total: 5 };
}

// --- Mensajes del canal ------------------------------------------------------------------------------

/** Lo que la página le puede pedir a la búsqueda (se repite en extension/canal.js; una prueba revisa que coincidan). */
export const ORDENES_BUSQUEDA = ["estado", "pausar", "seguir", "detener", "buscar"] as const;
export type OrdenBusqueda = (typeof ORDENES_BUSQUEDA)[number];

export const FASES_BUSQUEDA = ["lista", "buscando", "pausada", "verificacion", "revisando", "terminada", "detenida", "error"] as const;
export type FaseBusqueda = (typeof FASES_BUSQUEDA)[number];

/** Cómo va la búsqueda de dueños en la extensión de este navegador. */
export interface EstadoBusquedaExt {
  fase: FaseBusqueda;
  motivoPausa: "usuario" | "actividad" | null;
  detenida: boolean;
  automatica: boolean;
  pagina: number;
  total: number;
  restanteMs: number;
  haciendo: string;
  mensaje: string;
  /** Última señal de vida (ms): sin latido reciente, la búsqueda se cortó. */
  latido: number;
}

export type MensajeDeExtension =
  | { tipo: "presente"; version: string; conectada: boolean; corredor: string }
  | { tipo: "resultado"; pedido: string; ok: boolean; corredor: string; mensaje: string }
  | { tipo: "busqueda"; pedido: string; ok: boolean; estado: EstadoBusquedaExt };

/** Lo mínimo de un MessageEvent (para poder probarlo sin navegador). */
export interface Evento {
  source: unknown;
  origin: string;
  data: unknown;
}

const VERSION = /^\d{1,4}(\.\d{1,5}){0,3}$/;
const texto = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

/**
 * Lee un mensaje de la extensión. Se ignora (null) lo que no viene de esta misma ventana y de este mismo origen
 * (otra pestaña, un iframe o un sitio ajeno no pueden hablar por aquí), o lo que no tiene la forma esperada.
 */
export function leerMensajeDeExtension(e: Evento, ventana: unknown, origen: string): MensajeDeExtension | null {
  if (e.source !== ventana || e.origin !== origen) return null;
  const d = e.data as Record<string, unknown> | null;
  if (!d || typeof d !== "object" || Array.isArray(d) || d.fuente !== CANAL.extension) return null;
  if (d.tipo === "presente") {
    if (typeof d.version !== "string" || !VERSION.test(d.version)) return null;
    return { tipo: "presente", version: d.version, conectada: d.conectada === true, corredor: texto(d.corredor, 120) };
  }
  if (d.tipo === "resultado") {
    if (typeof d.pedido !== "string" || !/^[a-z0-9-]{1,40}$/.test(d.pedido)) return null;
    return { tipo: "resultado", pedido: d.pedido, ok: d.ok === true, corredor: texto(d.corredor, 120), mensaje: texto(d.mensaje, 300) };
  }
  if (d.tipo === "busqueda") {
    if (typeof d.pedido !== "string" || !/^[a-z0-9-]{1,40}$/.test(d.pedido)) return null;
    const fase = FASES_BUSQUEDA.find((f) => f === d.fase);
    if (!fase) return null;
    const numero = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0);
    return {
      tipo: "busqueda",
      pedido: d.pedido,
      ok: d.ok === true,
      estado: {
        fase,
        motivoPausa: d.motivoPausa === "usuario" || d.motivoPausa === "actividad" ? d.motivoPausa : null,
        detenida: d.detenida === true,
        automatica: d.automatica === true,
        pagina: numero(d.pagina),
        total: numero(d.total),
        restanteMs: numero(d.restanteMs),
        haciendo: texto(d.haciendo, 120),
        mensaje: texto(d.mensaje, 300),
        latido: numero(d.latido),
      },
    };
  }
  return null;
}

// --- La búsqueda vista desde el panel ------------------------------------------------------------------------

/** Sin latido por este tiempo, la búsqueda se dio por cortada (Chrome cerró la extensión). */
export const LATIDO_MAX_MS = 90_000;
const EN_CURSO: FaseBusqueda[] = ["buscando", "pausada", "verificacion", "revisando"];

/** ¿Hay una búsqueda viva en este navegador? */
export function busquedaEnCurso(e: EstadoBusquedaExt | null, ahora = Date.now()): boolean {
  return !!e && EN_CURSO.includes(e.fase) && ahora - e.latido < LATIDO_MAX_MS;
}

/** "quedan ~6 min" */
export function textoRestante(ms: number): string {
  const min = Math.round(ms / 60_000);
  return min < 1 ? "queda menos de 1 min" : `quedan ~${min} min`;
}

/** Título y detalle de la tarjeta "Buscando ahora" del panel. */
export function textoBusqueda(e: EstadoBusquedaExt): { titulo: string; detalle: string } {
  const pagina = e.total ? `página ${e.pagina} de ${e.total}` : "";
  switch (e.fase) {
    case "buscando":
      return {
        titulo: `Buscando ahora${pagina ? ` · ${pagina}` : ""}`,
        detalle: [e.haciendo, e.restanteMs ? textoRestante(e.restanteMs) : ""].filter(Boolean).join(" · "),
      };
    case "pausada":
      return {
        titulo: `En pausa${pagina ? ` · ${pagina}` : ""}`,
        detalle: e.motivoPausa === "actividad" ? "Se pausó porque usaste la pestaña de Encuentra24." : "Sigue desde aquí, la extensión o la pestaña.",
      };
    case "verificacion":
      return { titulo: "Encuentra24 pide que confirmes que eres tú", detalle: "Resuélvelo en la pestaña de Encuentra24 y toca Seguir." };
    case "revisando":
      return { titulo: "Revisando lo que leyó", detalle: e.detenida ? "La detuviste: revisa y guarda lo que alcanzó a leer." : "Viendo cuáles son dueños directos…" };
    default:
      return { titulo: "", detalle: e.mensaje };
  }
}

/** La extensión responde a "busqueda" desde la 1.3.0: las anteriores no tienen estos botones. */
export const VERSION_BUSQUEDA_EN_VIVO = "1.3.0";

/** El código del panel tal como lo acepta la extensión ("K7PM-4QXR"). */
export const CODIGO = /^[A-Z0-9]{4}-?[A-Z0-9]{4}$/;
