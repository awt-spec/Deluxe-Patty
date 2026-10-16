import { describe, expect, it, vi } from "vitest";
import type { Cerebro } from "../lib/asistente/cerebro";
import { SIN_CONSUMO } from "../lib/asistente/costo";
import {
  FICHA_VACIA,
  conversarFicha,
  datosParaGuardar,
  faltantes,
  fichaLimpia,
  resumenFicha,
} from "../lib/propiedades/conversar";
import { corredorBase } from "./dobles";

const casa = {
  ...FICHA_VACIA,
  titulo: "Casa en condominio en Escazú",
  tipo: "casa" as const,
  operacion: "venta" as const,
  precio: 450000,
  moneda: "USD" as const,
  canton: "Escazú",
  zona: "Escazú",
  habitaciones: 3,
  banos: 2.5,
  m2_construccion: 320,
  amenidades: ["piscina", "seguridad 24/7"],
};

function cerebroCon(ficha: object, pregunta: string | null = null) {
  return { fichaConversada: vi.fn(async () => ({ ficha, pregunta, consumo: SIN_CONSUMO })) } as unknown as Cerebro &
    { fichaConversada: ReturnType<typeof vi.fn> };
}

describe("agregar casa conversando", () => {
  it("pregunta lo esencial que falta, uno a la vez", async () => {
    const cerebro = cerebroCon({ ...FICHA_VACIA, tipo: "casa", zona: "Escazú", precio: 450000 }, "¿Es para venta o alquiler?");
    const r = await conversarFicha(cerebro, corredorBase(), [{ autor: "corredor", texto: "Casa en Escazú, 450 mil" }], null);
    expect(r).toMatchObject({ lista: false, mensaje: "¿Es para venta o alquiler?" });

    // Sin pregunta del modelo, el código pregunta por lo primero que falta.
    const sinPregunta = cerebroCon({ ...FICHA_VACIA, operacion: "venta", tipo: "casa" });
    const r2 = await conversarFicha(sinPregunta, corredorBase(), [{ autor: "corredor", texto: "casa en venta" }], null);
    expect(r2.mensaje).toBe("¿En qué zona está?");
  });

  it("con lo esencial, muestra el resumen para confirmar aunque el modelo quiera preguntar más", async () => {
    const r = await conversarFicha(cerebroCon(casa, "¿Tiene parqueo?"), corredorBase(), [{ autor: "corredor", texto: "…" }], null);
    expect(r).toMatchObject({ lista: true, mensaje: "Así quedó. ¿Está bien?" });
  });

  it("le pasa al modelo la conversación y la ficha que ya lleva", async () => {
    const cerebro = cerebroCon(casa);
    const msgs = [
      { autor: "corredor" as const, texto: "casa en Escazú" },
      { autor: "asistente" as const, texto: "¿Precio?" },
      { autor: "corredor" as const, texto: "450 mil" },
    ];
    await conversarFicha(cerebro, corredorBase(), msgs, casa);
    expect(cerebro.fichaConversada).toHaveBeenCalledWith(expect.anything(), msgs, casa);
  });

  it("limpia la ficha que llega del navegador o del modelo", () => {
    expect(
      fichaLimpia({ tipo: "castillo", operacion: "venta", precio: -3, banos: 2.4, habitaciones: 3.2, amenidades: ["  piscina ", "", 4], zona: " " }),
    ).toEqual({ ...FICHA_VACIA, operacion: "venta", banos: 2.5, habitaciones: 3, amenidades: ["piscina"] });
    expect(fichaLimpia(null)).toEqual(FICHA_VACIA);
  });

  it("dice qué falta y arma el resumen en palabras sencillas", () => {
    expect(faltantes(FICHA_VACIA)).toEqual(["operacion", "tipo", "zona", "precio"]);
    expect(faltantes(casa)).toEqual([]);
    expect(resumenFicha(casa)).toEqual([
      "Casa en condominio en Escazú",
      "Casa en venta",
      "Escazú",
      "$450.000",
      "3 cuartos · 2,5 baños · 320 m² de construcción",
      "piscina · seguridad 24/7",
    ]);
    expect(resumenFicha({ ...casa, operacion: "alquiler", precio: 2200 })).toContain("$2.200 al mes");
  });

  it("se guarda con las mismas reglas que el formulario", () => {
    const r = datosParaGuardar({ ...casa, titulo: null, zona: null }, "P-007");
    expect(r).toMatchObject({
      ok: true,
      valor: { codigo: "P-007", titulo: "Casa en Escazú", zona: "Escazú", precio: 450000, banos: 2.5, estado: "activa" },
    });
    expect(datosParaGuardar({ ...casa, operacion: null }, "P-007").ok).toBe(false);
  });
});
