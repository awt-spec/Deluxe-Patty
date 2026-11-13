import { APP } from "./config.js";
import { esPaginaDeAnuncio } from "./comun.js";

// La extensión solo abre páginas: el servidor le dice qué dirección de Encuentra24 sigue, la abre en una
// pestaña de este Chrome (con el internet de la casa, que Cloudflare deja pasar), le manda lo que trajo
// la página y espera la próxima. Si Encuentra24 pide verificar que es una persona, se muestra la
// pestaña para que la persona lo resuelva. Nada se disfraza: es un Chrome normal, con pausas.
//
// Además:
//  - Búsqueda semanal sola: una alarma despierta cada ~6 horas (y al abrir Chrome) y le pregunta al servidor si
//    toca (/api/extension/programa). Si toca, corre la misma búsqueda en una pestaña de fondo. Si Encuentra24 pide
//    la verificación, se cancela sin molestar y se reintenta en el siguiente despertar. Se apaga en el popup.
//  - "Leer este anuncio": manda al servidor lo que muestra la página del anuncio abierto (texto, JSON-LD, fotos).

const PAUSA_MIN_MS = 6000;
const PAUSA_MAX_MS = 12000;
const ESPERA_VERIFICACION_MS = 5 * 60_000;
const ESPERA_RESULTADO_MS = 6 * 60_000;
const ALARMA = "busqueda-semanal";
const CADA_MIN = 6 * 60;

let corriendo = false;

class VerificacionPendiente extends Error {}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

async function progreso(cambios) {
  const { progreso: actual } = await chrome.storage.local.get("progreso");
  // El latido le dice al popup que la búsqueda sigue viva (Chrome puede cerrar la extensión a medias).
  await chrome.storage.local.set({ progreso: { ...(actual ?? {}), ...cambios, latido: Date.now() } });
}

async function api(ruta, cuerpo, token, metodo = "POST") {
  let r;
  try {
    r = await fetch(APP + ruta, {
      method: metodo,
      headers: { ...(metodo === "POST" ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(metodo === "POST" ? { body: JSON.stringify(cuerpo ?? {}) } : {}),
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

async function abrir(tabId, url, automatica) {
  const cargada = cuandoCargue(tabId);
  await chrome.tabs.update(tabId, { url });
  await cargada;
  await esperar(1500);
  let html = await leerPestana(tabId);
  // En la búsqueda sola no se le pone la pestaña enfrente a la persona: se deja para el siguiente despertar.
  if (esVerificacion(html) && automatica) throw new VerificacionPendiente();
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

async function buscar(automatica = false) {
  corriendo = true;
  let tabId = null;
  // En la búsqueda sola, si algo sale mal se vuelve en silencio a lo que mostraba el popup antes.
  const { progreso: antes } = await chrome.storage.local.get("progreso");
  const fallar = (mensaje) =>
    automatica ? chrome.storage.local.set({ progreso: antes ?? null }) : progreso({ fase: "error", mensaje });
  try {
    const { token } = await chrome.storage.local.get("token");
    if (!token) return automatica ? undefined : progreso({ fase: "error", mensaje: "Primero conecta la extensión con el código del panel." });
    await chrome.storage.local.set({
      progreso: { fase: "buscando", paginas: 0, mensaje: automatica ? "Búsqueda de la semana: empezando…" : "Empezando…", latido: Date.now() },
    });

    const inicio = await api("/api/extension/busqueda", { automatica }, token);
    if (!inicio.ok) return fallar(inicio.mensaje);

    tabId = (await chrome.tabs.create({ url: "about:blank", active: false })).id;
    let url = inicio.siguiente;
    for (let n = 1; url; n++) {
      if (n > 1) await esperar(PAUSA_MIN_MS + Math.random() * (PAUSA_MAX_MS - PAUSA_MIN_MS));
      await progreso({ fase: "buscando", paginas: n - 1, mensaje: `Leyendo la página ${n} de Encuentra24…` });
      const html = await abrir(tabId, url, automatica);
      const r = await api("/api/extension/pagina", { busqueda: inicio.busqueda, url, html }, token);
      if (!r.ok) return fallar(r.mensaje);
      url = r.siguiente;
    }

    await chrome.tabs.remove(tabId).catch(() => {});
    tabId = null;
    await progreso({ fase: "revisando", mensaje: "Revisando cuáles son dueños directos…" });
    const r = await esperarResultado(inicio.busqueda, token);
    if (!r.ok) return fallar(r.mensaje);
    const n = r.resumen.duenos;
    await progreso({
      fase: "listo",
      fecha: Date.now(),
      mensaje:
        n === 0
          ? `Listo: revisé ${r.resumen.anuncios} anuncios y esta semana no hay dueños nuevos.`
          : `Listo: ${n} ${n === 1 ? "dueño nuevo" : "dueños nuevos"}. Están en el panel, en Más, en Dueños directos.`,
    });
  } catch (e) {
    await fallar(
      e instanceof VerificacionPendiente
        ? "Encuentra24 siguió pidiendo la verificación. Vuelve a buscar cuando puedas resolverla en la pestaña."
        : "La búsqueda se cortó. Vuelve a intentarlo.",
    );
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

// --- Conexión desde la página de instalación del panel (panel.js) ----------------------------------------

const ORIGEN_APP = (() => {
  try {
    return new URL(APP).origin;
  } catch {
    return null;
  }
})();

/** ¿El mensaje viene del content script de esta extensión, en la ventana principal de /panel/duenos* del panel? */
function desdeElPanel(remitente) {
  if (!ORIGEN_APP || remitente?.id !== chrome.runtime.id || !remitente.tab || remitente.frameId !== 0) return false;
  try {
    const u = new URL(remitente.url ?? "");
    return u.origin === ORIGEN_APP && u.pathname.startsWith("/panel/duenos");
  } catch {
    return false;
  }
}

let conectandoPanel = false;

/** Canjea el código que le pasó la página. A la página solo vuelve si quedó conectada y a quién: el permiso no. */
async function conectarDesdePanel(codigo) {
  if (conectandoPanel) return { ok: false, mensaje: "Ya se está conectando. Espera un momento." };
  conectandoPanel = true;
  try {
    const r = await conectar(codigo);
    return r?.ok ? { ok: true, corredor: typeof r.corredor === "string" ? r.corredor : "" } : { ok: false, mensaje: r?.mensaje ?? "No se pudo conectar." };
  } finally {
    conectandoPanel = false;
  }
}

/**
 * Al instalarla o actualizarla, Chrome no carga el content script en las pestañas que ya estaban abiertas: se le
 * pone a la del panel para que la página vea la extensión sin recargar (y el asistente avance solo).
 */
async function avisarAlPanel() {
  if (!ORIGEN_APP) return;
  const tabs = await chrome.tabs.query({ url: `${ORIGEN_APP}/panel/duenos*` }).catch(() => []);
  for (const t of tabs) {
    if (t.id !== undefined) chrome.scripting.executeScript({ target: { tabId: t.id }, files: ["canal.js", "panel.js"] }).catch(() => {});
  }
}
chrome.runtime.onInstalled.addListener(() => {
  avisarAlPanel().catch(() => {});
});

async function desconectar() {
  const { token } = await chrome.storage.local.get("token");
  if (token) await api("/api/extension/desconectar", {}, token);
  await chrome.storage.local.remove(["token", "corredor", "progreso"]);
  return { ok: true };
}

// --- Búsqueda semanal sola ----------------------------------------------------------------------------

async function despertar() {
  const { token, buscarSola } = await chrome.storage.local.get(["token", "buscarSola"]);
  // Apagada en el popup, o sin conectar: no pregunta ni busca.
  if (!token || buscarSola === false || corriendo) return;
  const r = await api("/api/extension/programa", null, token, "GET");
  if (!r?.ok) return;
  if (typeof r.ultimaDias === "number") await chrome.storage.local.set({ ultimaDias: r.ultimaDias });
  if (r.buscar && !corriendo) await buscar(true);
}

async function verUltima() {
  const { token } = await chrome.storage.local.get("token");
  if (!token) return { ok: false };
  const r = await api("/api/extension/programa?ver=1", null, token, "GET");
  if (r?.ok) await chrome.storage.local.set({ ultimaDias: r.ultimaDias ?? null });
  return r;
}

function programarAlarma() {
  // Crear la alarma con el mismo nombre la reemplaza: el primer despertar es al minuto de abrir Chrome.
  chrome.alarms.create(ALARMA, { delayInMinutes: 1, periodInMinutes: CADA_MIN });
}

chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === ALARMA) despertar().catch(() => {});
});
chrome.runtime.onInstalled.addListener(programarAlarma);
chrome.runtime.onStartup.addListener(programarAlarma);

// --- Leer este anuncio ---------------------------------------------------------------------------------

/**
 * Corre dentro de la página del anuncio. Saca la dirección, el título, el texto visible, el JSON-LD, los enlaces de
 * WhatsApp (ahí va la referencia de los anuncios de la asistente) y las fotos. Tolerante: si no reconoce la galería,
 * manda todas las imágenes grandes de la página.
 */
function extraerAnuncio() {
  const MAX_TEXTO = 20000;
  const jsonld = [...document.querySelectorAll('script[type="application/ld+json"]')]
    .map((s) => (s.textContent ?? "").trim())
    .filter(Boolean)
    .slice(0, 5)
    .map((t) => t.slice(0, MAX_TEXTO));
  const enlaces = [...document.querySelectorAll("a[href]")]
    .map((a) => a.href)
    .filter((h) => /wa\.me|whatsapp/i.test(h))
    .slice(0, 50);

  const fuente = (img) => img.currentSrc || img.src || img.dataset?.src || img.dataset?.lazy || "";
  const ancho = (img) => img.naturalWidth || img.width || 0;
  const alto = (img) => img.naturalHeight || img.height || 0;
  const grande = (img, min) => ancho(img) >= min && alto(img) >= min * 0.6;
  const GALERIA = '[class*="gallery" i], [class*="galeria" i], [class*="carousel" i], [class*="slider" i], [class*="swiper" i], [class*="photo" i], [id*="gallery" i]';
  const imagenes = [...document.images];
  // En la galería, una foto que todavía no carga (ancho 0) también cuenta; las miniaturas diminutas no.
  const deGaleria = imagenes.filter((img) => img.closest(GALERIA) && (ancho(img) === 0 || grande(img, 300)));
  const elegidas = deGaleria.length >= 2 ? deGaleria : imagenes.filter((img) => grande(img, 400));
  const fotos = elegidas.map(fuente);
  for (const t of jsonld) {
    try {
      const datos = [JSON.parse(t)].flat();
      for (const d of datos) {
        for (const i of [d?.image].flat()) {
          if (typeof i === "string") fotos.push(i);
          else if (typeof i?.url === "string") fotos.push(i.url);
        }
      }
    } catch {
      // JSON-LD roto: se ignora
    }
  }
  // La verificación de Cloudflare en vez del anuncio.
  const desafio =
    !!document.querySelector('script[src*="challenge-platform"], #challenge-form, #cf-challenge-running') || /just a moment/i.test(document.title);
  return {
    desafio,
    url: location.href,
    titulo: document.title,
    texto: (document.body?.innerText ?? "").slice(0, MAX_TEXTO),
    jsonld,
    enlaces,
    fotos: [...new Set(fotos.filter((u) => typeof u === "string" && u.startsWith("https://") && !/\.svg(\?|$)/i.test(u)))].slice(0, 30),
  };
}

async function leerAnuncio(tabId) {
  // La lectura recuerda de qué página es: el popup solo la muestra en esa pestaña.
  const tabUrl = await chrome.tabs.get(tabId).then((t) => t.url ?? "", () => "");
  const fin = (fase, mensaje, ruta = null) => chrome.storage.local.set({ lectura: { fase, mensaje, ruta, url: tabUrl, fecha: Date.now() } });
  const { token } = await chrome.storage.local.get("token");
  if (!token) return fin("error", "Primero conecta la extensión con el código del panel.");
  await fin("leyendo", "Leyendo el anuncio…");
  let pagina;
  try {
    if (!esPaginaDeAnuncio(tabUrl)) return fin("error", "Abre la página de un anuncio de Encuentra24 y vuelve a tocar el botón.");
    const [r] = await chrome.scripting.executeScript({ target: { tabId }, func: extraerAnuncio });
    pagina = r?.result;
  } catch {
    pagina = null;
  }
  if (!pagina?.url) return fin("error", "No pude leer esta página. Recárgala y vuelve a intentarlo.");
  if (pagina.desafio) {
    return fin("error", "Encuentra24 pide verificar que eres una persona. Resuélvelo en la página y vuelve a tocar el botón.");
  }
  const { desafio: _desafio, ...datos } = pagina;
  const r = await api("/api/extension/anuncio", datos, token);
  const ruta = typeof r?.ruta === "string" && r.ruta.startsWith("/panel/") ? r.ruta : null;
  return fin(r?.ok ? "listo" : "error", r?.mensaje || "No se pudo leer el anuncio. Vuelve a intentarlo.", ruta);
}

chrome.runtime.onMessage.addListener((m, remitente, responder) => {
  // La página del panel (por panel.js) solo puede preguntar si está y pasar un código; nada más.
  if (remitente?.tab) {
    if (!desdeElPanel(remitente)) return false;
    if (m?.tipo === "panel_estado") {
      chrome.storage.local.get(["token", "corredor"]).then(({ token, corredor }) =>
        responder({ conectada: !!token, corredor: token && typeof corredor === "string" ? corredor : "" }),
      );
      return true;
    }
    if (m?.tipo === "panel_conectar" && typeof m.codigo === "string" && /^[A-Z0-9]{4}-?[A-Z0-9]{4}$/.test(m.codigo)) {
      conectarDesdePanel(m.codigo).then(responder, () => responder({ ok: false, mensaje: "No se pudo conectar." }));
      return true;
    }
    return false;
  }
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
  if (m?.tipo === "leer_anuncio" && Number.isInteger(m.tabId)) {
    leerAnuncio(m.tabId).catch(() =>
      chrome.storage.local.set({ lectura: { fase: "error", mensaje: "No se pudo leer el anuncio. Vuelve a intentarlo.", fecha: Date.now() } }),
    );
    responder({ ok: true });
  }
  if (m?.tipo === "ver_ultima") {
    verUltima().then(responder, () => responder({ ok: false }));
    return true;
  }
  if (m?.tipo === "buscar_sola") {
    // Al encenderla, el próximo despertar es en un minuto.
    chrome.storage.local.set({ buscarSola: m.encendida === true }).then(() => {
      if (m.encendida === true) programarAlarma();
      responder({ ok: true });
    });
    return true;
  }
  return false;
});

// Si Chrome cerró la extensión a media búsqueda o lectura, el aviso no queda en "buscando" para siempre.
chrome.runtime.onStartup.addListener(async () => {
  const { progreso: p, lectura } = await chrome.storage.local.get(["progreso", "lectura"]);
  if (p && ["buscando", "verificar", "revisando"].includes(p.fase)) {
    await progreso({ fase: "error", mensaje: "La búsqueda anterior se cortó. Vuelve a empezarla." });
  }
  if (lectura?.fase === "leyendo") await chrome.storage.local.remove("lectura");
});
