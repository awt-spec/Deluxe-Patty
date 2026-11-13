import { describe, expect, it } from "vitest";
import { enlaceModoCorredor, sitiosWeb } from "@/lib/sitio/modo-corredor";

const sitio = "https://www.deluxeproperties.sale";

describe("Modo corredor", () => {
  it("arma el enlace /share/<slug> de una casa activa", () => {
    expect(enlaceModoCorredor({ sitio, slugCasa: "casa-lujo-bosques-de-lindora-santa-ana", estado: "activa" })).toBe(`${sitio}/share/casa-lujo-bosques-de-lindora-santa-ana`);
    expect(enlaceModoCorredor({ sitio: `${sitio}/`, slugCasa: "x", estado: "activa" })).toBe(`${sitio}/share/x`);
  });
  it("casa pausada, vendida, sin slug o sin sitio: null", () => {
    expect(enlaceModoCorredor({ sitio, slugCasa: "x", estado: "inactiva" })).toBeNull();
    expect(enlaceModoCorredor({ sitio, slugCasa: "x", estado: "vendida" })).toBeNull();
    expect(enlaceModoCorredor({ sitio, slugCasa: "", estado: "activa" })).toBeNull();
    expect(enlaceModoCorredor({ sitio, slugCasa: null, estado: "activa" })).toBeNull();
    expect(enlaceModoCorredor({ sitio: null, slugCasa: "x", estado: "activa" })).toBeNull();
    expect(enlaceModoCorredor({ sitio: "http://inseguro.com", slugCasa: "x", estado: "activa" })).toBeNull();
    expect(enlaceModoCorredor({ sitio: "no es url", slugCasa: "x", estado: "activa" })).toBeNull();
  });
  it("escapa caracteres raros del slug", () => {
    expect(enlaceModoCorredor({ sitio, slugCasa: "a b/c?d#e", estado: "activa" })).toBe(`${sitio}/share/a%20b%2Fc%3Fd%23e`);
  });
  it("Deluxe tiene su sitio por defecto", () => {
    expect(sitiosWeb()["deluxe-properties"]).toBe(sitio);
  });
});
