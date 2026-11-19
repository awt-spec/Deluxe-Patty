// Precio por millón de tokens (USD), API de Anthropic. Revisar si cambian los precios.
const PRECIOS: Record<string, { entrada: number; salida: number }> = {
  "claude-haiku-5-5": { entrada: 0.1, salida: 0.5 },
  "claude-sonnet-5-5": { entrada: 2, salida: 10 },
};

export interface UsoTokens {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  /** Búsquedas en internet que hizo la herramienta del servidor en esta llamada (se cobran aparte de los tokens). */
  server_tool_use?: { web_search_requests?: number | null } | null;
}

/** Cada búsqueda en internet (web_search) cuesta USD 10 por cada 1.000, aparte de los tokens que lee. Leer una página (web_fetch) no se cobra aparte. */
export const COSTO_BUSQUEDA_WEB_USD = 10 / 1000;

export interface Consumo {
  tokensEntrada: number;
  tokensSalida: number;
  costoUsd: number;
}

// Estimación: escritura de caché a 1,25x y lectura a 0,1x del precio de entrada, más las búsquedas en internet.
export function consumo(modelo: string, uso: UsoTokens): Consumo {
  const p = PRECIOS[modelo] ?? PRECIOS["claude-sonnet-5-5"];
  const escrituraCache = uso.cache_creation_input_tokens ?? 0;
  const lecturaCache = uso.cache_read_input_tokens ?? 0;
  const entradaEquivalente = uso.input_tokens + escrituraCache * 1.25 + lecturaCache * 0.1;
  const busquedas = Math.max(0, Number(uso.server_tool_use?.web_search_requests ?? 0) || 0);
  return {
    tokensEntrada: uso.input_tokens + escrituraCache + lecturaCache,
    tokensSalida: uso.output_tokens,
    costoUsd: (entradaEquivalente * p.entrada + uso.output_tokens * p.salida) / 1_000_000 + busquedas * COSTO_BUSQUEDA_WEB_USD,
  };
}

export function sumar(a: Consumo, b: Consumo): Consumo {
  return {
    tokensEntrada: a.tokensEntrada + b.tokensEntrada,
    tokensSalida: a.tokensSalida + b.tokensSalida,
    costoUsd: a.costoUsd + b.costoUsd,
  };
}

export const SIN_CONSUMO: Consumo = { tokensEntrada: 0, tokensSalida: 0, costoUsd: 0 };
