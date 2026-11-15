import { describe, expect, it } from "vitest";
import { comisionAlCorregir, etiquetaComision, leerComision, precioIncreible, previaComision, validarCierre } from "../lib/crm/cierre";
import { cifraAmbigua, comisionEstimada, leerCifra, leerPorcentaje, MONTO_MAXIMO, plata, validarOferta } from "../lib/crm/dinero";
import { comisiones, delAnio, delMes, mesLocal, ultimosMeses } from "../lib/crm/ganado";
import { leerNumero } from "../lib/panel/formularios";

const CR = "America/Costa_Rica";

describe("leerCifra / leerNumero: dinero como se escribe en Costa Rica", () => {
  it("acepta miles con punto o coma, decimales con la otra marca, símbolos y espacios", () => {
    for (const [texto, n] of [
      ["1.250.000", 1_250_000],
      ["1,250,000", 1_250_000],
      ["1.250.000,00", 1_250_000],
      ["1,250,000.00", 1_250_000],
      ["1.250.000,50", 1_250_000.5],
      ["1,250,000.50", 1_250_000.5],
      ["1250000", 1_250_000],
      ["$1.250.000", 1_250_000],
      [" $ 1 250 000 ", 1_250_000],
      ["₡95.000.000", 95_000_000],
      ["USD 2,200", 2200],
      ["2,5", 2.5],
      ["0.5", 0.5],
      ["0", 0],
    ] as const) {
      expect(leerCifra(texto), texto).toBe(n);
      expect(leerNumero(texto), texto).toBe(n);
    }
    expect(leerCifra("")).toBeNull();
    expect(leerCifra("   ")).toBeNull();
  });

  it("rechaza negativos, texto, palabras, notación científica, Infinity y montos absurdos", () => {
    for (const malo of ["-5", "abc", "12 millones", "1.2M", "50k", "1e6", "Infinity", "NaN", "1.25.000", "1,2,3", "1.250.000,5000", "100000000001"]) {
      expect(leerCifra(malo), malo).toBe("invalido");
    }
    expect(leerCifra(String(MONTO_MAXIMO))).toBe(MONTO_MAXIMO);
  });
});

describe("plata: cifras redondas sin '1000 mil'", () => {
  it("redondea antes de elegir la unidad, en dólares y en colones", () => {
    expect(plata(999_999)).toBe("$1 millón");
    expect(plata(999_500, "CRC")).toBe("₡1 millón");
    expect(plata(999_499)).toBe("$999 mil");
    expect(plata(999.6)).toBe("$1 mil");
    expect(plata(999.4)).toBe("$999");
    expect(plata(1_000_000)).toBe("$1 millón");
    expect(plata(1_940_000)).toBe("$1,9 millones");
    expect(plata(1_250_000)).toBe("$1,3 millones");
    expect(plata(1_180_000)).toBe("$1,2 millones");
    expect(plata(1_960_000)).toBe("$2 millones");
    expect(plata(2_500_000, "CRC")).toBe("₡2,5 millones");
    expect(plata(999_999_999, "CRC")).toBe("₡1.000 millones");
    expect(plata(12_340_000_000, "CRC")).toBe("₡12.340 millones");
    expect(plata(0)).toBe("$0");
  });
});

describe("oferta y cierre: lo que no se entiende no se guarda", () => {
  it("validarOferta: vacía quita; inválida o cero avisa; válida con centavos", () => {
    expect(validarOferta("")).toEqual({ ok: true, valor: null });
    expect(validarOferta("1.250.000,50")).toEqual({ ok: true, valor: 1_250_000.5 });
    for (const malo of ["-5", "abc", "12 millones", "0"]) expect(validarOferta(malo), malo).toMatchObject({ ok: false });
    expect(validarOferta("abc")).toMatchObject({ motivo: expect.stringMatching(/No entendí el monto/) });
  });

  it("validarCierre: precio obligatorio y > 0, comisión vacía se estima, 0 es 0 y nunca más que el precio", () => {
    expect(validarCierre("", "", "USD")).toEqual({ ok: false, motivo: "Escribe el precio final." });
    expect(validarCierre("0", "", "USD")).toMatchObject({ ok: false });
    expect(validarCierre("300000", "", "USD")).toEqual({ ok: true, precio: 300_000, comision: null, porcentaje: null });
    expect(validarCierre("300000", "0", "USD")).toEqual({ ok: true, precio: 300_000, comision: 0, porcentaje: 0 });
    expect(validarCierre("300.000", "15.000", "USD")).toEqual({ ok: true, precio: 300_000, comision: 15_000, porcentaje: null });
    // En alquiler la comisión es un mes de renta: igual al precio, cabe.
    expect(validarCierre("1500", "1500", "USD")).toMatchObject({ ok: true, comision: 1500 });
    expect(validarCierre("300000", "150000000", "USD")).toMatchObject({ ok: false, motivo: expect.stringMatching(/mayor que el precio \(\$300\.000,00\)/) });
    expect(validarCierre("300000", "-1", "USD")).toMatchObject({ ok: false, motivo: expect.stringMatching(/comisión/) });
  });

  it("el aviso de comisión mayor que el precio muestra el precio con sus centavos", () => {
    expect(validarCierre("1.180.000,50", "2000000", "USD")).toMatchObject({ ok: false, motivo: expect.stringContaining("($1.180.000,50)") });
  });

  it("leerPorcentaje: vacío es 5, 0 es 0, fuera de 0–20 avisa", () => {
    expect(leerPorcentaje("")).toEqual({ ok: true, valor: 5 });
    expect(leerPorcentaje("0")).toEqual({ ok: true, valor: 0 });
    expect(leerPorcentaje("3,5")).toEqual({ ok: true, valor: 3.5 });
    expect(leerPorcentaje("5%")).toEqual({ ok: true, valor: 5 });
    expect(leerPorcentaje("25")).toMatchObject({ ok: false });
    expect(leerPorcentaje("-1")).toMatchObject({ ok: false });
  });
});

describe("ganado del mes y del año en la zona del corredor", () => {
  const cierres = [
    // 31 de octubre a las 18:30 en Costa Rica = 1 de noviembre 00:30 UTC: es de octubre.
    { cierre_at: "2026-11-01T00:30:00Z", cierre_comision: 10_000, cierre_moneda: "USD" },
    { cierre_at: "2026-11-15T15:00:00Z", cierre_comision: 500_000, cierre_moneda: "CRC" },
    // 31 de diciembre de noche en Costa Rica: es del año que termina.
    { cierre_at: "2027-01-01T03:00:00Z", cierre_comision: 7000, cierre_moneda: "USD" },
    { cierre_at: null, cierre_comision: 1, cierre_moneda: "USD" },
  ];

  it("mesLocal cuenta en hora de Costa Rica, no en UTC", () => {
    expect(mesLocal("2026-11-01T00:30:00Z", CR)).toBe("2026-10");
    expect(mesLocal("2026-11-01T06:00:00Z", CR)).toBe("2026-11");
    expect(mesLocal(null, CR)).toBeNull();
    expect(mesLocal("no-es-fecha", CR)).toBeNull();
  });

  it("delMes y delAnio agrupan por mes y año locales, y dólares y colones no se mezclan", () => {
    const octubre = delMes(cierres, "2026-10", CR, (c) => c.cierre_at);
    expect(comisiones(octubre)).toEqual({ USD: 10_000, CRC: 0 });
    expect(comisiones(delMes(cierres, "2026-11", CR, (c) => c.cierre_at))).toEqual({ USD: 0, CRC: 500_000 });
    expect(comisiones(delAnio(cierres, 2026, CR, (c) => c.cierre_at))).toEqual({ USD: 17_000, CRC: 500_000 });
    expect(delAnio(cierres, 2027, CR, (c) => c.cierre_at)).toEqual([]);
  });

  it("ultimosMeses arma las claves locales hasta el mes de hoy, cruzando el año", () => {
    // 1 de febrero 02:00 UTC es todavía 31 de enero en Costa Rica.
    expect(ultimosMeses(new Date("2027-02-01T02:00:00Z"), CR, 3)).toEqual(["2026-11", "2026-12", "2027-01"]);
  });
});

describe("cierre: la comisión se escribe en % o en monto", () => {
  it("«5», «5%», «5 %» y «4,5%» son porcentaje del precio", () => {
    expect(leerComision("5", 1_180_000.5, "USD")).toEqual({ ok: true, comision: 59_000.03, porcentaje: 5 });
    expect(leerComision("5%", 1_180_000, "USD")).toEqual({ ok: true, comision: 59_000, porcentaje: 5 });
    expect(leerComision("5 %", 1_180_000, "USD")).toEqual({ ok: true, comision: 59_000, porcentaje: 5 });
    expect(leerComision("4,5%", 200_000, "USD")).toEqual({ ok: true, comision: 9_000, porcentaje: 4.5 });
    expect(leerComision("4.5", 200_000, "USD")).toEqual({ ok: true, comision: 9_000, porcentaje: 4.5 });
    expect(leerComision("20", 200_000, "USD")).toMatchObject({ ok: true, porcentaje: 20 });
    // Con % puede pasar de 20 (en alquiler hay quien cobra medio mes), pero no de 100.
    expect(leerComision("50 %", 1_500, "USD")).toEqual({ ok: true, comision: 750, porcentaje: 50 });
    expect(leerComision("150%", 1_500, "USD")).toMatchObject({ ok: false });
  });

  it("con símbolo de moneda, miles o más de 20 es un monto", () => {
    expect(leerComision("$5", 100, "USD")).toEqual({ ok: true, comision: 5, porcentaje: null });
    expect(leerComision("15.000", 300_000, "USD")).toEqual({ ok: true, comision: 15_000, porcentaje: null });
    expect(leerComision("59000", 1_180_000, "USD")).toEqual({ ok: true, comision: 59_000, porcentaje: null });
    expect(leerComision("₡1.625.000", 32_500_000, "CRC")).toEqual({ ok: true, comision: 1_625_000, porcentaje: null });
  });

  it("vacía se estima después; 0 es cero; % y moneda juntos, la coma ambigua y un monto ínfimo avisan", () => {
    expect(leerComision("", 300_000, "USD")).toEqual({ ok: true, comision: null, porcentaje: null });
    expect(leerComision("0", 300_000, "USD")).toEqual({ ok: true, comision: 0, porcentaje: 0 });
    expect(leerComision("$5%", 300_000, "USD")).toMatchObject({ ok: false });
    expect(leerComision("12,500", 300_000, "USD")).toMatchObject({ ok: false, motivo: expect.stringMatching(/12,5 o 12\.500/) });
    // $25 de comisión sobre $300.000 (0,01 %) es un porcentaje mal escrito.
    expect(leerComision("$25", 300_000, "USD")).toMatchObject({ ok: false, motivo: expect.stringMatching(/Entendí una comisión de \$25,00/) });
  });

  it("la etiqueta dice que se acepta % o monto", () => {
    expect(etiquetaComision(5, "venta").replace(/\u00a0/g, " ")).toBe("Tu comisión: % o monto. Vacía: 5 %");
    expect(etiquetaComision(5, "alquiler")).toBe("Tu comisión: % o monto. Vacía: un mes de renta");
  });

  it("vista previa: lo que se va a guardar", () => {
    const base = { moneda: "USD" as const, comisionPct: 5, operacion: "venta" };
    const nb = (t: string | undefined) => t?.replace(/\u00a0/g, " ");
    expect(nb(previaComision({ ...base, precio: "1.180.000", comision: "5" })?.texto)).toBe("= $59.000,00 (5 % del precio)");
    expect(nb(previaComision({ ...base, precio: "1.180.000", comision: "" })?.texto)).toBe("Se calcula: $59.000,00 (5 %)");
    expect(nb(previaComision({ ...base, precio: "300000", comision: "15000" })?.texto)).toBe("= $15.000,00 (5 % del precio)");
    expect(previaComision({ ...base, precio: "300000", comision: "$25" })).toMatchObject({ error: true });
    expect(previaComision({ ...base, precio: "", comision: "5" })).toBeNull();
    const actual = { precio: 1_180_000, moneda: "USD", comision: 50_000, operacion: "venta" };
    expect(nb(previaComision({ ...base, precio: "1180000", comision: "", actual })?.texto)).toBe("Se queda en $50.000,00");
    expect(nb(previaComision({ ...base, precio: "1200000", comision: "", actual })?.texto)).toBe("Se calcula: $60.000,00 (5 %)");
  });
});

describe("cierre: precios absurdos no se guardan", () => {
  const casa = { operacion: "venta", lista: { precio: 1_250_000, moneda: "USD" } };

  it("«1,5» frente a una lista de $1.250.000: dice lo que entendió y lo que seguramente era", () => {
    const r = validarCierre("1,5", "", "USD", casa);
    expect(r).toMatchObject({ ok: false });
    expect((r as { motivo: string }).motivo.replace(/\u00a0/g, " ")).toBe(
      "Entendí $1,50 y la casa está en $1.250.000,00. ¿Era $1.500.000,00? Escríbelo completo, por ejemplo 1500000.",
    );
  });

  it("menos del 20 % de la lista (misma moneda) se rechaza; desde el 20 %, se acepta", () => {
    expect(validarCierre("1.180", "", "USD", casa)).toMatchObject({ ok: false, motivo: expect.stringMatching(/¿Era \$1\.180\.000,00\?/) });
    expect(validarCierre("249.999", "", "USD", casa)).toMatchObject({ ok: false });
    expect(validarCierre("250.000", "", "USD", casa)).toMatchObject({ ok: true, precio: 250_000 });
    expect(validarCierre("1.180.000,50", "5", "USD", casa)).toEqual({ ok: true, precio: 1_180_000.5, comision: 59_000.03, porcentaje: 5 });
  });

  it("la lista en otra moneda no se compara (dólares y colones nunca se mezclan)", () => {
    expect(validarCierre("130.000.000", "", "CRC", casa)).toMatchObject({ ok: true, precio: 130_000_000 });
    expect(precioIncreible(130_000_000, "CRC", casa)).toBeNull();
  });

  it("venta por debajo de $1.000 o ₡500.000 sin lista se rechaza; en alquiler el mínimo es otro", () => {
    expect(validarCierre("999", "", "USD", { operacion: "venta" })).toMatchObject({ ok: false });
    expect(validarCierre("499.999", "", "CRC", { operacion: "venta" })).toMatchObject({ ok: false });
    expect(validarCierre("500.000", "", "CRC", { operacion: "venta" })).toMatchObject({ ok: true });
    expect(validarCierre("1.000", "", "USD")).toMatchObject({ ok: true });
    expect(validarCierre("800", "", "USD", { operacion: "alquiler" })).toMatchObject({ ok: true });
    expect(validarCierre("1,5", "", "USD", { operacion: "alquiler" })).toMatchObject({ ok: false, motivo: expect.stringMatching(/Entendí \$1,50/) });
    // Renta de lista $1.500: una de $250 no se cree.
    expect(validarCierre("250", "", "USD", { operacion: "alquiler", lista: { precio: 1_500, moneda: "USD" } })).toMatchObject({ ok: false });
  });

  it("«1,180» es ambiguo (¿1,18 o 1.180?): se pide escribirlo sin la coma; «1.180.000» y «1,180,000» no lo son", () => {
    expect(cifraAmbigua("1,180")).toBe(true);
    expect(cifraAmbigua("$ 1,180")).toBe(true);
    expect(cifraAmbigua("1.180")).toBe(false);
    expect(cifraAmbigua("1,180,000")).toBe(false);
    expect(cifraAmbigua("1,5")).toBe(false);
    expect(validarCierre("1,180", "", "USD")).toMatchObject({ ok: false, motivo: expect.stringMatching(/puede ser 1,18 o 1\.180/) });
    expect(validarCierre("1,180,000", "", "USD", casa)).toMatchObject({ ok: true, precio: 1_180_000 });
    expect(validarCierre("1.180.000", "", "USD", casa)).toMatchObject({ ok: true, precio: 1_180_000 });
  });
});

describe("cierre: redondeo a centavos en todas partes", () => {
  it("la comisión estimada se redondea a centavos, no a la unidad", () => {
    expect(comisionEstimada(1_250_000.5, 5)).toBe(62_500.03);
    expect(comisionEstimada(1_999.99, 2.5)).toBe(50);
    expect(comisionEstimada(1_400.4, 5, "alquiler")).toBe(1_400.4);
  });
});

describe("cierre: corregir con la comisión vacía", () => {
  const antes = { precio: 1_500, moneda: "USD", comision: 1_500, operacion: "alquiler" };
  it("si no cambian precio, moneda ni operación se queda la de antes; si cambia algo, se recalcula (null)", () => {
    expect(comisionAlCorregir(antes, { precio: 1_500, moneda: "USD", operacion: "alquiler" })).toBe(1_500);
    expect(comisionAlCorregir(antes, { precio: 1_400, moneda: "USD", operacion: "alquiler" })).toBeNull();
    expect(comisionAlCorregir(antes, { precio: 1_500, moneda: "CRC", operacion: "alquiler" })).toBeNull();
    expect(comisionAlCorregir(antes, { precio: 1_500, moneda: "USD", operacion: "venta" })).toBeNull();
    expect(comisionAlCorregir({ ...antes, comision: null }, { precio: 1_500, moneda: "USD", operacion: "alquiler" })).toBeNull();
  });
});
