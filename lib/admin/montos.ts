import { leerNumero } from "../panel/formularios";

const MAXIMO_USD = 10_000;

/** Monto en dólares: vacío es null (usar el de la plataforma); fuera de rango, error. */
export function monto(v: FormDataEntryValue | null, vacioEsNull: boolean): number | null | "error" {
  // Mismo lector que el resto del panel: "1.000" y "1,000" son mil; "2,5" y "2.5" son dos y medio.
  const n = leerNumero(String(v ?? "").trim());
  if (n === null) return vacioEsNull ? null : "error";
  return n !== "invalido" && n <= MAXIMO_USD ? Math.round(n * 100) / 100 : "error";
}
