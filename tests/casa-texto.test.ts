import { describe, expect, it, vi } from "vitest";
import { FICHA_VACIA } from "../lib/propiedades/conversar";
import { claveDuda, conversarCasaTexto, convieneTener, siguientePregunta, textosLimpios } from "../lib/propiedades/casa-texto";
import { amenidadesSitio, armarPedidoCasa, datosCasaSitio, leerRespuestaCasa, urlFuncionCasa, type TextosCasa } from "../lib/sitio/casa";
import { firmarCuerpo } from "../lib/sitio/fotos";
import type { Corredor, FichaParcial } from "../lib/datos/tipos";

// Casa nueva desde el chat de Patty con el texto pegado: qué se pregunta, "tal cual" de verdad y el pedido al sitio.

const completa: FichaParcial = {
  ...FICHA_VACIA,
  titulo: "Casa en Escazú",
  tipo: "casa",
  operacion: "venta",
  precio: 450000,
  moneda: "USD",
  zona: "Escazú",
  habitaciones: 3,
  banos: 2.5,
  m2_construccion: 280,
  amenidades: ["piscina", "seguridad 24/7"],
};
const textos: TextosCasa = {
  titulo_es: "Casa en Escazú",
  titulo_en: "House in Escazú",
  descripcion_es: "Linda casa.",
  descripcion_en: "Nice house.",
  destacados_es: ["Piscina", "Vista al valle"],
  destacados_en: ["Pool", "Valley view"],
};

describe("qué se pregunta", () => {
  it("primero lo esencial, en orden", () => {
    expect(siguientePregunta({ ...completa, operacion: null, precio: null }, [], [])?.clave).toBe("operacion");
    expect(siguientePregunta({ ...completa, precio: null }, ["¿Es en colones?"], [])?.clave).toBe("precio");
  });

  it("lo esencial se vuelve a preguntar aunque ya se haya preguntado", () => {
    expect(siguientePregunta({ ...completa, zona: null }, [], ["zona"])?.clave).toBe("zona");
  });

  it("después lo que conviene (una sola vez) y por último las dudas de la IA (una sola vez)", () => {
    const sinCuartos = { ...completa, habitaciones: null };
    expect(siguientePregunta(sinCuartos, ["¿El precio incluye mantenimiento?"], [])?.clave).toBe("habitaciones");
    const despues = siguientePregunta(sinCuartos, ["¿El precio incluye mantenimiento?"], ["habitaciones"]);
    expect(despues?.texto).toBe("¿El precio incluye mantenimiento?");
    expect(siguientePregunta(sinCuartos, ["¿El precio incluye mantenimiento?"], ["habitaciones", despues!.clave])).toBeNull();
  });

  it("en un lote conviene el terreno, no los cuartos", () => {
    expect(convieneTener({ ...completa, tipo: "lote", habitaciones: null, m2_terreno: null })).toEqual(["m2_terreno"]);
  });

  it("la clave de una duda no cambia con la puntuación", () => {
    expect(claveDuda("¿El precio incluye mantenimiento?")).toBe(claveDuda("el precio incluye el mantenimiento"));
  });
});

describe("conversarCasaTexto", () => {
  const corredor = { id: "c1", nombre_contacto: "Patricia" } as Corredor;
  const cerebro = (r: Partial<{ ficha: FichaParcial; dudas: string[]; textos: TextosCasa }> = {}) => ({
    casaDesdeTexto: vi.fn(async () => ({
      ficha: r.ficha ?? completa,
      parqueos: null,
      textos: r.textos ?? { ...textos, descripcion_es: "Texto reescrito por la IA." },
      dudas: r.dudas ?? [],
      consumo: { tokensEntrada: 1, tokensSalida: 1, costoUsd: 0.01 },
    })),
  });

  it("«tal cual» guarda el texto que pegó el corredor, sin cambiarle palabras", async () => {
    const pegado = "Casa  linda en Escazú.   \n\n\n\nTiene piscina.";
    const r = await conversarCasaTexto(cerebro(), corredor, { texto: pegado, modo: "tal_cual", mensajes: [], actual: null, preguntadas: [] });
    expect(r.textos.descripcion_es).toBe("Casa  linda en Escazú.\n\nTiene piscina.");
    expect(r.ficha.descripcion).toBe(r.textos.descripcion_es);
  });

  it("«mejorar» usa el texto de la IA; con todo listo, muestra cómo quedó", async () => {
    const r = await conversarCasaTexto(cerebro(), corredor, { texto: "casa", modo: "mejorar", mensajes: [], actual: null, preguntadas: [] });
    expect(r.textos.descripcion_es).toBe("Texto reescrito por la IA.");
    expect(r).toMatchObject({ lista: true, puedeGuardar: true, pregunta: null, mensaje: "Así quedó. ¿Está bien?" });
  });

  it("sin precio pregunta el precio y no deja guardar", async () => {
    const r = await conversarCasaTexto(cerebro({ ficha: { ...completa, precio: null } }), corredor, { texto: "casa", modo: "mejorar", mensajes: [], actual: null, preguntadas: [] });
    expect(r).toMatchObject({ lista: false, puedeGuardar: false, pregunta: "precio" });
  });

  it("con una duda de la IA, la pregunta pero ya se puede guardar", async () => {
    const r = await conversarCasaTexto(cerebro({ dudas: ["¿Son 3 o 4 cuartos?"] }), corredor, { texto: "casa", modo: "mejorar", mensajes: [], actual: null, preguntadas: [] });
    expect(r).toMatchObject({ lista: false, puedeGuardar: true, mensaje: "¿Son 3 o 4 cuartos?" });
  });

  it("los textos del navegador se validan", () => {
    expect(textosLimpios({ titulo_es: "", descripcion_es: "x" })).toBeNull();
    expect(textosLimpios({ ...textos, destacados_es: ["a", 3, null] })?.destacados_es).toEqual(["a"]);
  });
});

describe("pedido al sitio", () => {
  it("la función de casas vive junto a la de fotos", () => {
    expect(urlFuncionCasa("https://x.supabase.co/functions/v1/recibir-fotos")).toBe("https://x.supabase.co/functions/v1/recibir-casa");
    expect(urlFuncionCasa("http://x.supabase.co/functions/v1/recibir-fotos")).toBeNull();
    expect(urlFuncionCasa("https://x.supabase.co/otra")).toBeNull();
  });

  it("traduce la ficha al formato del sitio sin inventar", () => {
    const d = datosCasaSitio({ ...completa, m2_terreno: null }, textos);
    expect(d).toMatchObject({ operacion: "sale", tipo: "house", precio: 450000, moneda: "USD", habitaciones: 3, banos: 2.5, m2_terreno: null });
    expect(d.titulo).toEqual({ es: "Casa en Escazú", en: "House in Escazú" });
    expect(datosCasaSitio({ ...completa, operacion: "alquiler", tipo: "apartamento" }, textos)).toMatchObject({ operacion: "rent", tipo: "apartment" });
  });

  it("las amenidades del sitio salen solo de lo dicho", () => {
    expect(amenidadesSitio({ amenidades: ["Piscina", "Seguridad 24/7"], descripcion: null }, ["Vista al valle"])).toEqual(["pool", "security", "view"]);
    expect(amenidadesSitio({ amenidades: [], descripcion: null })).toEqual([]);
  });

  it("el pedido va firmado, con las fotos en orden", () => {
    const p = armarPedidoCasa({ ficha: completa, textos, fotos: ["https://a/1.jpg", "https://a/2.jpg", "https://a/1.jpg"], secreto: "s".repeat(40) }, 1_800_000_000_000, "nonce-1234");
    const cuerpo = JSON.parse(p.cuerpo);
    expect(cuerpo).toMatchObject({ accion: "crear", ts: 1_800_000_000, nonce: "nonce-1234" });
    expect(cuerpo.fotos).toEqual([
      { url: "https://a/1.jpg", orden: 1 },
      { url: "https://a/2.jpg", orden: 2 },
    ]);
    expect(p.firma).toBe(firmarCuerpo("s".repeat(40), p.cuerpo));
    expect(() => armarPedidoCasa({ ficha: completa, textos, fotos: [], secreto: "s".repeat(40) })).toThrow();
  });

  it("de la respuesta solo se acepta el código DP, fotos de sus hosts y el enlace de su sitio", () => {
    const r = leerRespuestaCasa(
      { ok: true, codigo: "dp-a1b2c3", fotos: [{ url: "https://sitio.supabase.co/x.jpg" }, { url: "https://malo.com/y.jpg" }], url_casa: "https://www.deluxe.com/propiedad/casa" },
      { hostsFotos: ["sitio.supabase.co"], sitio: "https://www.deluxe.com" },
    );
    expect(r).toEqual({ codigo: "DP-A1B2C3", fotos: ["https://sitio.supabase.co/x.jpg"], urlCasa: "https://www.deluxe.com/propiedad/casa" });
    expect(leerRespuestaCasa({ ok: true, codigo: "P-001" }, { hostsFotos: [], sitio: null })).toBeNull();
    expect(leerRespuestaCasa({ ok: true, codigo: "DP-A1B2C3", url_casa: "https://otro.com/x" }, { hostsFotos: [], sitio: "https://www.deluxe.com" })?.urlCasa).toBeNull();
  });
});
