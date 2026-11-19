// "Llenar con Patty" y "Preparar un anuncio" (desde la 1.6.0): reglas puras del panel lateral y del trabajador de fondo
// (sin chrome.* ni DOM). Las prueban tests/llenar-extension.test.ts; las usan background.js y sidepanel.js.
//
// Todo lo que llega del servidor se vuelve a validar aquí antes de dibujarlo o de llevarlo a la página de Encuentra24:
// textos cortados, ids con forma de uuid y fotos solo del bucket público "fotos" del portal (las originales).
import { esPaginaDeAnuncio } from "./comun.js";
import { esUrlDeE24, UUID } from "./mensajes.js";

export const MAX_FOTOS = 20;
/** Una foto más grande que esto no se baja (las del bucket están achicadas a 2400 px). */
export const MAX_FOTO_BYTES = 8 * 1024 * 1024;
export const INICIO_E24 = "https://www.encuentra24.com/costa-rica-es";

/** Los nombres de cada campo, para el informe. */
export const NOMBRES_CAMPOS = {
  titulo: "título",
  descripcion: "descripción",
  precio: "precio",
  moneda: "moneda",
  operacion: "venta o alquiler",
  tipo: "tipo de propiedad",
  habitaciones: "habitaciones",
  banos: "baños",
  m2_construccion: "m² de construcción",
  m2_terreno: "m² de terreno",
  provincia: "provincia",
  canton: "cantón",
  distrito: "distrito",
  zona: "zona",
};

const PUBLICAR = /(^|[/_\-?=&.])(publicar|publica|anunciar|insertar|insertar-anuncio|post|postad|post-ad|nuevo-anuncio|crear-anuncio|place-ad|placead)([/_\-?=&.]|$)/i;

/**
 * ¿La pestaña parece el formulario de publicar de Encuentra24? Por la dirección (barato); si no lo dice, el panel
 * lateral pregunta a la página (ver_formulario) si tiene un formulario con título y descripción.
 */
export function esFormularioDePublicar(url) {
  if (!esUrlDeE24(url) || esPaginaDeAnuncio(url)) return false;
  const u = new URL(url);
  return PUBLICAR.test(u.pathname + u.search);
}

/** Una foto que se puede bajar para el formulario: https, del Storage público, bucket "fotos", sin "..". */
export function esFotoParaLlenar(url) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && !u.username && !u.password && !u.port && u.pathname.startsWith("/storage/v1/object/public/fotos/") && !u.pathname.includes("..");
  } catch {
    return false;
  }
}

const texto = (v, max) => (typeof v === "string" ? v.slice(0, max) : "");
const textoONulo = (v, max) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const numero = (v) => (typeof v === "number" && Number.isFinite(v) && v > 0 && v < 1e12 ? v : null);
const id = (v) => (typeof v === "string" && UUID.test(v) ? v : null);
const portada = (v) => (typeof v === "string" && esFotoParaLlenar(v) ? v : null);

function idioma(v) {
  if (!v || typeof v !== "object") return null;
  const titulo = texto(v.titulo, 300).trim();
  const descripcion = texto(v.descripcion, 20000).trim();
  return titulo && descripcion ? { titulo, descripcion } : null;
}

/** Lo que manda GET /api/extension/anuncio-listo, limpio (o null). Es lo único que llega a la página. */
export function limpiarDatosLlenar(a) {
  if (!a || typeof a !== "object" || Array.isArray(a)) return null;
  const es = idioma(a.es);
  if (!id(a.id) || !es) return null;
  return {
    id: a.id,
    referencia: texto(a.referencia, 12),
    es,
    en: idioma(a.en),
    operacion: a.operacion === "venta" || a.operacion === "alquiler" ? a.operacion : null,
    tipo: textoONulo(a.tipo, 40),
    precio: numero(a.precio),
    moneda: a.moneda === "USD" || a.moneda === "CRC" ? a.moneda : null,
    provincia: textoONulo(a.provincia, 80),
    canton: textoONulo(a.canton, 80),
    distrito: textoONulo(a.distrito, 80),
    zona: textoONulo(a.zona, 120),
    habitaciones: numero(a.habitaciones),
    banos: numero(a.banos),
    m2_construccion: numero(a.m2_construccion),
    m2_terreno: numero(a.m2_terreno),
    amenidades: (Array.isArray(a.amenidades) ? a.amenidades : []).map((x) => textoONulo(x, 60)).filter(Boolean).slice(0, 30),
    fotos: [...new Set((Array.isArray(a.fotos) ? a.fotos : []).filter((u) => typeof u === "string" && esFotoParaLlenar(u)))].slice(0, MAX_FOTOS),
    conEnlace: a.conEnlace === true,
  };
}

/** La lista de GET /api/extension/anuncios-listos, limpia. */
export function limpiarListos(lista) {
  return (Array.isArray(lista) ? lista : [])
    .filter((a) => a && typeof a === "object" && id(a.id))
    .slice(0, 20)
    .map((a) => ({
      id: a.id,
      referencia: texto(a.referencia, 12),
      titulo: texto(a.titulo, 160) || "Anuncio sin título",
      casa: texto(a.casa?.titulo, 120),
      codigo: texto(a.casa?.codigo, 30),
      portada: portada(a.portada),
    }));
}

/** La lista de GET /api/extension/casas-para-anuncio, limpia. */
export function limpiarCasas(lista) {
  return (Array.isArray(lista) ? lista : [])
    .filter((c) => c && typeof c === "object" && id(c.id))
    .slice(0, 50)
    .map((c) => ({ id: c.id, codigo: texto(c.codigo, 30), titulo: texto(c.titulo, 160) || "Casa sin título", portada: portada(c.portada), conBorrador: c.conBorrador === true }));
}

const lista = (claves) => {
  const n = claves.map((k) => NOMBRES_CAMPOS[k]).filter(Boolean);
  return n.length <= 1 ? (n[0] ?? "") : `${n.slice(0, -1).join(", ")} y ${n.at(-1)}`;
};

/**
 * El informe para la persona. `inf`: { llenados, faltan, yaTenian, amenidades, fotos: { total, adjuntadas, sinCampo,
 * unaSola, fallidas }, detenido, conEnlace }. Siempre termina con lo que tiene que hacer ella: revisar y publicar.
 */
export function textoInforme(inf, asistente = "Patty") {
  const i = inf && typeof inf === "object" ? inf : {};
  const claves = (v) => (Array.isArray(v) ? v.filter((k) => k in NOMBRES_CAMPOS) : []);
  const llenados = claves(i.llenados);
  const faltan = claves(i.faltan);
  const yaTenian = claves(i.yaTenian);
  const lineas = [];
  if (i.detenido) lineas.push("Lo detuviste: dejé lo que alcancé a poner.");
  lineas.push(llenados.length ? `Llené: ${lista(llenados)}.` : "No encontré campos que pudiera llenar en esta página.");
  if (i.amenidades > 0) lineas.push(`Marqué ${i.amenidades} ${i.amenidades === 1 ? "amenidad" : "amenidades"}.`);
  if (faltan.length) lineas.push(`Llénalos tú: ${lista(faltan)}.`);
  if (yaTenian.length) lineas.push(`Ya tenían algo y no los toqué: ${lista(yaTenian)}.`);
  const f = i.fotos ?? {};
  if (f.total > 0) {
    if (f.sinCampo) lineas.push(`No encontré dónde subir las fotos: súbelas tú (${f.total} en el orden de tu panel).`);
    else if (f.adjuntadas > 0) {
      lineas.push(`${f.adjuntadas} ${f.adjuntadas === 1 ? "foto adjunta" : "fotos adjuntas"}${f.unaSola ? " (el formulario recibe una a la vez: sube las demás tú)" : ""}.`);
    } else if (i.detenido) lineas.push("No adjunté fotos.");
    if (f.fallidas > 0) lineas.push(`${f.fallidas} ${f.fallidas === 1 ? "foto no se pudo bajar" : "fotos no se pudieron bajar"}.`);
  }
  if (i.conEnlace === false) lineas.push("La descripción no lleva tu enlace de WhatsApp: falta el número de la asistente.");
  lineas.push("Revisa todo y toca Publicar en Encuentra24.");
  lineas.push(`Ya publicado, abre tu anuncio y toca «Leer este anuncio»: ${asistente} lo enlaza a tu panel.`);
  return lineas.join(" ");
}

/** "Llenando… 3 de 8 fotos" mientras trabaja. */
export function textoAvance(l) {
  if (!l || typeof l !== "object") return "";
  const total = Number.isInteger(l.total) && l.total > 0 ? l.total : 0;
  const hechas = Number.isInteger(l.hechas) ? Math.max(0, Math.min(l.hechas, total)) : 0;
  if (l.paso === "campos" || !total) return "Llenando los campos…";
  return `Llenando… ${hechas} de ${total} ${total === 1 ? "foto" : "fotos"}`;
}

/** Hace cuánto una lectura de "llenando" quedó colgada (Chrome cerró el trabajador de fondo). */
export const LLENADO_MAX_MS = 5 * 60_000;

/**
 * Qué muestra la tarjeta "Publicar con Patty". `d`: { url (la pestaña activa), formulario (si la página dijo que tiene
 * uno, o null), llenado (de chrome.storage), ahora, asistente }.
 */
export function vistaPublicar({ url = "", formulario = null, llenado = null, ahora = Date.now(), asistente = "Patty" } = {}) {
  const enE24 = esUrlDeE24(url);
  const enFormulario = esFormularioDePublicar(url) || (enE24 && !esPaginaDeAnuncio(url) && formulario === true);
  const mio = llenado && typeof llenado === "object" && llenado.url === url ? llenado : null;
  const llenando = !!mio && mio.fase === "llenando" && ahora - (Number(mio.fecha) || 0) < LLENADO_MAX_MS;
  return {
    titulo: `Publicar con ${asistente}`,
    enFormulario,
    ayuda: enFormulario
      ? "Elige el anuncio y lo lleno por ti. Tú revisas y publicas."
      : enE24
        ? "Ve a Publicar anuncio en Encuentra24 y aquí te lo lleno."
        : "Abre Encuentra24, entra con tu cuenta y ve a Publicar anuncio. Yo lleno el formulario.",
    llenando,
    avance: llenando ? textoAvance(mio) : "",
    informe: mio && !llenando && typeof mio.mensaje === "string" ? mio.mensaje.slice(0, 900) : "",
    error: !!mio && mio.fase === "error",
  };
}
