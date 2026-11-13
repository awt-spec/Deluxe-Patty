import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import manifiesto from "../extension/manifest.json";
import {
  CANAL,
  compararVersiones,
  detectarEntorno,
  direccionExtensiones,
  dondeInstalar,
  estadoExtension,
  haceDias,
  leerMensajeDeExtension,
  pasoInicial,
  pasoVisible,
  pideActualizar,
  siguiente,
  anterior,
  type EstadoExtension,
} from "../lib/panel/extension-instalar";

const UA = {
  chromeWin: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  chromeMac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  edge: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0",
  safariMac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  firefox: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0",
  iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  chromeAndroid: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36",
  chromeIphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1",
};

describe("aparato y navegador", () => {
  it("Chrome en Windows y en Mac se instala aquí", () => {
    expect(detectarEntorno(UA.chromeWin)).toEqual({ sistema: "windows", navegador: "chrome", movil: false });
    expect(detectarEntorno(UA.chromeMac)).toEqual({ sistema: "mac", navegador: "chrome", movil: false });
    expect(dondeInstalar(detectarEntorno(UA.chromeWin))).toBe("aqui");
  });

  it("Edge y Brave también, con su propia dirección de extensiones", () => {
    const edge = detectarEntorno(UA.edge);
    expect(edge.navegador).toBe("edge");
    expect(dondeInstalar(edge)).toBe("aqui");
    expect(direccionExtensiones("edge")).toBe("edge://extensions");
    expect(detectarEntorno(UA.chromeWin, { brave: true }).navegador).toBe("brave");
    expect(direccionExtensiones("brave")).toBe("brave://extensions");
    expect(direccionExtensiones("chrome")).toBe("chrome://extensions");
  });

  it("Safari y Firefox no cargan la extensión", () => {
    expect(detectarEntorno(UA.safariMac)).toEqual({ sistema: "mac", navegador: "safari", movil: false });
    expect(dondeInstalar(detectarEntorno(UA.safariMac))).toBe("otro_navegador");
    expect(dondeInstalar(detectarEntorno(UA.firefox))).toBe("otro_navegador");
  });

  it("en el teléfono (aunque sea Chrome) y en el iPad no se muestran pasos imposibles", () => {
    expect(dondeInstalar(detectarEntorno(UA.iphone))).toBe("movil");
    expect(dondeInstalar(detectarEntorno(UA.chromeAndroid))).toBe("movil");
    expect(dondeInstalar(detectarEntorno(UA.chromeIphone))).toBe("movil");
    // El iPad se presenta como Mac, pero con pantalla táctil
    expect(dondeInstalar(detectarEntorno(UA.safariMac, { toques: 5 }))).toBe("movil");
    expect(dondeInstalar(detectarEntorno(UA.chromeWin, { movil: true }))).toBe("movil");
  });

  it("userAgentData manda sobre el userAgent recortado", () => {
    expect(detectarEntorno("Mozilla/5.0 Chrome/130.0.0.0", { plataforma: "macOS" }).sistema).toBe("mac");
    expect(detectarEntorno("Mozilla/5.0 Chrome/130.0.0.0", { marcas: ["Microsoft Edge", "Chromium"] }).navegador).toBe("edge");
  });
});

describe("versiones", () => {
  it("compara número por número", () => {
    expect(compararVersiones("1.1.0", "1.2.0")).toBe(-1);
    expect(compararVersiones("1.10.0", "1.2.0")).toBe(1);
    expect(compararVersiones("1.2", "1.2.0")).toBe(0);
    expect(compararVersiones("2.0.0", "1.9.9")).toBe(1);
  });

  it("el manifiesto va en 1.2.0 con el content script solo en /panel/duenos* del panel", () => {
    expect(manifiesto.version).toBe("1.2.0");
    expect(manifiesto.content_scripts).toEqual([{ matches: ["__APP__/panel/duenos*"], js: ["canal.js", "panel.js"], run_at: "document_idle" }]);
    // Sin permisos nuevos ni conexión externa abierta
    expect(manifiesto.host_permissions).toEqual(["https://www.encuentra24.com/*", "__APP__/*"]);
    expect(manifiesto.permissions).toEqual(["storage", "scripting", "alarms"]);
    expect("externally_connectable" in manifiesto).toBe(false);
  });
});

describe("estado de la extensión", () => {
  const conectadaServidor = { conectada: true, ultimaBusquedaDias: 3 };
  const sinServidor = { conectada: false, ultimaBusquedaDias: null };
  const vista = (conectada: boolean, version = "1.2.0") => ({ estado: "si" as const, version, conectada, corredor: "Deluxe" });

  it("instalada y conectada (la extensión y el servidor lo dicen)", () => {
    expect(estadoExtension(vista(true), conectadaServidor, "1.2.0")).toEqual({ tipo: "conectada", corredor: "Deluxe", ultimaBusquedaDias: 3 });
  });

  it("instalada pero sin conectar, también si el servidor ya la desconectó", () => {
    expect(estadoExtension(vista(false), sinServidor, "1.2.0").tipo).toBe("sin_conectar");
    expect(estadoExtension(vista(true), sinServidor, "1.2.0").tipo).toBe("sin_conectar");
  });

  it("no la ve: no instalada; o versión anterior si el servidor la tiene conectada", () => {
    expect(estadoExtension({ estado: "no" }, sinServidor, "1.2.0").tipo).toBe("no_instalada");
    expect(estadoExtension({ estado: "no" }, conectadaServidor, "1.2.0").tipo).toBe("vieja");
  });

  it("versión menor a la del panel: hay una nueva", () => {
    const e = estadoExtension(vista(true, "1.2.0"), conectadaServidor, "1.3.0");
    expect(e).toEqual({ tipo: "nueva_version", version: "1.3.0", conectada: true });
    expect(pideActualizar(e)).toBe(true);
  });

  it("sin poder mirar el navegador, vale lo del servidor", () => {
    expect(estadoExtension({ estado: "no_se_sabe" }, conectadaServidor, "1.2.0").tipo).toBe("conectada");
    expect(estadoExtension({ estado: "no_se_sabe" }, sinServidor, "1.2.0").tipo).toBe("sin_conectar_servidor");
    expect(estadoExtension({ estado: "buscando" }, sinServidor, "1.2.0").tipo).toBe("buscando");
  });

  it("dice hace cuánto buscó", () => {
    expect(haceDias(null)).toBe("todavía no ha buscado");
    expect(haceDias(0)).toBe("última búsqueda hoy");
    expect(haceDias(1)).toBe("última búsqueda ayer");
    expect(haceDias(9)).toBe("última búsqueda hace 9 días");
  });
});

describe("pasos del asistente", () => {
  const no: EstadoExtension = { tipo: "no_instalada" };
  const sin: EstadoExtension = { tipo: "sin_conectar" };
  const con: EstadoExtension = { tipo: "conectada", corredor: "Deluxe", ultimaBusquedaDias: 0 };

  it("empieza en Descargar o donde quedó", () => {
    expect(pasoInicial(null, no)).toBe("descargar");
    expect(pasoInicial("abrir", no)).toBe("abrir");
    expect(pasoInicial("cualquier-cosa", no)).toBe("descargar");
  });

  it("ya conectada al llegar: la pantalla de Listo; si quedó en Listo y se desconectó, a conectar", () => {
    expect(pasoInicial(null, con)).toBe("listo");
    expect(pasoInicial("conectar", con)).toBe("conectar");
    expect(pasoInicial("listo", sin)).toBe("conectar");
    expect(pasoInicial("listo", no)).toBe("descargar");
  });

  it("en cuanto ve la extensión instalada, salta a Conectar (salvo que haya vuelto atrás)", () => {
    expect(pasoVisible("cargar", sin, false)).toBe("conectar");
    expect(pasoVisible("descargar", { tipo: "nueva_version", version: "1.3.0", conectada: false }, false)).toBe("conectar");
    expect(pasoVisible("cargar", sin, true)).toBe("cargar");
    expect(pasoVisible("cargar", no, false)).toBe("cargar");
  });

  it("siguiente y atrás no se salen de la lista", () => {
    expect(siguiente("descargar")).toBe("descomprimir");
    expect(siguiente("listo")).toBe("listo");
    expect(anterior("descargar")).toBe("descargar");
    expect(anterior("conectar")).toBe("cargar");
  });
});

describe("canal página ↔ extensión", () => {
  const ventana = { yo: true };
  const ORIGEN = "https://panel.ejemplo.com";
  const presente = { fuente: CANAL.extension, tipo: "presente", version: "1.2.0", conectada: true, corredor: "Deluxe" };

  it("la página lee lo que dice la extensión", () => {
    expect(leerMensajeDeExtension({ source: ventana, origin: ORIGEN, data: presente }, ventana, ORIGEN)).toEqual({
      tipo: "presente",
      version: "1.2.0",
      conectada: true,
      corredor: "Deluxe",
    });
    const r = leerMensajeDeExtension(
      { source: ventana, origin: ORIGEN, data: { fuente: CANAL.extension, tipo: "resultado", pedido: "ab12", ok: true, corredor: "Deluxe" } },
      ventana,
      ORIGEN,
    );
    expect(r).toEqual({ tipo: "resultado", pedido: "ab12", ok: true, corredor: "Deluxe", mensaje: "" });
  });

  it("otro origen, otra ventana o una forma rara se ignoran", () => {
    expect(leerMensajeDeExtension({ source: ventana, origin: "https://malo.example", data: presente }, ventana, ORIGEN)).toBeNull();
    expect(leerMensajeDeExtension({ source: { otra: true }, origin: ORIGEN, data: presente }, ventana, ORIGEN)).toBeNull();
    expect(leerMensajeDeExtension({ source: ventana, origin: ORIGEN, data: { ...presente, fuente: "otro" } }, ventana, ORIGEN)).toBeNull();
    expect(leerMensajeDeExtension({ source: ventana, origin: ORIGEN, data: { ...presente, version: "<b>" } }, ventana, ORIGEN)).toBeNull();
    expect(leerMensajeDeExtension({ source: ventana, origin: ORIGEN, data: "hola" }, ventana, ORIGEN)).toBeNull();
    expect(leerMensajeDeExtension({ source: ventana, origin: ORIGEN, data: [presente] }, ventana, ORIGEN)).toBeNull();
    expect(
      leerMensajeDeExtension({ source: ventana, origin: ORIGEN, data: { fuente: CANAL.extension, tipo: "resultado", pedido: "../x", ok: true } }, ventana, ORIGEN),
    ).toBeNull();
    // La extensión nunca manda el permiso: aunque viniera un campo de más, no pasa a la página
    const conToken = leerMensajeDeExtension({ source: ventana, origin: ORIGEN, data: { ...presente, token: "f".repeat(64) } }, ventana, ORIGEN);
    expect(conToken && "token" in conToken).toBe(false);
  });

  // extension/canal.js es un script clásico del content script: se evalúa aquí tal cual.
  const canal = new Function(`${readFileSync("extension/canal.js", "utf8")}\nreturn { CANAL, validarDePagina };`)() as {
    CANAL: typeof CANAL;
    validarDePagina: (e: unknown, v: unknown, o: string) => unknown;
  };

  it("la extensión usa los mismos nombres que la página", () => {
    expect(canal.CANAL).toEqual(CANAL);
  });

  it("el content script acepta solo hola y conectar con un código válido, de esta ventana y del panel", () => {
    const ev = (data: unknown, origin = ORIGEN, source: unknown = ventana) => ({ source, origin, data });
    expect(canal.validarDePagina(ev({ fuente: CANAL.pagina, tipo: "hola" }), ventana, ORIGEN)).toEqual({ tipo: "hola" });
    expect(canal.validarDePagina(ev({ fuente: CANAL.pagina, tipo: "conectar", codigo: "K7PM-4QXR", pedido: "a1" }), ventana, ORIGEN)).toEqual({
      tipo: "conectar",
      codigo: "K7PM-4QXR",
      pedido: "a1",
    });
    // Otra página (otro origen) o un iframe (otra ventana): nada
    expect(canal.validarDePagina(ev({ fuente: CANAL.pagina, tipo: "hola" }, "https://malo.example"), ventana, ORIGEN)).toBeNull();
    expect(canal.validarDePagina(ev({ fuente: CANAL.pagina, tipo: "hola" }, ORIGEN, { iframe: true }), ventana, ORIGEN)).toBeNull();
    // Formas inválidas
    expect(canal.validarDePagina(ev({ fuente: CANAL.pagina, tipo: "conectar", codigo: "x", pedido: "a1" }), ventana, ORIGEN)).toBeNull();
    expect(canal.validarDePagina(ev({ fuente: CANAL.pagina, tipo: "conectar", codigo: "K7PM-4QXR" }), ventana, ORIGEN)).toBeNull();
    expect(canal.validarDePagina(ev({ fuente: CANAL.pagina, tipo: "dame_el_permiso" }), ventana, ORIGEN)).toBeNull();
    expect(canal.validarDePagina(ev({ fuente: CANAL.extension, tipo: "hola" }), ventana, ORIGEN)).toBeNull();
    expect(canal.validarDePagina(ev(null), ventana, ORIGEN)).toBeNull();
  });
});
