// Unidades de IA (1 unidad = 1 centavo de dólar) del tope de gasto de IA que define el
// superadministrador (/admin → IA y topes). Base de `energia.ts`. El tanque es el tope del MES: el propio del corredor
// (`corredores.tope_ia_mes_usd`) o, si está vacío, el de la plataforma; 0 apaga la IA (agotado).
// Funciones puras: sin base ni red.

export const TOKENS_POR_DOLAR = 100;

/** Avisa "quedan pocos" cuando queda el 15 % o menos. */
export const UMBRAL_POCO = 0.15;

export type NivelTokens = "bien" | "poco" | "agotado" | "sin_tope";

export interface EstadoTokens {
  total: number;
  usados: number;
  restantes: number;
  /** Porcentaje usado, de 0 a 100 (entero). */
  pct: number;
  nivel: NivelTokens;
}

/** Dólares a tokens, redondeado hacia abajo (nunca se muestra más de lo que hay). */
export function aTokens(usd: number | null | undefined): number {
  const n = Number(usd);
  if (!Number.isFinite(n) || n <= 0) return 0;
  // El épsilon evita que 0,29 USD dé 28 por el error de coma flotante.
  return Math.floor(n * TOKENS_POR_DOLAR + 1e-9);
}

/** Tope que vale para el corredor: el propio si lo tiene (0 incluido), si no el de la plataforma. */
export function topeEfectivo(propio: number | null | undefined, plataforma: number | null | undefined): number | null {
  if (propio !== null && propio !== undefined && Number.isFinite(Number(propio))) return Number(propio);
  if (plataforma !== null && plataforma !== undefined && Number.isFinite(Number(plataforma))) return Number(plataforma);
  return null;
}

export function estadoTokens({ gastoMesUsd, topeMesUsd }: { gastoMesUsd: number; topeMesUsd: number | null | undefined }): EstadoTokens {
  const usadosReal = aTokens(gastoMesUsd);
  if (topeMesUsd === null || topeMesUsd === undefined || !Number.isFinite(Number(topeMesUsd))) {
    return { total: 0, usados: usadosReal, restantes: 0, pct: 0, nivel: "sin_tope" };
  }
  const total = aTokens(topeMesUsd);
  // Con la IA apagada (tope 0) no hay tanque: agotado.
  if (total <= 0) return { total: 0, usados: usadosReal, restantes: 0, pct: 100, nivel: "agotado" };
  const usados = Math.min(usadosReal, total);
  const restantes = total - usados;
  // El freno real compara el gasto en dólares: si ya lo alcanzó, está agotado aunque el redondeo diga otra cosa.
  const agotado = restantes <= 0 || Number(gastoMesUsd) >= Number(topeMesUsd);
  const pct = agotado ? 100 : Math.min(100, Math.floor((usados / total) * 100));
  const nivel: NivelTokens = agotado ? "agotado" : restantes <= total * UMBRAL_POCO ? "poco" : "bien";
  return { total, usados, restantes: agotado ? 0 : restantes, pct, nivel };
}

/** Lo mismo para el tope del día (la barra muestra el mes). */
export function estadoTokensDia({ gastoDiaUsd, topeDiaUsd }: { gastoDiaUsd: number; topeDiaUsd: number | null | undefined }): EstadoTokens {
  return estadoTokens({ gastoMesUsd: gastoDiaUsd, topeMesUsd: topeDiaUsd });
}

/** Desde lo que devuelve `presupuesto_ia()` (repositorio.presupuestoIA). */
export function tokensDePresupuesto(p: { gastoMes: number; topeMes: number | null }): EstadoTokens {
  return estadoTokens({ gastoMesUsd: p.gastoMes, topeMesUsd: p.topeMes });
}
