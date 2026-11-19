import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { COSTO_BUSQUEDA_WEB_USD, consumo } from "../lib/asistente/costo";
import { lineasFuentes, textoYFuentes } from "../lib/asistente/fuentes-web";
import { crearCerebroClaude, MAX_BUSQUEDAS_PATTY } from "../lib/asistente/cerebro";
import { esEnlaceExterno, trozos } from "../lib/panel/markdown";
import { inicioDeMes, resumirNegocio, seccionNegocio, type EntradaNegocio } from "../lib/panel/negocio-patty";

const CR = "America/Costa_Rica";
const AHORA = new Date("2026-11-19T15:00:00Z");

const base = (e: Partial<EntradaNegocio> = {}): EntradaNegocio => ({
  clientes: [],
  casas: [],
  visitasProximas: 0,
  visitasHechas: 0,
  duenosNuevos: 0,
  mensajesMes: null,
  energia: null,
  ...e,
});

const cierre = (at: string, comision: number, moneda: "USD" | "CRC") => ({
  etapa: "cerrado",
  oferta_monto: null,
  oferta_moneda: null,
  cierre_at: at,
  cierre_comision: comision,
  cierre_moneda: moneda,
});

describe("sección Negocio de Patty", () => {
  it("lo ganado va por mes y por moneda, sin sumar dólares con colones", () => {
    const texto = seccionNegocio(
      resumirNegocio(
        base({
          clientes: [
            cierre("2026-11-05T16:00:00Z", 12_500, "USD"),
            cierre("2026-11-10T16:00:00Z", 850_000, "CRC"),
            cierre("2026-10-20T16:00:00Z", 3_000, "USD"),
            // 31 de octubre en la noche en Costa Rica: es de octubre, no de noviembre.
            cierre("2026-11-01T02:00:00Z", 1_000, "USD"),
          ],
        }),
        AHORA,
        CR,
      ),
    );
    expect(texto).toContain("- Ganado este mes (noviembre): $12.500 y ₡850.000 en comisiones, 2 cierres.");
    expect(texto).toContain("- Ganado el mes pasado (octubre): $4.000 en comisiones, 2 cierres.");
    expect(texto).not.toMatch(/862\.500|863/);
  });

  it("embudo, ofertas, visitas, casas, dueños, mensajes y energía; lo que está en cero no se escribe", () => {
    const r = resumirNegocio(
      base({
        clientes: [
          { etapa: "nuevo", oferta_monto: null, oferta_moneda: null, cierre_at: null, cierre_comision: null, cierre_moneda: null },
          { etapa: "negociando", oferta_monto: 250_000, oferta_moneda: "USD", cierre_at: null, cierre_comision: null, cierre_moneda: null },
          { etapa: "negociando", oferta_monto: "90000000", oferta_moneda: "CRC", cierre_at: null, cierre_comision: null, cierre_moneda: null },
          { etapa: "negociando", oferta_monto: null, oferta_moneda: null, cierre_at: null, cierre_comision: null, cierre_moneda: null },
        ],
        casas: [{ estado: "activa" }, { estado: "activa" }, { estado: "inactiva" }, { estado: "vendida" }],
        visitasProximas: 3,
        duenosNuevos: 2,
        mensajesMes: 140,
        energia: { restante: 62, usado: 38, nivel: "bien" },
      }),
      AHORA,
      CR,
    );
    const texto = seccionNegocio(r);
    expect(texto).toContain("- Clientes por etapa: Nuevo 1, Negociando 3.");
    expect(texto).toContain("- Ofertas en negociación: 2, por $250.000 y ₡90.000.000 en total.");
    expect(texto).toContain("- Visitas: 3 en los próximos 7 días.");
    expect(texto).toContain("- Casas: 2 activas, 1 pausadas, 1 vendidas.");
    expect(texto).toContain("- Dueños directos nuevos en los últimos 7 días: 2.");
    expect(texto).toContain("- Mensajes de WhatsApp que llegaron este mes: 140.");
    expect(texto).toContain("le queda 62 %");
    expect(texto).not.toMatch(/Interesado|reservadas|alquiladas|hechas/);
  });

  it("sin datos: solo lo ganado (sin cierres) y la aclaración del cero", () => {
    const texto = seccionNegocio(resumirNegocio(base({ energia: { restante: 100, usado: 0, nivel: "sin_tope" } as never }), AHORA, CR));
    expect(texto.split("\n")).toEqual([
      "Negocio (cifras exactas del sistema; dólares y colones van por separado y nunca se suman):",
      "- Ganado este mes (noviembre): sin cierres.",
      "- Ganado el mes pasado (octubre): sin cierres.",
      "- Lo que no aparece en esta lista está en cero.",
    ]);
  });

  it("el mes de uso se cuenta en la zona del corredor", () => {
    expect(inicioDeMes(new Date("2026-12-01T03:00:00Z"), CR)).toBe("2026-11-01");
    expect(inicioDeMes(new Date("2026-12-01T07:00:00Z"), CR)).toBe("2026-12-01");
  });
});

type Bloque = Anthropic.Beta.BetaContentBlock;

const conBusqueda: Bloque[] = [
  { type: "server_tool_use", id: "s1", name: "web_search", input: { query: "precio m2 Escazú" } } as never,
  {
    type: "web_search_tool_result",
    tool_use_id: "s1",
    content: [
      { type: "web_search_result", url: "https://www.nacion.com/economia/vivienda", title: "Vivienda en Escazú", encrypted_content: "x", page_age: null },
      { type: "web_search_result", url: "http://inseguro.example.com/a", title: "Sin https", encrypted_content: "x", page_age: null },
      { type: "web_search_result", url: "https://www.crhoy.com/precios", title: "Precios [2026]", encrypted_content: "x", page_age: null },
    ],
  } as never,
  { type: "text", text: "Según lo que encontré en internet, ", citations: null },
  {
    type: "text",
    text: "el metro ronda $1.800",
    citations: [
      { type: "web_search_result_location", url: "https://www.elfinancierocr.com/x(1)", title: "El Financiero", cited_text: "…", encrypted_index: "e" },
      { type: "web_search_result_location", url: "https://www.elfinancierocr.com/x(1)", title: "El Financiero", cited_text: "…", encrypted_index: "e" },
    ],
  },
  { type: "text", text: " en anuncios.", citations: null },
];

describe("búsqueda en internet de Patty", () => {
  it("solo el texto llega al corredor; las fuentes salen de las citas y luego de los resultados, sin repetir y hasta 3", () => {
    const { texto, fuentes } = textoYFuentes(conBusqueda);
    expect(texto).toBe("Según lo que encontré en internet, el metro ronda $1.800 en anuncios.");
    expect(fuentes.map((f) => f.url)).toEqual([
      "https://www.elfinancierocr.com/x%281%29",
      "https://www.nacion.com/economia/vivienda",
      "https://www.crhoy.com/precios",
    ]);
    expect(fuentes[2].titulo).toBe("Precios 2026");
    const lineas = lineasFuentes(fuentes);
    expect(lineas.split("\n")[0]).toBe("Fuentes:");
    expect(lineas).toContain("- [El Financiero](https://www.elfinancierocr.com/x%281%29) · elfinancierocr.com");
    // El lector del panel los ve como enlaces externos.
    const enlace = trozos("[El Financiero](https://www.elfinancierocr.com/x%281%29)")[0];
    expect(enlace).toMatchObject({ tipo: "enlace" });
    expect(esEnlaceExterno((enlace as { url: string }).url)).toBe(true);
    expect(esEnlaceExterno("javascript:alert(1)")).toBe(false);
    expect(esEnlaceExterno("http://x.com")).toBe(false);
  });

  it("una búsqueda con error no rompe ni trae fuentes", () => {
    const { texto, fuentes } = textoYFuentes([
      { type: "web_search_tool_result", tool_use_id: "s1", content: { type: "web_search_tool_result_error", error_code: "max_uses_exceeded" } } as never,
      { type: "text", text: "No encontré nada claro.", citations: null },
    ]);
    expect(texto).toBe("No encontré nada claro.");
    expect(fuentes).toEqual([]);
    expect(lineasFuentes(fuentes)).toBe("");
  });

  it("cada búsqueda suma su costo aparte de los tokens", () => {
    const sin = consumo("claude-sonnet-5-5", { input_tokens: 1000, output_tokens: 100 });
    const con = consumo("claude-sonnet-5-5", { input_tokens: 1000, output_tokens: 100, server_tool_use: { web_search_requests: 2 } });
    expect(con.costoUsd - sin.costoUsd).toBeCloseTo(2 * COSTO_BUSQUEDA_WEB_USD, 10);
    expect(COSTO_BUSQUEDA_WEB_USD).toBe(0.01);
    expect(consumo("claude-sonnet-5-5", { input_tokens: 0, output_tokens: 0, server_tool_use: null }).costoUsd).toBe(0);
  });

  it("conversarConCorredor declara web_search con tope, devuelve el texto con sus fuentes y cuenta las búsquedas", async () => {
    const pedidos: Anthropic.Beta.MessageCreateParams[] = [];
    const client = {
      beta: {
        messages: {
          create: async (p: Anthropic.Beta.MessageCreateParams) => {
            pedidos.push(p);
            return {
              model: "claude-sonnet-5-5",
              stop_reason: "end_turn",
              content: conBusqueda,
              usage: { input_tokens: 1000, output_tokens: 100, server_tool_use: { web_search_requests: 1, web_fetch_requests: 0 } },
            };
          },
        },
      },
    } as unknown as Anthropic;
    const corredor = { nombre_asistente: "Patty", nombre_contacto: "Pati", nombre: "Deluxe", zona_horaria: CR } as never;
    const r = await crearCerebroClaude(client).conversarConCorredor(corredor, "Negocio: …", [], "¿Cuánto vale el metro en Escazú?");
    const herramientas = pedidos[0].tools as { type: string; max_uses?: number; user_location?: { country?: string } }[];
    const busqueda = herramientas.find((t) => t.type === "web_search_20260209");
    expect(busqueda?.max_uses).toBe(MAX_BUSQUEDAS_PATTY);
    expect(busqueda?.user_location?.country).toBe("CR");
    expect(herramientas.some((t) => t.type === "web_fetch_20260209")).toBe(true);
    expect(r.texto.startsWith("Según lo que encontré en internet, el metro ronda $1.800 en anuncios.\n\nFuentes:\n- [El Financiero]")).toBe(true);
    const tokens = (1000 * 2 + 100 * 10) / 1_000_000;
    expect(r.consumo.costoUsd).toBeCloseTo(tokens + COSTO_BUSQUEDA_WEB_USD, 10);
  });
});
