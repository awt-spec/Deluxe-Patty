import { describe, expect, it } from "vitest";
import { cuentaEnJuego, datosDelNegocio, liquidacionCierre, montoContable, porcentaje, textoFila } from "@/lib/crm/contable";

// Cifras contables del cierre: signo, dos decimales, miles con punto y dólares y colones nunca mezclados.

const s = (t: string) => t.replace(/ /g, " ");
const conceptos = (filas: { concepto: string }[]) => filas.map((f) => f.concepto);

describe("montoContable", () => {
  it("dos decimales, miles con punto y coma decimal (como montoExacto)", () => {
    expect(montoContable(1_250_000, "USD")).toBe("$1.250.000,00");
    expect(montoContable(1234.5, "USD")).toBe("$1.234,50");
    expect(montoContable(0.005, "USD")).toBe("$0,01");
    expect(montoContable(999.999, "USD")).toBe("$1.000,00");
  });

  it("con signo: + para lo que suma y el menos de verdad (U+2212) para lo que resta", () => {
    expect(s(montoContable(60_000, "USD", { signo: true }))).toBe("+ $60.000,00");
    expect(s(montoContable(-50_000, "USD", { signo: true }))).toBe("− $50.000,00");
    expect(montoContable(-50_000, "USD")).toContain("−");
    expect(montoContable(-50_000, "USD")).not.toContain("-");
    // Sin signo pedido, un negativo igual lo lleva; un positivo no.
    expect(montoContable(60_000, "USD")).toBe("$60.000,00");
    // El espacio entre signo y cifra no se parte.
    expect(montoContable(1, "USD", { signo: true })).toBe("+ $1,00");
  });

  it("cero es $0,00, sin signo (también -0 y lo que redondea a cero)", () => {
    expect(montoContable(0, "USD", { signo: true })).toBe("$0,00");
    expect(montoContable(-0, "USD")).toBe("$0,00");
    expect(montoContable(-0.004, "USD", { signo: true })).toBe("$0,00");
    expect(montoContable(Number.NaN, "USD")).toBe("$0,00");
  });

  it("colones con su símbolo", () => {
    expect(s(montoContable(95_000_000, "CRC", { signo: true }))).toBe("+ ₡95.000.000,00");
    expect(montoContable(450_000, "CRC")).toBe("₡450.000,00");
  });

  it("porcentaje con coma y hasta dos decimales", () => {
    expect(s(porcentaje(5))).toBe("5 %");
    expect(s(porcentaje(100 / 24))).toBe("4,17 %");
  });
});

describe("liquidacionCierre", () => {
  const venta = { moneda: "USD" as const, comisionPct: 5, operacion: "venta" };

  it("con lista en la misma moneda: lista, descuento negociado con %, precio final, comisión, IVA y total", () => {
    const l = liquidacionCierre({ ...venta, precioFinal: 450_000, comision: 22_500, lista: { precio: 500_000, moneda: "USD" } });
    expect(conceptos(l.filas)).toEqual(["Precio de lista", "Descuento negociado", "Precio final", "Tu comisión", "IVA 13 %", "Total a facturar"]);
    const [lista, desc, final, com, iva, total] = l.filas;
    expect(lista).toMatchObject({ monto: 500_000, tipo: "base", signo: "" });
    expect(desc).toMatchObject({ monto: -50_000, tipo: "resta", signo: "−" });
    expect(s(desc.detalle!)).toBe("10 % de la lista");
    expect(s(textoFila(desc, "USD"))).toBe("− $50.000,00");
    expect(final).toMatchObject({ monto: 450_000, tipo: "total" });
    expect(com).toMatchObject({ monto: 22_500, tipo: "suma", signo: "+" });
    expect(s(com.detalle!)).toBe("5 % del precio final");
    expect(s(textoFila(com, "USD"))).toBe("+ $22.500,00");
    expect(iva).toMatchObject({ monto: 2925, tipo: "suma" });
    expect(iva.detalle).toMatch(/si la facturas con IVA aparte/);
    expect(iva.detalle).toMatch(/estimado/);
    expect(total).toMatchObject({ monto: 25_425, tipo: "total" });
    expect(textoFila(total, "USD")).toBe("$25.425,00");
    expect(l.comisionEstimada).toBe(false);
  });

  it("sin descuento (precio igual a la lista) no hay fila de descuento; por encima, se muestra como suma", () => {
    const igual = liquidacionCierre({ ...venta, precioFinal: 500_000, comision: 25_000, lista: { precio: 500_000, moneda: "USD" } });
    expect(conceptos(igual.filas)).not.toContain("Descuento negociado");
    const mas = liquidacionCierre({ ...venta, precioFinal: 510_000, comision: 25_500, lista: { precio: 500_000, moneda: "USD" } });
    expect(mas.filas[1]).toMatchObject({ concepto: "Sobre la lista", monto: 10_000, tipo: "suma" });
  });

  it("la lista en otra moneda no entra: ni lista ni descuento (nunca se restan dólares de colones)", () => {
    const l = liquidacionCierre({ ...venta, precioFinal: 450_000, comision: 22_500, lista: { precio: 250_000_000, moneda: "CRC" } });
    expect(conceptos(l.filas)).toEqual(["Precio final", "Tu comisión", "IVA 13 %", "Total a facturar"]);
    expect(l.filas[0].tipo).toBe("base");
  });

  it("sin precio de lista (sin casa o casa sin precio) empieza en el precio final", () => {
    expect(conceptos(liquidacionCierre({ ...venta, precioFinal: 300_000, comision: 15_000, lista: null }).filas)[0]).toBe("Precio final");
    expect(conceptos(liquidacionCierre({ ...venta, precioFinal: 300_000, comision: 15_000, lista: { precio: null, moneda: "USD" } }).filas)[0]).toBe("Precio final");
  });

  it("colones de punta a punta", () => {
    const l = liquidacionCierre({ precioFinal: 95_000_000, moneda: "CRC", comision: 4_750_000, comisionPct: 5, operacion: "venta", lista: { precio: 100_000_000, moneda: "CRC" } });
    expect(s(textoFila(l.filas[1], "CRC"))).toBe("− ₡5.000.000,00");
    expect(textoFila(l.filas.at(-1)!, "CRC")).toBe("₡5.367.500,00");
  });

  it("alquiler: renta al mes y la comisión como un mes de renta", () => {
    const l = liquidacionCierre({ precioFinal: 1_800, moneda: "USD", comision: 1_800, comisionPct: 5, operacion: "alquiler", lista: { precio: 2_000, moneda: "USD" } });
    expect(conceptos(l.filas)).toEqual(["Renta de lista", "Descuento negociado", "Renta final (al mes)", "Tu comisión", "IVA 13 %", "Total a facturar"]);
    expect(l.filas[3].detalle).toBe("un mes de renta");
    expect(l.alquiler).toBe(true);
    const media = liquidacionCierre({ precioFinal: 2_000, moneda: "USD", comision: 1_000, comisionPct: 5, operacion: "alquiler" });
    expect(media.filas.find((f) => f.concepto === "Tu comisión")!.detalle).toBe("0,5 meses de renta");
  });

  it("comisión sin anotar (null): se estima como al guardar el cierre y se dice que es estimada", () => {
    const venta5 = liquidacionCierre({ ...venta, precioFinal: 300_000, comision: null });
    expect(venta5.comisionEstimada).toBe(true);
    expect(venta5.comision).toBe(15_000);
    expect(s(venta5.filas.find((f) => f.concepto === "Tu comisión")!.detalle!)).toBe("estimada: 5 % del precio final");
    const alq = liquidacionCierre({ precioFinal: 1_500, moneda: "USD", comision: null, comisionPct: 5, operacion: "alquiler" });
    expect(alq.comision).toBe(1_500);
  });

  it("comisión cero: $0,00 sin IVA ni total a facturar", () => {
    const l = liquidacionCierre({ ...venta, precioFinal: 300_000, comision: 0 });
    expect(conceptos(l.filas)).toEqual(["Precio final", "Tu comisión"]);
    expect(textoFila(l.filas[1], "USD")).toBe("$0,00");
    expect(l.filas[1].signo).toBe("");
  });
});

describe("datosDelNegocio", () => {
  const base = { llegoAt: "2026-09-01T15:00:00Z", cierreAt: "2026-10-13T15:00:00Z", visitasHechas: 3, precioFinal: 450_000, moneda: "USD" as const };

  it("días hasta cerrar, visitas y la diferencia con su oferta en la misma moneda", () => {
    const d = datosDelNegocio({ ...base, oferta: { monto: 430_000, moneda: "USD" } });
    expect(d.map((x) => x.k)).toEqual(["Desde que llegó hasta cerrar", "Visitas hechas", "Su oferta anotada", "Subió desde su oferta"]);
    expect(d[0].v).toBe("42 días");
    expect(d[1].v).toBe("3");
    expect(s(d[3].v)).toBe("+ $20.000,00 (4,65 %)");
    expect(d[3].tono).toBe("suma");
  });

  it("la oferta en otra moneda no se compara; sin fecha de cierre no hay días", () => {
    const d = datosDelNegocio({ ...base, cierreAt: null, oferta: { monto: 230_000_000, moneda: "CRC" } });
    expect(d.map((x) => x.k)).toEqual(["Visitas hechas"]);
  });

  it("oferta igual al precio: se anota sin diferencia; el mismo día", () => {
    const d = datosDelNegocio({ ...base, cierreAt: base.llegoAt, oferta: { monto: 450_000, moneda: "USD" } });
    expect(d[0].v).toBe("el mismo día");
    expect(d.map((x) => x.k)).not.toContain("Subió desde su oferta");
  });
});

describe("cuentaEnJuego", () => {
  it("con oferta y casa en la misma moneda: precio, descuento pedido, oferta y comisión estimada", () => {
    const f = cuentaEnJuego({ valor: 450_000, moneda: "USD", hayOferta: true, alquiler: false, comision: 22_500, regla: "5%", casa: { precio: 500_000, moneda: "USD" } });
    expect(conceptos(f)).toEqual(["Precio de la casa", "Pide de descuento", "Ofreció", "Tu comisión estimada"]);
    expect(s(textoFila(f[1], "USD"))).toBe("− $50.000,00");
    expect(s(textoFila(f[3], "USD"))).toBe("+ $22.500,00");
  });

  it("casa en otra moneda o sin oferta: solo lo que vale y la comisión", () => {
    expect(conceptos(cuentaEnJuego({ valor: 450_000, moneda: "USD", hayOferta: true, alquiler: false, comision: 22_500, regla: "5%", casa: { precio: 1, moneda: "CRC" } }))).toEqual([
      "Ofreció",
      "Tu comisión estimada",
    ]);
    expect(conceptos(cuentaEnJuego({ valor: 2_000, moneda: "USD", hayOferta: false, alquiler: true, comision: 2_000, regla: "un mes de renta", casa: { precio: 2_000, moneda: "USD" } }))).toEqual([
      "Vale (al mes)",
      "Tu comisión estimada",
    ]);
  });
});
