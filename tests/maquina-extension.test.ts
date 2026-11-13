import { readFileSync } from "node:fs";
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
}
interface Comun {
  esVerificacion(p: { html?: string; estado?: number }): boolean;
}
const cargar = async <T,>(ruta: string) => (await import(/* @vite-ignore */ ruta)) as T;
const maq = await cargar<Maquina>("../extension/maquina.js");
const men = await cargar<Mensajes>("../extension/mensajes.js");
const comun = await cargar<Comun>("../extension/comun.js");

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
    for (const archivo of ["background.js", "control.js", "panel.js", "canal.js", "ritmo.js", "maquina.js", "mensajes.js", "popup.js"]) {
      const c = readFileSync(`extension/${archivo}`, "utf8");
      expect(c, archivo).not.toMatch(/userAgent|webdriver|defineProperty\(navigator|HTMLCanvasElement|WebGLRenderingContext|navigator\.plugins|declarativeNetRequest|proxy/i);
    }
  });
});
