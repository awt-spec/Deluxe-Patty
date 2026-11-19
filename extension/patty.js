// "Patty en la extensión" (desde la 1.7.0): reglas puras del chat y las herramientas del panel lateral (sin chrome.* ni
// DOM). Las prueban tests/patty-extension.test.ts y las usan sidepanel.js y background.js.
//
// Lo que contesta el modelo nunca se arma como HTML: aquí se parte en bloques (párrafo, título, viñeta) y en partes
// (texto, negrita, enlace) que sidepanel.js dibuja con createElement y textContent. Los enlaces solo valen si son https
// (o una pantalla /panel/… del propio panel) y se abren aparte con chrome.tabs.create. Los pasos de la guía en pantalla
// y los pedidos de PDF o PNG (<<ir …>>, <<señalar …>>, <<pdf …>>, <<png …>>) son del chat del panel: aquí se quitan.
import { esUrlDeE24, MAX_MENSAJE_PATTY, MAX_TEXTO_TURNO, MAX_TURNOS_HISTORIAL } from "./mensajes.js";

export { MAX_MENSAJE_PATTY, MAX_TURNOS_HISTORIAL };
/** Turnos que se guardan en chrome.storage.session (lo que se ve en el chat). */
export const MAX_TURNOS_GUARDADOS = 20;
/** Largo máximo de una respuesta que se guarda y se dibuja. */
export const MAX_RESPUESTA = 12_000;
export const PREGUNTA_MES = "¿Cómo va el mes?";

const MARCA = /<<[^<>\n]{0,300}>>/g;
const DIAGRAMA = /```mermaid[\s\S]*?(```|$)/gi;
const IMAGEN = /!\[[^\]\n]{0,200}\]\([^)\s]{1,2000}\)/g;

/** Quita lo que solo sirve en el chat del panel: pasos de la guía, pedidos de documento, imágenes y diagramas. */
export function quitarMarcas(texto) {
  return String(texto ?? "")
    .replace(DIAGRAMA, "(Aquí va un diagrama: míralo en el chat del panel.)")
    .replace(IMAGEN, "(Imagen: mírala en el chat del panel.)")
    .replace(MARCA, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_RESPUESTA);
}

/** Origen del panel si es https (o localhost en las pruebas locales); si no, null. */
function origenApp(app) {
  try {
    const u = new URL(app);
    if (u.protocol === "https:" || (u.protocol === "http:" && /^(localhost|127\.0\.0\.1)$/.test(u.hostname))) return u.origin;
    return null;
  } catch {
    return null;
  }
}

const RUTA_PANEL = /^\/panel(\/[\w\-/?=&.%]*)?$/;

/**
 * La dirección que se puede abrir, o null: https sin usuario ni contraseña, o una pantalla /panel/… del propio panel
 * (se arma con su dirección). Nada de javascript:, data:, http: ni rutas raras.
 */
export function enlaceSeguro(url, app) {
  if (typeof url !== "string" || url.length > 2000) return null;
  const u = url.trim();
  if (u.startsWith("/")) {
    const base = RUTA_PANEL.test(u) ? origenApp(app) : null;
    return base ? base + u : null;
  }
  try {
    const x = new URL(u);
    if (x.protocol !== "https:" || x.username || x.password || !x.hostname.includes(".")) return null;
    return x.href;
  } catch {
    return null;
  }
}

// **negrita**, [texto](dirección) o una dirección suelta.
const EN_LINEA = /\*\*([^*\n]{1,300})\*\*|\[([^\]\n]{1,200})\]\(([^)\s]{1,2000})\)|(https:\/\/[^\s<>()"'`]{3,2000})/g;

/** Una línea en partes: { tipo: "texto" | "negrita" | "enlace", texto, url? }. */
export function partesDeLinea(linea, app) {
  const partes = [];
  const texto = (t) => {
    const limpio = t.replace(/`/g, "");
    if (!limpio) return;
    const ultima = partes.at(-1);
    if (ultima?.tipo === "texto") ultima.texto += limpio;
    else partes.push({ tipo: "texto", texto: limpio });
  };
  let desde = 0;
  for (const m of String(linea).matchAll(EN_LINEA)) {
    texto(linea.slice(desde, m.index));
    desde = m.index + m[0].length;
    if (m[1]) partes.push({ tipo: "negrita", texto: m[1] });
    else if (m[2]) {
      const url = enlaceSeguro(m[3], app);
      if (url) partes.push({ tipo: "enlace", texto: m[2], url });
      else texto(m[2]);
    } else {
      // Un punto o una coma al final no son parte de la dirección.
      const [, dir, cola] = /^(.*?)([.,;:!?]*)$/.exec(m[4]);
      const url = enlaceSeguro(dir, app);
      if (url) partes.push({ tipo: "enlace", texto: dir, url });
      else texto(dir);
      texto(cola);
    }
  }
  texto(String(linea).slice(desde));
  return partes;
}

/**
 * La respuesta en bloques para dibujar: { tipo: "titulo" | "parrafo" | "vineta", partes }. Markdown mínimo: títulos,
 * listas, tablas (cada fila como viñeta) y citas; el código va como texto.
 */
export function bloquesRespuesta(texto, app) {
  const bloques = [];
  let enCodigo = false;
  for (const cruda of quitarMarcas(texto).split("\n")) {
    const linea = cruda.replace(/\s+$/, "");
    if (/^\s*```/.test(linea)) {
      enCodigo = !enCodigo;
      continue;
    }
    if (enCodigo) {
      if (linea.trim()) bloques.push({ tipo: "parrafo", partes: [{ tipo: "texto", texto: linea }] });
      continue;
    }
    if (!linea.trim()) continue;
    let m;
    if ((m = /^\s*#{1,6}\s+(.*)$/.exec(linea))) bloques.push({ tipo: "titulo", partes: partesDeLinea(m[1].replace(/\*\*/g, ""), app) });
    else if ((m = /^\s*(?:[-*•]|\d{1,3}[.)])\s+(.*)$/.exec(linea))) bloques.push({ tipo: "vineta", partes: partesDeLinea(m[1], app) });
    else if (/^\s*\|/.test(linea)) {
      if (/^\s*\|?[\s:|-]+\|?\s*$/.test(linea)) continue;
      const celdas = linea.split("|").map((c) => c.trim()).filter(Boolean);
      if (celdas.length) bloques.push({ tipo: "vineta", partes: partesDeLinea(celdas.join(" · "), app) });
    } else if ((m = /^\s*>\s?(.*)$/.exec(linea))) bloques.push({ tipo: "parrafo", partes: partesDeLinea(m[1], app) });
    else bloques.push({ tipo: "parrafo", partes: partesDeLinea(linea.trim(), app) });
  }
  return bloques.filter((b) => b.partes.length);
}

/** La conversación guardada, limpia (viene de chrome.storage.session): los últimos 20 turnos con texto. */
export function limpiarConversacion(v) {
  if (!Array.isArray(v)) return [];
  return v
    .filter((t) => t && typeof t === "object" && (t.autor === "corredor" || t.autor === "asistente") && typeof t.texto === "string" && t.texto.trim())
    .slice(-MAX_TURNOS_GUARDADOS)
    .map((t) => ({ autor: t.autor, texto: t.texto.slice(0, MAX_RESPUESTA), ...(t.error === true ? { error: true } : {}) }));
}

export function agregarTurno(conversacion, turno) {
  return limpiarConversacion([...limpiarConversacion(conversacion), turno]);
}

/** Lo que se le manda al servidor como historial: sin los avisos de error, los últimos 12, cada uno de hasta 4.000. */
export function historialParaEnviar(conversacion) {
  return limpiarConversacion(conversacion)
    .filter((t) => !t.error)
    .slice(-MAX_TURNOS_HISTORIAL)
    .map((t) => ({ autor: t.autor, texto: t.texto.slice(0, MAX_TEXTO_TURNO) }));
}

const texto = (v, max) => (typeof v === "string" ? v.slice(0, max) : "");
/** Un dato de la base dentro de un texto que se dibuja: sin marcas de formato ni enlaces. */
const sinMarcas = (v, max = 120) => texto(v, max).replace(/[*_`[\]<>|]/g, "").replace(/\s+/g, " ").trim();

/** Lo que vuelve de /api/extension/revisar-casas, limpio. */
export function limpiarRevision(r) {
  if (!r || r.ok !== true) return { ok: false, mensaje: texto(r?.mensaje, 300) || "No pude revisar tus casas. Vuelve a intentarlo." };
  const numero = (n) => (Number.isInteger(n) && n >= 0 ? n : 0);
  const pendientes = (Array.isArray(r.pendientes) ? r.pendientes : []).slice(0, 10).flatMap((p) =>
    p && typeof p === "object" && typeof p.titulo === "string"
      ? [{ codigo: sinMarcas(p.codigo, 20), titulo: sinMarcas(p.titulo), problemas: (Array.isArray(p.problemas) ? p.problemas : []).slice(0, 6).map((x) => sinMarcas(x, 120)).filter(Boolean) }]
      : [],
  );
  return { ok: true, pendientes, total: Math.max(numero(r.total), pendientes.length), completas: numero(r.completas), pausadas: numero(r.pausadas) };
}

/** "Revisar mis casas" en palabras (lo arma el código, no el modelo). */
export function textoRevision(r) {
  if (!r?.ok) return r?.mensaje || "No pude revisar tus casas. Vuelve a intentarlo.";
  const pausadas = r.pausadas ? ` (${r.pausadas === 1 ? "1 pausada no la revisé" : `${r.pausadas} pausadas no las revisé`})` : "";
  if (!r.total) return `Revisé tus casas: ${r.completas === 1 ? "la que tienes está completa" : `las ${r.completas} están completas`}${pausadas}.`;
  const lineas = r.pendientes.map((p) => `- **${p.titulo}**${p.codigo ? ` (${p.codigo})` : ""}: ${p.problemas.join("; ") || "revísala"}`);
  const mas = r.total > r.pendientes.length ? `\n\nY ${r.total - r.pendientes.length} más.` : "";
  return [
    `Revisé tus casas: ${r.total === 1 ? "1 necesita algo" : `${r.total} necesitan algo`}${r.completas ? ` y ${r.completas} ${r.completas === 1 ? "está completa" : "están completas"}` : ""}${pausadas}.`,
    lineas.join("\n") + mas,
    "Arréglalas en [Mis casas](/panel/propiedades).",
  ].join("\n\n");
}

/** Lo que vuelve de /api/extension/duenos-recientes, limpio: solo enlaces de https://www.encuentra24.com. */
export function limpiarDuenos(r) {
  if (!r || r.ok !== true) return { ok: false, mensaje: texto(r?.mensaje, 300) || "No pude leer los dueños. Vuelve a intentarlo." };
  const numero = (n) => (Number.isInteger(n) && n >= 0 ? n : 0);
  const recientes = (Array.isArray(r.recientes) ? r.recientes : []).slice(0, 5).flatMap((d) =>
    d && typeof d === "object"
      ? [
          {
            titulo: sinMarcas(d.titulo) || "Anuncio sin título",
            zona: sinMarcas(d.zona, 60),
            precio: Number.isFinite(d.precio) && d.precio > 0 ? d.precio : null,
            moneda: d.moneda === "CRC" ? "CRC" : d.moneda === "USD" ? "USD" : null,
            url: typeof d.url === "string" && esUrlDeE24(d.url) ? d.url : null,
          },
        ]
      : [],
  );
  return { ok: true, recientes, sinEscribir: numero(r.sinEscribir), ultimaSemana: numero(r.ultimaSemana) };
}

function precioTexto(precio, moneda) {
  if (!precio) return "";
  try {
    return moneda ? new Intl.NumberFormat("es-CR", { style: "currency", currency: moneda, maximumFractionDigits: 0 }).format(precio) : new Intl.NumberFormat("es-CR").format(precio);
  } catch {
    return String(precio);
  }
}

/** "Dueños directos" en palabras (lo arma el código). */
export function textoDuenos(r) {
  if (!r?.ok) return r?.mensaje || "No pude leer los dueños. Vuelve a intentarlo.";
  const semana = r.ultimaSemana ? ` Esta semana encontré ${r.ultimaSemana === 1 ? "1 nuevo" : `${r.ultimaSemana} nuevos`}.` : "";
  if (!r.sinEscribir) return `No tienes dueños esperando que les escribas.${semana} Puedo buscar más desde la pestaña de búsqueda.`;
  const lineas = r.recientes.map((d) =>
    [`- **${d.titulo}**`, d.zona, precioTexto(d.precio, d.moneda)].filter(Boolean).join(" · ") + (d.url ? ` — [Ver en Encuentra24](${d.url})` : ""),
  );
  return [
    `Tienes ${r.sinEscribir === 1 ? "1 dueño" : `${r.sinEscribir} dueños`} a ${r.sinEscribir === 1 ? "quien" : "quienes"} todavía no les escribes.${semana}`,
    lineas.join("\n"),
    "Escríbeles desde [Dueños directos](/panel/duenos): ahí te ayudo con el primer mensaje.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** Hace cuánto un "llenando" quedó colgado (igual que llenado.js). */
const LLENADO_MAX_MS = 5 * 60_000;

/**
 * Lo largo que está corriendo, para controlarlo desde la pestaña de Patty: la búsqueda de dueños (la vista `enCurso` de
 * vista-panel.js, con sus botones) y el llenado del formulario de Encuentra24.
 */
export function vistaTrabajos({ enCurso = null, llenado = null, ahora = Date.now() } = {}) {
  const busqueda = enCurso && typeof enCurso === "object" ? enCurso : null;
  const ll = llenado && typeof llenado === "object" && llenado.fase === "llenando" && ahora - (Number(llenado.fecha) || 0) < LLENADO_MAX_MS ? llenado : null;
  let avance = "";
  if (ll) {
    const total = Number.isInteger(ll.total) && ll.total > 0 ? ll.total : 0;
    const hechas = Number.isInteger(ll.hechas) ? Math.max(0, Math.min(ll.hechas, total)) : 0;
    avance = ll.paso === "campos" || !total ? "Llenando los campos del formulario…" : `Llenando el formulario… ${hechas} de ${total} ${total === 1 ? "foto" : "fotos"}`;
  }
  return { busqueda, llenado: ll ? { texto: avance } : null, hay: !!busqueda || !!ll };
}
