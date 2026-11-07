// Dinero del CRM: ofertas, cierres y comisiones en dólares o colones (nunca se suman entre sí) y la
// comisión estimada según la operación: en venta un porcentaje del precio, en alquiler un mes de renta.

export type Moneda = "USD" | "CRC";
export type Montos = Record<Moneda, number>;

export const monedaDe = (v: unknown): Moneda => (v === "CRC" ? "CRC" : "USD");
const SIMBOLO: Record<Moneda, string> = { USD: "$", CRC: "₡" };

/** Comisión estimada: en alquiler, un mes de renta; en venta, el porcentaje del corredor. */
export function comisionEstimada(precio: number, porcentaje: number | null | undefined, operacion?: string | null): number {
  if (operacion === "alquiler") return Math.round(precio);
  return Math.round((precio * (porcentaje ?? 5)) / 100);
}

/** Cómo se calcula, para mostrarlo al lado: "5%" o "un mes de renta". */
export const reglaComision = (porcentaje: number | null | undefined, operacion?: string | null) =>
  operacion === "alquiler" ? "un mes de renta" : `${porcentaje ?? 5}%`;

/** Suma por moneda. */
export function sumar(lista: { monto: number; moneda: Moneda }[]): Montos {
  const total: Montos = { USD: 0, CRC: 0 };
  for (const { monto, moneda } of lista) if (monto > 0) total[moneda] += monto;
  return total;
}

/** "$1,2 millones", "₡850 mil": cifras redondas, fáciles de leer. */
export function plata(n: number, moneda: Moneda = "USD"): string {
  const s = SIMBOLO[moneda];
  if (n >= 1_000_000) return `${s}${(n / 1_000_000).toFixed(1).replace(".", ",").replace(",0", "")} ${n >= 2_000_000 ? "millones" : "millón"}`;
  if (n >= 1000) return `${s}${Math.round(n / 1000)} mil`;
  return `${s}${Math.round(n)}`;
}

/** "$1,2 millones + ₡850 mil" (solo lo que no es cero). */
export function plataMontos(m: Montos): string {
  return (["USD", "CRC"] as const)
    .filter((k) => m[k] > 0)
    .map((k) => plata(m[k], k))
    .join(" + ");
}

export const hayMonto = (m: Montos) => m.USD > 0 || m.CRC > 0;

/** Monto exacto con su símbolo: "$1.250.000" o "₡450.000". */
export const montoExacto = (n: number, moneda: Moneda) => `${SIMBOLO[moneda]}${Math.round(n).toLocaleString("es-CR")}`;
