import Anthropic from "@anthropic-ai/sdk";

// Cliente de Claude para producción:
//  - Tiempo de espera y reintentos acotados: el webhook de WhatsApp corre en una función de Vercel que
//    se corta a los 300 s. Con el valor de fábrica del SDK (10 min por intento, 2 reintentos) una
//    llamada colgada mataba la función sin aviso: el cliente quedaba sin respuesta y el corredor sin
//    el aviso de "falla de Claude". Con 90 s y 1 reintento, lo peor son ~3 min (dentro de los 300 s) y
//    el error llega al código, que avisa al corredor. 90 s alcanza para lo largo (anuncios, análisis
//    con web_fetch); un solo reintento evita pagar tres veces una respuesta lenta y aún cubre 429/529.
//  - Una traza por llamada (modelo, milisegundos, tokens, caché, motivo de parada), sin contenido de
//    mensajes ni datos de clientes (Ley 8968): para ver latencia, costo y si la caché está sirviendo.

export const TIEMPO_ESPERA_MS = 90_000;
export const REINTENTOS = 1;

export interface TrazaClaude {
  evento: "llamada_claude";
  modelo: string | null;
  estado: number;
  ms: number;
  entrada: number;
  salida: number;
  cache_lectura: number;
  cache_escritura: number;
  parada: string | null;
}

/** Arma la traza de una respuesta de /v1/messages (solo cifras, nunca texto). */
export function trazaDe(estado: number, ms: number, cuerpo: unknown): TrazaClaude {
  const c = (cuerpo ?? {}) as {
    model?: string;
    stop_reason?: string | null;
    usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null };
  };
  return {
    evento: "llamada_claude",
    modelo: c.model ?? null,
    estado,
    ms,
    entrada: c.usage?.input_tokens ?? 0,
    salida: c.usage?.output_tokens ?? 0,
    cache_lectura: c.usage?.cache_read_input_tokens ?? 0,
    cache_escritura: c.usage?.cache_creation_input_tokens ?? 0,
    parada: c.stop_reason ?? null,
  };
}

/** fetch que mide cada llamada a /v1/messages y deja la traza; no cambia la respuesta. */
export function fetchConTraza(base: typeof fetch = fetch, registrar: (t: TrazaClaude) => void = (t) => console.info(JSON.stringify(t))): typeof fetch {
  return (async (url: RequestInfo | URL, init?: RequestInit) => {
    const inicio = Date.now();
    const respuesta = await base(url, init);
    if (String(url).includes("/v1/messages") && !String(url).includes("count_tokens")) {
      const ms = Date.now() - inicio;
      respuesta
        .clone()
        .json()
        .then((cuerpo) => registrar(trazaDe(respuesta.status, ms, cuerpo)))
        .catch(() => registrar(trazaDe(respuesta.status, ms, null)));
    }
    return respuesta;
  }) as typeof fetch;
}

export function crearClienteClaude(): Anthropic {
  return new Anthropic({ timeout: TIEMPO_ESPERA_MS, maxRetries: REINTENTOS, fetch: fetchConTraza() });
}
