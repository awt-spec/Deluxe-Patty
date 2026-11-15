// Arreglos de la extensión 1.4.1 (QA 3, parte A): la ficha de la pausa, el panel lateral angosto, el tope del día que
// cuenta el servidor, el reinicio del trabajador de fondo a media búsqueda, "Todavía veo la verificación" y lo que
// cuenta el asistente para actualizar. Los módulos de la extensión se cargan tal cual (JavaScript sin compilar).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { novedadesDesde } from "../app/panel/duenos/extension/novedades";

interface Maquina {
  mensajeInterrumpida(fase: string, corte: unknown): string;
}
interface Mensajes {
  leerPedido(de: string | null, m: unknown): Record<string, unknown> | null;
}
interface VistaPanel {
  LATIDO_PREGUNTAR_MS: number;
  latidoViejo(d: unknown, ahora?: number): boolean;
  vistaPanel(d: unknown, ahora?: number): {
    enCurso: null | { fase: string; detalle: string };
    resultado: null | { texto: string; error: boolean };
  };
}
const cargar = async <T,>(ruta: string) => (await import(/* @vite-ignore */ ruta)) as T;
const maq = await cargar<Maquina>("../extension/maquina.js");
const men = await cargar<Mensajes>("../extension/mensajes.js");
const vp = await cargar<VistaPanel>("../extension/vista-panel.js");

const leer = (archivo: string) => readFileSync(`extension/${archivo}`, "utf8");
/** El cuerpo de una regla CSS (la primera con ese selector exacto). */
function regla(css: string, selector: string): string {
  const i = css.indexOf(`${selector} {`);
  if (i < 0) throw new Error(`no está la regla ${selector}`);
  const desde = i + selector.length;
  return css.slice(desde, css.indexOf("}", desde));
}

describe("pausa: la barra se achica a una ficha en la esquina que deja pasar los clics", () => {
  const control = leer("control.js");

  it("en pausa la barra es una ficha abajo a la derecha; solo sus botones reciben el mouse", () => {
    const ficha = regla(control, ".barra[data-chip]");
    expect(ficha).toMatch(/pointer-events: none/);
    expect(ficha).toMatch(/right: 14px/);
    expect(ficha).toMatch(/bottom: 14px/);
    expect(ficha).toMatch(/top: auto/);
    expect(regla(control, ".barra[data-chip] button")).toMatch(/pointer-events: auto/);
    // Se pone en cualquier pausa (por actividad o con Pausar) y se quita al seguir.
    expect(control).toContain('barra.toggleAttribute("data-chip", f === "pausada")');
  });

  it("en pausa el marco deja de brillar", () => {
    expect(regla(control, '[data-fase="pausada"] .marco::after')).toMatch(/display: none/);
    expect(regla(control, '[data-fase="pausada"] .marco')).not.toMatch(/22px|54px/);
    // El brillo animado queda solo para cuando busca.
    expect(control.match(/animation: brillo/g)).toHaveLength(1);
    expect(control).toContain('[data-fase="buscando"] .marco::after { animation: brillo');
  });
});

describe("panel lateral angosto: sin scroll horizontal y con «…»", () => {
  const css = leer("sidepanel.css");

  it("el nombre y la conexión se cortan con puntos suspensivos", () => {
    const corte = regla(css, ".quien strong,\n#conexion-texto");
    for (const p of ["min-width: 0", "overflow: hidden", "text-overflow: ellipsis", "white-space: nowrap"]) expect(corte).toContain(p);
    expect(regla(css, ".quien")).toContain("min-width: 0");
    expect(regla(css, ".conexion")).toContain("min-width: 0");
  });

  it("el cuerpo no tiene ancho mínimo ni deja scroll horizontal, y los textos largos se parten", () => {
    const body = regla(css, "}\nbody");
    expect(body).toContain("min-width: 0");
    expect(body).toContain("overflow-x: hidden");
    expect(body).toContain("overflow-wrap: anywhere");
    expect(regla(css, ".botones")).toContain("flex-wrap: wrap");
  });

  it("el texto entero queda en el título (al pasar el mouse), puesto como propiedad, no como HTML", () => {
    const js = leer("sidepanel.js");
    expect(js).toContain('$("nombre").title = c.nombre;');
    expect(js).toContain('$("conexion-texto").title = c.conexion;');
  });
});

describe("reinicio del trabajador de fondo a media búsqueda", () => {
  const fondo = leer("background.js");

  it("el aviso dice que se interrumpió, nunca que se cerró Chrome", () => {
    expect(fondo).not.toMatch(/se cerró Chrome|Chrome se cerró/);
    expect(maq.mensajeInterrumpida("buscando", { ok: true, paginas: 3 })).toBe(
      "La búsqueda se interrumpió; lo leído quedó guardado. Toca «Buscar dueños ahora» para seguir.",
    );
    expect(maq.mensajeInterrumpida("pausada", { ok: true, paginas: 0 })).toMatch(/antes de leer anuncios/);
    // Sin respuesta del servidor no promete que quedó guardado.
    expect(maq.mensajeInterrumpida("buscando", null)).toBe("La búsqueda se interrumpió. Toca «Buscar dueños ahora» para seguir.");
    expect(maq.mensajeInterrumpida("buscando", { ok: false })).not.toMatch(/guardado/);
    expect(maq.mensajeInterrumpida("revisando", null)).toMatch(/lo ves en el panel/);
    for (const f of ["buscando", "pausada", "verificacion", "revisando"]) expect(maq.mensajeInterrumpida(f, null)).not.toMatch(/Chrome/);
  });

  it("al despertar: pide /detener (lo leído se guarda), cierra la pestaña y borra busquedaViva", () => {
    const limpiar = fondo.slice(fondo.indexOf("async function limpiarCortada"), fondo.indexOf("limpieza = limpiarCortada()"));
    expect(limpiar).toContain('api("/api/extension/detener", { busqueda: viva.id, motivo: "usuario" }, token)');
    expect(limpiar).toContain("chrome.tabs.remove(viva.tabId)");
    expect(limpiar).toMatch(/busquedaViva: null,[\s\S]*bitacora: agregarPaso/);
    expect(limpiar).toContain('fase: "detenida"');
    // Mientras revisaba, la búsqueda ya no tiene página esperada: no se pide /detener.
    expect(limpiar).toContain('b.fase !== "revisando"');
  });

  it("nadie recibe 'buscando' de un trabajador recién despierto: el estado espera a la limpieza", () => {
    const estado = fondo.slice(fondo.indexOf("async function estadoParaAfuera"), fondo.indexOf("// --- Búsqueda semanal sola"));
    expect(estado.indexOf("await limpieza")).toBeGreaterThan(-1);
    expect(estado.indexOf("await limpieza")).toBeLessThan(estado.indexOf("if (S)"));
  });

  it("el panel lateral le pregunta al trabajador de fondo con el latido de más de 3 s (pedido 'estado', solo de la extensión)", () => {
    expect(vp.LATIDO_PREGUNTAR_MS).toBe(3_000);
    const ahora = 1_700_000_000_000;
    const b = (latido: number, fase = "buscando") => ({ busqueda: { fase, latido } });
    expect(vp.latidoViejo(b(ahora - 2_000), ahora)).toBe(false);
    expect(vp.latidoViejo(b(ahora - 11_000), ahora)).toBe(true);
    expect(vp.latidoViejo(b(ahora - 11_000, "terminada"), ahora)).toBe(false);
    expect(vp.latidoViejo({}, ahora)).toBe(false);
    expect(leer("sidepanel.js")).toMatch(/if \(latidoViejo\(g\)\) preguntarEstado\(\);/);
    expect(men.leerPedido("popup", { tipo: "estado", x: 1 })).toEqual({ tipo: "estado" });
    expect(men.leerPedido("panel", { tipo: "estado" })).toBeNull();
    expect(men.leerPedido("control", { tipo: "estado" })).toBeNull();
    expect(fondo).toContain('case "estado":\n      // El panel lateral pregunta');
  });

  it("sin latido por mucho rato el panel lateral muestra que se interrumpió, sin hablar de Chrome", () => {
    const ahora = 1_700_000_000_000;
    const v = vp.vistaPanel({ token: "t", busqueda: { fase: "buscando", latido: ahora - 120_000 } }, ahora);
    expect(v.enCurso).toBeNull();
    expect(v.resultado).toEqual({ texto: "La búsqueda se interrumpió. Toca «Buscar dueños ahora» para seguir.", error: true });
  });
});

describe("verificación: 'Todavía veo la verificación' también en el panel lateral", () => {
  const ahora = 1_700_000_000_000;
  it("con Seguir sin resolverla, el detalle cambia; la primera vez, el texto de siempre", () => {
    const todavia = "Todavía veo la verificación. Resuélvela en la página y toca Seguir.";
    const v1 = vp.vistaPanel({ token: "t", busqueda: { fase: "verificacion", latido: ahora, mensaje: todavia } }, ahora);
    expect(v1.enCurso?.detalle).toBe(todavia);
    const v2 = vp.vistaPanel({ token: "t", busqueda: { fase: "verificacion", latido: ahora, mensaje: "" } }, ahora);
    expect(v2.enCurso?.detalle).toMatch(/^Encuentra24 pide que confirmes/);
    // Otro mensaje cualquiera no se cuela.
    const v3 = vp.vistaPanel({ token: "t", busqueda: { fase: "verificacion", latido: ahora, mensaje: "Listo" } }, ahora);
    expect(v3.enCurso?.detalle).toMatch(/^Encuentra24 pide que confirmes/);
  });

  it("una verificación nueva empieza sin el 'Todavía…' de la anterior", () => {
    expect(leer("background.js")).toContain('await cambiar({ tipo: "verificacion" }, { mensaje: "" });');
  });
});

describe("asistente para actualizar: qué trae la versión nueva", () => {
  it("desde la 1.3.0 nombra el panel con el nombre de la asistente (lo más nuevo primero)", () => {
    const t = novedadesDesde("1.3.0", "Patty");
    expect(t).toHaveLength(2);
    expect(t[0]).toMatch(/El panel de Patty se ve más claro/);
    expect(t.join(" ")).not.toMatch(/popup/i);
  });

  it("desde la 1.4.0, lo de la 1.5.0 y la 1.4.1; desde la 1.4.1, solo la 1.5.0; sin saber la instalada, lo más reciente; nombre vacío = Patty", () => {
    expect(novedadesDesde("1.4.0", "Ana")).toEqual([expect.stringMatching(/tokens de IA/), expect.stringMatching(/ficha chica/)]);
    expect(novedadesDesde("1.4.1", "Ana")).toEqual([expect.stringMatching(/El panel de Ana se ve más claro/)]);
    expect(novedadesDesde("1.5.0", "Ana")).toEqual([]);
    expect(novedadesDesde(null, " ")).toHaveLength(2);
    expect(novedadesDesde(null, " ").join(" ")).toContain("Patty");
  });
});
