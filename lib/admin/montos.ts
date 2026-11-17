import { leerCifra, traeMiles } from "../crm/dinero";

// Montos en dólares de los topes de IA (/admin). Mismo lector que el resto del panel (lib/crm/dinero.ts `leerCifra`):
// el punto seguido de tres cifras es separador de miles, como se escribe en Costa Rica: "1.000" es mil dólares (nunca
// $1,00) y "10.500" es diez mil quinientos (más del máximo, se rechaza). Los centavos van con una o dos cifras:
// "150,50" o "150.50". Funciones puras: las usa también el campo del navegador (app/admin/campo-usd.tsx).

export const MAXIMO_USD = 10_000;

/** Ayuda bajo cada campo de tope; `conVacio` en los del corredor, donde vacío usa el de la plataforma. */
export const ayudaMontoUsd = (conVacio: boolean) =>
  `Escribe el monto en dólares, por ejemplo 150 o 150,50.${conVacio ? " Vacío = el de la plataforma;" : ""} 0 = apagado. El punto con tres cifras es de miles: 1.000 son mil dólares.`;

export type LecturaUsd =
  | { tipo: "vacio" }
  | { tipo: "invalido" }
  /** Se entendió, pero pasa de MAXIMO_USD. */
  | { tipo: "fuera"; n: number }
  /** `miles`: se escribió con separador de miles ("1.000"), para decir cómo se leyó. */
  | { tipo: "ok"; n: number; miles: boolean };

export function leerMontoUsd(v: FormDataEntryValue | string | null): LecturaUsd {
  const crudo = String(v ?? "").trim();
  const n = leerCifra(crudo);
  if (n === null) return { tipo: "vacio" };
  if (n === "invalido") return { tipo: "invalido" };
  const redondo = Math.round(n * 100) / 100;
  if (redondo > MAXIMO_USD) return { tipo: "fuera", n: redondo };
  return { tipo: "ok", n: redondo, miles: traeMiles(crudo) };
}

/** Monto en dólares: vacío es null (usar el de la plataforma); fuera de rango, error. */
export function monto(v: FormDataEntryValue | null, vacioEsNull: boolean): number | null | "error" {
  const l = leerMontoUsd(v);
  if (l.tipo === "vacio") return vacioEsNull ? null : "error";
  return l.tipo === "ok" ? l.n : "error";
}
