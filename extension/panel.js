/* global CANAL, validarDePagina -- vienen de canal.js, que Chrome carga antes en el mismo mundo aislado */
// Content script de la página de instalación del panel (manifest.json: solo __APP__/panel/duenos*). Le dice a
// la página que la extensión está instalada y su versión, y si la página le pasa un código de conexión, se lo da
// al trabajador de fondo, que lo canjea por el permiso (/api/extension/conectar, como el código escrito a mano).
// A la página solo vuelve "conectada a <corredor>" o el mensaje de error: el permiso nunca.
(() => {
  const APP = "__APP__";
  let ORIGEN;
  try {
    ORIGEN = new URL(APP).origin;
  } catch {
    return;
  }
  // Solo en la ventana principal del panel (no dentro de un iframe, aunque sea del panel).
  if (location.origin !== ORIGEN || window.top !== window) return;

  const vivo = () => {
    try {
      return !!chrome.runtime?.id;
    } catch {
      return false;
    }
  };
  const decir = (datos) => window.postMessage({ fuente: CANAL.extension, ...datos }, ORIGEN);
  const enPanel = () => location.pathname.startsWith("/panel/duenos");

  async function presentarse() {
    if (!vivo()) return apagar();
    let estado;
    try {
      estado = await chrome.runtime.sendMessage({ tipo: "panel_estado" });
    } catch {
      return apagar();
    }
    decir({
      tipo: "presente",
      version: chrome.runtime.getManifest().version,
      conectada: estado?.conectada === true,
      corredor: typeof estado?.corredor === "string" ? estado.corredor.slice(0, 120) : "",
    });
  }

  async function oir(evento) {
    const m = validarDePagina(evento, window, ORIGEN);
    if (!m || !enPanel()) return;
    if (!vivo()) return apagar();
    if (m.tipo === "hola") return presentarse();
    if (m.tipo === "busqueda") return busqueda(m);
    let r = null;
    try {
      r = await chrome.runtime.sendMessage({ tipo: "panel_conectar", codigo: m.codigo });
    } catch {
      r = null;
    }
    decir({
      tipo: "resultado",
      pedido: m.pedido,
      ok: r?.ok === true,
      corredor: r?.ok && typeof r.corredor === "string" ? r.corredor.slice(0, 120) : "",
      mensaje: r?.ok ? "" : typeof r?.mensaje === "string" ? r.mensaje.slice(0, 300) : "La extensión no respondió. Recarga la página.",
    });
    if (r?.ok) presentarse();
  }

  /** Cómo va la búsqueda de dueños, o pausarla, seguirla, detenerla o empezarla. A la página vuelve solo el estado. */
  async function busqueda(m) {
    let e = null;
    try {
      e = await chrome.runtime.sendMessage({ tipo: "panel_busqueda", orden: m.orden });
    } catch {
      e = null;
    }
    const n = (v) => (Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0);
    const t = (v, max) => (typeof v === "string" ? v.slice(0, max) : "");
    decir({
      tipo: "busqueda",
      pedido: m.pedido,
      ok: !!e && typeof e.fase === "string",
      fase: t(e?.fase, 20),
      motivoPausa: t(e?.motivoPausa, 20),
      detenida: e?.detenida === true,
      automatica: e?.automatica === true,
      pagina: n(e?.pagina),
      total: n(e?.total),
      restanteMs: n(e?.restanteMs),
      haciendo: t(e?.haciendo, 120),
      mensaje: t(e?.mensaje, 300),
      latido: n(e?.latido),
    });
  }

  // Al actualizar la extensión se vuelve a inyectar: la copia anterior (ya sin extensión detrás) se apaga.
  function apagar() {
    window.removeEventListener("message", oir);
  }
  try {
    globalThis.__buscadorDuenosApagar?.();
  } catch {
    // la copia anterior ya no existe
  }
  globalThis.__buscadorDuenosApagar = apagar;
  window.addEventListener("message", oir);
  if (enPanel()) presentarse();
})();
