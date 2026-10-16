import { describe, expect, it, vi } from "vitest";
import type { Cerebro } from "../lib/asistente/cerebro";
import { SIN_CONSUMO } from "../lib/asistente/costo";
import { BusquedaSinResultados, armarListaDuenos, buscarDuenos } from "../lib/encuentra24/busqueda";
import { anunciosDePagina, esDesafio, urlListado } from "../lib/encuentra24/parsear";
import { anuncioE24, paginaE24 } from "./fixtures/e24";

const html = paginaE24([anuncioE24(1001, "Agente", "Inmobiliaria Ejemplo"), anuncioE24(1002, "Propietario", "Juan Pérez"), anuncioE24(1001, "Agente", "Inmobiliaria Ejemplo")]);

describe("parser de Encuentra24", () => {
  it("une los fragmentos del payload y extrae cada anuncio una vez", () => {
    const anuncios = anunciosDePagina(html);
    expect(anuncios.map((a) => [a.id, a.tipoAnunciante])).toEqual([
      ["1001", "Agente"],
      ["1002", "Propietario"],
    ]);
  });

  it("normaliza campos", () => {
    const a = anunciosDePagina(html)[1];
    expect(a).toMatchObject({
      titulo: "Casa de prueba 1002",
      url: "https://www.encuentra24.com/costa-rica-es/bienes-raices-venta-de-propiedades-casas/casa-de-prueba/1002",
      precio: 350000,
      moneda: "USD",
      zona: "San José provincia, Escazú, San Rafael",
      m2Construccion: 220,
      m2Terreno: null,
      habitaciones: 3,
      anunciante: { id: "u1002", nombre: "Juan Pérez", verificado: false },
      fechaActualizacion: "2026-10-15T15:49:59.000Z",
    });
    expect(a.descripcion).toBe('Casa de prueba {1002} con "comillas" y \n\nsalto.');
  });

  it("reconoce la página de desafío de Cloudflare", () => {
    expect(esDesafio(html)).toBe(false);
    expect(esDesafio("<title>Attention Required! | Cloudflare</title>")).toBe(true);
  });

  it("arma la URL de cada página", () => {
    expect(urlListado("bienes-raices-venta-de-propiedades-casas", "san-jose-provincia-escazu", 1)).toBe(
      "https://www.encuentra24.com/costa-rica-es/bienes-raices-venta-de-propiedades-casas/san-jose-provincia-escazu",
    );
    expect(urlListado("bienes-raices-venta-de-propiedades-casas", "san-jose-provincia-escazu", 3)).toMatch(/\?page=3$/);
  });
});

describe("buscarDuenos", () => {
  const CAT = "bienes-raices-venta-de-propiedades-casas";
  // Escazú: 2 páginas; Santa Ana: 1 página. La página siguiente a la última repite anuncios.
  const paginas: Record<string, string> = {
    [urlListado(CAT, "escazu", 1)]: paginaE24([
      anuncioE24(1, "Agente", "Realty Uno"),
      anuncioE24(2, "Propietario", "Ana Mora"),
      anuncioE24(3, "Propietario", "Pedro Solís", { price: { currency: { symbol: "USD" }, amount: { value: 2_000_000 } } }),
    ]),
    [urlListado(CAT, "escazu", 2)]: paginaE24([
      anuncioE24(4, "Propietario", "Luis Vargas"),
      anuncioE24(5, "Propietario", "Bienes Raíces Escondidas", { user: { id: "u5", name: "Bienes Raíces Escondidas" } }),
      anuncioE24(6, "Propietario", "María Jiménez"),
    ]),
    [urlListado(CAT, "santa-ana", 1)]: paginaE24([anuncioE24(7, "Propietario", "Rosa Quesada")]),
  };
  const obtener = vi.fn(async (url: string) => paginas[url] ?? paginaE24([anuncioE24(1, "Agente", "Realty Uno")]));
  const cerebro = {
    clasificarAnuncio: vi.fn(async (a: { id: string; anunciante: { nombre: string | null } }) => ({
      esDueno: !/bienes ra/i.test(a.anunciante.nombre ?? ""),
      puntaje: 100 - Number(a.id),
      senales: ["texto en primera persona"],
      consumo: SIN_CONSUMO,
    })),
  } as unknown as Pick<Cerebro, "clasificarAnuncio">;

  it("filtra agentes, ya vistos, bloqueados y fuera de rango; Haiku descarta corredores", async () => {
    const r = await buscarDuenos(
      {
        categoria: CAT,
        zonas: ["escazu", "santa-ana"],
        precioMin: 100_000,
        precioMax: 1_000_000,
        yaVistos: new Set(["6"]),
        bloqueados: [{ nombre: "LUIS  vargas", anunciante_e24_id: null }],
        maxPaginasPorZona: 3,
      },
      obtener,
      cerebro,
    );
    // 1 agente; 3 fuera de rango; 4 bloqueado por nombre; 6 ya visto; 5 corredor según Haiku.
    expect(r.leads.map((l) => l.anuncio.id)).toEqual(["2", "7"]);
    expect(r).toMatchObject({ anunciosLeidos: 7, candidatos: 3, descartadosPorCorredor: 1, llamadasClaude: 3 });
    // Las zonas se recorren por turnos y una zona sin anuncios nuevos deja de pedirse.
    expect(obtener.mock.calls.map((c) => c[0].replace(/^.*casas\//, ""))).toEqual([
      "escazu",
      "santa-ana",
      "escazu?page=2",
      "santa-ana?page=2",
      "escazu?page=3",
    ]);
  });

  it("una página bloqueada se salta y la zona sigue; dos bloqueos seguidos la abandonan", async () => {
    const DESAFIO = "<title>Attention Required! | Cloudflare</title>";
    const zonaA: Record<number, string> = {
      1: paginaE24([anuncioE24(11, "Propietario", "Ana Mora")]),
      2: DESAFIO,
      3: paginaE24([anuncioE24(13, "Propietario", "Luis Vargas")]),
      4: DESAFIO,
      5: DESAFIO,
      6: paginaE24([anuncioE24(16, "Propietario", "No debería leerse")]),
    };
    const pedidas: string[] = [];
    const r = await buscarDuenos(
      { categoria: CAT, zonas: ["a"], precioMin: null, precioMax: null, yaVistos: new Set(), bloqueados: [], maxPaginasPorZona: 6 },
      async (url) => {
        pedidas.push(url);
        const n = Number(/page=(\d+)/.exec(url)?.[1] ?? 1);
        return zonaA[n];
      },
      cerebro,
    );
    expect(r.leads.map((l) => l.anuncio.id).sort()).toEqual(["11", "13"]);
    expect(pedidas).toHaveLength(5);
  });

  it("si Encuentra24 bloquea todo, falla para que se note", async () => {
    await expect(
      buscarDuenos(
        { categoria: CAT, zonas: ["escazu"], precioMin: null, precioMax: null, yaVistos: new Set(), bloqueados: [] },
        async () => "<title>Attention Required! | Cloudflare</title>",
        cerebro,
      ),
    ).rejects.toThrow(BusquedaSinResultados);
  });

  it("arma la lista para WhatsApp con enlace y puntaje", async () => {
    const [a] = anunciosDePagina(paginaE24([anuncioE24(2, "Propietario", "Ana Mora")]));
    const lista = armarListaDuenos([{ anuncio: a, puntaje: 88, senales: ["vendo mi casa", "una sola propiedad"] }]);
    expect(lista).toContain("*Dueños directos de la semana (1)*");
    expect(lista).toContain("1. Casa de prueba 2 · $350.000 · Escazú, San Rafael (88/100)");
    expect(lista).toContain("   vendo mi casa; una sola propiedad");
    expect(lista).toContain(a.url);
    expect(armarListaDuenos([])).toContain("no encontré dueños directos nuevos");
  });
});
