// Extensión 1.5.0: el panel lateral rediseñado. Las reglas puras de lo que dibuja (vista-panel.js): la tarjeta de los
// tokens de IA en cada nivel, los pasos juntados por minuto con los viejos plegados, el botón "Leer este anuncio" que
// dice por qué no se puede, y el pedido nuevo "ver_tokens". Los módulos de la extensión se cargan tal cual.
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ARCHIVOS_EXTENSION, revisarCarpeta } from "../scripts/empacar-extension.mjs";

interface Tokens {
  total: number;
  usados: number;
  restantes: number;
  pct: number | null;
  nivel: string;
}
interface VistaTokens {
  nivel: string;
  texto: string;
  detalle: string;
  uso: number | null;
  aviso: string;
}
interface Paso {
  icono: string;
  texto: string;
  hora: string;
}
interface Grupos {
  recientes: { hora: string; pasos: Paso[] }[];
  anteriores: { hora: string; pasos: Paso[] }[];
  ocultos: number;
}
interface VistaPanel {
  PASOS_VISIBLES: number;
  miles(n: number): string;
  limpiarTokens(t: unknown): Tokens | null;
  vistaTokens(t: unknown): VistaTokens | null;
  agruparPasos(pasos: Paso[], visibles?: number): Grupos;
  accionLeer(a?: { enAnuncio?: boolean; leyendo?: boolean }): { activo: boolean; texto: string; motivo: string };
  textoUltima(dias: unknown): string;
  vistaPanel(
    d: unknown,
    ahora?: number,
  ): {
    cabecera: { estado: string; conexion: string };
    enCurso: null | { titulo: string; avance: null | { pct: number; texto: string } };
    tokens: VistaTokens | null;
    grupos: Grupos;
  };
}
interface Mensajes {
  leerPedido(de: string | null, m: unknown): Record<string, unknown> | null;
}
const cargar = async <T,>(ruta: string) => (await import(/* @vite-ignore */ ruta)) as T;
const vp = await cargar<VistaPanel>("../extension/vista-panel.js");
const men = await cargar<Mensajes>("../extension/mensajes.js");
const leer = (archivo: string) => readFileSync(`extension/${archivo}`, "utf8");

describe("tarjeta «Tokens de IA»", () => {
  it("bien: «1.240 de 2.000 este mes», cuánto queda y la barra con lo gastado", () => {
    expect(vp.vistaTokens({ total: 2000, usados: 1240, restantes: 760, pct: 62, nivel: "bien" })).toEqual({
      nivel: "bien",
      texto: "1.240 de 2.000 este mes",
      detalle: "Quedan 760",
      uso: 0.62,
      aviso: "",
    });
  });

  it("poco (15 % o menos): ámbar y lo dice", () => {
    const t = vp.vistaTokens({ total: 2000, usados: 1760, restantes: 240, pct: 88, nivel: "poco" });
    expect(t).toMatchObject({ nivel: "poco", texto: "1.760 de 2.000 este mes", detalle: "Quedan pocos: 240", aviso: "" });
    expect(t?.uso).toBeCloseTo(0.88);
  });

  it("agotado: barra llena y el texto llano «Se acabaron los tokens de este mes»", () => {
    expect(vp.vistaTokens({ total: 2000, usados: 2150, restantes: 0, pct: 100, nivel: "agotado" })).toEqual({
      nivel: "agotado",
      texto: "2.000 de 2.000 este mes",
      detalle: "",
      uso: 1,
      aviso: "Se acabaron los tokens de este mes",
    });
  });

  it("sin tope: lo usado, sin barra", () => {
    expect(vp.vistaTokens({ total: 0, usados: 1240, restantes: 0, pct: 0, nivel: "sin_tope" })).toEqual({
      nivel: "sin_tope",
      texto: "1.240 usados este mes",
      detalle: "Sin tope este mes",
      uso: null,
      aviso: "",
    });
  });

  it("null, sin el campo o con datos raros: no se muestra", () => {
    for (const malo of [null, undefined, "x", [], {}, { total: "2000", usados: 3 }, { total: 2000 }, { total: NaN, usados: 1 }]) {
      expect(vp.vistaTokens(malo), JSON.stringify(malo)).toBeNull();
    }
    expect(vp.vistaPanel({ token: "t" }).tokens).toBeNull();
    expect(vp.vistaPanel({ token: "t", tokens: null }).tokens).toBeNull();
    expect(vp.vistaPanel({ token: "t", tokens: { total: 2000, usados: 1240, restantes: 760, pct: 62, nivel: "bien" } }).tokens?.texto).toBe(
      "1.240 de 2.000 este mes",
    );
  });

  it("un nivel desconocido se calcula (≤ 15 % que queda es poco); los números se limpian", () => {
    expect(vp.limpiarTokens({ total: 2000, usados: 1700, nivel: "otro" })).toEqual({ total: 2000, usados: 1700, restantes: 300, pct: null, nivel: "poco" });
    expect(vp.limpiarTokens({ total: 2000, usados: 1699 })?.nivel).toBe("bien");
    expect(vp.limpiarTokens({ total: 2000, usados: 2000 })?.nivel).toBe("agotado");
    expect(vp.limpiarTokens({ total: 0, usados: 5 })?.nivel).toBe("sin_tope");
    expect(vp.limpiarTokens({ total: -4, usados: 1.6, pct: 400 })).toMatchObject({ total: 0, usados: 2, pct: 100 });
    // Solo lo de la forma conocida: nada más viaja a la vista.
    expect(Object.keys(vp.limpiarTokens({ total: 1, usados: 0, html: "<b>x</b>" }) ?? {})).toEqual(["total", "usados", "restantes", "pct", "nivel"]);
  });

  it("punto de miles", () => {
    expect(vp.miles(0)).toBe("0");
    expect(vp.miles(999)).toBe("999");
    expect(vp.miles(1240)).toBe("1.240");
    expect(vp.miles(2_000_000)).toBe("2.000.000");
  });

  it("se piden al abrir el panel y después de cada búsqueda (GET /api/extension/estado), con el pedido 'ver_tokens'", () => {
    expect(men.leerPedido("popup", { tipo: "ver_tokens", x: 1 })).toEqual({ tipo: "ver_tokens" });
    expect(men.leerPedido("panel", { tipo: "ver_tokens" })).toBeNull();
    expect(men.leerPedido("control", { tipo: "ver_tokens" })).toBeNull();
    expect(leer("sidepanel.js")).toContain('chrome.runtime.sendMessage({ tipo: "ver_tokens" })');
    const fondo = leer("background.js");
    expect(fondo).toContain('api("/api/extension/estado", null, token, "GET")');
    const fin = fondo.slice(fondo.indexOf("async function esperarResultado"), fondo.indexOf("async function silenciar"));
    expect(fin).toContain("verTokens()");
    expect(fin).toContain("limpiarTokens(r.tokens)");
    // Al desconectar no quedan.
    expect(fondo).toMatch(/remove\(\["token", "corredor", "busqueda", "busquedaViva", "bitacora", "asistente", "tokens"\]\)/);
  });
});

describe("lo que fui haciendo: por minuto y con los viejos plegados", () => {
  const p = (hora: string, texto: string): Paso => ({ icono: "leer", texto, hora });

  it("junta los pasos seguidos del mismo minuto", () => {
    const g = vp.agruparPasos([p("10:05", "c"), p("10:05", "b"), p("10:04", "a")]);
    expect(g.recientes.map((x) => [x.hora, x.pasos.map((y) => y.texto)])).toEqual([
      ["10:05", ["c", "b"]],
      ["10:04", ["a"]],
    ]);
    expect(g).toMatchObject({ anteriores: [], ocultos: 0 });
  });

  it("deja abiertos hasta PASOS_VISIBLES pasos sin partir un minuto; el resto, plegado", () => {
    expect(vp.PASOS_VISIBLES).toBe(6);
    const pasos = Array.from({ length: 10 }, (_, i) => p(`10:${String(20 - Math.floor(i / 2)).padStart(2, "0")}`, `paso ${i}`));
    const g = vp.agruparPasos(pasos);
    expect(g.recientes.flatMap((x) => x.pasos)).toHaveLength(6);
    expect(g.anteriores.flatMap((x) => x.pasos)).toHaveLength(4);
    expect(g.ocultos).toBe(4);
  });

  it("un minuto más largo que lo visible igual se ve entero; sin pasos, nada", () => {
    const g = vp.agruparPasos(Array.from({ length: 9 }, (_, i) => p("10:00", `p${i}`)));
    expect(g.recientes[0].pasos).toHaveLength(9);
    expect(g.ocultos).toBe(0);
    expect(vp.agruparPasos([])).toEqual({ recientes: [], anteriores: [], ocultos: 0 });
  });

  it("vistaPanel trae los grupos (lo más nuevo arriba)", () => {
    const bitacora = [
      { icono: "inicio", texto: "Empecé", t: new Date(2026, 10, 15, 10, 0, 5).getTime() },
      { icono: "abrir", texto: "Abriendo", t: new Date(2026, 10, 15, 10, 0, 40).getTime() },
      { icono: "leer", texto: "Leí", t: new Date(2026, 10, 15, 10, 2).getTime() },
    ];
    const g = vp.vistaPanel({ token: "t", bitacora }).grupos;
    expect(g.recientes.map((x) => [x.hora, x.pasos.map((y) => y.texto)])).toEqual([
      ["10:02", ["Leí"]],
      ["10:00", ["Abriendo", "Empecé"]],
    ]);
  });
});

describe("inicio: acciones grandes", () => {
  it("«Leer este anuncio» solo en la página de un anuncio; si no, dice por qué", () => {
    const fuera = vp.accionLeer({ enAnuncio: false });
    expect(fuera.activo).toBe(false);
    expect(fuera.texto).toBe("Leer este anuncio");
    expect(fuera.motivo).toMatch(/Abre un anuncio de Encuentra24/);
    expect(vp.accionLeer()).toEqual(fuera);
    expect(vp.accionLeer({ enAnuncio: true })).toMatchObject({ activo: true, texto: "Leer este anuncio" });
    expect(vp.accionLeer({ enAnuncio: true, leyendo: true })).toMatchObject({ activo: false, texto: "Leyendo el anuncio…" });
  });

  it("el motivo va pegado al botón (aria-describedby) y el botón empieza desactivado", () => {
    const html = leer("sidepanel.html");
    expect(html).toMatch(/<button id="leer"[^>]*aria-describedby="leer-motivo"[^>]*disabled/);
    expect(html).toContain('id="leer-motivo"');
    expect(leer("sidepanel.js")).toContain('$("leer").disabled = !leer.activo;');
  });

  it("última búsqueda en palabras", () => {
    expect(vp.textoUltima(0)).toBe("Última búsqueda: hoy");
    expect(vp.textoUltima(1)).toBe("Última búsqueda: ayer");
    expect(vp.textoUltima(6)).toBe("Última búsqueda: hace 6 días");
    for (const x of [null, undefined, -1, NaN, "2"]) expect(vp.textoUltima(x)).toBe("");
  });

  it("cabecera: estado en una palabra; el anillo con «3/12»; la verificación no repite el detalle en el título", () => {
    const ahora = 1_700_000_000_000;
    const b = (fase: string, extra = {}) => ({ token: "t", corredor: "Deluxe", busqueda: { fase, pagina: 3, total: 12, latido: ahora, ...extra } });
    expect(vp.vistaPanel({}, ahora).cabecera.estado).toBe("Sin conectar");
    expect(vp.vistaPanel({ token: "t" }, ahora).cabecera).toMatchObject({ estado: "Lista", conexion: "Conectada a tu panel" });
    expect(vp.vistaPanel(b("buscando"), ahora).cabecera.estado).toBe("Trabajando");
    expect(vp.vistaPanel(b("pausada"), ahora).cabecera.estado).toBe("En pausa");
    expect(vp.vistaPanel(b("verificacion"), ahora).cabecera.estado).toBe("Te necesita");
    expect(vp.vistaPanel(b("revisando", { total: 0 }), ahora).enCurso?.avance).toBeNull();
    const v = vp.vistaPanel(b("buscando"), ahora).enCurso;
    expect(v?.avance?.texto).toBe("3/12");
    expect(v?.avance?.pct).toBeCloseTo(0.25);
    expect(vp.vistaPanel(b("verificacion"), ahora).enCurso?.titulo).toBe("Patty necesita tu ayuda");
  });
});

describe("paquete 1.5.0", () => {
  it("las ilustraciones son archivos del paquete (SVG en línea, nada remoto) y están en la lista del zip", () => {
    const svgs = readdirSync("extension").filter((n) => n.endsWith(".svg"));
    expect(svgs.sort()).toEqual(["ilustra-conectar.svg", "ilustra-pasos.svg", "ilustra-quieta.svg"]);
    for (const n of svgs) {
      expect(ARCHIVOS_EXTENSION).toContain(n);
      const c = leer(n);
      // Solo el espacio de nombres de SVG; sin enlaces, scripts, imágenes ni letras de afuera.
      expect(c.match(/https?:\/\/[^"\s]+/g) ?? []).toEqual(["http://www.w3.org/2000/svg"]);
      expect(c).not.toMatch(/<script|<image|href=|@import|url\(|on[a-z]+=|<foreignObject/i);
    }
    // Las que el panel usa existen.
    for (const [, n] of leer("sidepanel.html").matchAll(/src="([^"]+\.svg)"/g)) expect(svgs).toContain(n);
    expect(revisarCarpeta(readdirSync("extension"))).toEqual({ sobran: [], faltan: [] });
  });

  it("letra del sistema y nada remoto en el panel", () => {
    const css = leer("sidepanel.css");
    expect(css).not.toMatch(/@import|url\(|@font-face/);
    expect(css).toContain("system-ui");
    expect(leer("sidepanel.html")).not.toMatch(/https?:\/\/(?!www\.w3\.org)/);
    // Modo oscuro y foco visible para el teclado.
    expect(css).toContain("@media (prefers-color-scheme: dark)");
    expect(css).toMatch(/:focus-visible/);
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
  });

  it("la barra sobre la página sigue dejando pasar los clics en pausa y respeta el movimiento reducido", () => {
    const control = leer("control.js");
    expect(control).toContain("@media (prefers-reduced-motion: reduce)");
    expect(control).toContain("@media (prefers-color-scheme: dark)");
    expect(control).not.toMatch(/@import|url\(|@font-face/);
  });
});
