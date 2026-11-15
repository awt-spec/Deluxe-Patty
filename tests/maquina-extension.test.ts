import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  busquedaEnCurso,
  CANAL,
  FASES_BUSQUEDA,
  leerMensajeDeExtension,
  ORDENES_BUSQUEDA,
  textoBusqueda,
  type EstadoBusquedaExt,
} from "../lib/panel/extension-instalar";
import { CAPTCHA, DEMASIADAS, DESAFIO_CLOUDFLARE, LISTADO_CON_CAPTCHA } from "./fixtures/verificacion-e24";
import { anuncioE24, paginaE24 } from "./fixtures/e24";
import { ARCHIVOS_EXTENSION, direccionApp, normalizar, revisarCarpeta } from "../scripts/empacar-extension.mjs";

// Módulos de la extensión (JavaScript sin compilar): se cargan tal cual.
type Estado = { fase: string; motivoPausa?: string | null; detenida?: boolean; [k: string]: unknown };
interface Maquina {
  FASES: string[];
  ACTIVAS: string[];
  activa(f: string): boolean;
  transicion(e: Estado, ev: { tipo: string; motivo?: string }): Estado | null;
  textoFase(e: Estado): string;
}
interface Mensajes {
  ORIGEN_E24: string;
  deQuien(remitente: unknown, ctx: { id: string; origenApp: string | null; tabBusqueda: number | null }): string | null;
  leerPedido(de: string | null, m: unknown): Record<string, unknown> | null;
  estadoPublico(s: unknown): Record<string, unknown>;
  esUrlDeE24(url: unknown): boolean;
}
type Paso = { icono: string; texto: string; t?: number };
interface Bitacora {
  ICONOS: string[];
  MAX_PASOS: number;
  nombreZona(url: string): string;
  contarEnPagina(html: unknown): { anuncios: number; propietarios: number };
  textoPaso: {
    inicio(m: string): string;
    abrir(url: string, pagina: number, total: number): string;
    leer(c: { anuncios: number; propietarios: number }): string;
    espera(ms: number): string;
    descanso(ms: number): string;
  };
  pasoDeEvento(ev: { tipo: string }, nuevo: Estado): Paso | null;
  agregarPaso(lista: unknown, paso: Paso, ahora?: number): Required<Paso>[];
  leerBitacora(v: unknown): Required<Paso>[];
}
interface VistaPanel {
  vistaPanel(d: unknown, ahora?: number): {
    conectada: boolean;
    cabecera: { nombre: string; inicial: string; conexion: string; tono: string; progreso: number | null; progresoTexto: string };
    enCurso: null | { fase: string; titulo: string; detalle: string; tiempo: string; botones: Record<string, unknown> };
    resultado: null | { texto: string; error: boolean };
    pasos: { icono: string; texto: string; hora: string }[];
  };
}
interface Comun {
  esVerificacion(p: { html?: string; estado?: number }): boolean;
}
const cargar = async <T,>(ruta: string) => (await import(/* @vite-ignore */ ruta)) as T;
const maq = await cargar<Maquina>("../extension/maquina.js");
const men = await cargar<Mensajes>("../extension/mensajes.js");
const comun = await cargar<Comun>("../extension/comun.js");
const bit = await cargar<Bitacora>("../extension/bitacora.js");
const vp = await cargar<VistaPanel>("../extension/vista-panel.js");

const paso = (e: Estado, ...eventos: { tipo: string; motivo?: string }[]) => {
  let actual: Estado = e;
  for (const ev of eventos) {
    const n = maq.transicion(actual, ev);
    if (!n) throw new Error(`no corresponde ${ev.tipo} en ${actual.fase}`);
    actual = n;
  }
  return actual;
};

describe("estados de la búsqueda (extension/maquina.js)", () => {
  const lista: Estado = { fase: "lista" };

  it("lista → buscando → pausada → buscando → revisando → terminada", () => {
    const e = paso(lista, { tipo: "iniciar" }, { tipo: "pausar" }, { tipo: "seguir" }, { tipo: "revisar" }, { tipo: "terminar" });
    expect(e.fase).toBe("terminada");
    expect(e.detenida).toBe(false);
  });

  it("detener desde buscando, pausada o la verificación: revisa lo leído y queda detenida", () => {
    for (const antes of [[], [{ tipo: "pausar" }], [{ tipo: "verificacion" }]]) {
      const e = paso(lista, { tipo: "iniciar" }, ...antes, { tipo: "detener" });
      expect(e).toMatchObject({ fase: "revisando", detenida: true });
      expect(paso(e, { tipo: "terminar" }).fase).toBe("detenida");
    }
  });

  it("la actividad de la persona pausa con su motivo, y seguir retoma", () => {
    const e = paso(lista, { tipo: "iniciar" }, { tipo: "pausar", motivo: "actividad" });
    expect(e).toMatchObject({ fase: "pausada", motivoPausa: "actividad" });
    expect(maq.textoFase(e)).toMatch(/usar esta pestaña/);
    expect(paso(e, { tipo: "seguir" })).toMatchObject({ fase: "buscando", motivoPausa: null });
    // Un motivo raro cuenta como pausa de la persona.
    expect(paso(lista, { tipo: "iniciar" }, { tipo: "pausar", motivo: "<x>" }).motivoPausa).toBe("usuario");
  });

  it("verificación: espera a la persona; Seguir vuelve a buscar", () => {
    const e = paso(lista, { tipo: "iniciar" }, { tipo: "verificacion" });
    expect(e.fase).toBe("verificacion");
    expect(maq.textoFase(e)).toBe("Encuentra24 pide que confirmes que eres tú. Resuélvelo y toca Seguir.");
    // En la verificación no se pausa por actividad (la persona la está resolviendo).
    expect(maq.transicion(e, { tipo: "pausar", motivo: "actividad" })).toBeNull();
    expect(paso(e, { tipo: "seguir" }).fase).toBe("buscando");
  });

  it("lo que no corresponde se ignora", () => {
    expect(maq.transicion(lista, { tipo: "pausar" })).toBeNull();
    expect(maq.transicion(lista, { tipo: "seguir" })).toBeNull();
    expect(maq.transicion(lista, { tipo: "detener" })).toBeNull();
    expect(maq.transicion({ fase: "buscando" }, { tipo: "iniciar" })).toBeNull();
    expect(maq.transicion({ fase: "revisando" }, { tipo: "detener" })).toBeNull();
    expect(maq.transicion({ fase: "terminada" }, { tipo: "pausar" })).toBeNull();
    expect(maq.transicion({ fase: "buscando" }, { tipo: "borrar_todo" })).toBeNull();
    // No cambia el que recibe.
    const e: Estado = { fase: "buscando" };
    maq.transicion(e, { tipo: "pausar" });
    expect(e.fase).toBe("buscando");
  });

  it("de un error, una terminada o una detenida se puede volver a empezar", () => {
    for (const fase of ["terminada", "detenida", "error"]) expect(maq.transicion({ fase }, { tipo: "iniciar" })?.fase).toBe("buscando");
    expect(paso(lista, { tipo: "iniciar" }, { tipo: "fallar" }).fase).toBe("error");
    expect(maq.ACTIVAS).toEqual(["buscando", "pausada", "verificacion", "revisando"]);
    // Las fases de la extensión y las del panel son las mismas.
    expect(maq.FASES).toEqual([...FASES_BUSQUEDA]);
  });
});

describe("quién le habla al trabajador de fondo (extension/mensajes.js)", () => {
  const ID = "abcdefghijklmnopabcdefghijklmnop";
  const APP = "https://panel.ejemplo.com";
  const ctx = { id: ID, origenApp: APP, tabBusqueda: 7 };
  const tab = (id: number) => ({ id });

  it("reconoce el popup, el panel y la barra de la pestaña de la búsqueda", () => {
    expect(men.deQuien({ id: ID, url: `chrome-extension://${ID}/popup.html` }, ctx)).toBe("popup");
    expect(men.deQuien({ id: ID, url: `${APP}/panel/duenos`, tab: tab(3), frameId: 0 }, ctx)).toBe("panel");
    expect(men.deQuien({ id: ID, url: `${men.ORIGEN_E24}/costa-rica-es/casas/escazu`, tab: tab(7), frameId: 0 }, ctx)).toBe("control");
  });

  it("nadie más: otra extensión, un iframe, otra pestaña de Encuentra24, otra ruta del panel u otro sitio", () => {
    expect(men.deQuien({ id: "otra", url: `chrome-extension://otra/popup.html` }, ctx)).toBeNull();
    expect(men.deQuien({ id: ID, url: `chrome-extension://otra/popup.html` }, ctx)).toBeNull();
    expect(men.deQuien({ id: ID, url: `${APP}/panel/duenos`, tab: tab(3), frameId: 2 }, ctx)).toBeNull();
    expect(men.deQuien({ id: ID, url: `${APP}/panel/clientes`, tab: tab(3), frameId: 0 }, ctx)).toBeNull();
    expect(men.deQuien({ id: ID, url: `${men.ORIGEN_E24}/x`, tab: tab(8), frameId: 0 }, ctx)).toBeNull();
    expect(men.deQuien({ id: ID, url: `${men.ORIGEN_E24}/x`, tab: tab(7), frameId: 0 }, { ...ctx, tabBusqueda: null })).toBeNull();
    expect(men.deQuien({ id: ID, url: "https://encuentra24.com.malo.example/x", tab: tab(7), frameId: 0 }, ctx)).toBeNull();
    expect(men.deQuien({ id: ID, url: "http://www.encuentra24.com/x", tab: tab(7), frameId: 0 }, ctx)).toBeNull();
    expect(men.deQuien({ id: ID, url: "nada" }, ctx)).toBeNull();
    expect(men.deQuien(null, ctx)).toBeNull();
  });

  it("cada uno solo pide lo suyo", () => {
    // La barra: pausar, seguir, detener, dejar la verificación y avisar actividad. Nada de buscar ni conectar.
    expect(men.leerPedido("control", { tipo: "control_pausar" })).toEqual({ tipo: "control_pausar" });
    expect(men.leerPedido("control", { tipo: "control_actividad", extra: 1 })).toEqual({ tipo: "control_actividad" });
    expect(men.leerPedido("control", { tipo: "buscar" })).toBeNull();
    expect(men.leerPedido("control", { tipo: "conectar", codigo: "K7PM-4QXR" })).toBeNull();
    // El panel: estado, conectar con código y órdenes de búsqueda sin parámetros.
    expect(men.leerPedido("panel", { tipo: "panel_busqueda", orden: "detener" })).toEqual({ tipo: "panel_busqueda", orden: "detener" });
    expect(men.leerPedido("panel", { tipo: "panel_busqueda", orden: "buscar", zonas: ["x"], paginas: 999 })).toEqual({
      tipo: "panel_busqueda",
      orden: "buscar",
    });
    expect(men.leerPedido("panel", { tipo: "panel_busqueda", orden: "borrar" })).toBeNull();
    expect(men.leerPedido("panel", { tipo: "panel_conectar", codigo: "x" })).toBeNull();
    expect(men.leerPedido("panel", { tipo: "desconectar" })).toBeNull();
    expect(men.leerPedido("panel", { tipo: "pausar" })).toBeNull();
    // El popup.
    expect(men.leerPedido("popup", { tipo: "modo_semanal", modo: "vista" })).toEqual({ tipo: "modo_semanal", modo: "vista" });
    expect(men.leerPedido("popup", { tipo: "modo_semanal", modo: "turbo" })).toBeNull();
    expect(men.leerPedido("popup", { tipo: "detener" })).toEqual({ tipo: "detener" });
    expect(men.leerPedido("popup", { tipo: "leer_anuncio", tabId: "3" })).toBeNull();
    expect(men.leerPedido("popup", { tipo: "control_pausar" })).toBeNull();
    // Sin remitente o sin forma.
    expect(men.leerPedido(null, { tipo: "buscar" })).toBeNull();
    expect(men.leerPedido("popup", "buscar")).toBeNull();
    expect(men.leerPedido("popup", [{ tipo: "buscar" }])).toBeNull();
  });

  it("el estado que sale no lleva el permiso, el id de la búsqueda ni la pestaña", () => {
    const p = men.estadoPublico({
      fase: "buscando",
      token: "f".repeat(64),
      id: "1b4e28ba-2fa1-11d2-883f-0016d3cca427",
      tabId: 9,
      pagina: 3,
      total: 12,
      restanteMs: 61_234.7,
      haciendo: "Leyendo anuncios…",
      motivoPausa: "<b>",
    });
    expect(p).toEqual({
      fase: "buscando",
      motivoPausa: null,
      detenida: false,
      automatica: false,
      aLaVista: false,
      pagina: 3,
      total: 12,
      restanteMs: 61_235,
      haciendo: "Leyendo anuncios…",
      mensaje: "",
      latido: 0,
    });
    expect(men.estadoPublico(null)).toEqual({ fase: "lista" });
  });
});

describe("¿Encuentra24 pide confirmar que eres tú? (extension/comun.js)", () => {
  it("reconoce el desafío de Cloudflare, un captcha y los frenos 403 y 429", () => {
    expect(comun.esVerificacion({ html: DESAFIO_CLOUDFLARE })).toBe(true);
    expect(comun.esVerificacion({ html: CAPTCHA })).toBe(true);
    expect(comun.esVerificacion({ html: DEMASIADAS })).toBe(true);
    expect(comun.esVerificacion({ html: "", estado: 429 })).toBe(true);
    expect(comun.esVerificacion({ html: paginaE24([anuncioE24(1, "Propietario", "Ana")]), estado: 403 })).toBe(true);
  });

  it("un listado con sus datos nunca es la verificación, aunque traiga un captcha en los scripts", () => {
    expect(comun.esVerificacion({ html: LISTADO_CON_CAPTCHA })).toBe(false);
    expect(comun.esVerificacion({ html: paginaE24([anuncioE24(1, "Propietario", "Ana")]), estado: 200 })).toBe(false);
    expect(comun.esVerificacion({ html: "<html><body>Casas</body></html>" })).toBe(false);
    expect(comun.esVerificacion({})).toBe(false);
  });
});

describe("canal del panel: la búsqueda en vivo", () => {
  const ventana = { yo: true };
  const ORIGEN = "https://panel.ejemplo.com";
  const canal = new Function(`${readFileSync("extension/canal.js", "utf8")}\nreturn { CANAL, ORDENES_BUSQUEDA, validarDePagina };`)() as {
    CANAL: typeof CANAL;
    ORDENES_BUSQUEDA: string[];
    validarDePagina: (e: unknown, v: unknown, o: string) => unknown;
  };
  const ev = (data: unknown, origin = ORIGEN, source: unknown = ventana) => ({ source, origin, data });

  it("la extensión y la página aceptan las mismas órdenes", () => {
    expect(canal.ORDENES_BUSQUEDA).toEqual([...ORDENES_BUSQUEDA]);
  });

  it("solo estado, pausar, seguir, detener y buscar, sin parámetros, de esta ventana y del panel", () => {
    for (const orden of ORDENES_BUSQUEDA) {
      expect(canal.validarDePagina(ev({ fuente: CANAL.pagina, tipo: "busqueda", orden, pedido: "b1", zonas: ["x"] }), ventana, ORIGEN)).toEqual({
        tipo: "busqueda",
        orden,
        pedido: "b1",
      });
    }
    expect(canal.validarDePagina(ev({ fuente: CANAL.pagina, tipo: "busqueda", orden: "iniciar", pedido: "b1" }), ventana, ORIGEN)).toBeNull();
    expect(canal.validarDePagina(ev({ fuente: CANAL.pagina, tipo: "busqueda", orden: "detener" }), ventana, ORIGEN)).toBeNull();
    expect(canal.validarDePagina(ev({ fuente: CANAL.pagina, tipo: "busqueda", orden: "detener", pedido: "b1" }, "https://malo.example"), ventana, ORIGEN)).toBeNull();
    expect(canal.validarDePagina(ev({ fuente: CANAL.pagina, tipo: "busqueda", orden: "detener", pedido: "b1" }, ORIGEN, { iframe: 1 }), ventana, ORIGEN)).toBeNull();
  });

  it("la página lee el estado que vuelve y descarta lo raro", () => {
    const datos = {
      fuente: CANAL.extension,
      tipo: "busqueda",
      pedido: "b1",
      ok: true,
      fase: "buscando",
      motivoPausa: "",
      pagina: 3,
      total: 12,
      restanteMs: 360_000,
      haciendo: "Leyendo anuncios…",
      latido: 1000,
      token: "f".repeat(64),
    };
    const m = leerMensajeDeExtension({ source: ventana, origin: ORIGEN, data: datos }, ventana, ORIGEN);
    expect(m).toEqual({
      tipo: "busqueda",
      pedido: "b1",
      ok: true,
      estado: {
        fase: "buscando",
        motivoPausa: null,
        detenida: false,
        automatica: false,
        pagina: 3,
        total: 12,
        restanteMs: 360_000,
        haciendo: "Leyendo anuncios…",
        mensaje: "",
        latido: 1000,
      },
    });
    expect(leerMensajeDeExtension({ source: ventana, origin: ORIGEN, data: { ...datos, fase: "volando" } }, ventana, ORIGEN)).toBeNull();
    expect(leerMensajeDeExtension({ source: ventana, origin: "https://malo.example", data: datos }, ventana, ORIGEN)).toBeNull();
  });

  it("la tarjeta del panel: 'Buscando ahora · página 3 de 12' mientras tenga latido", () => {
    const e: EstadoBusquedaExt = {
      fase: "buscando",
      motivoPausa: null,
      detenida: false,
      automatica: false,
      pagina: 3,
      total: 12,
      restanteMs: 360_000,
      haciendo: "Leyendo anuncios…",
      mensaje: "",
      latido: 1_000_000,
    };
    expect(textoBusqueda(e)).toEqual({ titulo: "Buscando ahora · página 3 de 12", detalle: "Leyendo anuncios… · quedan ~6 min" });
    expect(busquedaEnCurso(e, 1_000_000 + 5_000)).toBe(true);
    // Sin latido por más de 90 s, se cortó.
    expect(busquedaEnCurso(e, 1_000_000 + 91_000)).toBe(false);
    expect(busquedaEnCurso({ ...e, fase: "terminada" }, 1_000_000)).toBe(false);
    expect(textoBusqueda({ ...e, fase: "pausada", motivoPausa: "actividad" }).detalle).toMatch(/usaste la pestaña/);
    expect(textoBusqueda({ ...e, fase: "verificacion" }).titulo).toBe("Encuentra24 pide que confirmes que eres tú");
  });
});

describe("la barra sobre Encuentra24 (extension/control.js) no se expone a la página", () => {
  const codigo = readFileSync("extension/control.js", "utf8");
  it("Shadow DOM cerrado, sin postMessage, sin globales y sin clics de verdad", () => {
    expect(codigo).toContain('attachShadow({ mode: "closed" })');
    expect(codigo).not.toMatch(/\.postMessage\(/);
    expect(codigo).not.toMatch(/window\.\w+\s*=|globalThis\.\w+\s*=/);
    expect(codigo).not.toMatch(/\.click\(\)|dispatchEvent|new (Mouse|Keyboard|Pointer)Event/);
    // Solo escucha al trabajador de fondo de la misma extensión.
    expect(codigo).toContain("remitente?.id !== chrome.runtime.id || remitente.tab");
  });

  it("la extensión no toca la identidad del navegador", () => {
    for (const archivo of ARCHIVOS_EXTENSION.filter((a) => a.endsWith(".js") || a.endsWith(".html"))) {
      const c = readFileSync(`extension/${archivo}`, "utf8");
      expect(c, archivo).not.toMatch(/userAgent|webdriver|defineProperty\(navigator|HTMLCanvasElement|WebGLRenderingContext|navigator\.plugins|declarativeNetRequest|proxy/i);
    }
  });
});

describe("lo que va haciendo, paso a paso (extension/bitacora.js)", () => {
  const URL_ESCAZU = "https://www.encuentra24.com/costa-rica-es/bienes-raices-venta-de-propiedades-casas/san-jose-provincia-escazu?page=2";

  it("nombra la zona con su tilde, solo de Encuentra24", () => {
    expect(bit.nombreZona(URL_ESCAZU)).toBe("Escazú");
    expect(bit.nombreZona("https://www.encuentra24.com/costa-rica-es/casas/heredia-provincia-santo-domingo")).toBe("Santo Domingo");
    expect(bit.nombreZona("https://www.encuentra24.com/costa-rica-es/casas/san-jose-provincia-montes-de-oca")).toBe("Montes de Oca");
    expect(bit.nombreZona("https://malo.example/costa-rica-es/casas/escazu")).toBe("");
    expect(bit.nombreZona("nada")).toBe("");
  });

  it("cuenta anuncios y posibles dueños en el payload de la página", () => {
    const html = paginaE24([anuncioE24(1, "Propietario", "Ana"), anuncioE24(2, "Agente", "Luis"), anuncioE24(3, "Propietario", "Eva")]);
    expect(bit.contarEnPagina(html)).toEqual({ anuncios: 3, propietarios: 2 });
    expect(bit.contarEnPagina(null)).toEqual({ anuncios: 0, propietarios: 0 });
  });

  it("los textos de cada paso, en palabras de todos los días", () => {
    expect(bit.textoPaso.abrir(URL_ESCAZU, 2, 12)).toBe("Abriendo Escazú, página 2 de 12");
    expect(bit.textoPaso.leer({ anuncios: 18, propietarios: 3 })).toBe("Leí 18 anuncios · 3 posibles dueños");
    expect(bit.textoPaso.leer({ anuncios: 1, propietarios: 0 })).toBe("Leí 1 anuncio · ningún posible dueño");
    expect(bit.textoPaso.descanso(61_000)).toBe("Descanso de 1 min para ir a ritmo de persona");
    expect(bit.textoPaso.espera(12_400)).toBe("Espero 12 s antes de la siguiente página");
  });

  it("cada cambio de la máquina de estados deja su línea", () => {
    const enVerif = paso({ fase: "lista" }, { tipo: "iniciar" }, { tipo: "verificacion" });
    expect(bit.pasoDeEvento({ tipo: "verificacion" }, enVerif)).toEqual({
      icono: "verificacion",
      texto: "Verificación de Encuentra24: toca «Seguir» cuando la completes",
    });
    expect(bit.pasoDeEvento({ tipo: "pausar" }, { fase: "pausada", motivoPausa: "actividad" })?.texto).toMatch(/usar la pestaña/);
    expect(bit.pasoDeEvento({ tipo: "terminar" }, { fase: "terminada", mensaje: "Listo: 2 dueños nuevos." })).toEqual({ icono: "listo", texto: "Listo: 2 dueños nuevos." });
    expect(bit.pasoDeEvento({ tipo: "iniciar" }, { fase: "buscando" })).toBeNull();
  });

  it("la lista no repite, se queda con los últimos y descarta lo raro", () => {
    let l = bit.agregarPaso([], { icono: "abrir", texto: "Abriendo Escazú, página 1 de 12" }, 1000);
    l = bit.agregarPaso(l, { icono: "abrir", texto: "Abriendo Escazú, página 1 de 12" }, 2000);
    expect(l).toEqual([{ icono: "abrir", texto: "Abriendo Escazú, página 1 de 12", t: 1000 }]);
    for (let i = 0; i < 60; i++) l = bit.agregarPaso(l, { icono: "leer", texto: `paso ${i}` }, 3000 + i);
    expect(l).toHaveLength(bit.MAX_PASOS);
    expect(l.at(-1)?.texto).toBe("paso 59");
    expect(bit.agregarPaso(l, { icono: "<script>", texto: "x" }).length).toBe(bit.MAX_PASOS);
    expect(bit.leerBitacora([{ icono: "leer", texto: "a".repeat(500), t: 5 }, { icono: "leer" }, "x", null])).toEqual([{ icono: "leer", texto: "a".repeat(160), t: 5 }]);
    expect(bit.leerBitacora({ no: "lista" })).toEqual([]);
  });
});

describe("el panel lateral (extension/vista-panel.js)", () => {
  const AHORA = 1_700_000_000_000;
  const busqueda = (cambios: Record<string, unknown> = {}) => ({
    fase: "buscando",
    pagina: 2,
    total: 12,
    restanteMs: 360_000,
    haciendo: "Abriendo Escazú, página 2 de 12",
    latido: AHORA - 2_000,
    ...cambios,
  });

  it("dibuja un paso nuevo cuando llega el estado de la búsqueda", () => {
    const antes = vp.vistaPanel({ token: "t", corredor: "Deluxe Properties", asistente: "Patty", busqueda: busqueda(), bitacora: [] }, AHORA);
    expect(antes.pasos).toEqual([]);
    const bitacora = bit.agregarPaso([], { icono: "leer", texto: bit.textoPaso.leer({ anuncios: 18, propietarios: 3 }) }, new Date(2026, 10, 15, 10, 42).getTime());
    const v = vp.vistaPanel({ token: "t", corredor: "Deluxe Properties", asistente: "Patty", busqueda: busqueda(), bitacora }, AHORA);
    expect(v.pasos[0]).toEqual({ icono: "leer", texto: "Leí 18 anuncios · 3 posibles dueños", hora: "10:42" });
    expect(v.cabecera).toMatchObject({ nombre: "Patty", inicial: "P", conexion: "Conectada a Deluxe Properties", tono: "trabajando", progresoTexto: "Página 2 de 12" });
    expect(v.cabecera.progreso).toBeCloseTo(2 / 12);
    expect(v.enCurso).toMatchObject({ titulo: "Patty está buscando dueños", detalle: "Abriendo Escazú, página 2 de 12", tiempo: "quedan ~6 min" });
    expect(v.enCurso?.botones).toEqual({ pausar: true, seguir: false, detener: true, detenerTexto: "Detener" });
  });

  it("lo más nuevo arriba", () => {
    let l = bit.agregarPaso([], { icono: "inicio", texto: "Empecé" }, 1);
    l = bit.agregarPaso(l, { icono: "abrir", texto: "Abriendo" }, 2);
    expect(vp.vistaPanel({ token: "t", bitacora: l }, AHORA).pasos.map((p) => p.texto)).toEqual(["Abriendo", "Empecé"]);
  });

  it("los botones siguen a la máquina de estados", () => {
    const pausada = vp.vistaPanel({ token: "t", busqueda: busqueda({ fase: "pausada", motivoPausa: "usuario" }) }, AHORA);
    expect(pausada.enCurso?.botones).toMatchObject({ pausar: false, seguir: true, detener: true });
    expect(pausada.cabecera.tono).toBe("pausa");
    const verif = vp.vistaPanel({ token: "t", busqueda: busqueda({ fase: "verificacion" }) }, AHORA);
    expect(verif.enCurso).toMatchObject({ titulo: "Encuentra24 pide que confirmes que eres tú" });
    expect(verif.enCurso?.botones).toMatchObject({ seguir: true, detenerTexto: "Dejarlo para después" });
    expect(vp.vistaPanel({ token: "t", busqueda: busqueda({ fase: "revisando" }) }, AHORA).enCurso?.botones.detener).toBe(false);
  });

  it("en reposo: el resultado; sin latido, se cortó; sin permiso, sin conectar", () => {
    const fin = vp.vistaPanel({ token: "t", busqueda: { fase: "terminada", mensaje: "Listo: 2 dueños nuevos." } }, AHORA);
    expect(fin.enCurso).toBeNull();
    expect(fin.resultado).toEqual({ texto: "Listo: 2 dueños nuevos.", error: false });
    const cortada = vp.vistaPanel({ token: "t", busqueda: busqueda({ latido: AHORA - 120_000 }) }, AHORA);
    expect(cortada.enCurso).toBeNull();
    expect(cortada.resultado?.error).toBe(true);
    const nada = vp.vistaPanel({}, AHORA);
    expect(nada).toMatchObject({ conectada: false, cabecera: { conexion: "Sin conectar", nombre: "Patty" } });
    expect(JSON.stringify(vp.vistaPanel({ token: "secreto-123" }, AHORA))).not.toContain("secreto-123");
  });
});

describe("seguridad de la extensión", () => {
  const manifiesto = JSON.parse(readFileSync("extension/manifest.json", "utf8"));

  it("solo abre páginas de https://www.encuentra24.com (B3)", () => {
    expect(men.esUrlDeE24("https://www.encuentra24.com/costa-rica-es/casas/escazu?page=2")).toBe(true);
    for (const u of [
      "http://www.encuentra24.com/x",
      "https://encuentra24.com/x",
      "https://www.encuentra24.com.malo.example/x",
      "https://usuario:clave@www.encuentra24.com/x",
      "https://www.encuentra24.com:8443/x",
      "javascript:alert(1)",
      "chrome://settings",
      "",
      null,
    ]) {
      expect(men.esUrlDeE24(u), String(u)).toBe(false);
    }
    const fondo = readFileSync("extension/background.js", "utf8");
    // La revisión va antes de navegar.
    const abrir = fondo.slice(fondo.indexOf("async function abrirPagina"), fondo.indexOf("chrome.tabs.update(S.tabId, { url })"));
    expect(abrir).toContain("if (!esUrlDeE24(url)) throw");
  });

  it("los content scripts no leen el permiso: storage.local solo para contextos de confianza (B4)", () => {
    const fondo = readFileSync("extension/background.js", "utf8");
    expect(fondo).toMatch(/chrome\.storage\.local\.setAccessLevel\?\.\(\{ accessLevel: "TRUSTED_CONTEXTS" \}\)/);
    for (const archivo of ["control.js", "panel.js", "canal.js"]) expect(readFileSync(`extension/${archivo}`, "utf8"), archivo).not.toMatch(/chrome\.storage/);
  });

  it("el zip lleva solo la lista y nada más (B2)", () => {
    expect(revisarCarpeta([...ARCHIVOS_EXTENSION, ".DS_Store"])).toEqual({ sobran: [], faltan: [] });
    expect(revisarCarpeta([...ARCHIVOS_EXTENSION, ".env.local", "borrador.js", "captura.png", "sub"])).toEqual({
      sobran: ["borrador.js", "captura.png", "sub"],
      faltan: [],
    });
    expect(revisarCarpeta(ARCHIVOS_EXTENSION.filter((a) => a !== "sidepanel.js")).faltan).toEqual(["sidepanel.js"]);
    // La carpeta de hoy coincide con la lista.
    expect(revisarCarpeta(readdirSync("extension"))).toEqual({ sobran: [], faltan: [] });
    // Lo que el manifiesto y el panel lateral cargan está en la lista.
    const usados = [manifiesto.background.service_worker, manifiesto.side_panel.default_path, ...manifiesto.content_scripts[0].js, ...Object.values(manifiesto.icons)];
    for (const u of usados) expect(ARCHIVOS_EXTENSION, String(u)).toContain(u);
  });

  it("en producción la dirección del panel tiene que ser https (B2)", () => {
    expect(direccionApp(undefined, { VERCEL_ENV: "production", NEXT_PUBLIC_URL_APP: "panel.ejemplo.com" })).toBe("https://panel.ejemplo.com");
    expect(() => direccionApp(undefined, { VERCEL_ENV: "production", NEXT_PUBLIC_URL_APP: "http://panel.ejemplo.com" })).toThrow(/https/);
    expect(() => direccionApp(undefined, { VERCEL_ENV: "production" })).toThrow(/https/);
    expect(direccionApp(undefined, { VERCEL_ENV: "preview" })).toBe("http://localhost:3000");
    expect(direccionApp(undefined, {})).toBe("http://localhost:3000");
    expect(direccionApp("http://127.0.0.1:3000", {})).toBe("http://127.0.0.1:3000");
    expect(normalizar("https://x.example/ruta")).toBeNull();
  });

  it("1.4.1 con panel lateral y permisos mínimos", () => {
    expect(manifiesto.version).toBe("1.4.1");
    expect(manifiesto.side_panel.default_path).toBe("sidepanel.html");
    expect(manifiesto.action.default_popup).toBeUndefined();
    expect(manifiesto.permissions.sort()).toEqual(["alarms", "scripting", "sidePanel", "storage"]);
    expect(manifiesto.host_permissions).toEqual(["https://www.encuentra24.com/*", "__APP__/*"]);
    expect(manifiesto.content_security_policy).toBeUndefined();
  });

  it("el panel lateral y la barra dibujan con textContent, sin innerHTML con datos ni eval", () => {
    const panel = readFileSync("extension/sidepanel.js", "utf8");
    expect(panel).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|eval\(|new Function/);
    expect(readFileSync("extension/sidepanel.html", "utf8")).not.toMatch(/<script(?![^>]*src="sidepanel\.js")/);
    const barra = readFileSync("extension/control.js", "utf8");
    // Solo la plantilla fija del Shadow DOM.
    expect(barra.match(/innerHTML/g)).toHaveLength(1);
    expect(barra).not.toMatch(/eval\(|new Function|insertAdjacentHTML/);
  });
});
