import { describe, expect, it } from "vitest";
import { cifrasInventadas, cifrasPermitidas, conCifrasDichas, normalizarCifra, traeCifra } from "../lib/redes/cifras";
import { MOTIVO_CIFRAS, revisarTextoIA } from "../lib/redes/texto-ia";

// H-07 (QA): el validador de cifras de redes dejaba pasar precios inventados en palabras, abreviados o armados
// con dígitos de la ficha, y rechazaba un precio legítimo con decimales. Ahora cada cifra se lee por su valor.

const FICHA = "Casa en Escazú. Precio: $450.000. 3 habitaciones, 2,5 baños, 250 m² de construcción y 125 m² de terreno. Código DP-01.";
const CONTACTO = "📲 Más información y visitas por WhatsApp: wa.me/50688887777 (código DP-01)";
const p = cifrasPermitidas(FICHA, CONTACTO);
const inventa = (t: string) => cifrasInventadas(t, p);

describe("cifras de redes: lo que reportó QA", () => {
  it("rechaza «dos millones de dólares» (en palabras)", () => {
    expect(inventa("Precio especial: dos millones de dólares")).toEqual(["2000000"]);
  });
  it("rechaza «$3 250» (ya no junta 3 y 250 por partes)", () => {
    expect(inventa("Solo $3 250")).toEqual(["3250"]);
  });
  it("rechaza «$1.25M» (es 1 250 000, no 125)", () => {
    expect(inventa("Ahora a $1.25M")).toEqual(["1250000"]);
  });
  it("acepta «USD 450,000.00» (el precio real con decimales)", () => {
    expect(inventa("USD 450,000.00")).toEqual([]);
  });
  it("revisarTextoIA descarta el texto con el precio en palabras (antes quedaba con dos precios)", () => {
    const r = revisarTextoIA("Casa de ensueño por dos millones de dólares. wa.me/50688887777 DP-01", {
      ficha: FICHA,
      anterior: "",
      casa: { codigo: "DP-01", precio: 450000, moneda: "USD", operacion: "venta" },
      contacto: { nombre: "Patricia", whatsapp: "+50688887777" },
      modo: "mejorar",
    });
    expect(r).toEqual({ ok: false, motivo: MOTIVO_CIFRAS });
  });
});

describe("cifras de redes: formatos del precio real (es-CR y en-US)", () => {
  it.each([
    "$450.000",
    "$450,000",
    "USD 450.000",
    "USD450,000",
    "$450.000,00",
    "$ 450 000",
    "450 000 dólares",
    "450 000",
    "$450K",
    "450k",
    "$450 mil",
    "cuatrocientos cincuenta mil dólares",
    "0450000",
  ])("acepta %s", (t) => {
    expect(inventa(t)).toEqual([]);
  });

  it.each([
    ["$460.000", "460000"],
    ["$4.500.000", "4500000"],
    ["$45.000", "45000"],
    ["medio millón de dólares", "500000"],
    ["trescientos mil", "300000"],
    ["un millón y medio", "1500000"],
    ["1 millón y medio", "1500000"],
    ["$2 millones", "2000000"],
    ["₡250 millones", "250000000"],
    ["half a million dollars", "500000"],
    ["two million dollars", "2000000"],
    ["$4.5M", "4500000"],
  ])("rechaza %s", (t, cifra) => {
    expect(inventa(t)).toEqual([cifra]);
  });

  it("colones con ₡ y CRC, millones con decimales", () => {
    const c = cifrasPermitidas("₡125.000.000");
    expect(cifrasInventadas("CRC 125,000,000", c)).toEqual([]);
    expect(cifrasInventadas("₡125 millones", c)).toEqual([]);
    expect(cifrasInventadas("₡ 0,125 mil millones", c)).not.toEqual([]);
    expect(cifrasInventadas("₡1,25 millones", cifrasPermitidas("₡1.250.000"))).toEqual([]);
  });
});

describe("cifras de redes: casos de borde", () => {
  it("datos de la ficha en otro formato o en palabras", () => {
    expect(inventa("3 habitaciones y 2.5 baños")).toEqual([]);
    expect(inventa("tres habitaciones")).toEqual([]);
    expect(inventa("cinco habitaciones")).toEqual(["5"]);
    expect(inventa("250m² y 125 m2 de terreno")).toEqual([]);
    expect(inventa("260 m²")).toEqual(["260"]);
    expect(inventa("doscientos cincuenta metros")).toEqual([]);
    expect(inventa("trescientos metros cuadrados")).toEqual(["300"]);
  });

  it("palabras que no son cifras no se cuentan", () => {
    expect(inventa("Una casa hermosa, un lugar único, baño y medio de lujo")).toEqual([]);
    expect(inventa("Una habitación principal con vista")).toEqual([]);
    expect(inventa("dos terrazas")).toEqual([]);
  });

  it("teléfonos: con o sin código de país, con espacios o guiones, en el enlace", () => {
    expect(inventa("wa.me/50688887777")).toEqual([]);
    expect(inventa("+506 8888 7777")).toEqual([]);
    expect(inventa("8888-7777")).toEqual([]);
    expect(inventa("8888 7777")).toEqual([]);
    expect(inventa("+506 8888 7000")).toEqual(["50688887000"]);
    expect(inventa("wa.me/50611112222")).toEqual(["50611112222"]);
  });

  it("códigos: DP-01 es el código, no el número 1", () => {
    expect(inventa("Código DP-01")).toEqual([]);
    expect(inventa("código dp-01")).toEqual([]);
    expect(inventa("Código DP-02")).toEqual(["#DP-02"]);
    // El 1 del código no sirve para inventar "1 piscina".
    expect(cifrasPermitidas("DP-01").has("1")).toBe(false);
  });

  it("años, 24/7, porcentajes, fechas y horas que no están en la ficha se rechazan", () => {
    expect(inventa("Construida en 2024")).toEqual(["2024"]);
    expect(inventa("Seguridad 24/7")).toEqual(["24", "7"]);
    expect(inventa("5% de descuento")).toEqual(["5"]);
    expect(inventa("Visítala el 15/11/2026 a las 10:30")).toEqual(["15", "11", "2026", "10", "30"]);
  });

  it("si la ficha los trae, se aceptan", () => {
    const c = cifrasPermitidas("Amenidades: seguridad 24/7, construida en 2024, 5% de comisión");
    expect(cifrasInventadas("Seguridad 24/7 desde 2024 (5%)", c)).toEqual([]);
  });

  it("normalizarCifra lee el valor", () => {
    expect(normalizarCifra("1.250.000")).toBe("1250000");
    expect(normalizarCifra("03")).toBe("3");
    expect(normalizarCifra("3,5")).toBe("3.5");
    expect(normalizarCifra("1,250,000.00")).toBe("1250000");
  });

  it("traeCifra reconoce el precio y el contacto en cualquier formato", () => {
    expect(traeCifra("Solo USD 450,000.00", 450000)).toBe(true);
    expect(traeCifra("Solo $450 mil", 450000)).toBe(true);
    expect(traeCifra("Solo $45.000", 450000)).toBe(false);
    expect(traeCifra("wa.me/50688887777", "+50688887777")).toBe(true);
    expect(traeCifra("Llama al 8888-7777", "+50688887777")).toBe(true);
    expect(traeCifra("Llama al 8888-7000", "+50688887777")).toBe(false);
  });

  it("conCifrasDichas acepta las cifras del corredor (también en palabras) y ninguna otra", () => {
    const con = conCifrasDichas(p, "agrégale que tiene dos parqueos y que está a 5 minutos del centro");
    expect(cifrasInventadas("2 parqueos, a cinco minutos del centro", con)).toEqual([]);
    expect(cifrasInventadas("3 parqueos", con)).toEqual([]); // el 3 ya estaba (habitaciones)
    expect(cifrasInventadas("4 parqueos", con)).toEqual(["4"]);
  });
});
