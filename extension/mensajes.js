// Quién le habla al trabajador de fondo y qué puede pedir. Reglas puras (sin chrome.*): las prueba
// tests/maquina-extension.test.ts y las usa background.js en cada chrome.runtime.onMessage.
//
//  - "popup": las páginas de la propia extensión (popup.html).
//  - "panel": el content script de /panel/duenos* del panel, en la ventana principal.
//  - "control": el content script de la barra (control.js), solo en la pestaña de la búsqueda en curso y en
//    Encuentra24.
// Cada uno tiene su lista de pedidos; lo demás se ignora. Del panel no se puede empezar una búsqueda con datos
// propios: "buscar" no lleva parámetros.

export const ORIGEN_E24 = "https://www.encuentra24.com";
const CODIGO = /^[A-Z0-9]{4}-?[A-Z0-9]{4}$/;
export const ORDENES_PANEL = ["estado", "pausar", "seguir", "detener", "buscar"];

const origenDe = (url) => {
  try {
    return new URL(url);
  } catch {
    return null;
  }
};

/**
 * De quién es el mensaje. `ctx`: { id: el de la extensión, origenApp: origen del panel, tabBusqueda: la pestaña de la
 * búsqueda en curso o null }.
 */
export function deQuien(remitente, ctx) {
  if (!remitente || !ctx?.id || remitente.id !== ctx.id) return null;
  const u = origenDe(remitente.url ?? "");
  if (!u) return null;
  // Las páginas de la extensión (el popup; en las pruebas, abierto en una pestaña).
  if (u.protocol === "chrome-extension:" && u.host === ctx.id) return "popup";
  if (!remitente.tab || remitente.frameId !== 0) return null;
  if (ctx.origenApp && u.origin === ctx.origenApp && u.pathname.startsWith("/panel/duenos")) return "panel";
  if (u.origin === ORIGEN_E24 && ctx.tabBusqueda != null && remitente.tab.id === ctx.tabBusqueda) return "control";
  return null;
}

/** El pedido, limpio, si ese remitente lo puede hacer; si no, null. */
export function leerPedido(de, m) {
  if (!m || typeof m !== "object" || Array.isArray(m) || typeof m.tipo !== "string") return null;
  if (de === "popup") {
    switch (m.tipo) {
      case "conectar":
        return typeof m.codigo === "string" && m.codigo.length <= 20 ? { tipo: "conectar", codigo: m.codigo } : null;
      case "leer_anuncio":
        return Number.isInteger(m.tabId) ? { tipo: "leer_anuncio", tabId: m.tabId } : null;
      case "buscar_sola":
        return { tipo: "buscar_sola", encendida: m.encendida === true };
      case "modo_semanal":
        return m.modo === "vista" || m.modo === "fondo" ? { tipo: "modo_semanal", modo: m.modo } : null;
      case "desconectar":
      case "buscar":
      case "ver_ultima":
      case "pausar":
      case "seguir":
      case "detener":
        return { tipo: m.tipo };
      default:
        return null;
    }
  }
  if (de === "panel") {
    if (m.tipo === "panel_estado") return { tipo: "panel_estado" };
    if (m.tipo === "panel_conectar") return typeof m.codigo === "string" && CODIGO.test(m.codigo) ? { tipo: "panel_conectar", codigo: m.codigo } : null;
    if (m.tipo === "panel_busqueda") return ORDENES_PANEL.includes(m.orden) ? { tipo: "panel_busqueda", orden: m.orden } : null;
    return null;
  }
  if (de === "control") {
    return ["control_pausar", "control_seguir", "control_detener", "control_dejar", "control_actividad"].includes(m.tipo) ? { tipo: m.tipo } : null;
  }
  return null;
}

/**
 * Lo que se cuenta de la búsqueda fuera del trabajador de fondo (popup, panel, barra): sin el permiso, sin ids del
 * servidor y sin direcciones.
 */
export function estadoPublico(s) {
  if (!s) return { fase: "lista" };
  const numero = (v) => (Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0);
  const texto = (v, max) => (typeof v === "string" ? v.slice(0, max) : "");
  return {
    fase: s.fase,
    motivoPausa: s.motivoPausa === "actividad" || s.motivoPausa === "usuario" ? s.motivoPausa : null,
    detenida: s.detenida === true,
    automatica: s.automatica === true,
    aLaVista: s.aLaVista === true,
    pagina: numero(s.pagina),
    total: numero(s.total),
    restanteMs: numero(s.restanteMs),
    haciendo: texto(s.haciendo, 120),
    mensaje: texto(s.mensaje, 300),
    latido: numero(s.latido),
  };
}
