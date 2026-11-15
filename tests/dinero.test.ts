import { describe, expect, it } from "vitest";
import { leerCifra, leerPorcentaje, MONTO_MAXIMO, plata, validarCierre, validarOferta } from "../lib/crm/dinero";
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
    expect(plata(1_940_000)).toBe("$1,9 millón");
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
    expect(validarCierre("300000", "", "USD")).toEqual({ ok: true, precio: 300_000, comision: null });
    expect(validarCierre("300000", "0", "USD")).toEqual({ ok: true, precio: 300_000, comision: 0 });
    expect(validarCierre("300.000", "15.000", "USD")).toEqual({ ok: true, precio: 300_000, comision: 15_000 });
    // En alquiler la comisión es un mes de renta: igual al precio, cabe.
    expect(validarCierre("1500", "1500", "USD")).toMatchObject({ ok: true, comision: 1500 });
    expect(validarCierre("300000", "150000000", "USD")).toMatchObject({ ok: false, motivo: expect.stringMatching(/mayor que el precio \(\$300\.000\)/) });
    expect(validarCierre("300000", "-1", "USD")).toMatchObject({ ok: false, motivo: expect.stringMatching(/comisión/) });
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
