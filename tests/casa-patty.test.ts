import { describe, expect, it } from "vitest";
import { resumenParaGlobo } from "../app/panel/guia";
import { pideCargarCasa } from "../lib/panel/casa-patty";

describe("Patty: pedir que cargue una casa", () => {
  it.each([
    "Agrega esta casa: Escazú, en venta, 450 mil, 3 cuartos y piscina",
    "agrégala: casa en Santa Ana, alquiler, $1.800",
    "Patty, cargá un apartamento en Rohrmoser en alquiler a $1200",
    "Súbeme esta propiedad, lote de 500 m2 en Grecia",
    "Guarda la casa de Lindora: 3 cuartos, 2 baños, $380.000",
    "registra una nueva casa en Heredia",
    "Por favor agrega un lote en Atenas de 1.000 m²",
    "quiero agregar una casa en Escazú, venta, 600 mil",
    "¿Me ayudas a agregar esta casa? Es en Escazú, venta, 450 mil",
    "agrega a mis casas: casa en Curridabat en venta",
  ])("sí: %s", (texto) => expect(pideCargarCasa(texto)).toBe(true));

  it.each([
    "¿cómo agrego una casa?",
    "¿Cómo subo una casa?",
    "¿Puedes agregar una casa?",
    "dónde agrego casas",
    "agrega una visita mañana a las 10",
    "agrega un cliente que busca casa en Escazú",
    "sube las fotos de la casa",
    "sube el precio de la casa DP-01",
    "guarda esto",
    "¿Qué casa se mueve más?",
    "hazme una imagen de una casa con piscina",
    "bloquear mañana en la tarde",
  ])("no: %s", (texto) => expect(pideCargarCasa(texto)).toBe(false));
});

describe("Globo de la guía con la respuesta", () => {
  it("quita el formato y los enlaces, y corta lo largo", () => {
    expect(resumenParaGlobo("## Hoy\n- Ve a [Ajustes](/panel/ajustes) y **cambia** la hora")).toBe("Hoy Ve a Ajustes y cambia la hora");
    const largo = resumenParaGlobo("palabra ".repeat(100), 50);
    expect(largo.length).toBeLessThanOrEqual(50);
    expect(largo.endsWith("…")).toBe(true);
  });
});
