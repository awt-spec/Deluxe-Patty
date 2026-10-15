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
}

export interface Consumo {
  tokensEntrada: number;
  tokensSalida: number;
  costoUsd: number;
}

// Estimación: escritura de caché a 1,25x y lectura a 0,1x del precio de entrada.
export function consumo(modelo: string, uso: UsoTokens): Consumo {
  const p = PRECIOS[modelo] ?? PRECIOS["claude-sonnet-5-5"];
  const escrituraCache = uso.cache_creation_input_tokens ?? 0;
  const lecturaCache = uso.cache_read_input_tokens ?? 0;
  const entradaEquivalente = uso.input_tokens + escrituraCache * 1.25 + lecturaCache * 0.1;
  return {
    tokensEntrada: uso.input_tokens + escrituraCache + lecturaCache,
    tokensSalida: uso.output_tokens,
    costoUsd: (entradaEquivalente * p.entrada + uso.output_tokens * p.salida) / 1_000_000,
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
