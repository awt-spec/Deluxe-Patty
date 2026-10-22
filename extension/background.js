import { APP } from "./config.js";

// La extensión solo abre páginas: el servidor le dice qué dirección de Encuentra24 sigue, la abre en una
// pestaña de este Chrome (con el internet de la casa, que Cloudflare deja pasar), le manda lo que trajo
// la página y espera la próxima. Si Encuentra24 pide verificar que es una persona, se muestra la
// pestaña para que la persona lo resuelva. Nada se disfraza: es un Chrome normal, con pausas.

const PAUSA_MIN_MS = 6000;
const PAUSA_MAX_MS = 12000;
const ESPERA_VERIFICACION_MS = 5 * 60_000;
const ESPERA_RESULTADO_MS = 6 * 60_000;

let corriendo = false;

class VerificacionPendiente extends Error {}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

async function progreso(cambios) {
  const { progreso: actual } = await chrome.storage.local.get("progreso");
  // El latido le dice al popup que la búsqueda sigue viva (Chrome puede cerrar la extensión a medias).
  await chrome.storage.local.set({ progreso: { ...(actual ?? {}), ...cambios, latido: Date.now() } });
}

async function api(ruta, cuerpo, token) {
  let r;
  try {
    r = await fetch(APP + ruta, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(cuerpo ?? {}),
    });
  } catch {
    return { ok: false, mensaje: "No hay conexión con el panel. Revisa el internet y vuelve a intentarlo." };
  }
  if (r.status === 401) await chrome.storage.local.remove(["token", "corredor"]);
  try {
    return await r.json();
  } catch {
    return { ok: false, mensaje: "El panel no respondió bien. Vuelve a intentarlo en un rato." };
  }
}

/** Espera a que la pestaña termine de cargar (o 60 segundos). Se arma antes de navegar. */
function cuandoCargue(tabId) {
  return new Promise((resolver) => {
    const fin = () => {
      clearTimeout(tope);
      chrome.tabs.onUpdated.removeListener(oyente);
      resolver();
    };
    const oyente = (id, info) => {
      if (id === tabId && info.status === "complete") fin();
    };
    const tope = setTimeout(fin, 60_000);
    chrome.tabs.onUpdated.addListener(oyente);
  });
}

/**
 * Lo que necesita el servidor de la página: el título y los scripts con los datos de los anuncios
 * (payload de Next.js). Si no los hay (por ejemplo, la verificación de Cloudflare), la página entera.
 */
async function leerPestana(tabId) {
  try {
    const [r] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const datos = [...document.scripts].map((s) => s.textContent ?? "").filter((t) => t.includes("self.__next_f"));
        if (datos.length === 0) return document.documentElement.outerHTML.slice(0, 300_000);
        const titulo = document.title.replace(/</g, "");
        return `<title>${titulo}</title>\n` + datos.map((t) => `<script>${t}</script>`).join("\n");
      },
    });
    return typeof r?.result === "string" ? r.result : "";
  } catch {
    return "";
  }
}

const esVerificacion = (html) =>
  !html.includes("self.__next_f") && /cloudflare|cf-chl|challenge-platform|just a moment|un momento/i.test(html);

async function abrir(tabId, url) {
  const cargada = cuandoCargue(tabId);
  await chrome.tabs.update(tabId, { url });
  await cargada;
  await esperar(1500);
  let html = await leerPestana(tabId);
  if (esVerificacion(html)) {
    const tab = await chrome.tabs.update(tabId, { active: true });
    await chrome.windows.update(tab.windowId, { focused: true });
    await progreso({
      fase: "verificar",
      mensaje: "Encuentra24 pide verificar que eres una persona. Resuélvelo en la pestaña que se abrió; la búsqueda sigue sola.",
    });
    const hasta = Date.now() + ESPERA_VERIFICACION_MS;
    while (esVerificacion(html) && Date.now() < hasta) {
      await esperar(5000);
      html = await leerPestana(tabId);
      await progreso({});
    }
    // Sin resolver no se sigue: cada página volvería a esperar 5 minutos.
    if (esVerificacion(html)) throw new VerificacionPendiente();
    await progreso({ fase: "buscando", mensaje: "Sigo buscando…" });
  }
  return html;
}

async function esperarResultado(busqueda, token) {
  const hasta = Date.now() + ESPERA_RESULTADO_MS;
  while (Date.now() < hasta) {
    await esperar(5000);
    const r = await api("/api/extension/estado", { busqueda }, token);
    if (!r.ok || r.listo) return r;
    await progreso({});
  }
  return { ok: false, mensaje: "La revisión tardó demasiado. Mira el panel en un rato; si no aparecen, vuelve a buscar." };
}

async function buscar() {
  corriendo = true;
  let tabId = null;
  try {
    const { token } = await chrome.storage.local.get("token");
    if (!token) return progreso({ fase: "error", mensaje: "Primero conecta la extensión con el código del panel." });
    await chrome.storage.local.set({ progreso: { fase: "buscando", paginas: 0, mensaje: "Empezando…", latido: Date.now() } });

    const inicio = await api("/api/extension/busqueda", {}, token);
    if (!inicio.ok) return progreso({ fase: "error", mensaje: inicio.mensaje });

    tabId = (await chrome.tabs.create({ url: "about:blank", active: false })).id;
    let url = inicio.siguiente;
    for (let n = 1; url; n++) {
      if (n > 1) await esperar(PAUSA_MIN_MS + Math.random() * (PAUSA_MAX_MS - PAUSA_MIN_MS));
      await progreso({ fase: "buscando", paginas: n - 1, mensaje: `Leyendo la página ${n} de Encuentra24…` });
      const html = await abrir(tabId, url);
      const r = await api("/api/extension/pagina", { busqueda: inicio.busqueda, url, html }, token);
      if (!r.ok) return progreso({ fase: "error", mensaje: r.mensaje });
      url = r.siguiente;
    }

    await chrome.tabs.remove(tabId).catch(() => {});
    tabId = null;
    await progreso({ fase: "revisando", mensaje: "Revisando cuáles son dueños directos…" });
    const r = await esperarResultado(inicio.busqueda, token);
    if (!r.ok) return progreso({ fase: "error", mensaje: r.mensaje });
    const n = r.resumen.duenos;
    await progreso({
      fase: "listo",
      fecha: Date.now(),
      mensaje:
        n === 0
          ? `Listo: revisé ${r.resumen.anuncios} anuncios y esta semana no hay dueños nuevos.`
          : `Listo: ${n} ${n === 1 ? "dueño nuevo" : "dueños nuevos"}. Están en el panel, en Más → Dueños directos.`,
    });
  } catch (e) {
    await progreso({
      fase: "error",
      mensaje:
        e instanceof VerificacionPendiente
          ? "Encuentra24 siguió pidiendo la verificación. Vuelve a buscar cuando puedas resolverla en la pestaña."
          : "La búsqueda se cortó. Vuelve a intentarlo.",
    });
  } finally {
    corriendo = false;
    if (tabId !== null) chrome.tabs.remove(tabId).catch(() => {});
  }
}

async function conectar(codigo) {
  const r = await api("/api/extension/conectar", { codigo });
  if (r.ok) await chrome.storage.local.set({ token: r.token, corredor: r.corredor, progreso: null });
  return r;
}

async function desconectar() {
  const { token } = await chrome.storage.local.get("token");
  if (token) await api("/api/extension/desconectar", {}, token);
  await chrome.storage.local.remove(["token", "corredor", "progreso"]);
  return { ok: true };
}

chrome.runtime.onMessage.addListener((m, _remitente, responder) => {
  if (m?.tipo === "conectar") {
    conectar(String(m.codigo ?? "")).then(responder);
    return true;
  }
  if (m?.tipo === "desconectar") {
    desconectar().then(responder);
    return true;
  }
  if (m?.tipo === "buscar") {
    if (!corriendo) buscar();
    responder({ ok: true });
  }
  return false;
});

// Si Chrome cerró la extensión a media búsqueda, el aviso no queda en "buscando" para siempre.
chrome.runtime.onStartup.addListener(async () => {
  const { progreso: p } = await chrome.storage.local.get("progreso");
  if (p && ["buscando", "verificar", "revisando"].includes(p.fase)) {
    await progreso({ fase: "error", mensaje: "La búsqueda anterior se cortó. Vuelve a empezarla." });
  }
});
