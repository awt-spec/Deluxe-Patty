import { APP } from "./config.js";
import { esPaginaDeAnuncio, esVerificacion } from "./comun.js";
import { activa, textoFase, transicion } from "./maquina.js";
import { deQuien, estadoPublico, leerPedido } from "./mensajes.js";
import {
  anotarPaginaDelDia,
  azar,
  estimarRestanteMs,
  hoyLocal,
  planLectura,
  quedanHoy,
  RITMO,
  ritmoInicial,
  siguientePausa,
  textoDuracion,
  totalEstimado,
} from "./ritmo.js";

// La extensión solo abre páginas: el servidor le dice qué dirección de Encuentra24 sigue, la abre en UNA pestaña de
// este Chrome (con el internet de la casa), le manda lo que trajo la página y espera la próxima. Va al ritmo de una
// persona (ritmo.js): lee cada página un rato, baja por tramos, hace pausas y descansa cada pocas páginas, con un tope
// de páginas por búsqueda y por día. Nada se disfraza: es el Chrome de la persona, con su sesión, sin tocar su
// identidad (user agent, huellas) y sin resolver ni saltar verificaciones.
//
// A la vista (la empieza la persona, o la semanal si eligió "a la vista"): la pestaña queda activa y control.js pone
// encima un marco, una barra con Pausar y Detener y un cursor con el nombre de la asistente que muestra qué mira. Si la
// persona usa esa pestaña (mouse, teclado, rueda), se pausa sola. Se detiene desde la barra, el popup o el panel; al
// detener, lo leído se revisa y se guarda (/api/extension/detener).
//
// Si Encuentra24 pide confirmar que es una persona (o frena con 403/429): a la vista, la búsqueda se detiene, deja la
// pestaña enfrente y pide "Resuélvelo y toca Seguir"; en la semanal de fondo se cancela en silencio y se reintenta en el
// siguiente despertar.
//
// Además:
//  - Búsqueda semanal sola: una alarma despierta cada ~6 horas (y al abrir Chrome) y le pregunta al servidor si toca
//    (/api/extension/programa). Se apaga en el popup.
//  - "Leer este anuncio": manda al servidor lo que muestra la página del anuncio abierto (texto, JSON-LD, fotos).

const ESPERA_RESULTADO_MS = 6 * 60_000;
const ESPERA_VERIFICACION_MS = 15 * 60_000;
/** Pausada más de esto (nadie volvió), se detiene guardando lo leído. */
const PAUSA_MAX_MS = 30 * 60_000;
const LATIDO_MS = 4_000;
const ALARMA = "busqueda-semanal";
const CADA_MIN = 6 * 60;

const ORIGEN_APP = (() => {
  try {
    return new URL(APP).origin;
  } catch {
    return null;
  }
})();
/** Factor para acelerar el reloj en las pruebas locales: solo vale con el panel en localhost. */
const PRUEBA_LOCAL = !!ORIGEN_APP && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(ORIGEN_APP);

/** La búsqueda en curso (una a la vez). null: ninguna. */
let S = null;

class Detenida extends Error {}
class Silencio extends Error {}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

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

// --- Estado que ven el popup, el panel y la barra ------------------------------------------------------------

/** Guarda el estado público (el popup lo lee; el latido dice que sigue viva) y se lo pasa a la barra. */
async function publicar() {
  if (!S) return;
  const restantes = Math.max(0, S.total - S.pagina);
  S.restanteMs = S.fase === "buscando" || S.fase === "pausada" ? estimarRestanteMs(restantes, S.esperaMs ?? 0) : 0;
  S.latido = Date.now();
  // En el descanso, la cuenta regresiva.
  if (S.descanso && S.fase === "buscando") S.haciendo = `Descansando ${Math.max(1, Math.ceil((S.esperaMs ?? 0) / 1000))} s…`;
  // Lo que hace: el paso en curso mientras busca; fuera de eso, la fase en palabras (sin pisar el paso).
  const p = estadoPublico({ ...S, haciendo: S.fase === "buscando" ? S.haciendo : textoFase(S) });
  // chrome.storage cuenta como actividad: mantiene despierto al trabajador de fondo en las esperas largas. Aparte, lo
  // mínimo para no dejarla colgada si Chrome se cierra (limpiarCortada): el id de la búsqueda y la pestaña.
  await chrome.storage.local.set({
    busqueda: { ...p, mensaje: p.mensaje || textoFase(S) },
    busquedaViva: activa(S.fase) && S.id ? { id: S.id, tabId: S.tabId } : null,
  });
  avisarBarra({ tipo: "pintar", estado: { ...p, asistente: S.asistente } });
}

function avisarBarra(m) {
  if (!S?.tabId || !S.barra) return;
  chrome.tabs.sendMessage(S.tabId, { para: "control", ...m }, { frameId: 0 }).catch(() => {});
}

/** Aplica un evento de la máquina de estados (maquina.js). false si no correspondía. */
async function cambiar(evento, extra = {}) {
  if (!S) return false;
  const nuevo = transicion(S, evento);
  if (!nuevo) return false;
  Object.assign(S, nuevo, extra);
  if (S.fase === "pausada") S.pausadaDesde = Date.now();
  await publicar();
  return true;
}

// --- Pedidos de la persona: pausar, seguir y detener ---------------------------------------------------------

async function pausar(motivo = "usuario") {
  return cambiar({ tipo: "pausar", motivo });
}

async function seguir() {
  return cambiar({ tipo: "seguir" });
}

/** Detener: se corta en menos de un segundo. `origen` decide qué pasa con la pestaña (ver cortar). */
function detener(origen = "popup") {
  if (!S || !activa(S.fase) || S.fase === "revisando") return false;
  S.detener ??= origen;
  return true;
}

/**
 * Espera `ms` del ritmo (acelerado en las pruebas locales). En pausa o en la verificación el reloj no corre; Detener
 * corta la espera enseguida. `alSeguir(hecho)` corre al volver de una pausa (para que el cursor retome).
 */
async function esperarActivo(ms, alSeguir) {
  let falta = ms;
  let antes = Date.now();
  let latido = 0;
  let estabaPausada = false;
  for (;;) {
    if (S.detener) throw new Detenida();
    const ahora = Date.now();
    if (S.fase === "buscando") {
      if (estabaPausada) {
        estabaPausada = false;
        alSeguir?.(ms - falta);
      }
      falta -= (ahora - antes) * S.velocidad;
    } else {
      estabaPausada = true;
      if (S.fase === "pausada" && ahora - S.pausadaDesde > PAUSA_MAX_MS) detener("pausa_larga");
    }
    antes = ahora;
    if (falta <= 0 && S.fase === "buscando") {
      S.esperaMs = 0;
      return;
    }
    S.esperaMs = Math.max(0, falta);
    if (ahora - latido > LATIDO_MS) {
      latido = ahora;
      await publicar();
    }
    await dormir(Math.max(20, Math.min(250, falta / S.velocidad)));
  }
}

// --- La pestaña -----------------------------------------------------------------------------------------------

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
 * Lo que necesita el servidor de la página: el título y los scripts con los datos de los anuncios (payload de Next.js).
 * Si no los hay (por ejemplo, la verificación de Cloudflare), la página entera. Más el código HTTP (403, 429).
 */
async function leerPestana(tabId) {
  try {
    const [r] = await chrome.scripting.executeScript({
      target: { tabId, frameIds: [0] },
      func: () => {
        const nav = performance.getEntriesByType("navigation")[0];
        const estado = typeof nav?.responseStatus === "number" ? nav.responseStatus : 0;
        const datos = [...document.scripts].map((s) => s.textContent ?? "").filter((t) => t.includes("self.__next_f"));
        if (datos.length === 0) return { estado, html: document.documentElement.outerHTML.slice(0, 300_000) };
        const titulo = document.title.replace(/</g, "");
        return { estado, html: `<title>${titulo}</title>\n` + datos.map((t) => `<script>${t}</script>`).join("\n") };
      },
    });
    const v = r?.result;
    return { estado: Number(v?.estado) || 0, html: typeof v?.html === "string" ? v.html : "" };
  } catch {
    return { estado: 0, html: "" };
  }
}

/** Pone la barra, el marco y el cursor (control.js) sobre la página recién cargada. */
async function ponerBarra() {
  if (!S.tabId) return;
  // Si ya está en esta página (la misma verificación, vuelta a mirar), no se pone otra.
  const ya = await chrome.tabs.sendMessage(S.tabId, { para: "control", tipo: "hola" }, { frameId: 0 }).catch(() => null);
  S.barra = ya?.ok === true;
  if (!S.barra) {
    try {
      await chrome.scripting.executeScript({ target: { tabId: S.tabId, frameIds: [0] }, files: ["control.js"] });
      S.barra = true;
    } catch {
      // Una página de error de Chrome no deja: la búsqueda sigue igual.
    }
  }
  await publicar();
}

/** Cuántos anuncios trae la página (para el tiempo de lectura): cada anuncio dice su tipo de anunciante. */
const contarAnuncios = (html) => Math.min(60, (html.match(/advertiserType/g) ?? []).length);

async function abrirPagina(url) {
  if (S.detener) throw new Detenida();
  S.barra = false;
  const cargada = cuandoCargue(S.tabId);
  await chrome.tabs.update(S.tabId, { url });
  await cargada;
  if (S.detener) throw new Detenida();
  await dormir(Math.max(50, 1200 / S.velocidad));
  return leerPestana(S.tabId);
}

/**
 * Encuentra24 pide confirmar que es una persona. A la vista: la pestaña queda enfrente y se espera a que la persona la
 * resuelva y toque Seguir (o "Dejarlo para después", que detiene guardando lo leído). La extensión no toca el desafío.
 */
async function esperarVerificacion() {
  if (S.automatica && !S.aLaVista) throw new Silencio();
  if (S.fase === "pausada") await cambiar({ tipo: "seguir" });
  await cambiar({ tipo: "verificacion" });
  try {
    const tab = await chrome.tabs.update(S.tabId, { active: true });
    await chrome.windows.update(tab.windowId, { focused: true });
  } catch {
    // la pestaña ya no está: lo resuelve onRemoved
  }
  await ponerBarra();
  const hasta = Date.now() + ESPERA_VERIFICACION_MS;
  let latido = Date.now();
  for (;;) {
    if (S.detener) throw new Detenida();
    if (Date.now() > hasta) {
      detener("verificacion");
      throw new Detenida();
    }
    if (S.fase === "buscando") {
      // Tocó Seguir: se vuelve a mirar la página (al resolverla, Encuentra24 la recarga sola).
      const pagina = await leerPestana(S.tabId);
      if (!esVerificacion(pagina)) return pagina;
      await cambiar({ tipo: "verificacion" }, { mensaje: "Todavía veo la verificación. Resuélvela en la página y toca Seguir." });
      await ponerBarra();
    }
    await dormir(400);
    if (Date.now() - latido > LATIDO_MS) {
      latido = Date.now();
      await publicar();
    }
  }
}

/** Le cuenta al servidor una página más leída hoy en este Chrome. */
async function contarPaginaDelDia() {
  const { paginasHoy } = await chrome.storage.local.get("paginasHoy");
  await chrome.storage.local.set({ paginasHoy: anotarPaginaDelDia(paginasHoy, hoyLocal()) });
}

// --- La búsqueda ---------------------------------------------------------------------------------------------

let limpieza = Promise.resolve();

/**
 * Busca dueños. `automatica`: la semanal sola (sin avisos si algo sale mal). A la vista si la pidió la persona o si
 * eligió "a la vista" para la semanal.
 */
async function buscar(automatica = false) {
  await limpieza;
  if (S) return { ok: false, mensaje: "Ya hay una búsqueda en curso." };
  const guardado = await chrome.storage.local.get(["token", "paginasHoy", "modoSemanal", "velocidadPrueba", "busqueda"]);
  const { token } = guardado;
  const fallarAntes = async (mensaje) => {
    if (!automatica) await chrome.storage.local.set({ busqueda: { fase: "error", mensaje, latido: Date.now() } });
    return { ok: false, mensaje };
  };
  if (!token) return fallarAntes("Primero conecta la extensión con el código del panel.");
  const restantesHoy = quedanHoy(guardado.paginasHoy, hoyLocal());
  if (restantesHoy <= 0) {
    return fallarAntes(`Hoy ya leí ${RITMO.maxPaginasDia} páginas de Encuentra24, el máximo del día. Sigo mañana.`);
  }

  const velocidad = PRUEBA_LOCAL && Number(guardado.velocidadPrueba) > 1 ? Math.min(1000, Number(guardado.velocidadPrueba)) : 1;
  S = {
    fase: "lista",
    automatica,
    aLaVista: !automatica || guardado.modoSemanal === "vista",
    pagina: 0,
    total: 0,
    velocidad,
    asistente: "Patty",
    antes: guardado.busqueda ?? null,
    haciendo: "Empezando…",
    tabId: null,
    barra: false,
    detener: null,
    id: null,
    token,
    enviando: null,
  };
  await cambiar({ tipo: "iniciar" }, { mensaje: "" });

  try {
    const inicio = await api("/api/extension/busqueda", { automatica }, token);
    if (!inicio.ok) {
      if (automatica) throw new Silencio();
      await cambiar({ tipo: "fallar" }, { mensaje: inicio.mensaje ?? "No se pudo empezar." });
      return { ok: false, mensaje: inicio.mensaje };
    }
    S.id = inicio.busqueda;
    S.asistente = typeof inicio.asistente === "string" && inicio.asistente.trim() ? inicio.asistente.trim().slice(0, 40) : "Patty";
    S.total = Math.max(1, totalEstimado(inicio.zonas, restantesHoy));
    S.haciendo = `Empezando: tardaré ${textoDuracion(S.total)}.`;

    // Una sola pestaña. A la vista, junto a la del panel o el popup y enfrente; de fondo, sin quitarle la vista a nadie.
    const tab = await chrome.tabs.create({ url: "about:blank", active: S.aLaVista });
    S.tabId = tab.id;
    await publicar();

    const rng = azar((Date.now() ^ Math.floor(Math.random() * 2 ** 31)) >>> 0);
    let ritmo = ritmoInicial(rng);
    let url = inicio.siguiente;
    while (url) {
      if (S.pagina >= S.total) {
        // Tope de páginas por búsqueda o por día: se corta guardando lo leído.
        S.detener = "tope";
        throw new Detenida();
      }
      if (S.pagina > 0) {
        const p = siguientePausa(ritmo, rng);
        ritmo = p.estado;
        const s = Math.round(p.ms / 1000);
        S.haciendo = p.tipo === "descanso" ? `Descansando ${s} s…` : "Pasando a la siguiente página…";
        S.descanso = p.tipo === "descanso";
        await publicar();
        avisarBarra({ tipo: "siguiente", ms: Math.min(p.ms, 2500) / S.velocidad, pagina: S.pagina + 1 });
        await esperarActivo(p.ms);
        S.descanso = false;
      }
      S.pagina++;
      S.haciendo = `Abriendo la página ${S.pagina}…`;
      await publicar();
      let pagina = await abrirPagina(url);
      if (esVerificacion(pagina)) pagina = await esperarVerificacion();
      await contarPaginaDelDia();
      await ponerBarra();

      const plan = planLectura(contarAnuncios(pagina.html), rng);
      S.haciendo = "Leyendo anuncios…";
      await publicar();
      const pedida = url;
      S.enviando = api("/api/extension/pagina", { busqueda: S.id, url: pedida, html: pagina.html }, token);
      const mirar = (hecho) => {
        if (S.fase !== "buscando") return;
        // Los tramos que faltan, con el tiempo ya acelerado para la animación.
        let acumulado = 0;
        const tramos = [];
        for (const t of plan.tramos) {
          acumulado += t.ms;
          if (acumulado > hecho) tramos.push({ hasta: t.hasta, ms: Math.min(t.ms, acumulado - hecho) / S.velocidad });
        }
        avisarBarra({ tipo: "mirar", tramos });
      };
      mirar(0);
      await esperarActivo(plan.ms, mirar);
      const r = await S.enviando;
      S.enviando = null;
      if (!r.ok) throw Object.assign(new Error("pagina"), { mensaje: r.mensaje });
      url = r.siguiente;
    }

    await cambiar({ tipo: "revisar" });
    await cerrarPestana();
    await esperarResultado();
  } catch (e) {
    if (e instanceof Detenida) await cortar();
    else if (e instanceof Silencio || (S.automatica && !S.aLaVista)) await silenciar();
    else await fallar(e?.mensaje ?? "La búsqueda se cortó. Vuelve a intentarlo.");
  } finally {
    if (S?.tabId && !S.dejarPestana) chrome.tabs.remove(S.tabId).catch(() => {});
    S = null;
  }
  return { ok: true };
}

async function cerrarPestana() {
  if (!S.tabId) return;
  const id = S.tabId;
  S.tabId = null;
  S.barra = false;
  await chrome.tabs.remove(id).catch(() => {});
}

/**
 * Se detuvo (Detener, la pestaña cerrada, la verificación dejada, una pausa demasiado larga o el tope de páginas): se
 * espera la página que iba en camino, el servidor revisa lo leído y la pestaña se cierra, salvo que la persona la haya
 * detenido desde ella misma (la está usando: solo se quita la barra).
 */
async function cortar() {
  const origen = S.detener ?? "popup";
  const enCamino = await S.enviando?.catch(() => null);
  S.enviando = null;
  // Si esa era la última página, el servidor ya está revisando todo: no hay nada que cortar.
  const yaTermino = enCamino?.ok === true && enCamino.siguiente === null;
  if (origen === "pestana") {
    avisarBarra({ tipo: "quitar" });
    S.dejarPestana = true;
    S.tabId = null;
    S.barra = false;
  } else {
    await cerrarPestana();
  }
  await cambiar({ tipo: "detener" });
  // El tope de páginas no es "detenida": la búsqueda se da por hecha con lo leído.
  if (origen === "tope") S.detenida = false;
  if (yaTermino) return esperarResultado(origen);
  const r = S.id ? await api("/api/extension/detener", { busqueda: S.id, motivo: origen === "tope" ? "tope" : "usuario" }, S.token) : { ok: false };
  if (!r.ok) {
    // Nada que guardar (la detuvo antes de la primera página).
    await cambiar({ tipo: "terminar" }, { mensaje: "Detenida. No alcancé a leer anuncios." });
    return;
  }
  await esperarResultado(origen);
}

async function esperarResultado(origen = null) {
  const hasta = Date.now() + ESPERA_RESULTADO_MS;
  let r = { ok: false, mensaje: "La revisión tardó demasiado. Mira el panel en un rato; si no aparecen, vuelve a buscar." };
  while (Date.now() < hasta) {
    await dormir(Math.max(200, 4000 / S.velocidad));
    const c = await api("/api/extension/estado", { busqueda: S.id }, S.token);
    if (!c.ok || c.listo) {
      r = c;
      break;
    }
    await publicar();
  }
  if (S.automatica && !S.aLaVista && !r.ok) return silenciar();
  const detenida = S.detenida;
  let mensaje;
  if (r.ok) {
    const n = r.resumen.duenos;
    const encontrados = n === 0 ? "no hay dueños nuevos" : `${n} ${n === 1 ? "dueño nuevo" : "dueños nuevos"} en el panel, en Dueños directos`;
    if (origen === "tope") mensaje = `Por hoy es suficiente: revisé ${r.resumen.anuncios} anuncios y ${encontrados}.`;
    else if (detenida) mensaje = `Detenida. De lo que alcancé a leer (${r.resumen.anuncios} anuncios): ${encontrados}.`;
    else mensaje = n === 0 ? `Listo: revisé ${r.resumen.anuncios} anuncios y esta semana no hay dueños nuevos.` : `Listo: ${encontrados}.`;
  } else {
    mensaje = r.mensaje ?? "No se pudo revisar.";
  }
  await cambiar({ tipo: "terminar" }, { mensaje, fecha: Date.now() });
}

/** La semanal de fondo no molesta: se vuelve a lo que se mostraba antes y se reintenta en el siguiente despertar. */
async function silenciar() {
  await cerrarPestana();
  await chrome.storage.local.set({ busqueda: S.antes ?? null });
}

async function fallar(mensaje) {
  await cerrarPestana();
  if (!(await cambiar({ tipo: "fallar" }, { mensaje }))) {
    await chrome.storage.local.set({ busqueda: { fase: "error", mensaje, latido: Date.now() } });
  }
}

// Si la persona cierra la pestaña de la búsqueda, es como tocar Detener.
chrome.tabs.onRemoved.addListener((tabId) => {
  if (S && S.tabId === tabId) {
    S.tabId = null;
    S.barra = false;
    detener("cerrada");
  }
});

/**
 * Al despertar el trabajador de fondo no hay búsqueda en memoria: si el estado guardado dice que había una en curso,
 * Chrome se cerró (o cerró la extensión) a media búsqueda. No se deja colgada: se le pide al servidor que guarde lo
 * leído y se avisa.
 */
async function limpiarCortada() {
  const { busqueda: b, busquedaViva: viva, token } = await chrome.storage.local.get(["busqueda", "busquedaViva", "token"]);
  if (!b || !activa(b.fase)) return;
  if (viva?.tabId) chrome.tabs.remove(viva.tabId).catch(() => {});
  if (token && viva?.id) await api("/api/extension/detener", { busqueda: viva.id, motivo: "usuario" }, token);
  await chrome.storage.local.set({
    busqueda: {
      fase: "detenida",
      mensaje:
        viva?.id && !b.automatica
          ? "La búsqueda anterior se cortó (se cerró Chrome). Guardé lo que alcancé a leer: míralo en el panel."
          : "La búsqueda anterior se cortó. Vuelve a empezarla.",
      latido: Date.now(),
    },
  });
}
limpieza = limpiarCortada().catch(() => {});

async function conectar(codigo) {
  const r = await api("/api/extension/conectar", { codigo });
  if (r.ok) await chrome.storage.local.set({ token: r.token, corredor: r.corredor, busqueda: null });
  return r;
}

// --- Conexión desde la página de instalación del panel (panel.js) ----------------------------------------

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
  detener("popup");
  const { token } = await chrome.storage.local.get("token");
  if (token) await api("/api/extension/desconectar", {}, token);
  await chrome.storage.local.remove(["token", "corredor", "busqueda", "busquedaViva"]);
  return { ok: true };
}

/** Estado público de la búsqueda (para el panel): el de memoria si hay una en curso, o el último guardado. */
async function estadoParaAfuera() {
  if (S) return estadoPublico({ ...S, haciendo: S.fase === "buscando" ? S.haciendo : textoFase(S), mensaje: S.mensaje || textoFase(S) });
  const { busqueda } = await chrome.storage.local.get("busqueda");
  return estadoPublico(busqueda ?? null);
}

// --- Búsqueda semanal sola ----------------------------------------------------------------------------

async function despertar() {
  const { token, buscarSola } = await chrome.storage.local.get(["token", "buscarSola"]);
  // Apagada en el popup, o sin conectar: no pregunta ni busca.
  if (!token || buscarSola === false || S) return;
  const r = await api("/api/extension/programa", null, token, "GET");
  if (!r?.ok) return;
  if (typeof r.ultimaDias === "number") await chrome.storage.local.set({ ultimaDias: r.ultimaDias });
  if (r.buscar && !S) await buscar(true);
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

// --- Mensajes: cada remitente con su lista de pedidos (mensajes.js) -----------------------------------------

/** Pausar, seguir, detener o empezar, venga de donde venga (popup, panel o la barra). */
async function ordenDeBusqueda(orden, origen) {
  if (orden === "pausar") await pausar("usuario");
  else if (orden === "seguir") await seguir();
  else if (orden === "detener") detener(origen);
  else if (orden === "buscar" && !S) buscar(false).catch(() => {});
  // Un respiro para que el estado que vuelve ya traiga el cambio.
  await dormir(orden === "buscar" ? 300 : 50);
  return estadoParaAfuera();
}

chrome.runtime.onMessage.addListener((mensaje, remitente, responder) => {
  const de = deQuien(remitente, { id: chrome.runtime.id, origenApp: ORIGEN_APP, tabBusqueda: S?.tabId ?? null });
  const m = leerPedido(de, mensaje);
  if (!m) return false;
  const conRespuesta = (promesa) => {
    promesa.then(responder, () => responder({ ok: false }));
    return true;
  };

  // La barra sobre Encuentra24 (control.js), solo desde la pestaña de la búsqueda.
  if (de === "control") {
    if (m.tipo === "control_pausar") return conRespuesta(pausar("usuario"));
    if (m.tipo === "control_seguir") return conRespuesta(seguir());
    if (m.tipo === "control_detener") return conRespuesta(Promise.resolve(detener("pestana")));
    if (m.tipo === "control_dejar") return conRespuesta(Promise.resolve(detener("verificacion")));
    if (m.tipo === "control_actividad") return conRespuesta(pausar("actividad"));
    return false;
  }

  // La página del panel (por panel.js): estado, conectar con un código y pausar/seguir/detener/buscar sin parámetros.
  if (de === "panel") {
    if (m.tipo === "panel_estado") {
      return conRespuesta(
        chrome.storage.local.get(["token", "corredor"]).then(({ token, corredor }) => ({
          conectada: !!token,
          corredor: token && typeof corredor === "string" ? corredor : "",
        })),
      );
    }
    if (m.tipo === "panel_conectar") return conRespuesta(conectarDesdePanel(m.codigo));
    if (m.tipo === "panel_busqueda") {
      return conRespuesta(
        chrome.storage.local.get("token").then(({ token }) => (token || m.orden === "estado" ? ordenDeBusqueda(m.orden, "panel") : estadoParaAfuera())),
      );
    }
    return false;
  }

  // El popup.
  switch (m.tipo) {
    case "conectar":
      return conRespuesta(conectar(m.codigo));
    case "desconectar":
      return conRespuesta(desconectar());
    case "buscar":
      if (!S) buscar(false).catch(() => {});
      responder({ ok: true });
      return false;
    case "pausar":
    case "seguir":
    case "detener":
      return conRespuesta(ordenDeBusqueda(m.tipo, "popup"));
    case "leer_anuncio":
      leerAnuncio(m.tabId).catch(() =>
        chrome.storage.local.set({ lectura: { fase: "error", mensaje: "No se pudo leer el anuncio. Vuelve a intentarlo.", fecha: Date.now() } }),
      );
      responder({ ok: true });
      return false;
    case "ver_ultima":
      return conRespuesta(verUltima());
    case "buscar_sola":
      // Al encenderla, el próximo despertar es en un minuto.
      return conRespuesta(
        chrome.storage.local.set({ buscarSola: m.encendida }).then(() => {
          if (m.encendida) programarAlarma();
          return { ok: true };
        }),
      );
    case "modo_semanal":
      return conRespuesta(chrome.storage.local.set({ modoSemanal: m.modo }).then(() => ({ ok: true })));
    default:
      return false;
  }
});

// Si Chrome cerró la extensión a media lectura de un anuncio, el aviso no queda en "leyendo" para siempre.
chrome.runtime.onStartup.addListener(async () => {
  const { lectura } = await chrome.storage.local.get("lectura");
  if (lectura?.fase === "leyendo") await chrome.storage.local.remove("lectura");
  // El estado de antes de la 1.3.0.
  await chrome.storage.local.remove("progreso");
});
