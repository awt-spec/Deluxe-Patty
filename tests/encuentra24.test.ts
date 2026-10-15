import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { anunciosDePagina, esDesafio, urlListado } from "../lib/encuentra24/parsear";

const html = readFileSync(new URL("./fixtures/listado-e24.html", import.meta.url), "utf8");

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
